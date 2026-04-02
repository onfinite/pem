import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseError } from 'pg';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  dumpTable,
  prepTable,
  userTable,
  type UserRow,
} from '../database/schemas';

@Injectable()
export class UserService {
  private readonly log = new Logger(UserService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByClerkId(clerkId: string): Promise<UserRow | undefined> {
    const rows = await this.db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
      .limit(1);
    return rows[0];
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const rows = await this.db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);
    return rows[0];
  }

  async upsertUserFromClerk(
    clerkId: string,
    email: string | null,
    fullName: string | null,
  ): Promise<UserRow> {
    const existing = await this.findByClerkId(clerkId);
    if (existing) {
      let changed = false;
      let nextEmail = existing.email;
      let nextFullName = existing.fullName;
      if (email !== null && existing.email !== email) {
        nextEmail = email;
        changed = true;
      }
      if (fullName !== null && existing.fullName !== fullName) {
        nextFullName = fullName;
        changed = true;
      }
      if (changed) {
        const now = new Date();
        const [updated] = await this.db
          .update(userTable)
          .set({
            email: nextEmail ?? null,
            fullName: nextFullName ?? null,
            updatedAt: now,
          })
          .where(eq(userTable.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }

    if (email) {
      const byEmail = await this.findByEmail(email);
      if (byEmail && byEmail.clerkId !== clerkId) {
        const now = new Date();
        const [relinked] = await this.db
          .update(userTable)
          .set({
            clerkId,
            fullName: fullName !== null ? fullName : byEmail.fullName,
            updatedAt: now,
          })
          .where(eq(userTable.id, byEmail.id))
          .returning();
        this.log.log(`user_relinked_clerk_id ${clerkId}`);
        return relinked;
      }
    }

    const now = new Date();
    try {
      const [created] = await this.db
        .insert(userTable)
        .values({
          clerkId,
          email,
          fullName,
          isActive: true,
          userData: {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return created;
    } catch (e) {
      if (e instanceof DatabaseError && e.code === '23505') {
        const race = await this.findByClerkId(clerkId);
        if (race) {
          return this.upsertUserFromClerk(clerkId, email, fullName);
        }
        if (email) {
          const again = await this.findByEmail(email);
          if (again) {
            const relNow = new Date();
            const [relinked] = await this.db
              .update(userTable)
              .set({
                clerkId,
                fullName: fullName !== null ? fullName : again.fullName,
                updatedAt: relNow,
              })
              .where(eq(userTable.id, again.id))
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

    await this.db.transaction(async (tx) => {
      await tx.delete(prepTable).where(eq(prepTable.userId, user.id));
      await tx.delete(dumpTable).where(eq(dumpTable.userId, user.id));
      await tx.delete(userTable).where(eq(userTable.id, user.id));
    });
    return true;
  }
}
