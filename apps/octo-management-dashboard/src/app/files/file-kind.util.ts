import type { FileKind } from './files-dashboard.models';

const GCODE_EXTENSIONS = ['gcode.3mf', 'gcode', '3mf'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
const LOG_EXTENSIONS = ['log', 'txt'];
const ARCHIVE_EXTENSIONS = ['zip', 'tar', 'gz', 'rar', '7z'];
const MODEL_EXTENSIONS = ['stl', 'obj', 'step', 'stp'];

const KIND_ICONS: Record<FileKind, string> = {
  gcode: 'pi pi-print',
  image: 'pi pi-image',
  binary: 'pi pi-file',
  log: 'pi pi-file-edit',
  model: 'pi pi-box',
  archive: 'pi pi-folder-open',
};

/**
 * Extracts the extension portion of a file name, keeping compound suffixes
 * (e.g. "FILEB.gcode.3mf" -> "gcode.3mf") since sliced print files use them
 * to distinguish plain 3MF archives from gcode-carrying ones.
 */
export function extensionFromName(fileNameOrExtension: string): string {
  const lower = fileNameOrExtension.trim().toLowerCase();
  const withoutPath = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;
  const withoutLeadingDot = withoutPath.startsWith('.') ? withoutPath.slice(1) : withoutPath;
  const firstDot = withoutLeadingDot.indexOf('.');
  return firstDot === -1 ? withoutLeadingDot : withoutLeadingDot.slice(firstDot + 1);
}

export function fileKindFromExtension(fileNameOrExtension: string): FileKind {
  const extension = extensionFromName(fileNameOrExtension);
  const lastSegment = extension.includes('.')
    ? extension.slice(extension.lastIndexOf('.') + 1)
    : extension;

  if (GCODE_EXTENSIONS.includes(extension) || GCODE_EXTENSIONS.includes(lastSegment)) {
    return 'gcode';
  }
  if (IMAGE_EXTENSIONS.includes(lastSegment)) return 'image';
  if (LOG_EXTENSIONS.includes(lastSegment)) return 'log';
  if (ARCHIVE_EXTENSIONS.includes(lastSegment)) return 'archive';
  if (MODEL_EXTENSIONS.includes(lastSegment)) return 'model';
  return 'binary';
}

export function fileKindIcon(kind: FileKind): string {
  return KIND_ICONS[kind];
}

export function fileIconFromName(fileNameOrExtension: string): string {
  return fileKindIcon(fileKindFromExtension(fileNameOrExtension));
}
