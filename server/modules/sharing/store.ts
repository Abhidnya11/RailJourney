import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Share {
  shareId: string;
  journeyId: string;
  createdAt: string;
  expiresAt: string;
}

/** Swappable store: in-memory for local development, signed tokens for serverless hosting. */
export interface ShareStore {
  create(journeyId: string, ttlHours: number): Promise<Share>;
  get(shareId: string): Promise<Share | null>;
}

export class MemoryShareStore implements ShareStore {
  private shares = new Map<string, Share>();
  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(journeyId: string, ttlHours: number): Promise<Share> {
    this.sweep();
    const now = this.now();
    const share: Share = {
      // Unguessable, carries no provider credentials or user data.
      shareId: `share_${randomBytes(9).toString('base64url')}`,
      journeyId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlHours * 3_600_000).toISOString(),
    };
    this.shares.set(share.shareId, share);
    return share;
  }

  async get(shareId: string): Promise<Share | null> {
    const share = this.shares.get(shareId);
    if (!share) return null;
    if (Date.parse(share.expiresAt) <= this.now().getTime()) {
      this.shares.delete(shareId);
      return null;
    }
    return share;
  }

  private sweep() {
    const t = this.now().getTime();
    for (const [id, s] of this.shares) if (Date.parse(s.expiresAt) <= t) this.shares.delete(id);
  }
}

/**
 * Share links that need no storage. The link itself carries the journey and its expiry, signed with a server
 * secret, so any server instance can verify it. Required on serverless hosts (e.g. Vercel), where each request
 * may run on a different short-lived instance and an in-memory store would forget the link.
 *
 * Format: `share_<base64url(journeyId|issuedAtSeconds|expiresAtSeconds)>.<base64url(HMAC-SHA256 signature)>`.
 * The payload is readable but not forgeable. It holds no credentials or personal data.
 */
export class SignedShareStore implements ShareStore {
  constructor(
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (secret.length < 32) throw new Error('SHARE_SIGNING_SECRET must be at least 32 characters.');
  }

  async create(journeyId: string, ttlHours: number): Promise<Share> {
    const issued = Math.floor(this.now().getTime() / 1000);
    const expires = issued + Math.round(ttlHours * 3600);
    const payload = Buffer.from(`${journeyId}|${issued}|${expires}`).toString('base64url');
    return {
      shareId: `share_${payload}.${this.sign(payload)}`,
      journeyId,
      createdAt: new Date(issued * 1000).toISOString(),
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  async get(shareId: string): Promise<Share | null> {
    const match = /^share_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(shareId);
    if (!match) return null;
    const [, payload, signature] = match as unknown as [string, string, string];
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    const [journeyId, issued, expires] = Buffer.from(payload, 'base64url').toString().split('|');
    const issuedAt = Number(issued);
    const expiresAt = Number(expires);
    if (!journeyId || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
    if (expiresAt * 1000 <= this.now().getTime()) return null;
    return {
      shareId,
      journeyId,
      createdAt: new Date(issuedAt * 1000).toISOString(),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest().subarray(0, 18).toString('base64url');
  }
}
