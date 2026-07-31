import { Component, input } from '@angular/core';
import type { FileListItem } from '../files-dashboard.models';
import { UploadZone } from '../upload-zone/upload-zone';

@Component({
  selector: 'app-file-details',
  imports: [UploadZone],
  templateUrl: './file-details.html',
  styleUrl: './file-details.scss',
})
export class FileDetails {
  readonly file = input<FileListItem | null>(null);
  readonly uploadPath = input.required<string>();
  protected uploadMessage = '';

  protected requestUpload(): void {
    this.uploadMessage = 'Wybór pliku będzie dostępny po podłączeniu usługi FTPS.';
  }
}
