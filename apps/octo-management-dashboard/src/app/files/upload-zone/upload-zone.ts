import { Component, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-upload-zone',
  templateUrl: './upload-zone.html',
  styleUrl: './upload-zone.scss',
})
export class UploadZone {
  protected readonly i18n = inject(I18nService);
  readonly path = input.required<string>();
  readonly uploadRequested = output<File>();
  protected dragging = false;
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.uploadRequested.emit(file);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.uploadRequested.emit(file);
  }
}
