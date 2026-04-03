import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { MemoryFactRow } from '../database/schemas';
import { decodeMemoryCursor, ProfileRepository } from './profile.repository';
import { formatTimedForAgent } from './profile-timed';

/** Short snake_case key for memory (e.g. `location`, `car_budget`). */
export function normalizeProfileKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 128);
}

function noteForContext(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('{')) return raw;
  try {
    return formatTimedForAgent(raw);
  } catch {
    return raw;
  }
}

@Injectable()
export class ProfileService {
  constructor(private readonly repo: ProfileRepository) {}

  async listFacts(
    userId: string,
    status: 'active' | 'historical' | 'all' = 'all',
  ): Promise<MemoryFactRow[]> {
    return this.repo.listByUser(userId, status);
  }

  async listFactsPaginated(
    userId: string,
    limit: number,
    cursorRaw: string | null | undefined,
    status: 'active' | 'historical' | 'all' = 'all',
  ): Promise<{ rows: MemoryFactRow[]; nextCursor: string | null }> {
    let cursor: { learnedAt: Date; id: string } | null = null;
    if (cursorRaw) {
      const d = decodeMemoryCursor(cursorRaw);
      if (!d) {
        throw new BadRequestException('Invalid cursor');
      }
      cursor = d;
    }
    return this.repo.listByUserPaginated(userId, limit, cursor, status);
  }

  /** Active facts as key → one line for agent context (unwraps timed JSON in notes when present). */
  async getProfileMap(userId: string): Promise<Record<string, string>> {
    const map = await this.repo.getActiveMap(userId);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      out[k] = noteForContext(v);
    }
    return out;
  }

  /**
   * Natural-language block for the prep agent (active facts only).
   */
  async buildMemoryPromptSection(userId: string): Promise<string> {
    const rows = await this.repo.listActiveNotesForPrompt(userId);
    if (rows.length === 0) {
      return 'What I know about this user:\n(nothing saved yet — infer only from this prep and transcript.)';
    }
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const r of rows) {
      if (seen.has(r.memoryKey)) continue;
      seen.add(r.memoryKey);
      const when = r.learnedAt.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });
      const text = noteForContext(r.note).trim();
      lines.push(`- (${r.memoryKey}) ${text} (as of ${when})`);
    }
    return `What I know about this user:\n${lines.join('\n')}`;
  }

  async remember(userId: string, key: string): Promise<string | null> {
    const k = normalizeProfileKey(key);
    if (!k) return null;
    const row = await this.repo.getActiveByMemoryKey(userId, k);
    if (!row) return null;
    return noteForContext(row.note);
  }

  /**
   * Agent save: supersede prior active rows for this memory_key, append new active.
   */
  async saveFromAgent(
    userId: string,
    memoryKeyRaw: string,
    note: string,
    sourcePrepId: string,
    sourceDumpId: string,
  ): Promise<void> {
    const memoryKey = normalizeProfileKey(memoryKeyRaw);
    if (!memoryKey) {
      return;
    }
    const trimmed = note.trim();
    if (!trimmed) {
      return;
    }
    await this.repo.markHistoricalForMemoryKey(userId, memoryKey);
    await this.repo.insertFact({
      userId,
      memoryKey,
      note: trimmed,
      sourceDumpId,
      sourcePrepId,
      status: 'active',
      provenance: 'agent',
    });
  }

  /** User-added from Settings (does not supersede — must be unique active key). */
  async createUserFact(
    userId: string,
    keyRaw: string,
    noteRaw: string,
  ): Promise<MemoryFactRow> {
    const memoryKey = normalizeProfileKey(keyRaw);
    if (!memoryKey) {
      throw new BadRequestException(
        'Use a short label (letters, numbers, spaces). e.g. Location, Car budget',
      );
    }
    const note = noteRaw.trim();
    if (!note) {
      throw new BadRequestException('Note is required');
    }
    if (note.length > 16_000) {
      throw new BadRequestException('Note is too long');
    }
    const n = await this.repo.countActiveWithKey(userId, memoryKey);
    if (n > 0) {
      throw new BadRequestException(
        'You already have an active fact for this topic. Edit it or pick a different label.',
      );
    }
    return this.repo.insertFact({
      userId,
      memoryKey,
      note,
      sourceDumpId: null,
      sourcePrepId: null,
      status: 'active',
      provenance: 'user',
    });
  }

  async updateUserFact(
    userId: string,
    id: string,
    patch: { key?: string; note?: string },
  ): Promise<MemoryFactRow> {
    const row = await this.repo.findByIdForUser(userId, id);
    if (!row) {
      throw new NotFoundException('Fact not found');
    }
    const nextKey =
      patch.key !== undefined ? normalizeProfileKey(patch.key) : row.memoryKey;
    const nextNote = patch.note !== undefined ? patch.note.trim() : row.note;
    if (!nextKey) {
      throw new BadRequestException('Invalid label');
    }
    if (!nextNote) {
      throw new BadRequestException('Note is required');
    }
    if (nextNote.length > 16_000) {
      throw new BadRequestException('Note is too long');
    }
    if (nextKey !== row.memoryKey) {
      const n = await this.repo.countActiveWithKey(userId, nextKey);
      if (n > 0) {
        throw new BadRequestException(
          'An active fact with this label already exists. Choose another label.',
        );
      }
    }
    const updated = await this.repo.updateById(userId, id, {
      memoryKey: nextKey,
      note: nextNote,
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
