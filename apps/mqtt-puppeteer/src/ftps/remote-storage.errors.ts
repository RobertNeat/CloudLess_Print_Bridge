export type RemoteStorageFailureKind =
  'unavailable' | 'timeout' | 'not-found' | 'conflict';

export type RemoteStorageOperation =
  | 'connect'
  | 'list'
  | 'download'
  | 'upload'
  | 'move'
  | 'delete-file'
  | 'create-directory'
  | 'delete-directory';

export class RemoteStorageOperationError extends Error {
  constructor(
    readonly kind: RemoteStorageFailureKind,
    readonly operation: RemoteStorageOperation,
    options?: ErrorOptions,
  ) {
    super(`Remote storage ${operation} failed`, options);
    this.name = 'RemoteStorageOperationError';
  }
}
