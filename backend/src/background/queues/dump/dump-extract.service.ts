import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { ExtractionService } from '../../agents/extraction/extraction.service';
import type {
  Confidence,
  ExtractedActionable,
} from '../../agents/extraction/extraction.schema';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import { ProfileService } from '../../../profile/profile.service';
import { ExtractsService } from '../../../extracts/extracts.service';
import {
  logsTable,
  extractsTable,
  dumpsTable,
  followUpsTable,
  usersTable,
  type ExtractRow,
  type DumpStatus,
} from '../../../database/schemas';
import { InboxEventsService } from '../../inbox-events/inbox-events.service';
import { PushService } from '../../../push/push.service';

function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s || !String(s).trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function allowLifecycleDestructive(c: Confidence): boolean {
  return c === 'high';
}
function allowSnooze(c: Confidence): boolean {
  return c === 'high' || c === 'medium';
}
function allowMergeFull(c: Confidence): boolean {
  return c === 'high';
}
function allowMergeSoft(c: Confidence): boolean {
  return c === 'high' || c === 'medium';
}
function allowFollowUp(c: Confidence): boolean {
  return c === 'high';
}

@Injectable()
export class DumpExtractService {
  private readonly log = new Logger(DumpExtractService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly extraction: ExtractionService,
    private readonly inboxEvents: InboxEventsService,
    private readonly push: PushService,
    private readonly profile: ProfileService,
    private readonly extracts: ExtractsService,
  ) {}

  async processDump(dumpId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(dumpsTable)
      .where(eq(dumpsTable.id, dumpId))
      .limit(1);
    const dump = rows[0];
    if (!dump) throw new NotFoundException(`dump ${dumpId} not found`);

    await this.setDumpStatus(dumpId, 'processing', null);

    try {
      const [userRow] = await this.db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, dump.userId))
        .limit(1);
      const tz = userRow?.timezone ?? null;

      const openRows = await this.db
        .select()
        .from(extractsTable)
        .where(
          and(
            eq(extractsTable.userId, dump.userId),
            ne(extractsTable.status, 'done'),
          ),
        );

      const openIds = new Set(openRows.map((r) => r.id));
      const allowedIds = new Set(openIds);

      const openExtracts = openRows.map((r) => ({
        id: r.id,
        text: r.extractText,
        status: r.status,
        tone: r.tone,
        urgency: r.urgency,
        batch_key: r.batchKey,
        due_at: r.dueAt?.toISOString() ?? null,
        period_label: r.periodLabel,
      }));

      let existingFollowUps: {
        actionable_id: string;
        note: string | null;
        recommended_at: string | null;
      }[] = [];
      if (openIds.size > 0) {
        const idList = [...openIds];
        const fuRows = await this.db
          .select()
          .from(followUpsTable)
          .where(
            and(
              eq(followUpsTable.userId, dump.userId),
              inArray(followUpsTable.extractId, idList),
            ),
          );
        existingFollowUps = fuRows.map((f) => ({
          actionable_id: f.extractId,
          note: f.note,
          recommended_at: f.recommendedAt?.toISOString() ?? null,
        }));
      }

      const memoryMap = await this.profile.getProfileMap(dump.userId);
      const memoryFactKeys = Object.keys(memoryMap);
      const memoryPromptSection = await this.profile.buildMemoryPromptSection(
        dump.userId,
      );

      const parsed = await this.extraction.extractFromDump({
        dumpText: dump.dumpText,
        userTimezone: tz,
        memoryPromptSection,
        memoryFactKeys,
        openActionables: openExtracts,
        existingFollowUps,
      });

      const polished = parsed.polished_text.trim() || null;
      await this.db
        .update(dumpsTable)
        .set({
          polishedText: polished,
          additionalContext: parsed.additional_context ?? null,
          agentAssumptions:
            parsed.agent_assumptions.length > 0
              ? parsed.agent_assumptions
              : null,
        })
        .where(eq(dumpsTable.id, dumpId));

