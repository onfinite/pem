import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ExtractionService } from '../../extraction/extraction.service';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleDb } from '../../database/database.module';
import {
  actionablesTable,
  dumpsTable,
  usersTable,
  type DumpStatus,
  type ActionableRow,
} from '../../database/schemas';
import { InboxEventsService } from '../../inbox-events/inbox-events.service';
import { PushService } from '../../push/push.service';

function parseIsoDate(s: string | null): Date | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class DumpExtractService {
  private readonly log = new Logger(DumpExtractService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly extraction: ExtractionService,
    private readonly inboxEvents: InboxEventsService,
    private readonly push: PushService,
  ) {}

  async processDump(dumpId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(dumpsTable)
      .where(eq(dumpsTable.id, dumpId))
      .limit(1);
    const dump = rows[0];
    if (!dump) {
      throw new NotFoundException(`dump ${dumpId} not found`);
    }

    await this.setDumpStatus(dumpId, 'processing');

    try {
      const [userRow] = await this.db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, dump.userId))
        .limit(1);

      const tz = userRow?.timezone ?? null;
      const { polishedText, items } = await this.extraction.extractFromDump(
        dump.dumpText,
        tz,
      );

      const polished = polishedText.trim() || null;
      await this.db
        .update(dumpsTable)
        .set({ polishedText: polished })
        .where(eq(dumpsTable.id, dumpId));

      if (items.length === 0) {
        await this.inboxEvents.publish(dumpId, {
          type: 'inbox.updated',
          dumpId,
        });
        await this.inboxEvents.publish(dumpId, { type: 'stream.done', dumpId });
        await this.push.notifyInboxUpdated(dump.userId);
        this.log.log(
          `dump ${dumpId} → 0 actionables (polished saved: ${!!polished})`,
        );
      } else {
        for (const item of items) {
          const dueAt = parseIsoDate(item.due_at);
          const pStart = parseIsoDate(item.period_start);
          const pEnd = parseIsoDate(item.period_end);
          const tzPending =
            !tz && (!!item.due_at?.trim() || !!item.period_start?.trim());

          const [row] = await this.db
            .insert(actionablesTable)
            .values({
              userId: dump.userId,
              dumpId: dump.id,
              actionableText: item.text.trim(),
              originalText: item.original_text.trim(),
              status: 'inbox',
              tone: item.tone,
              urgency: item.urgency,
              batchKey: item.batch_key,
              dueAt,
              periodStart: pStart,
              periodEnd: pEnd,
              periodLabel: item.period_label,
              timezonePending: tzPending,
              pemNote: item.pem_note?.trim() || null,
              draftText: item.draft_text?.trim() || null,
              updatedAt: new Date(),
            })
            .returning();

          if (row) {
            await this.inboxEvents.publish(dumpId, {
              type: 'item.created',
              dumpId,
              item: this.serializeActionable(row),
            });
          }
        }

        await this.inboxEvents.publish(dumpId, {
          type: 'inbox.updated',
          dumpId,
        });
        await this.inboxEvents.publish(dumpId, { type: 'stream.done', dumpId });

        await this.push.notifyInboxUpdated(dump.userId);

        this.log.log(`dump ${dumpId} → ${items.length} actionable(s)`);
      }

      await this.setDumpStatus(dumpId, 'processed');
    } catch (err) {
      await this.setDumpStatus(dumpId, 'failed');
      throw err;
    }
  }

  private async setDumpStatus(
    dumpId: string,
    status: DumpStatus,
  ): Promise<void> {
    await this.db
      .update(dumpsTable)
      .set({ status })
      .where(eq(dumpsTable.id, dumpId));
  }

  private serializeActionable(row: ActionableRow) {
    return {
      id: row.id,
      text: row.actionableText,
      status: row.status,
      tone: row.tone,
      urgency: row.urgency,
      created_at: row.createdAt.toISOString(),
    };
  }
}
