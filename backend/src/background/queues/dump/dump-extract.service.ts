import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { ExtractAgentService } from '../../agents/extraction/extract-agent.service';
import { ReconcileAgentService } from '../../agents/extraction/reconcile-agent.service';
import { ValidationService } from '../../agents/extraction/validation.service';
import type {
  CalendarWrite,
  Confidence,
  ExtractedItem,
  ExtractPhaseResult,
  ReconcilePhaseResult,
} from '../../agents/extraction/extraction.schema';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import { CalendarSyncService } from '../../../calendar/calendar-sync.service';
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

function allowMergeFull(c: Confidence): boolean {
  return c === 'high';
}
function allowMergeSoft(c: Confidence): boolean {
  return c === 'high' || c === 'medium';
}

@Injectable()
export class DumpExtractService {
  private readonly log = new Logger(DumpExtractService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly extractAgent: ExtractAgentService,
    private readonly reconcileAgent: ReconcileAgentService,
    private readonly validation: ValidationService,
    private readonly inboxEvents: InboxEventsService,
    private readonly push: PushService,
    private readonly profile: ProfileService,
    private readonly extracts: ExtractsService,
    private readonly calendarSync: CalendarSyncService,
  ) {}

  /* ── Public entry point ──────────────────────────────── */

  async processDump(
    dumpId: string,
    opts?: { isFinalAttempt?: boolean },
  ): Promise<void> {
    const dump = await this.loadDump(dumpId);
    await this.setDumpStatus(dumpId, 'processing', null);

    try {
      await this.db
        .delete(extractsTable)
        .where(
          and(
            eq(extractsTable.dumpId, dumpId),
            eq(extractsTable.source, 'dump'),
          ),
        );

      const ctx = await this.gatherContext(dump);

      // ── Phase 1: Extract ──
      const extracted = await this.extractAgent.run({
        dumpText: dump.dumpText,
        userTimezone: ctx.tz,
        memoryPromptSection: ctx.memoryPromptSection,
      });

      // ── Phase 2: Reconcile ──
      const reconciled = await this.reconcileAgent.run({
        dumpText: dump.dumpText,
        userTimezone: ctx.tz,
        memoryPromptSection: ctx.memoryPromptSection,
        newItems: extracted.new_items,
        openTasks: ctx.openExtracts,
        existingFollowUps: ctx.existingFollowUps,
      });

      // ── Phase 3: Validate (deterministic) ──
      const { extract, reconcile, issues } = this.validation.validate(
        extracted,
        reconciled,
        ctx.openIds,
      );

      // ── Apply results ──
      await this.saveDumpMetadata(dumpId, extract, ctx);
      await this.applyMemoryWrites(dump, extract);
      await this.applyLifecycleCommands(dump, reconcile, ctx.openIds);
      await this.applyMerges(dump, reconcile, ctx);
      const { count: createdCount, extractsByIndex: createdExtractMap } =
        await this.createNewItems(dump, extract, reconcile, ctx.tz);
      await this.applyFollowUps(dump, reconcile);
      await this.applyCalendarWrites(
        dump.userId,
        dumpId,
        reconcile,
        createdExtractMap,
      );

      // ── Finalize ──
      const totalMutations =
        createdCount +
        reconcile.merge_operations.length +
        reconcile.lifecycle_commands.length +
        reconcile.calendar_writes.length;

      this.log.log(
        `dump ${dumpId} → new:${createdCount} merge:${reconcile.merge_operations.length} ` +
          `lifecycle:${reconcile.lifecycle_commands.length} follow_up:${reconcile.follow_up_writes.length} ` +
          `calendar:${reconcile.calendar_writes.length} validation_issues:${issues.length}` +
          (totalMutations === 0 ? ' (no mutations)' : ''),
      );

      await this.inboxEvents.publish(dumpId, { type: 'inbox.updated', dumpId });
      await this.inboxEvents.publish(dumpId, { type: 'stream.done', dumpId });
      await this.push.notifyInboxUpdated(dump.userId);
      await this.setDumpStatus(dumpId, 'processed', null);

      await this.logEntry({
        userId: dump.userId,
        type: 'dump',
        dumpId,
        isAgent: true,
        pemNote: 'Pipeline complete',
        payload: {
          op: 'pipeline_done',
          created: createdCount,
          merged: reconcile.merge_operations.length,
          lifecycle: reconcile.lifecycle_commands.length,
          calendar: reconcile.calendar_writes.length,
          validation_issues: issues.length,
        },
      });
    } catch (err) {
      await this.handlePipelineError(dump, dumpId, err, opts);
      throw err;
    }
  }

  /* ── Context gathering ───────────────────────────────── */

  private async loadDump(dumpId: string) {
    const [dump] = await this.db
      .select()
      .from(dumpsTable)
      .where(eq(dumpsTable.id, dumpId))
      .limit(1);
    if (!dump) throw new NotFoundException(`dump ${dumpId} not found`);
    return dump;
  }