      // Log dump processing start
      await this.logEntry({
        userId: dump.userId,
        type: 'dump',
        dumpId,
        isAgent: true,
        pemNote: 'Extraction started',
        payload: { op: 'extract_start', polished: !!polished },
      });

      for (const mw of parsed.memory_writes) {
        await this.profile.saveFromAgent(
          dump.userId,
          mw.memory_key,
          mw.note,
          dumpId,
        );
      }

      for (const cmd of parsed.lifecycle_commands) {
        if (!allowedIds.has(cmd.actionable_id)) {
          this.log.warn(
            `skip lifecycle ${cmd.command}: extract ${cmd.actionable_id} not in open set`,
          );
          continue;
        }
        if (cmd.command === 'mark_done') {
          if (!allowLifecycleDestructive(cmd.confidence)) continue;
          const row = await this.extracts.findForUser(
            dump.userId,
            cmd.actionable_id,
          );
          if (!row || row.status === 'done') continue;
          const updated = await this.extracts.markDone(
            dump.userId,
            cmd.actionable_id,
          );
          allowedIds.delete(cmd.actionable_id);
          await this.logEntry({
            userId: dump.userId,
            type: 'extract',
            extractId: cmd.actionable_id,
            dumpId,
            isAgent: true,
            pemNote: cmd.agent_log_note,
            payload: { op: 'mark_done', command: cmd },
          });
          await this.inboxEvents.publish(dumpId, {
            type: 'item.updated',
            dumpId,
            item: this.serializeExtract(updated),
          });
        } else if (cmd.command === 'dismiss') {
          if (!allowLifecycleDestructive(cmd.confidence)) continue;
          const row = await this.extracts.findForUser(
            dump.userId,
            cmd.actionable_id,
          );
          if (!row || row.status === 'done') continue;
          const updated = await this.extracts.dismiss(
            dump.userId,
            cmd.actionable_id,
          );
          allowedIds.delete(cmd.actionable_id);
          await this.logEntry({
            userId: dump.userId,
            type: 'extract',
            extractId: cmd.actionable_id,
            dumpId,
            isAgent: true,
            pemNote: cmd.agent_log_note,
            payload: { op: 'dismiss', command: cmd },
          });
          await this.inboxEvents.publish(dumpId, {
            type: 'item.updated',
            dumpId,
            item: this.serializeExtract(updated),
          });
        } else if (cmd.command === 'snooze') {
          if (!allowSnooze(cmd.confidence)) continue;
          const iso = cmd.snooze_until_iso?.trim();
          if (!iso) {
            this.log.warn('snooze command missing snooze_until_iso');
            continue;
          }
          const row = await this.extracts.findForUser(
            dump.userId,
            cmd.actionable_id,
          );
          if (!row || row.status === 'done') continue;
          const updated = await this.extracts.snooze(
            dump.userId,
            cmd.actionable_id,
            'tomorrow',
            iso,
          );
          await this.logEntry({
            userId: dump.userId,
            type: 'extract',
            extractId: cmd.actionable_id,
            dumpId,
            isAgent: true,
            pemNote: cmd.agent_log_note,
            payload: { op: 'snooze', command: cmd },
          });
          await this.inboxEvents.publish(dumpId, {
            type: 'item.updated',
            dumpId,
            item: this.serializeExtract(updated),
          });
        }
      }

