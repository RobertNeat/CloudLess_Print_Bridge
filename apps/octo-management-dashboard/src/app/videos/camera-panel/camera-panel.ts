import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import type { CameraMetric, CameraSource } from '../videos-dashboard.models';

@Component({
  selector: 'app-camera-panel',
  imports: [ButtonModule],
  templateUrl: './camera-panel.html',
  styleUrl: './camera-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraPanel {
  readonly metrics = input.required<readonly CameraMetric[]>();
  readonly sources = input.required<readonly CameraSource[]>();
  readonly selectedSourceId = input.required<string>();
  readonly sourceSelected = output<string>();
}
