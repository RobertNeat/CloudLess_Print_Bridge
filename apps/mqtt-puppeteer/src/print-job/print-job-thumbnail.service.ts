import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { FtpsSessionService } from '../ftps/ftps-session.service';
import type { RemoteStorageClient } from '../ftps/remote-storage.client';

/**
 * Resolves the printer's on-device thumbnail PNG for the currently active
 * print job, entirely via FTPS against the printer itself — no dependency
 * on ftps-remote-manager, which is a separate service with no uptime
 * guarantee.
 *
 * Resolution protocol (Bambu Lab A1 firmware):
 *  1. The active job's gcode is named "<jobBaseName>*.gcode" under
 *     printJobThumbnail.gcodeDirectory, absolute from the FTP session root
 *     (a "./"-relative path does not resolve on the A1's embedded FTP
 *     server). jobBaseName is derived from the domain model's job.fileName
 *     (e.g. "Cute_Bunny_13_MIN_Test_Print.gcode.3mf" ->
 *     "Cute_Bunny_13_MIN_Test_Print", matching the on-device gcode
 *     "Cute_Bunny_13_MIN_Test_Print_plate_1.gcode").
 *  2. printJobThumbnail.md5IndexDirectory holds one "<identifier>.md5" file
 *     per known thumbnail, whose content is the upper-case MD5 hex digest
 *     of the matching gcode file.
 *  3. MD5-ing the matched gcode and comparing it against the index yields
 *     the identifier; the thumbnail itself is "<identifier>.png" under
 *     printJobThumbnail.imageDirectory.
 *
 * The md5 index (identifier -> digest) is built once at startup and then
 * only incrementally refreshed (new .md5 files picked up, nothing
 * re-downloaded) — see refreshIndex(). Resolutions, including "no match
 * found for this fileName", are cached per fileName so a job in progress
 * never re-downloads its (potentially hundreds of MB) gcode on every poll.
 */
@Injectable()
export class PrintJobThumbnailService implements OnModuleInit {
  private readonly logger = new Logger(PrintJobThumbnailService.name);

  /** identifier -> upper-case MD5 hex digest, read from <md5IndexDirectory>/<identifier>.md5 */
  private readonly md5Index = new Map<string, string>();
  private readonly indexedIdentifiers = new Set<string>();
  private indexBuilt = false;
  private indexRefreshInFlight: Promise<void> | null = null;
  private lastIndexRefreshAt = 0;

