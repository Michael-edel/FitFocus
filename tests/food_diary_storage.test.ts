import { describe, expect, it } from 'vitest';
import { sanitizeFoodEntryForStorage } from '../storage/foodDiary';

describe('food diary storage policy', () => {
  it('removes the full-size photo before persisting an entry', () => {
    const entry = sanitizeFoodEntryForStorage({
      name: 'Омлет',
      photo: 'data:image/jpeg;base64,full',
      photoThumb: 'data:image/jpeg;base64,thumb',
    });

    expect(entry.photo).toBeUndefined();
    expect(entry.photoThumb).toBe('data:image/jpeg;base64,thumb');
  });

  it('removes oversized thumbnails but keeps smaller ones', () => {
    const oversized = sanitizeFoodEntryForStorage({ photoThumb: 'x'.repeat(120_001) });
    const allowed = sanitizeFoodEntryForStorage({ photoThumb: 'x'.repeat(120_000) });

    expect(oversized.photoThumb).toBeUndefined();
    expect(allowed.photoThumb).toHaveLength(120_000);
  });
});
