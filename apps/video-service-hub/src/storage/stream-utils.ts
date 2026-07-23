import { PayloadTooLargeException } from '@nestjs/common';
import { Transform } from 'node:stream';

export class SizeAndHashTransform extends Transform {
  private bytesSeen = 0;

  constructor(
    private readonly maximumBytes: number,
    private readonly onChunk: (chunk: Buffer) => void,
  ) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    this.bytesSeen += chunk.length;
    if (this.bytesSeen > this.maximumBytes) {
      callback(
        new PayloadTooLargeException(
          `upload exceeds the ${this.maximumBytes} byte limit`,
        ),
      );
      return;
    }
    this.onChunk(chunk);
    callback(null, chunk);
  }
}

export class MjpegCountingTransform extends Transform {
  private bytesSeen = 0;
  private frameCount = 0;
  private tail = Buffer.alloc(0);

  constructor(
    private readonly boundary: Buffer,
    private readonly maximumBytes: number,
    private readonly onProgress: (bytes: number, frames: number) => void,
  ) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    this.bytesSeen += chunk.length;
    if (this.bytesSeen > this.maximumBytes) {
      callback(
        new PayloadTooLargeException(
          `live stream exceeds the ${this.maximumBytes} byte limit`,
        ),
      );
      return;
    }

    const searchable = Buffer.concat([this.tail, chunk]);
    let offset = 0;
    while ((offset = searchable.indexOf(this.boundary, offset)) >= 0) {
      this.frameCount += 1;
      offset += this.boundary.length;
    }
    const tailLength = Math.min(this.boundary.length - 1, searchable.length);
    this.tail = searchable.subarray(searchable.length - tailLength);
    this.onProgress(this.bytesSeen, this.frameCount);
    callback(null, chunk);
  }
}
