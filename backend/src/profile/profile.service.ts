import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { UserProfileRow } from '../database/schemas';
import { formatTimedForAgent, normalizeTimedInput } from './profile-timed';
import { decodeProfileCursor, ProfileRepository } from './profile.repository';

/** Short snake_case key for profile storage (e.g. `location`, `work_email`). */
export function normalizeProfileKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 128);
}

/**
 * User profile key-value memory for agent remember() / save() tools.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly repo: ProfileRepository) {}

  /** Full rows for “what Pem knows” in the app. */
  async listFacts(userId: string): Promise<UserProfileRow[]> {
    return this.repo.listByUser(userId);
  }

  /** Paginated for Settings (newest `updated_at` first). */
  async listFactsPaginated(
    userId: string,
    limit: number,
    cursorRaw?: string | null,
  ): Promise<{ rows: UserProfileRow[]; nextCursor: string | null }> {
    let cursor: { updatedAt: Date; id: string } | null = null;
    if (cursorRaw) {
      const d = decodeProfileCursor(cursorRaw);
      if (!d) {
        throw new BadRequestException('Invalid cursor');
      }
      cursor = d;
    }
    return this.repo.listByUserPaginated(userId, limit, cursor);
  }

  /** All facts as a plain map for prep enrichment. */
  async getProfileMap(userId: string): Promise<Record<string, string>> {
    const map = await this.repo.getMap(userId);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      out[k] = formatTimedForAgent(v);
    }
    return out;
  }

  async remember(userId: string, key: string): Promise<string | null> {
    const raw = await this.repo.get(userId, key);
    if (raw === null) {
      return null;
    }
    return formatTimedForAgent(raw);
  }

  async save(
    userId: string,
    key: string,
    value: string,
    source: string | null,
  ): Promise<void> {
    const stored = this.normalizeValueForStore(value);
    await this.repo.upsert(userId, key, stored, source);
  }

  private mapTimedError(e: unknown): never {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'CURRENT_REQUIRED') {
      throw new BadRequestException('Current value is required');
    }
    if (msg === 'DATE_ORDER') {
      throw new BadRequestException(
        'Each "from" date must be on or before the "to" date.',
      );
    }
    if (msg === 'EMPTY') {
      throw new BadRequestException('Value is required');
    }
    if (msg === 'INVALID_JSON' || msg === 'EXPECTED_JSON') {
      throw new BadRequestException('Invalid structured profile data.');
    }
    throw e instanceof Error ? e : new Error(String(e));
  }

  /** Plain string as-is; JSON must be valid timed (`kind: "timed"`) shape. */
  private normalizeValueForStore(raw: string): string {
    const t = raw.trim();
    if (!t) {
      throw new BadRequestException('Value is required');
    }
    if (!t.startsWith('{')) {
      return t;
    }
    try {
      return normalizeTimedInput(t);
    } catch (e) {
      this.mapTimedError(e);
    }
  }

  /** User-added from Settings; source = `user`. */
  async createUserFact(
    userId: string,
    keyRaw: string,
    valueRaw: string,
  ): Promise<UserProfileRow> {
    const key = normalizeProfileKey(keyRaw);
    if (!key) {
      throw new BadRequestException(
        'Use a short label (letters, numbers, spaces). e.g. Location, Work email',
      );
    }
    const stored = this.normalizeValueForStore(valueRaw);
    const existing = await this.repo.findByUserAndKey(userId, key);
    if (existing) {
      throw new BadRequestException(
        'You already have a fact with this label. Edit it or pick a different label.',
      );
    }
    await this.repo.upsert(userId, key, stored, 'user');
    const row = await this.repo.findByUserAndKey(userId, key);
    if (!row) {
      throw new Error('expected row after upsert');
    }
    return row;
  }

  async updateUserFact(
    userId: string,
    id: string,
    patch: { key?: string; value?: string },
  ): Promise<UserProfileRow> {
    const row = await this.repo.findByIdForUser(userId, id);
    if (!row) {
      throw new NotFoundException('Fact not found');
    }
    const nextKey =
      patch.key !== undefined ? normalizeProfileKey(patch.key) : row.key;
    let nextValue: string;
    if (patch.value !== undefined) {
      nextValue = this.normalizeValueForStore(patch.value);
    } else {
      nextValue = row.value;
    }
    if (!nextKey) {
      throw new BadRequestException('Invalid label');
    }
    if (!nextValue) {
      throw new BadRequestException('Value is required');
    }
    if (nextKey !== row.key) {
      const other = await this.repo.findByUserAndKey(userId, nextKey);
      if (other && other.id !== id) {
        throw new BadRequestException(
          'A fact with this label already exists. Choose another label.',
        );
      }
    }
    const updated = await this.repo.updateById(userId, id, {
      key: nextKey,
      value: nextValue,
      source: 'user',
    });
    if (!updated) {
      throw new NotFoundException('Fact not found');
    }
    return updated;
  }

  async deleteUserFact(userId: string, id: string): Promise<void> {
    const ok = await this.repo.deleteById(userId, id);
    if (!ok) {
      throw new NotFoundException('Fact not found');
    }
  }
}
