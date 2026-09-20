import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MoveRemoteEntryRequestDto } from '@cloudless/printer-contracts';
import type { FilesOperationsPort } from '../files-dashboard.ports';
import type { FileAction, FileListItem } from '../files-dashboard.models';
import { FtpsRemoteManagerConfig } from './ftps-remote-manager.config';

const OCTET_STREAM = 'application/octet-stream';

/**
 * Real FilesOperationsPort implementation backed by ftps-remote-manager.
 *
 * download() is intentionally not routed through execute() -- it isn't a
 * mutating operation like rename/move/delete, it needs a distinct blob-based
 * browser flow (fetch + object URL + programmatic anchor click), and lumping
 * it into the execute() action switch would make that method do two
 * unrelated jobs (fire-and-forget mutation vs. return-a-payload-and-save-it).
 */
@Injectable({ providedIn: 'root' })
export class HttpFilesOperationsAdapter implements FilesOperationsPort {
  private readonly http = inject(HttpClient);
  private readonly config = inject(FtpsRemoteManagerConfig);

  async execute(
    action: FileAction,
    file: FileListItem,
    destination?: string,
  ): Promise<'ok' | 'error'> {
    try {
      switch (action) {
        case 'delete':
          await firstValueFrom(this.http.delete<void>(this.fileUrl(file.path)));
          return 'ok';
        case 'rename': {
          // The backend has no separate rename endpoint -- a rename is just a
          // move to the same directory with a new filename, per settled design.
          const newName = destination?.trim();
          if (!newName) return 'error';
          await this.moveEntry(file.path, this.joinPath(this.parentPath(file.path), newName));
          return 'ok';
        }
        case 'move': {
          const targetDirectory = destination?.trim();
          if (!targetDirectory) return 'error';
          await this.moveEntry(file.path, this.joinPath(targetDirectory, file.name));
          return 'ok';
        }
        case 'download':
          // Never reached: FilesDashboardPage routes 'download' through
          // operations.download() instead of execute(). Kept exhaustive so a
          // future FileAction addition doesn't silently fall through.
          return 'error';
      }
    } catch {
      return 'error';
    }
  }

  async upload(path: string, file: File, force = false): Promise<'ok' | 'conflict' | 'error'> {
    const destination = this.joinPath(path, file.name);
    try {
      await firstValueFrom(
        this.http.put<void>(this.fileUrl(destination), file, {
          // The backend rejects anything but a raw-bytes body: it checks
          // request.is('application/octet-stream') and throws 415 otherwise,
          // so the browser's inferred multipart/File-mime Content-Type must
          // be overridden explicitly rather than left to HttpClient/File.
          headers: { 'Content-Type': OCTET_STREAM },
          params: { force: String(force) },
        }),
      );
      return 'ok';
    } catch (error) {
      // 409 Conflict is what remote-files-exception.filter.ts maps a
      // RemoteStorageOperationError('conflict', ...) to; surfaced as a
      // distinct result so the page can offer an overwrite retry with force.
      if (error instanceof HttpErrorResponse && error.status === 409) return 'conflict';
      return 'error';
    }
  }

  // Lets HTTP failures propagate as-is; FilesDashboardPage wraps the call in
  // try/catch to surface a notice, matching the pattern it already uses for
  // other repository/operation failures elsewhere on the page.
  async download(file: FileListItem): Promise<void> {
    const blob = await firstValueFrom(
      this.http.get(this.fileUrl(file.path), { responseType: 'blob' }),
    );
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.click();
    // Revoking synchronously right after click() can cancel the download in
    // some browsers because the click's navigation is asynchronous; defer
    // the revoke to the next tick instead.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  private async moveEntry(source: string, destination: string): Promise<void> {
    const body: MoveRemoteEntryRequestDto = { source, destination };
    await firstValueFrom(this.http.post<void>(`${this.config.baseUrl}/files/move`, body));
  }

  private fileUrl(path: string): string {
    // Encode each segment individually (not the whole path, which would also
    // escape the '/' separators) so filenames with spaces/'#'/'%'/etc. survive
    // as a valid URL -- unlike the GET-listing endpoint, this path is spliced
    // directly into the URL rather than passed via HttpClient's `params`.
    const encoded = path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${this.config.baseUrl}/files${encoded}`;
  }

  private joinPath(directory: string, name: string): string {
    return directory.endsWith('/') ? `${directory}${name}` : `${directory}/${name}`;
  }

  private parentPath(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
  }
}
