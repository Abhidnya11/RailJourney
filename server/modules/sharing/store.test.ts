import { describe, expect, it } from 'vitest';
import { MemoryShareStore } from './store';

describe('MemoryShareStore', () => {
  it('creates retrievable shares that expire', async () => {
    let t = Date.parse('2026-10-01T00:00:00Z');
    const store = new MemoryShareStore(() => new Date(t));
    const share = await store.create('12952_2026-10-01', 48);
    expect(share.shareId).toMatch(/^share_[A-Za-z0-9_-]{12}$/);
    expect(await store.get(share.shareId)).toMatchObject({ journeyId: '12952_2026-10-01' });
    t += 49 * 3_600_000;
    expect(await store.get(share.shareId)).toBeNull();
  });
  it('returns null for unknown ids', async () => {
    expect(await new MemoryShareStore().get('share_nope')).toBeNull();
  });
});
