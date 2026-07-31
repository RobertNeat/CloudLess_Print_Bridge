import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-upload-zone',
  templateUrl: './upload-zone.html',
  styleUrl: './upload-zone.scss',
})
export class UploadZone {
  readonly path = input.required<string>();
  readonly uploadRequested = output<void>();
  protected dragging = false;
}
