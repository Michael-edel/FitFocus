import { describe, expect, it } from 'vitest';
import { shouldMirrorKey } from '../storage/hybrid';

describe('hybrid storage remote mirror policy', () => {
  it('keeps legacy all-users snapshots local only', () => {
    expect(shouldMirrorKey('fitfocus_data_user-1_food:1')).toBe(true);
    expect(shouldMirrorKey('fitfocus_data_user-1_all_users')).toBe(false);
    expect(shouldMirrorKey('fitfocus_data_user-1_all_users__ffv')).toBe(false);
  });
});
