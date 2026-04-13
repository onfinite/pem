import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  extractsTable,
  logsTable,
  usersTable,
  type UserPreferences,
  type UserRow,
} from '../database/schemas';

@Injectable()
export class UserService {
  private readonly log = new Logger(UserService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByClerkId(clerkId: string): Promise<UserRow | undefined> {
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkId))
      .limit(1);
    return rows[0];
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    return rows[0];
  }

  async upsertUserFromClerk(
    clerkId: string,
    email: string | null,
    name: string | null,
  ): Promise<UserRow> {
    const existing = await this.findByClerkId(clerkId);
    if (existing) {
      let changed = false;
      let nextEmail = existing.email;
      let nextName = existing.name;
      if (email !== null && existing.email !== email) {
        nextEmail = email;
        changed = true;
      }
      if (name !== null && existing.name !== name) {
        nextName = name;
        changed = true;
      }
      if (changed) {
        const [updated] = await this.db
          .update(usersTable)
          .set({ email: nextEmail ?? null, name: nextName ?? null })
          .where(eq(usersTable.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }

    if (email) {
      const byEmail = await this.findByEmail(email);
      if (byEmail && byEmail.clerkId !== clerkId) {
        const [relinked] = await this.db
          .update(usersTable)
          .set({ clerkId, name: name !== null ? name : byEmail.name })
          .where(eq(usersTable.id, byEmail.id))
          .returning();
        this.log.log(`user_relinked_clerk_id ${clerkId}`);
        return relinked;
      }
    }

    const [created] = await this.db
      .insert(usersTable)
      .values({ clerkId, email, name })
      .onConflictDoUpdate({
        target: usersTable.clerkId,
        set: {
          email: sql`COALESCE(excluded.email, ${usersTable.email})`,
          name: sql`COALESCE(excluded.name, ${usersTable.name})`,
        },
      })
      .returning();
    return created;
  }

  async deleteUserByClerkId(clerkId: string): Promise<boolean> {
    const user = await this.findByClerkId(clerkId);
    if (!user) return false;
    await this.db.delete(usersTable).where(eq(usersTable.id, user.id));
    return true;
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.db.delete(usersTable).where(eq(usersTable.id, userId));
    this.log.log(`account_deleted userId=${userId}`);
  }

  async setPushToken(userId: string, token: string | null): Promise<void> {
    await this.db
      .update(usersTable)
      .set({ pushToken: token })
      .where(eq(usersTable.id, userId));
    await this.db.insert(logsTable).values({
      userId,
      type: 'user',
      isAgent: false,
      pemNote: token ? 'Push token set' : 'Push token cleared',
      payload: {
        op: 'push_token',
        action: token ? 'set' : 'cleared',
        token_length: token?.length ?? 0,
      },
    });
  }

  async updateSummary(userId: string, summary: string): Promise<void> {
    await this.db
      .update(usersTable)
      .set({ summary })
      .where(eq(usersTable.id, userId));
  }

  async setNotificationTime(userId: string, time: string): Promise<void> {
    await this.db
      .update(usersTable)
      .set({ notificationTime: time })
      .where(eq(usersTable.id, userId));
  }

  async setName(userId: string, name: string): Promise<void> {
    await this.db
      .update(usersTable)
      .set({ name: name.trim() })
      .where(eq(usersTable.id, userId));
  }

  async completeOnboarding(userId: string): Promise<void> {
    await this.db
      .update(usersTable)
      .set({ onboardingCompleted: true })
      .where(eq(usersTable.id, userId));
  }

  async setPreferences(userId: string, prefs: UserPreferences): Promise<void> {
    await this.db
      .update(usersTable)
      .set({ preferences: prefs })
      .where(eq(usersTable.id, userId));
  }

  async setTimezone(userId: string, timezone: string): Promise<void> {
    const [prev] = await this.db
      .select({ tz: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const [{ n }] = await this.db
      .select({
        n: sql<number>`count(*)::int`,
      })
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.timezonePending, true),
        ),
      );
    const pendingBefore = Number(n) || 0;
    const now = new Date();
    await this.db
      .update(usersTable)
      .set({ timezone })
      .where(eq(usersTable.id, userId));
    await this.db
      .update(extractsTable)
      .set({ timezonePending: false, updatedAt: now })
      .where(eq(extractsTable.userId, userId));
    await this.db.insert(logsTable).values({
      userId,
      type: 'user',
      isAgent: false,
      pemNote: 'Timezone updated',
      payload: {
        op: 'timezone_updated',
        from: prev?.tz ?? null,
        to: timezone,
        extracts_had_timezone_pending: pendingBefore,
      },
    });
  }
}
