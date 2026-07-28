export class InvalidRemotePathError extends Error {
  constructor() {
    super('Remote path must be absolute and cannot contain ..');
    this.name = 'InvalidRemotePathError';
  }
}

export class ProtectedRemotePathError extends Error {
  constructor(operation: string) {
    super(`${operation} the remote root is not allowed`);
    this.name = 'ProtectedRemotePathError';
  }
}
