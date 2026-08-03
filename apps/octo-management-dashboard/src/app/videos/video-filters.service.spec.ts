import { TestBed } from '@angular/core/testing';
import { VideoFiltersService } from './video-filters.service';

describe('VideoFiltersService', () => {
  it('updates state through commands and resets the complete feature state', () => {
    const filters = TestBed.inject(VideoFiltersService);
    filters.setQuery('recording');
    filters.setDate('2026-08-03');
    filters.setSourceId('camera');
    filters.setSources([{ id: 'camera', name: 'Camera' }]);

    expect(filters.query()).toBe('recording');
    expect(filters.sources()).toHaveLength(1);

    filters.reset();

    expect(filters.query()).toBe('');
    expect(filters.date()).toBe('');
    expect(filters.sourceId()).toBe('');
    expect(filters.sources()).toEqual([]);
  });
});