      for (const merge of parsed.merge_operations) {
        if (!allowedIds.has(merge.actionable_id)) {
          this.log.warn(`skip merge: extract ${merge.actionable_id} not open`);
          continue;
        }
        const full = allowMergeFull(merge.confidence);
        const soft = allowMergeSoft(merge.confidence);
        if (!soft) continue;

        const row = await this.extracts.findForUser(
          dump.userId,
          merge.actionable_id,
        );
        if (!row || row.status === 'done') continue;

        const patch = merge.patch;
        const now = new Date();
        const update: Partial<typeof extractsTable.$inferInsert> = {};

        if (patch.text !== undefined) update.extractText = patch.text;
        if (patch.original_text !== undefined)
          update.originalText = patch.original_text;
        if (patch.tone !== undefined) update.tone = patch.tone;
        if (patch.urgency !== undefined) update.urgency = patch.urgency;
        if (patch.pem_note !== undefined) update.pemNote = patch.pem_note;
        if (patch.draft_text !== undefined) update.draftText = patch.draft_text;

        if (full) {
          if (patch.batch_key !== undefined) update.batchKey = patch.batch_key;
          const dueAt = parseIsoDate(patch.due_at ?? null);
          const pStart = parseIsoDate(patch.period_start ?? null);
          const pEnd = parseIsoDate(patch.period_end ?? null);
          if (patch.due_at !== undefined) update.dueAt = dueAt;
          if (patch.period_start !== undefined) update.periodStart = pStart;
          if (patch.period_end !== undefined) update.periodEnd = pEnd;
          if (patch.period_label !== undefined)
            update.periodLabel = patch.period_label;
          const rec = parseIsoDate(patch.recommended_at ?? null);
          if (patch.recommended_at !== undefined) update.recommendedAt = rec;
          const tzPending =
            !tz &&
            (!!patch.due_at?.trim() ||
              !!patch.period_start?.trim() ||
              !!patch.period_end?.trim());
          if (
            patch.due_at !== undefined ||
            patch.period_start !== undefined ||
            patch.period_end !== undefined
          ) {
            update.timezonePending = tzPending;
          }
        }

        if (Object.keys(update).length === 0) continue;
        update.updatedAt = now;

        const [updated] = await this.db
          .update(extractsTable)
          .set(update)
          .where(
            and(
              eq(extractsTable.id, merge.actionable_id),
              eq(extractsTable.userId, dump.userId),
            ),
          )
          .returning();

        if (updated) {
          await this.logEntry({
            userId: dump.userId,
            type: 'extract',
            extractId: merge.actionable_id,
            dumpId,
            isAgent: true,
            pemNote: merge.agent_log_note,
            payload: {
              op: 'merge',
              confidence: merge.confidence,
              patch: merge.patch,
              applied_full: full,
            },
          });
          await this.inboxEvents.publish(dumpId, {
            type: 'item.updated',
            dumpId,
            item: this.serializeExtract(updated),
          });
        }
      }

      let createdCount = 0;
      for (const item of parsed.new_items) {
        const row = await this.insertNewExtract(dump, item, tz);
        if (row) {
          createdCount += 1;
          await this.logEntry({
            userId: dump.userId,
            type: 'extract',
            extractId: row.id,
            dumpId,
            isAgent: true,
            pemNote: 'Created from dump extraction',
            payload: { op: 'create', source: item },
          });
          await this.inboxEvents.publish(dumpId, {
            type: 'item.created',
            dumpId,
            item: this.serializeExtract(row),
          });
        }
      }

      for (const fu of parsed.follow_up_writes) {
        if (!allowFollowUp(fu.confidence)) continue;
        const target = await this.extracts.findForUser(
          dump.userId,
          fu.actionable_id,
        );
        if (!target || target.status === 'done') continue;

        const recAt = parseIsoDate(fu.recommended_at);
        await this.db
          .insert(followUpsTable)
          .values({
            userId: dump.userId,
            extractId: fu.actionable_id,
            note: fu.note?.trim() || null,
            recommendedAt: recAt,
            sourceDumpId: dumpId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: followUpsTable.extractId,
            set: {
              note: sql`excluded.note`,
              recommendedAt: sql`excluded.recommended_at`,
              sourceDumpId: sql`excluded.source_dump_id`,
              updatedAt: sql`excluded.updated_at`,
            },
          });

        await this.logEntry({
          userId: dump.userId,
          type: 'extract',
          extractId: fu.actionable_id,
          dumpId,
          isAgent: true,
          pemNote: fu.agent_log_note,
          payload: { op: 'follow_up_upsert', follow_up: fu },
        });
      }

