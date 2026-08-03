import { Component, inject, input, output } from '@angular/core';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-upload-zone',
  templateUrl: './upload-zone.html',
  styleUrl: './upload-zone.scss',
})
export class UploadZone {
  protected readonly i18n = inject(I18nService);
  readonly path = input.required<string>();
  readonly uploadRequested = output<void>();
  protected dragging = false;
}
