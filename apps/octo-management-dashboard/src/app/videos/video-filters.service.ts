import { Injectable, signal } from '@angular/core';

export interface VideoSourceOption {
  readonly id: string;
  readonly name: string;
}

@Injectable({ providedIn: 'root' })
export class VideoFiltersService {
  private readonly queryState = signal('');
  private readonly dateState = signal('');
  private readonly sourceIdState = signal('');
  private readonly sourcesState = signal<readonly VideoSourceOption[]>([]);

  readonly query = this.queryState.asReadonly();
  readonly date = this.dateState.asReadonly();
  readonly sourceId = this.sourceIdState.asReadonly();
  readonly sources = this.sourcesState.asReadonly();

  setQuery(query: string): void {
    this.queryState.set(query);
  }

  setDate(date: string): void {
    this.dateState.set(date);
  }

  setSourceId(sourceId: string): void {
    this.sourceIdState.set(sourceId);
  }

  setSources(sources: readonly VideoSourceOption[]): void {
    this.sourcesState.set(sources);
  }

  reset(): void {
    this.queryState.set('');
    this.dateState.set('');
    this.sourceIdState.set('');
    this.sourcesState.set([]);
  }
}
