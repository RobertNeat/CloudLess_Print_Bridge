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

type GlobToken =
  { kind: 'any' } | { kind: 'one' } | { kind: 'literal'; character: string };

export class RemoteFilePattern {
  readonly displayValue: string;
  private readonly basenameTokens: GlobToken[];

  private constructor(
    name: RemoteFileName,
    prefix: string,
    suffix: string,
    readonly extension: RemoteFileExtension,
  ) {
    assertNoPathSeparators(prefix, 'prefix');
    assertNoPathSeparators(suffix, 'suffix');
    this.basenameTokens = [
      ...wildcardTokens(prefix),
      ...literalTokens(name.value),
      ...wildcardTokens(suffix),
    ];
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
    return matchesTokens(this.basenameTokens, basename);
  }
}

function assertNoPathSeparators(value: string, fieldName: string): void {
  if (value.includes('/') || value.includes('\\')) {
    throw new InvalidRemoteFileSelectorError(
      `${fieldName} must not contain path separators`,
    );
  }
}

/** `*` matches any sequence of characters, `?` matches exactly one. */
function wildcardTokens(value: string): GlobToken[] {
  return [...value].map((character) => {
    if (character === '*') return { kind: 'any' };
    if (character === '?') return { kind: 'one' };
    return { kind: 'literal', character };
  });
}

function literalTokens(value: string): GlobToken[] {
  return [...value].map((character) => ({ kind: 'literal', character }));
}

/**
 * Matches `text` against a token sequence built from `*`/`?` wildcard
 * fragments and literal fragments (e.g. the file name, where `*`/`?` are
 * not wildcards). Implemented iteratively over tokens (no dynamic RegExp
 * construction) to avoid catastrophic backtracking on adversarial input.
 */
function matchesTokens(tokens: GlobToken[], text: string): boolean {
  const textChars = [...text];

  let tokenIndex = 0;
  let textIndex = 0;
  let starTokenIndex = -1;
  let starTextIndex = -1;

  while (textIndex < textChars.length) {
    const token = tokens[tokenIndex];
    if (token?.kind === 'one') {
      tokenIndex++;
      textIndex++;
    } else if (token?.kind === 'any') {
      starTokenIndex = tokenIndex;
      starTextIndex = textIndex;
      tokenIndex++;
    } else if (
      token?.kind === 'literal' &&
      token.character === textChars[textIndex]
    ) {
      tokenIndex++;
      textIndex++;
    } else if (starTokenIndex !== -1) {
      tokenIndex = starTokenIndex + 1;
      starTextIndex++;
      textIndex = starTextIndex;
    } else {
      return false;
    }
  }

  while (tokens[tokenIndex]?.kind === 'any') {
    tokenIndex++;
  }

  return tokenIndex === tokens.length;
}
