import {
  BadRequestException,
  PayloadTooLargeException,
  PipeTransform,
} from '@nestjs/common';
import { Transform, type TransformCallback } from 'node:stream';

export class RequiredStringPipe implements PipeTransform<unknown, string> {
  constructor(private readonly fieldName: string) {}

  transform(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(
        `${this.fieldName} must be a non-empty string`,
      );
    }
    return value;
  }
}

export class OptionalStringPipe implements PipeTransform<unknown, string> {
  constructor(
    private readonly fieldName: string,
    private readonly fallback: string,
  ) {}

  transform(value: unknown): string {
    if (value === undefined) return this.fallback;
    return new RequiredStringPipe(this.fieldName).transform(value);
  }
}

export class OptionalBooleanPipe implements PipeTransform<unknown, boolean> {
  constructor(
    private readonly fieldName: string,
    private readonly fallback: boolean,
  ) {}

  transform(value: unknown): boolean {
    if (value === undefined) return this.fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException(`${this.fieldName} must be true or false`);
  }
}

export class DeleteByNameRequestPipe implements PipeTransform<
  unknown,
  { targets: Array<{ path: string; extension: string }> }
> {
  transform(value: unknown): {
    targets: Array<{ path: string; extension: string }>;
  } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException('Request body must be a JSON object');
    }
    const targets = (value as { targets?: unknown }).targets;
    if (!Array.isArray(targets) || targets.length === 0) {
      throw new BadRequestException('targets must be a non-empty array');
    }
    for (const target of targets) {
      if (
        typeof target !== 'object' ||
        target === null ||
        Array.isArray(target)
      ) {
        throw new BadRequestException('Each target must be a JSON object');
      }
      const candidate = target as Record<string, unknown>;
      for (const field of ['path', 'extension']) {
        if (
          typeof candidate[field] !== 'string' ||
          candidate[field].trim().length === 0
        ) {
          throw new BadRequestException(
            `Each target ${field} must be a non-empty string`,
          );
        }
      }
      for (const field of ['prefix', 'suffix']) {
        if (
          candidate[field] !== undefined &&
          typeof candidate[field] !== 'string'
        ) {
          throw new BadRequestException(
            `Each target ${field} must be a string when provided`,
          );
        }
      }
    }
    return value as {
      targets: Array<{ path: string; extension: string }>;
    };
  }
}

export class RequiredStringFieldsPipe<
  Fields extends readonly string[],
> implements PipeTransform<unknown, Record<Fields[number], string>> {
  constructor(private readonly fields: Fields) {}

  transform(value: unknown): Record<Fields[number], string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    const body = value as Record<string, unknown>;
    for (const field of this.fields) {
      if (typeof body[field] !== 'string' || body[field].trim().length === 0) {
        throw new BadRequestException(`${field} must be a non-empty string`);
      }
    }
    return body as Record<Fields[number], string>;
  }
}

export class UploadSizeLimitStream extends Transform {
  private receivedBytes = 0;

  constructor(private readonly maximumBytes: number) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.receivedBytes += chunk.length;
    if (this.receivedBytes > this.maximumBytes) {
      callback(
        new PayloadTooLargeException(
          `Upload exceeds the ${this.maximumBytes} byte limit`,
        ),
      );
      return;
    }
    callback(null, chunk);
  }
}
