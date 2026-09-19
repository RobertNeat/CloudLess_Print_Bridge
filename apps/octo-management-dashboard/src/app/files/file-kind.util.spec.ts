import {
  extensionFromName,
  fileIconFromName,
  fileKindFromExtension,
  fileKindIcon,
} from './file-kind.util';

describe('extensionFromName', () => {
  it('extracts a simple extension', () => {
    expect(extensionFromName('photo.png')).toBe('png');
  });

  it('keeps compound extensions such as gcode.3mf', () => {
    expect(extensionFromName('FILEB.gcode.3mf')).toBe('gcode.3mf');
  });

  it('handles a bare extension without a file name', () => {
    expect(extensionFromName('.gcode')).toBe('gcode');
  });

  it('strips any path segments before extracting the extension', () => {
    expect(extensionFromName('/home/cache/FILEA-plate-1.gcode')).toBe('gcode');
  });

  it('returns the whole name when there is no extension', () => {
    expect(extensionFromName('README')).toBe('readme');
  });
});

describe('fileKindFromExtension', () => {
  it('maps gcode files to the gcode kind', () => {
    expect(fileKindFromExtension('FILEA-plate-1.gcode')).toBe('gcode');
  });

  it('maps compound gcode.3mf files to the gcode kind', () => {
    expect(fileKindFromExtension('FILEB.gcode.3mf')).toBe('gcode');
  });

  it('maps plain 3mf files to the gcode kind', () => {
    expect(fileKindFromExtension('plate.3mf')).toBe('gcode');
  });

  it('maps image extensions to the image kind', () => {
    expect(fileKindFromExtension('F0A-B02-C03.png')).toBe('image');
    expect(fileKindFromExtension('photo.jpg')).toBe('image');
  });

  it('maps log extensions to the log kind', () => {
    expect(fileKindFromExtension('01234-index.log')).toBe('log');
  });

  it('maps archive extensions to the archive kind', () => {
    expect(fileKindFromExtension('CAM-012-index.avi.zip')).toBe('archive');
    expect(fileKindFromExtension('backup.tar')).toBe('archive');
  });

  it('maps 3d model extensions to the model kind', () => {
    expect(fileKindFromExtension('part.stl')).toBe('model');
    expect(fileKindFromExtension('part.obj')).toBe('model');
  });

  it('falls back to binary for unknown extensions', () => {
    expect(fileKindFromExtension('053493.md5')).toBe('binary');
    expect(fileKindFromExtension('CAM-012-index.bin')).toBe('binary');
  });
});

describe('fileKindIcon', () => {
  it('returns a distinct PrimeIcon class per kind', () => {
    expect(fileKindIcon('gcode')).toBe('pi pi-print');
    expect(fileKindIcon('image')).toBe('pi pi-image');
    expect(fileKindIcon('log')).toBe('pi pi-file-edit');
    expect(fileKindIcon('archive')).toBe('pi pi-folder-open');
    expect(fileKindIcon('model')).toBe('pi pi-box');
    expect(fileKindIcon('binary')).toBe('pi pi-file');
  });
});

describe('fileIconFromName', () => {
  it('derives the icon directly from a file name', () => {
    expect(fileIconFromName('FILEB.gcode.3mf')).toBe('pi pi-print');
    expect(fileIconFromName('F0A-B02-C03.png')).toBe('pi pi-image');
  });
});
