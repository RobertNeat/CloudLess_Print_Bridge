import type { RemoteEntryDto } from '@cloudless/printer-contracts';
import type { RemoteStorageEntry } from '../ftps/remote-storage.client';
import { RemotePath } from './remote-path';

export function toRemoteEntryDto(
  parent: RemotePath,
  entry: RemoteStorageEntry,
): RemoteEntryDto {
  return {
    name: entry.name,
    path: parent.child(entry.name).value,
    type: entry.type,
    size: entry.size,
    ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt.toISOString() } : {}),
  };
}
