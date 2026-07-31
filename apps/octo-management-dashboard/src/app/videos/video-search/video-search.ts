import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { VideoFiltersService } from '../video-filters.service';

@Component({
  selector: 'app-video-search',
  imports: [ButtonModule, FormsModule, InputTextModule, SelectModule],
  templateUrl: './video-search.html',
  styleUrl: './video-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoSearch {
  protected readonly filters = inject(VideoFiltersService);
  protected readonly openFilter = signal<'date' | 'source' | null>(null);

  protected toggle(filter: 'date' | 'source'): void {
    this.openFilter.update((current) => (current === filter ? null : filter));
  }
}