  /** fileName -> resolved identifier, or null when resolution was attempted and found nothing. */
  private readonly resolutionCache = new Map<string, string | null>();
  private readonly resolutionInFlight = new Map<string, Promise<void>>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: FtpsSessionService,
  ) {}

  onModuleInit(): void {
    // Fire-and-forget: FTPS may not be reachable yet (or ever) when this
    // module initializes, and must never block application startup — the
    // same reasoning mqtt-puppeteer already applies to its MQTT connection.
    void this.refreshIndex().catch((error: unknown) => {
      this.logger.warn(
        `Initial thumbnail md5 index build failed: ${errorMessage(error)}`,
      );
    });
  }

  /**
   * Never triggers FTPS I/O — used by PrinterStateService.getDomain(), which
   * must stay synchronous. Mirrors PrinterPositionService.getPosition().
   */
  getCachedThumbnailId(fileName: string): string | undefined {
    return this.resolutionCache.get(fileName) ?? undefined;
  }

  /**
   * Fire-and-forget: kicks off background resolution for fileName if it
   * isn't cached and isn't already in flight. Callers read the result later
   * via getCachedThumbnailId().
   */
  requestResolution(fileName: string): void {
    if (
      this.resolutionCache.has(fileName) ||
      this.resolutionInFlight.has(fileName)
    ) {
      return;
    }
    const task = this.resolveThumbnailId(fileName)
      .catch(() => undefined)
      .then(() => {
        this.resolutionInFlight.delete(fileName);
      });
    this.resolutionInFlight.set(fileName, task);
  }

  /**
   * Resolves the thumbnail identifier for the given job gcode fileName
   * (domain model's job.fileName), or undefined if none is known. Never
   * throws — a resolution failure just means no thumbnail is available yet.
   */
  async resolveThumbnailId(fileName: string): Promise<string | undefined> {
    const cached = this.resolutionCache.get(fileName);
    if (cached !== undefined) return cached ?? undefined;

    try {
      const identifier = await this.resolve(fileName);
      // An empty index means resolution never really had a chance (startup
      // build hasn't landed yet, or a transient failure left it empty) —
      // caching "no match" here would strand this fileName as a permanent
      // negative even once the index later populates, since nothing ever
      // re-checks a cached result. Only cache once the index has content.
      if (identifier || this.md5Index.size > 0) {
        this.resolutionCache.set(fileName, identifier ?? null);
      }
      return identifier;
    } catch (error) {
      this.logger.warn(
        `Thumbnail resolution failed for "${fileName}": ${errorMessage(error)}`,
      );
      // Not cached: a transient FTPS failure should be retried on the next
      // poll, unlike a confirmed "no match" result.
      return undefined;
    }
  }

  /** Streams the resolved thumbnail PNG bytes, or undefined if identifier is unknown. */
  async readThumbnail(identifier: string): Promise<Buffer | undefined> {
    if (!this.indexedIdentifiers.has(identifier)) return undefined;
    const remotePath = joinRemotePath(
      this.config.printJobThumbnail.imageDirectory,
      `${identifier}.png`,
    );
    try {
      return await this.sessions.execute('download', (client) =>
        downloadToBuffer(client, remotePath),
      );
    } catch (error) {
      this.logger.warn(
        `Thumbnail image download failed for "${identifier}": ${errorMessage(error)}`,
      );
      return undefined;
    }
  }

  private async resolve(fileName: string): Promise<string | undefined> {
    await this.ensureIndex();
    const jobBaseName = stripKnownExtensions(fileName);
    if (!jobBaseName) return undefined;

    const digest = await this.md5GcodeCandidate(jobBaseName);
    if (!digest) return undefined;

    for (const [identifier, indexedDigest] of this.md5Index) {
      if (indexedDigest === digest) return identifier;
    }
    return undefined;
  }

  private async md5GcodeCandidate(
    jobBaseName: string,
  ): Promise<string | undefined> {
    return this.sessions.execute('download', async (client) => {
      const gcodeDirectory = this.config.printJobThumbnail.gcodeDirectory;
      const entries = await client.list(gcodeDirectory);
      const candidate = entries
        .filter(
          (entry) =>
            entry.type === 'file' &&
            entry.name.startsWith(jobBaseName) &&
            entry.name.toLowerCase().endsWith('.gcode'),
        )
        // Deterministic pick for multi-plate jobs ("X_plate_1.gcode",
        // "X_plate_2.gcode", ...): first by name, so resolution never
        // depends on the FTP server's listing order.
        .sort((a, b) => a.name.localeCompare(b.name))[0];
      if (!candidate) return undefined;

      // Streamed, never buffered: gcode files for a long print can be
      // hundreds of MB. The hash is fed incrementally as bytes arrive over
      // FTPS rather than accumulating the whole file in memory first.
      const hash = createHash('md5');
      const sink = new PassThrough();
      sink.on('data', (chunk: Buffer) => hash.update(chunk));
      const downloadDone = client.download(
        sink,
        joinRemotePath(gcodeDirectory, candidate.name),
      );
      await Promise.all([downloadDone, finished(sink)]);
      return hash.digest('hex').toUpperCase();
    });
  }

  private async ensureIndex(): Promise<void> {
    if (this.indexBuilt) {
      const staleMs = Date.now() - this.lastIndexRefreshAt;
      if (staleMs < this.config.printJobThumbnail.indexRefreshIntervalMs) {
        return;
      }
    }
    await this.refreshIndex();
  }

  /**
   * Lists the md5 index directory and downloads only the .md5 files for
   * identifiers not already indexed — never re-downloads a known identifier,
   * so a large, mostly-stable index stays cheap to keep fresh.
   */
  private async refreshIndex(): Promise<void> {
    if (this.indexRefreshInFlight) return this.indexRefreshInFlight;
    this.indexRefreshInFlight = this.doRefreshIndex();
    try {
      await this.indexRefreshInFlight;
    } finally {
      this.indexRefreshInFlight = null;
    }
  }

  private async doRefreshIndex(): Promise<void> {
    const md5Directory = this.config.printJobThumbnail.md5IndexDirectory;
    await this.sessions.execute('list', async (client) => {
      const entries = await client.list(md5Directory);
      const newIdentifiers = entries
        .filter(
          (entry) =>
            entry.type === 'file' && entry.name.toLowerCase().endsWith('.md5'),
        )
        .map((entry) => entry.name.slice(0, -'.md5'.length))
        .filter((identifier) => !this.indexedIdentifiers.has(identifier));

      for (const identifier of newIdentifiers) {
        const digest = await downloadToBuffer(
          client,
          joinRemotePath(md5Directory, `${identifier}.md5`),
        );
        const value = digest
          .toString('utf8')
          .trim()
          .split(/\s+/)[0]
          ?.toUpperCase();
        if (value) {
          this.md5Index.set(identifier, value);
          this.indexedIdentifiers.add(identifier);
        }
      }
    });
    this.indexBuilt = true;
    this.lastIndexRefreshAt = Date.now();
  }
}

/**
 * "Cute_Bunny_13_MIN_Test_Print.gcode.3mf" -> "Cute_Bunny_13_MIN_Test_Print",
 * matching the print-job-name displayed in the dashboard against the bare
 * gcode base name used on the printer's cache directory.
 */
function stripKnownExtensions(fileName: string): string {
  return fileName
    .replace(/\.gcode\.3mf$/i, '')
    .replace(/\.3mf$/i, '')
    .trim();
}

function joinRemotePath(directory: string, name: string): string {
  return `${directory.replace(/\/+$/, '')}/${name}`;
}

async function downloadToBuffer(
  client: RemoteStorageClient,
  remotePath: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const sink = new PassThrough();
  sink.on('data', (chunk: Buffer) => chunks.push(chunk));
  const downloadDone = client.download(sink, remotePath);
  await Promise.all([downloadDone, finished(sink)]);
  return Buffer.concat(chunks);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
