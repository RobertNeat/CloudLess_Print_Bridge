import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { I18nService } from '../../core/i18n.service';
import { VideoFiltersService } from '../video-filters.service';

@Component({
  selector: 'app-video-search',
  imports: [ButtonModule, FormsModule, InputTextModule, SelectModule],
  templateUrl: './video-search.html',
  styleUrl: './video-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoSearch {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly i18n = inject(I18nService);
  protected readonly filters = inject(VideoFiltersService);
  protected readonly openFilter = signal<'date' | 'source' | null>(null);

  protected toggle(filter: 'date' | 'source'): void {
    this.openFilter.update((current) => (current === filter ? null : filter));
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    this.openFilter.set(null);
  }

  @HostListener('document:click', ['$event'])
  protected closeOnOutsideClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) this.openFilter.set(null);
  }
}
