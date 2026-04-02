import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseError } from 'pg';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { usersTable, type UserRow } from '../database/schemas';

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
          .set({
            email: nextEmail ?? null,
            name: nextName ?? null,
          })
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
          .set({
            clerkId,
            name: name !== null ? name : byEmail.name,
          })
          .where(eq(usersTable.id, byEmail.id))
          .returning();
        this.log.log(`user_relinked_clerk_id ${clerkId}`);
        return relinked;
      }
    }

    try {
      const [created] = await this.db
        .insert(usersTable)
        .values({
          clerkId,
          email,
          name,
        })
        .returning();
      return created;
    } catch (e) {
      if (e instanceof DatabaseError && e.code === '23505') {
        const race = await this.findByClerkId(clerkId);
        if (race) {
          return this.upsertUserFromClerk(clerkId, email, name);
        }
        if (email) {
          const again = await this.findByEmail(email);
          if (again) {
            const [relinked] = await this.db
              .update(usersTable)
              .set({
                clerkId,
                name: name !== null ? name : again.name,
              })
              .where(eq(usersTable.id, again.id))
              .returning();
            this.log.log(`user_relinked_clerk_id_after_race ${clerkId}`);
            return relinked;
          }
        }
        this.log.warn(`user_create_integrity_conflict_unresolved ${clerkId}`);
      }
      throw e;
    }
  }

  async deleteUserByClerkId(clerkId: string): Promise<boolean> {
    const user = await this.findByClerkId(clerkId);
    if (!user) {
      return false;
    }
    await this.db.delete(usersTable).where(eq(usersTable.id, user.id));
    return true;
  }

  async setPushToken(userId: string, token: string | null): Promise<void> {
    await this.db
      .update(usersTable)
      .set({ pushToken: token })
      .where(eq(usersTable.id, userId));
  }
}
