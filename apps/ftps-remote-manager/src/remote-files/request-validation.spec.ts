import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { UploadSizeLimitStream } from './request-validation';

describe('request validation', () => {
  it('streams uploads within the configured byte limit', async () => {
    const output = new UploadSizeLimitStream(5);
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk));

    await pipeline(Readable.from([Buffer.from('model')]), output);

    expect(Buffer.concat(chunks).toString()).toBe('model');
  });

  it('rejects an upload after it crosses the byte limit', async () => {
    await expect(
      pipeline(
        Readable.from([Buffer.from('123'), Buffer.from('456')]),
        new UploadSizeLimitStream(5),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
