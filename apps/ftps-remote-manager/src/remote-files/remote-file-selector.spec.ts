import {
  RemoteFileExtension,
  RemoteFileName,
  RemoteFilePattern,
} from './remote-file-selector';

describe('remote file selectors', () => {
  it('matches simple and compound extensions case-insensitively', () => {
    expect(RemoteFileExtension.from('.log').matches('DEVICE.LOG')).toBe(true);
    expect(RemoteFileExtension.from('.tar.gz').matches('archive.TAR.GZ')).toBe(
      true,
    );
  });

  it.each(['../file', 'folder/file', 'folder\\file', '..'])(
    'rejects a filename containing path syntax: %s',
    (name) => {
      expect(() => RemoteFileName.from(name)).toThrow(
        'must not contain path separators',
      );
    },
  );

  it.each(['log', '../log', '.', '.log/path'])(
    'rejects an invalid extension: %s',
    (extension) => {
      expect(() => RemoteFileExtension.from(extension)).toThrow(
        'Extension must start with a dot',
      );
    },
  );

  it('treats question mark as one character and asterisk as a sequence', () => {
    const pattern = RemoteFilePattern.from(
      RemoteFileName.from('(Niezapisany)'),
      'plate_*_',
      '_?',
      '.gcode.3mf',
    );

    expect(pattern.matches('plate_12_(Niezapisany)_a.gcode.3mf')).toBe(true);
    expect(pattern.matches('plate_(Niezapisany)_ab.gcode.3mf')).toBe(false);
    expect(pattern.matches('(Niezapisany)_a.gcode.3mf')).toBe(false);
  });
});
