export class InvalidRemoteFileSelectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRemoteFileSelectorError';
  }
}

export class RemoteFileName {
  private constructor(readonly value: string) {}

  static from(value: string): RemoteFileName {
    const normalized = value.trim();
    if (
      !normalized ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.includes('/') ||
      normalized.includes('\\')
    ) {
      throw new InvalidRemoteFileSelectorError(
        'File name must not contain path separators',
      );
    }
    return new RemoteFileName(normalized);
  }
}

export class RemoteFileExtension {
  private constructor(readonly value: string) {}

  static from(value: string): RemoteFileExtension {
    const normalized = value.trim();
    if (!/^\.[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
      throw new InvalidRemoteFileSelectorError(
        'Extension must start with a dot and must not contain path separators',
      );
    }
    return new RemoteFileExtension(normalized);
  }

  matches(filename: string): boolean {
    return filename.toLowerCase().endsWith(this.value.toLowerCase());
  }
}

export class RemoteFilePattern {
  readonly displayValue: string;
  private readonly basenamePattern: RegExp;

  private constructor(
    name: RemoteFileName,
    prefix: string,
    suffix: string,
    readonly extension: RemoteFileExtension,
  ) {
    const prefixPattern = wildcardFragment(prefix, 'prefix');
    const suffixPattern = wildcardFragment(suffix, 'suffix');
    this.basenamePattern = new RegExp(
      `^${prefixPattern}${escapeRegExp(name.value)}${suffixPattern}$`,
      'u',
    );
    this.displayValue = `${prefix}${name.value}${suffix}${extension.value}`;
  }

  static from(
    name: RemoteFileName,
    prefix: string | undefined,
    suffix: string | undefined,
    extension: string,
  ): RemoteFilePattern {
    return new RemoteFilePattern(
      name,
      prefix ?? '',
      suffix ?? '',
      RemoteFileExtension.from(extension),
    );
  }

  matches(filename: string): boolean {
    if (!this.extension.matches(filename)) return false;
    const basename = filename.slice(0, -this.extension.value.length);
    return this.basenamePattern.test(basename);
  }
}

function wildcardFragment(value: string, fieldName: string): string {
  if (value.includes('/') || value.includes('\\')) {
    throw new InvalidRemoteFileSelectorError(
      `${fieldName} must not contain path separators`,
    );
  }
  return [...value]
    .map((character) => {
      if (character === '*') return '.*';
      if (character === '?') return '.';
      return escapeRegExp(character);
    })
    .join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
