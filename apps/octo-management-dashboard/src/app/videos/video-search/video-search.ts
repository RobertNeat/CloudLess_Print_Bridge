import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { I18nService } from '../../core/i18n.service';
import type { JobDto } from '../backend/job-queue.models';
import { JobQueueStore } from '../job-queue.store';
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
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService);
  protected readonly filters = inject(VideoFiltersService);
  protected readonly jobQueue = inject(JobQueueStore);
  protected readonly openFilter = signal<'date' | 'source' | 'jobs' | null>(null);
  /** Local to the jobs popover -- deliberately not filters.sourceId(), which would also (re)filter the media grid. */
  protected readonly jobSourceId = signal('');

  protected readonly visibleJobs = computed<readonly JobDto[]>(() =>
    this.jobQueue.jobsFor(this.jobSourceId()),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.jobQueue.setPanelOpen(false));
  }

  protected toggle(filter: 'date' | 'source' | 'jobs'): void {
    this.openFilter.update((current) => (current === filter ? null : filter));
    this.jobQueue.setPanelOpen(this.openFilter() === 'jobs');
    if (this.openFilter() === 'jobs') void this.jobQueue.refresh();
  }

  protected cancelJob(requestId: string): void {
    void this.jobQueue.cancel(requestId);
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    this.openFilter.set(null);
    this.jobQueue.setPanelOpen(false);
  }

  @HostListener('document:click', ['$event'])
  protected closeOnOutsideClick(event: Event): void {
    // event.composedPath() (not elementRef.nativeElement.contains) so a
    // click on a row that gets removed from the DOM by the same handler
    // (e.g. cancelling a job) doesn't spuriously read as "outside" once the
    // node is detached.
    const path = event.composedPath();
    if (!path.includes(this.elementRef.nativeElement)) {
      this.openFilter.set(null);
      this.jobQueue.setPanelOpen(false);
    }
  }
}
