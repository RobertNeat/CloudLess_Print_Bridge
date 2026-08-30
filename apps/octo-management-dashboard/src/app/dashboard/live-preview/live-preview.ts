import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import type { LivePreviewData } from '../dashboard.models';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-live-preview',
  imports: [ButtonModule, FormsModule, SelectModule],
  templateUrl: './live-preview.html',
  styleUrl: './live-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LivePreview {
  protected readonly i18n = inject(I18nService);
  readonly preview = input.required<LivePreviewData>();
  readonly resolutionChanged = output<string>();
  readonly activeChanged = output<boolean>();
}
