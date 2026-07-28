import { posix } from 'node:path';
import {
  InvalidRemotePathError,
  ProtectedRemotePathError,
} from './remote-path.errors';

export class RemotePath {
  private constructor(readonly value: string) {}

  static from(input: string): RemotePath {
    const normalizedSeparators = input.replaceAll('\\', '/');
    if (
      !normalizedSeparators.startsWith('/') ||
      normalizedSeparators.split('/').includes('..')
    ) {
      throw new InvalidRemotePathError();
    }
    return new RemotePath(posix.normalize(normalizedSeparators));
  }

  assertNotRoot(operation: string): RemotePath {
    if (this.value === '/') {
      throw new ProtectedRemotePathError(operation);
    }
    return this;
  }

  child(name: string): RemotePath {
    return RemotePath.from(posix.join(this.value, name));
  }

  temporaryUpload(identifier: string): RemotePath {
    return this.temporarySibling('upload', identifier);
  }

  temporaryBackup(identifier: string): RemotePath {
    return this.temporarySibling('backup', identifier);
  }

  parent(): RemotePath {
    return RemotePath.from(posix.dirname(this.value));
  }

  filename(): string {
    return posix.basename(this.value);
  }

  private temporarySibling(kind: string, identifier: string): RemotePath {
    const directory = posix.dirname(this.value);
    const filename = posix.basename(this.value);
    return RemotePath.from(
      posix.join(directory, `.${filename}.${kind}-${identifier}`),
    );
  }
}
