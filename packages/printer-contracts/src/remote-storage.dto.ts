export type RemoteEntryType =
  | "file"
  | "directory"
  | "symbolic-link"
  | "unknown";

export interface RemoteEntryDto {
  name: string;
  path: string;
  type: RemoteEntryType;
  size: number;
  modifiedAt?: string;
}

export interface RemoteStorageConnectionDto {
  ok: true;
}

export interface MoveRemoteEntryRequestDto {
  source: string;
  destination: string;
}

export interface CreateRemoteDirectoryRequestDto {
  path: string;
}

export interface RemoteFileLocationExtensionDto {
  path: string;
  prefix?: string;
  suffix?: string;
  extension: string;
}

export interface DeleteRemoteFilesByNameRequestDto {
  targets: RemoteFileLocationExtensionDto[];
}

export interface RemoteFileBatchDeleteResultDto {
  deleted: string[];
  notFound: string[];
}
