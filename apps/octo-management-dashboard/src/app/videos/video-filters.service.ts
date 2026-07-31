import { Injectable, signal } from '@angular/core';

export interface VideoSourceOption {
  readonly id: string;
  readonly name: string;
}

@Injectable({ providedIn: 'root' })
export class VideoFiltersService {
  readonly query = signal('');
  readonly date = signal('');
  readonly sourceId = signal('');
  readonly sources = signal<readonly VideoSourceOption[]>([]);

  setSources(sources: readonly VideoSourceOption[]): void {
    this.sources.set(sources);
  }

  clear(): void {
    this.query.set('');
    this.date.set('');
    this.sourceId.set('');
  }
}
