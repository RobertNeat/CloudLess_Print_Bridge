import { Client, type AccessOptions, type FTPResponse } from 'basic-ftp';
import { TLSSocket } from 'node:tls';

/**
 * basic-ftp client adapted to the embedded FTP server used by Bambu Lab A1.
 * Certificate pinning happens before credentials are sent.
 */
export class BambuFtpsClient extends Client {
  override async access(
    options: AccessOptions = {},
    expectedFingerprint?: string,
  ): Promise<FTPResponse> {
    if (!expectedFingerprint) {
      throw new Error('An expected FTPS certificate fingerprint is required');
    }

    const usesExplicitTls = options.secure === true;
    const usesImplicitTls = options.secure === 'implicit';
    const welcome = usesImplicitTls
      ? await this.connectImplicitTLS(
          options.host,
          options.port,
          options.secureOptions,
        )
      : await this.connect(options.host, options.port);

    if (usesExplicitTls) {
      await this.useTLS({
        ...options.secureOptions,
        host: options.secureOptions?.host ?? options.host,
      });
    }
    if (!usesImplicitTls && !usesExplicitTls) {
      throw new Error('FTPS requires implicit or explicit TLS');
    }

    this.verifyFingerprint(expectedFingerprint);
    await this.sendIgnoringError('OPTS UTF8 ON');
    await this.login(options.user, options.password);
    await this.useDefaultSettings();
    return welcome;
  }

  override async pwd(): Promise<string> {
    const response = await this.send('PWD');
    const quotedPath = response.message.match(/"(.+)"/);
    if (quotedPath?.[1]) return quotedPath[1];

    // A1 can return `257 /` instead of the RFC-style quoted path.
    const unquotedPath = response.message.match(/^257\s+(\/\S*)(?:\s.*)?$/);
    if (unquotedPath?.[1]) return unquotedPath[1];

    throw new Error(
      `Can't parse response to command 'PWD': ${response.message}`,
    );
  }

  private verifyFingerprint(expected: string): void {
    if (!(this.ftp.socket instanceof TLSSocket) || !this.ftp.socket.encrypted) {
      throw new Error('FTPS did not establish an encrypted TLS socket');
    }
    const actual = this.ftp.socket
      .getPeerCertificate()
      .fingerprint256?.replaceAll(':', '')
      .toUpperCase();
    if (actual !== expected) {
      throw new Error('FTPS certificate SHA-256 fingerprint mismatch');
    }
  }
}
