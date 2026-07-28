import { FTPError } from 'basic-ftp';
import { PassThrough, Readable } from 'node:stream';
import { BambuFtpsAdapter } from './bambu-ftps.adapter';
import { BambuFtpsClient } from './bambu-ftps-client';

describe('BambuFtpsAdapter', () => {
  const accessOptions = {
    host: 'printer',
    port: 990,
    user: 'bblp',
    password: 'secret',
    secure: 'implicit' as const,
  };
  let client: jest.Mocked<BambuFtpsClient>;
  let adapter: BambuFtpsAdapter;

  beforeEach(() => {
    client = {
      access: jest.fn().mockResolvedValue({ code: 220, message: 'ready' }),
      list: jest.fn(),
      downloadTo: jest.fn(),
      uploadFrom: jest.fn(),
      remove: jest.fn(),
      rename: jest.fn(),
      ensureDir: jest.fn(),
      removeDir: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<BambuFtpsClient>;
    adapter = new BambuFtpsAdapter(client, accessOptions, 'A'.repeat(64));
  });

  it('maps connection timeouts to a neutral storage error', async () => {
    client.access.mockRejectedValueOnce(
      Object.assign(new Error('socket timed out'), { code: 'ETIMEDOUT' }),
    );

    await expect(adapter.connect()).rejects.toMatchObject({
      kind: 'timeout',
      operation: 'connect',
    });
  });

  it('maps missing downloads and upload conflicts', async () => {
    const missing = new FTPError({ code: 550, message: '550 Missing' });
    client.downloadTo.mockRejectedValueOnce(missing);
    client.uploadFrom.mockRejectedValueOnce(missing);

    await expect(
      adapter.download(new PassThrough(), '/missing.3mf'),
    ).rejects.toMatchObject({ kind: 'not-found' });
    await expect(
      adapter.upload(Readable.from('model'), '/existing.3mf'),
    ).rejects.toMatchObject({ kind: 'conflict' });
  });
});
