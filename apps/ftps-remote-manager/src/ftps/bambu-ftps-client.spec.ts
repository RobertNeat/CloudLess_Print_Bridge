import { Client } from 'basic-ftp';
import { BambuFtpsClient } from './bambu-ftps-client';

describe('BambuFtpsClient', () => {
  let client: BambuFtpsClient;

  beforeEach(() => {
    client = new BambuFtpsClient(1_000);
  });

  afterEach(() => {
    client.close();
  });

  it.each([
    ['257 "/models" is current directory', '/models'],
    ['257 /', '/'],
    ['257 /models_x', '/models_x'],
  ])('parses the A1 PWD response %s', async (message, expected) => {
    jest.spyOn(client, 'send').mockResolvedValue({ code: 257, message });

    await expect(client.pwd()).resolves.toBe(expected);
  });

  it('rejects a malformed PWD response', async () => {
    jest.spyOn(client, 'send').mockResolvedValue({ code: 257, message: '257' });

    await expect(client.pwd()).rejects.toThrow(
      "Can't parse response to command 'PWD': 257",
    );
  });

  it('does not send credentials before certificate verification', async () => {
    jest
      .spyOn(client, 'connectImplicitTLS')
      .mockResolvedValue({ code: 220, message: 'ready' });
    const verify = jest
      .spyOn(
        client as unknown as { verifyFingerprint(value: string): void },
        'verifyFingerprint',
      )
      .mockImplementation(() => undefined);
    jest
      .spyOn(client, 'sendIgnoringError')
      .mockResolvedValue({ code: 200, message: 'ok' });
    const login = jest
      .spyOn(client, 'login')
      .mockResolvedValue({ code: 230, message: 'logged in' });
    jest.spyOn(client, 'useDefaultSettings').mockResolvedValue();

    await client.access(
      {
        host: 'printer',
        port: 990,
        user: 'bblp',
        password: 'secret',
        secure: 'implicit',
        secureOptions: { rejectUnauthorized: false },
      },
      'A'.repeat(64),
    );

    expect(verify).toHaveBeenCalledWith('A'.repeat(64));
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(
      login.mock.invocationCallOrder[0],
    );
  });

  it('remains compatible with the basic-ftp Client API', () => {
    expect(client).toBeInstanceOf(Client);
  });
});
