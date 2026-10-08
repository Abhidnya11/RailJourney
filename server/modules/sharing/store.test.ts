import { describe, expect, it } from 'vitest';
import { MemoryShareStore, SignedShareStore } from './store.js';

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

describe('SignedShareStore', () => {
  const secret = 'x'.repeat(40);
  const at = (iso: string) => () => new Date(iso);

  it('creates links that any instance with the secret can verify, until they expire', async () => {
    const maker = new SignedShareStore(secret, at('2026-10-01T00:00:00Z'));
    const share = await maker.create('12952_2026-10-01', 48);
    expect(share.shareId).toMatch(/^share_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(share.expiresAt).toBe('2026-10-03T00:00:00.000Z');

    // A different instance (fresh object, no shared memory) accepts it.
    const other = new SignedShareStore(secret, at('2026-10-02T00:00:00Z'));
    expect(await other.get(share.shareId)).toMatchObject({ journeyId: '12952_2026-10-01', expiresAt: share.expiresAt });

    const later = new SignedShareStore(secret, at('2026-10-03T00:00:01Z'));
    expect(await later.get(share.shareId)).toBeNull();
  });

  it('rejects tampered, re-signed and malformed links', async () => {
    const store = new SignedShareStore(secret, at('2026-10-01T00:00:00Z'));
    const { shareId } = await store.create('12952_2026-10-01', 48);
    const [head, sig] = shareId.split('.') as [string, string];

    const forgedPayload = Buffer.from('99999_2026-10-01|0|9999999999').toString('base64url');
    expect(await store.get(`share_${forgedPayload}.${sig}`)).toBeNull();
    expect(await store.get(`${head}.${sig.slice(0, -2)}AA`)).toBeNull();
    expect(await new SignedShareStore('y'.repeat(40), at('2026-10-01T00:00:00Z')).get(shareId)).toBeNull();
    for (const bad of ['', 'share_', 'share_abc', 'nope.nope', `${head}`]) expect(await store.get(bad)).toBeNull();
  });

  it('refuses a weak secret', () => {
    expect(() => new SignedShareStore('short')).toThrow(/at least 32/);
  });
});