      if (
        createdCount === 0 &&
        parsed.merge_operations.length === 0 &&
        parsed.lifecycle_commands.length === 0
      ) {
        this.log.log(
          `dump ${dumpId} → 0 pipeline mutations (polished saved: ${!!polished})`,
        );
      } else {
        this.log.log(
          `dump ${dumpId} → new:${createdCount} merge:${parsed.merge_operations.length} lifecycle:${parsed.lifecycle_commands.length} follow_up:${parsed.follow_up_writes.length}`,
        );
      }

      await this.inboxEvents.publish(dumpId, { type: 'inbox.updated', dumpId });
      await this.inboxEvents.publish(dumpId, { type: 'stream.done', dumpId });
      await this.push.notifyInboxUpdated(dump.userId);

      await this.setDumpStatus(dumpId, 'processed', null);

      await this.logEntry({
        userId: dump.userId,
        type: 'dump',
        dumpId,
        isAgent: true,
        pemNote: 'Extraction complete',
        payload: {
          op: 'extract_done',
          created: createdCount,
          merged: parsed.merge_operations.length,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error';
      const lastError = message.slice(0, 2000);
      this.log.error(
        `dump ${dumpId} extraction failed: ${lastError}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.setDumpStatus(dumpId, 'failed', lastError);

      await this.logEntry({
        userId: dump.userId,
        type: 'dump',
        dumpId,
        isAgent: true,
        pemNote: 'Extraction failed',
        payload: { op: 'extract_failed' },
        error: {
          message: lastError,
          stack: err instanceof Error ? err.stack?.slice(0, 4000) : undefined,
        },
      });
      throw err;
    }
  }

  private async insertNewExtract(
    dump: { id: string; userId: string; dumpText: string },
    item: ExtractedActionable,
    tz: string | null,
  ): Promise<ExtractRow | null> {
    const dueAt = parseIsoDate(item.due_at);
    const pStart = parseIsoDate(item.period_start);
    const pEnd = parseIsoDate(item.period_end);
    const recAt = parseIsoDate(item.recommended_at);
    const tzPending =
      !tz && (!!item.due_at?.trim() || !!item.period_start?.trim());

    const [row] = await this.db
      .insert(extractsTable)
      .values({
        userId: dump.userId,
        dumpId: dump.id,
        extractText: item.text.trim(),
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
        recommendedAt: recAt,
        draftText: item.draft_text?.trim() || null,
        updatedAt: new Date(),
      })
      .returning();

    return row ?? null;
  }

  private async logEntry(args: {
    userId: string;
    type: 'dump' | 'extract' | 'ask';
    extractId?: string;
    dumpId?: string;
    isAgent: boolean;
    pemNote: string;
    payload: Record<string, unknown>;
    error?: { message: string; stack?: string; code?: string };
  }): Promise<void> {
    await this.db.insert(logsTable).values({
      userId: args.userId,
      type: args.type,
      extractId: args.extractId ?? null,
      dumpId: args.dumpId ?? null,
      pemNote: args.pemNote.trim() || null,
      isAgent: args.isAgent,
      payload: args.payload,
      error: args.error ?? null,
    });
  }

  private async setDumpStatus(
    dumpId: string,
    status: DumpStatus,
    lastError: string | null,
  ): Promise<void> {
    await this.db
      .update(dumpsTable)
      .set({ status, lastError })
      .where(eq(dumpsTable.id, dumpId));
  }

  private serializeExtract(row: ExtractRow) {
    return {
      id: row.id,
      text: row.extractText,
      status: row.status,
      tone: row.tone,
      urgency: row.urgency,
      created_at: row.createdAt.toISOString(),
    };
  }
}
