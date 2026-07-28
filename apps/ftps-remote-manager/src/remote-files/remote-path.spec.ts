import { RemotePath } from './remote-path';

describe('RemotePath', () => {
  it('normalizes separators and redundant segments', () => {
    expect(RemotePath.from('/models\\.\\part.3mf').value).toBe(
      '/models/part.3mf',
    );
  });

  it.each(['/../secret', '../secret', 'relative/file'])(
    'rejects an unsafe path: %s',
    (path) => {
      expect(() => RemotePath.from(path)).toThrow(
        'must be absolute and cannot contain ..',
      );
    },
  );

  it.each(['/', '//', '/./'])('protects the remote root: %s', (path) => {
    expect(() => RemotePath.from(path).assertNotRoot('Deleting')).toThrow(
      'Deleting the remote root is not allowed',
    );
  });
});
