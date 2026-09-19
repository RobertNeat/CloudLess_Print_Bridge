import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { KeyedLock } from '../common/keyed-lock';
import { assertCameraBaseUrl, assertIdentifier } from '../common/validation';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import type {
  CameraRegistryEntry,
  CameraRegistryInput,
} from './camera-registry.types';

@Injectable()
export class CameraRegistryService implements OnModuleInit {
  private readonly logger = new Logger(CameraRegistryService.name);
  private readonly lock = new KeyedLock();
  private readonly entries = new Map<string, CameraRegistryEntry>();
  private root!: string;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ServiceConfig) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    this.root = join(this.config.storage.root, 'camera-registry');
    await mkdir(this.root, { recursive: true });
    const files = await readdir(this.root).catch(() => []);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const entry = await this.readJsonIfExists(join(this.root, file));
      if (entry?.schemaVersion === 1) {
        this.entries.set(entry.cameraId, entry);
      }
    }
    this.logger.log(`Camera registry loaded ${this.entries.size} camera(s)`);
  }

  list(): CameraRegistryEntry[] {
    return [...this.entries.values()].sort((left, right) =>
      left.cameraId.localeCompare(right.cameraId),
    );
  }

  get(cameraId: string): CameraRegistryEntry {
    const entry = this.entries.get(assertIdentifier(cameraId, 'cameraId'));
    if (!entry) {
      throw new NotFoundException('camera is not registered');
    }
    return entry;
  }

  tryGet(cameraId: string): CameraRegistryEntry | undefined {
    return this.entries.get(cameraId);
  }

  async create(
    cameraId: string,
    input: CameraRegistryInput,
  ): Promise<CameraRegistryEntry> {
    assertIdentifier(cameraId, 'cameraId');
    const baseUrl = assertCameraBaseUrl(input.baseUrl);
    return this.lock.run(`registry:${cameraId}`, async () => {
      if (this.entries.has(cameraId)) {
        throw new ConflictException('camera is already registered');
      }
      const now = new Date().toISOString();
      const entry: CameraRegistryEntry = {
        schemaVersion: 1,
        cameraId,
        baseUrl,
        displayName: input.displayName?.trim() || undefined,
        locationCode: input.locationCode?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await this.persist(entry);
      this.entries.set(cameraId, entry);
      return entry;
    });
  }

  async update(
    cameraId: string,
    input: Partial<CameraRegistryInput>,
  ): Promise<CameraRegistryEntry> {
    assertIdentifier(cameraId, 'cameraId');
    return this.lock.run(`registry:${cameraId}`, async () => {
      const existing = this.entries.get(cameraId);
      if (!existing) {
        throw new NotFoundException('camera is not registered');
      }
      const entry: CameraRegistryEntry = {
        ...existing,
        baseUrl:
          input.baseUrl !== undefined
            ? assertCameraBaseUrl(input.baseUrl)
            : existing.baseUrl,
        displayName:
          input.displayName !== undefined
            ? input.displayName.trim() || undefined
            : existing.displayName,
        locationCode:
          input.locationCode !== undefined
            ? input.locationCode.trim() || undefined
            : existing.locationCode,
        updatedAt: new Date().toISOString(),
      };
      await this.persist(entry);
      this.entries.set(cameraId, entry);
      return entry;
    });
  }

  async remove(cameraId: string): Promise<void> {
    assertIdentifier(cameraId, 'cameraId');
    await this.lock.run(`registry:${cameraId}`, async () => {
      if (!this.entries.has(cameraId)) {
        throw new NotFoundException('camera is not registered');
      }
      await rm(this.entryPath(cameraId), { force: true });
      this.entries.delete(cameraId);
    });
  }

  private async persist(entry: CameraRegistryEntry): Promise<void> {
    const filePath = this.entryPath(entry.cameraId);
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(entry, null, 2)}\n`,
        'utf8',
      );
      await rename(temporaryPath, filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private entryPath(cameraId: string): string {
    return join(this.root, `${cameraId}.json`);
  }

  private async readJsonIfExists(
    filePath: string,
  ): Promise<CameraRegistryEntry | undefined> {
    try {
      return JSON.parse(
        await readFile(filePath, 'utf8'),
      ) as CameraRegistryEntry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw new Error(`Cannot read camera registry entry ${filePath}`, {
        cause: error,
      });
    }
  }
}
