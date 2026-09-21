import type { Readable, Writable } from 'node:stream';

export type RemoteStorageEntryType =
  'file' | 'directory' | 'symbolic-link' | 'unknown';

export interface RemoteStorageEntry {
  name: string;
  type: RemoteStorageEntryType;
  size: number;
  modifiedAt?: Date;
}

export interface RemoteStorageClient {
  connect(): Promise<void>;
  list(path: string): Promise<RemoteStorageEntry[]>;
  download(destination: Writable, remotePath: string): Promise<void>;
  upload(source: Readable, remotePath: string): Promise<void>;
  deleteFile(remotePath: string): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
  close(): void;
}