  private async gatherContext(dump: { id: string; userId: string }) {
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
          ne(extractsTable.status, 'dismissed'),
        ),
      );

    const openIds = new Set(openRows.map((r) => r.id));

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
      const fuRows = await this.db
        .select()
        .from(followUpsTable)
        .where(
          and(
            eq(followUpsTable.userId, dump.userId),
            inArray(followUpsTable.extractId, [...openIds]),
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

    return {
      tz,
      openRows,
      openIds,
      openExtracts,
      existingFollowUps,
      memoryFactKeys,
      memoryPromptSection,
    };
  }

  /* ── Apply: dump metadata ────────────────────────────── */

  private async saveDumpMetadata(
    dumpId: string,
    extract: ExtractPhaseResult,
    ctx: Awaited<ReturnType<typeof this.gatherContext>>,
  ) {
    const polished = extract.polished_text.trim() || null;
    await this.db
      .update(dumpsTable)
      .set({
        polishedText: polished,
        additionalContext: {
          memory_keys_referenced: [...ctx.memoryFactKeys],
          open_task_count: ctx.openExtracts.length,
          follow_up_count: ctx.existingFollowUps.length,
          summary: 'Derived server-side from context included in prompt.',
        },
        agentAssumptions:
          extract.agent_assumptions.length > 0
            ? extract.agent_assumptions
            : null,
      })
      .where(eq(dumpsTable.id, dumpId));
  }

  /* ── Apply: memory writes ────────────────────────────── */

  private async applyMemoryWrites(
    dump: { id: string; userId: string },
    extract: ExtractPhaseResult,
  ) {
    for (const mw of extract.memory_writes) {
      await this.profile.saveFromAgent(
        dump.userId,
        mw.memory_key,
        mw.note,
        dump.id,
      );
    }
  }

  /* ── Apply: lifecycle commands ───────────────────────── */

  private async applyLifecycleCommands(
    dump: { id: string; userId: string },
    reconcile: ReconcilePhaseResult,
    openIds: Set<string>,
  ) {
    for (const cmd of reconcile.lifecycle_commands) {
      if (!openIds.has(cmd.actionable_id)) continue;

      const row = await this.extracts.findForUser(
        dump.userId,
        cmd.actionable_id,
      );
      if (!row || row.status === 'done') continue;

      let updated: ExtractRow | null = null;

      if (cmd.command === 'mark_done') {
        updated = await this.extracts.markDone(dump.userId, cmd.actionable_id);
        openIds.delete(cmd.actionable_id);
      } else if (cmd.command === 'dismiss') {
        updated = await this.extracts.dismiss(dump.userId, cmd.actionable_id);
        openIds.delete(cmd.actionable_id);
      } else if (cmd.command === 'snooze') {
        const iso = cmd.snooze_until_iso?.trim();
        if (!iso) continue;
        updated = await this.extracts.snooze(
          dump.userId,
          cmd.actionable_id,
          'tomorrow',
          iso,
        );
      }

      if (updated) {
        await this.logEntry({
          userId: dump.userId,
          type: 'extract',
          extractId: cmd.actionable_id,
          dumpId: dump.id,
          isAgent: true,
          pemNote: cmd.agent_log_note,
          payload: { op: cmd.command, command: cmd },
        });
        await this.inboxEvents.publish(dump.id, {
          type: 'item.updated',
          dumpId: dump.id,
          item: this.serializeExtract(updated),
        });
      }
    }
  }

  /* ── Apply: merges ───────────────────────────────────── */

  private async applyMerges(
    dump: { id: string; userId: string },
    reconcile: ReconcilePhaseResult,
    ctx: Awaited<ReturnType<typeof this.gatherContext>>,
  ) {
    for (const merge of reconcile.merge_operations) {
      if (!ctx.openIds.has(merge.actionable_id)) continue;
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
        if (patch.due_at !== undefined)
          update.dueAt = parseIsoDate(patch.due_at);
        if (patch.period_start !== undefined)
          update.periodStart = parseIsoDate(patch.period_start);
        if (patch.period_end !== undefined)
          update.periodEnd = parseIsoDate(patch.period_end);
        if (patch.period_label !== undefined)
          update.periodLabel = patch.period_label;
        if (patch.recommended_at !== undefined)
          update.recommendedAt = parseIsoDate(patch.recommended_at);

        const tzPending =
          !ctx.tz &&
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
          dumpId: dump.id,
          isAgent: true,
          pemNote: merge.agent_log_note,
          payload: {
            op: 'merge',
            confidence: merge.confidence,
            patch: merge.patch,
            applied_full: full,
          },
        });
        await this.inboxEvents.publish(dump.id, {
          type: 'item.updated',
          dumpId: dump.id,
          item: this.serializeExtract(updated),
        });
      }
    }
  }

  /* ── Apply: create new items ─────────────────────────── */

  private async createNewItems(
    dump: { id: string; userId: string; dumpText: string },
    extract: ExtractPhaseResult,
    reconcile: ReconcilePhaseResult,
    tz: string | null,
  ): Promise<{ count: number; extractsByIndex: Map<number, ExtractRow> }> {
    const dedupIndices = new Set(
      (reconcile.deduplications ?? []).map((d) => d.new_item_index),
    );

    let count = 0;
    const extractsByIndex = new Map<number, ExtractRow>();
    for (let i = 0; i < extract.new_items.length; i++) {
      if (dedupIndices.has(i)) {
        this.log.log(
          `skip new_item[${i}] "${extract.new_items[i].text}" — dedup match`,
        );
        continue;
      }

      const row = await this.insertNewExtract(dump, extract.new_items[i], tz);
      if (row) {
        count++;
        extractsByIndex.set(i, row);
        await this.logEntry({
          userId: dump.userId,
          type: 'extract',
          extractId: row.id,
          dumpId: dump.id,
          isAgent: true,
          pemNote: 'Created from dump extraction',
          payload: { op: 'create', source: extract.new_items[i] },
        });
        await this.inboxEvents.publish(dump.id, {
          type: 'item.created',
          dumpId: dump.id,
          item: this.serializeExtract(row),
        });
      }
    }
    return { count, extractsByIndex };
  }

  private async insertNewExtract(
    dump: { id: string; userId: string },
    item: ExtractedItem,
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

  /* ── Apply: follow-ups ───────────────────────────────── */

  private async applyFollowUps(
    dump: { id: string; userId: string },
    reconcile: ReconcilePhaseResult,
  ) {
    for (const fu of reconcile.follow_up_writes) {
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
          sourceDumpId: dump.id,
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
        dumpId: dump.id,
        isAgent: true,
        pemNote: fu.agent_log_note,
        payload: { op: 'follow_up_upsert', follow_up: fu },
      });
    }
  }

  /* ── Apply: calendar writes ──────────────────────────── */

  private async applyCalendarWrites(
    userId: string,
    dumpId: string,
    reconcile: ReconcilePhaseResult,
    createdExtractMap: Map<number, ExtractRow>,
  ) {
    for (const cw of reconcile.calendar_writes) {
      const linkedExtract =
        cw.new_item_index != null
          ? (createdExtractMap.get(cw.new_item_index) ?? null)
          : null;
      await this.processCalendarWrite(userId, dumpId, cw, linkedExtract);
    }
  }

  private async processCalendarWrite(
    userId: string,
    dumpId: string,
    cw: CalendarWrite,
    linkedExtract: ExtractRow | null,
  ): Promise<void> {
    try {
      const startAt = new Date(cw.start_at);
      const endAt = new Date(cw.end_at);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        this.log.warn('Invalid calendar write date, skipping');
        return;
      }

      const result = await this.calendarSync.writeToGoogleCalendar(userId, {
        summary: cw.summary,
        start: startAt,
        end: endAt,
        location: cw.location ?? undefined,
        description: cw.description ?? undefined,
      });

      if (result && linkedExtract) {
        await this.db
          .update(extractsTable)
          .set({
            externalEventId: result.eventId,
            calendarConnectionId: result.connectionId,
            eventStartAt: startAt,
            eventEndAt: endAt,
            eventLocation: cw.location ?? null,
            updatedAt: new Date(),
          })
          .where(eq(extractsTable.id, linkedExtract.id));
        this.log.log(
          `Linked extract ${linkedExtract.id} → calendar event ${result.eventId}`,
        );
      }

      await this.logEntry({
        userId,
        type: 'calendar',
        dumpId,
        extractId: linkedExtract?.id,
        isAgent: true,
        pemNote: cw.agent_log_note,
        payload: {
          op: 'calendar_write',
          summary: cw.summary,
          eventId: result?.eventId ?? null,
          connectionId: result?.connectionId ?? null,
          linkedExtractId: linkedExtract?.id ?? null,
          written: !!result,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Calendar write failed';
      this.log.warn(`Calendar write failed: ${msg}`);
      await this.logEntry({
        userId,
        type: 'calendar',
        dumpId,
        isAgent: true,
        pemNote: `Calendar write failed: ${cw.summary}`,
        payload: { op: 'calendar_write_failed', summary: cw.summary },
        error: { message: msg },
      });
    }
  }

  /* ── Error handling ──────────────────────────────────── */

  private async handlePipelineError(
    dump: { id: string; userId: string },
    dumpId: string,
    err: unknown,
    opts?: { isFinalAttempt?: boolean },
  ) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'Unknown error';
    const lastError = message.slice(0, 2000);
    const isFinal = opts?.isFinalAttempt ?? true;

    this.log.error(
      `dump ${dumpId} pipeline failed (final=${isFinal}): ${lastError}`,
      err instanceof Error ? err.stack : undefined,
    );

    if (isFinal) {
      await this.setDumpStatus(dumpId, 'failed', lastError);
    }

    await this.logEntry({
      userId: dump.userId,
      type: 'dump',
      dumpId,
      isAgent: true,
      pemNote: isFinal
        ? 'Pipeline failed (final)'
        : 'Pipeline attempt failed, will retry',
      payload: { op: 'pipeline_failed', final: isFinal },
      error: {
        message: lastError,
        stack: err instanceof Error ? err.stack?.slice(0, 4000) : undefined,
      },
    });
  }

  /* ── Utilities ───────────────────────────────────────── */

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

  private async logEntry(args: {
    userId: string;
    type: 'dump' | 'extract' | 'ask' | 'calendar';
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
