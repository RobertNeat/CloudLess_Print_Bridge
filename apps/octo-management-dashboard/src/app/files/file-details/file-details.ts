import { Component, inject, input, output } from '@angular/core';
import { I18nService } from '../../core/i18n.service';
import type { FileDimensions } from '../files-dashboard.models';
import type { FileListItem } from '../files-dashboard.models';
import { UploadZone } from '../upload-zone/upload-zone';

@Component({
  selector: 'app-file-details',
  imports: [UploadZone],
  templateUrl: './file-details.html',
  styleUrl: './file-details.scss',
})
export class FileDetails {
  protected readonly i18n = inject(I18nService);
  readonly file = input<FileListItem | null>(null);
  readonly uploadPath = input.required<string>();
  readonly statusMessage = input('');
  readonly uploadRequested = output<void>();

  protected formatUnit(value: number | undefined, unit: string): string {
    return value === undefined ? '—' : `${this.i18n.formatNumber(value)} ${unit}`;
  }

  protected formatDimensions(value: FileDimensions | undefined): string {
    if (!value) return '—';
    return `${this.i18n.formatNumber(value.x)} × ${this.i18n.formatNumber(value.y)} × ${this.i18n.formatNumber(value.z)} mm`;
  }

  protected formatCost(value: number | undefined, currency: string | undefined): string {
    return value === undefined ? '—' : this.i18n.formatCurrency(value, currency);
  }

  protected formatDuration(value: number | undefined): string {
    return value === undefined ? '—' : this.i18n.formatDuration(value);
  }
}
