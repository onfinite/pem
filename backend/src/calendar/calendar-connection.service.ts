import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  calendarConnectionsTable,
  type CalendarConnectionRow,
  type CalendarProvider,
} from '../database/schemas';

@Injectable()
export class CalendarConnectionService {
  private readonly log = new Logger(CalendarConnectionService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async listForUser(userId: string): Promise<CalendarConnectionRow[]> {
    return this.db
      .select()
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.userId, userId));
  }

  async findByProvider(
    userId: string,
    provider: CalendarProvider,
  ): Promise<CalendarConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.userId, userId),
          eq(calendarConnectionsTable.provider, provider),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<CalendarConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Insert or update a Google Calendar connection.
   * If the same Google account (email) is already connected, update its tokens.
   * Otherwise create a new connection row — users can have many Google accounts.
   */
  async upsertGoogle(
    userId: string,
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
      email: string | null;
    },
  ): Promise<CalendarConnectionRow> {
    if (tokens.email) {
      const existing = await this.findGoogleByEmail(userId, tokens.email);
      if (existing) {
        const [updated] = await this.db
          .update(calendarConnectionsTable)
          .set({
            googleAccessToken: tokens.accessToken,
            googleRefreshToken: tokens.refreshToken,
            googleTokenExpiresAt: tokens.expiresAt,
            googleEmail: tokens.email,
            updatedAt: new Date(),
          })
          .where(eq(calendarConnectionsTable.id, existing.id))
          .returning();
        return updated;
      }
    }

    const hasOtherPrimary = await this.hasPrimary(userId);
    const [created] = await this.db
      .insert(calendarConnectionsTable)
      .values({
        userId,
        provider: 'google',
        isPrimary: !hasOtherPrimary,
        googleAccessToken: tokens.accessToken,
        googleRefreshToken: tokens.refreshToken,
        googleTokenExpiresAt: tokens.expiresAt,
        googleEmail: tokens.email,
      })
      .returning();
    return created;
  }

  async findGoogleByEmail(
    userId: string,
    email: string,
  ): Promise<CalendarConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.userId, userId),
          eq(calendarConnectionsTable.provider, 'google'),
          eq(calendarConnectionsTable.googleEmail, email),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async upsertApple(
    userId: string,
    calendarIds: string[],
  ): Promise<CalendarConnectionRow> {
    const existing = await this.findByProvider(userId, 'apple');
    const hasOtherPrimary = await this.hasPrimary(userId);

    if (existing) {
      const [updated] = await this.db
        .update(calendarConnectionsTable)
        .set({
          appleCalendarIds: calendarIds,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnectionsTable.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(calendarConnectionsTable)
      .values({
        userId,
        provider: 'apple',
        isPrimary: !hasOtherPrimary,
        appleCalendarIds: calendarIds,
      })
      .returning();
    return created;
  }

  async setPrimary(userId: string, connectionId: string): Promise<void> {
    await this.db
      .update(calendarConnectionsTable)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(calendarConnectionsTable.userId, userId));

    await this.db
      .update(calendarConnectionsTable)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(
        and(
          eq(calendarConnectionsTable.id, connectionId),
          eq(calendarConnectionsTable.userId, userId),
        ),
      );
  }

  async disconnect(userId: string, provider: CalendarProvider): Promise<void> {
    await this.db
      .delete(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.userId, userId),
          eq(calendarConnectionsTable.provider, provider),
        ),
      );
  }

  /** Disconnect a specific connection by ID (for multi-Google support). */
  async disconnectById(userId: string, connectionId: string): Promise<void> {
    await this.db
      .delete(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.id, connectionId),
          eq(calendarConnectionsTable.userId, userId),
        ),
      );
  }

  async getPrimary(userId: string): Promise<CalendarConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.userId, userId),
          eq(calendarConnectionsTable.isPrimary, true),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Update stored Google tokens after a refresh. */
  async updateGoogleTokens(
    connectionId: string,
    accessToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db
      .update(calendarConnectionsTable)
      .set({
        googleAccessToken: accessToken,
        googleTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(calendarConnectionsTable.id, connectionId));
  }

  async updateSyncState(
    connectionId: string,
    syncCursor: string | null,
  ): Promise<void> {
    await this.db
      .update(calendarConnectionsTable)
      .set({
        lastSyncedAt: new Date(),
        syncCursor,
        updatedAt: new Date(),
      })
      .where(eq(calendarConnectionsTable.id, connectionId));
  }

  private async hasPrimary(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: calendarConnectionsTable.id })
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.userId, userId),
          eq(calendarConnectionsTable.isPrimary, true),
        ),
      )
      .limit(1);
    return !!row;
  }
}
