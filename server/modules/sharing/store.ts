import { randomBytes } from 'node:crypto';

export interface Share {
  shareId: string;
  journeyId: string;
  createdAt: string;
  expiresAt: string;
}

/** Swappable store (in-memory now; Postgres in Phase 2). */
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
