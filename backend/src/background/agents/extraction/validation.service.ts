import { Injectable, Logger } from '@nestjs/common';

import type {
  ExtractPhaseResult,
  ReconcilePhaseResult,
  Confidence,
} from './extraction.schema';

export type ValidationIssue = {
  phase: 'extract' | 'reconcile';
  field: string;
  message: string;
  severity: 'drop' | 'warn';
};

export type ValidatedPipeline = {
  extract: ExtractPhaseResult;
  reconcile: ReconcilePhaseResult;
  issues: ValidationIssue[];
};

function parseIso(s: string | null | undefined): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

const ERRAND_KEYWORDS =
  /\b(laundry|dry clean|pick up|drop off|post office|pharmacy|car wash|oil change|return|trash|recycle|mow|clean|tidy|vacuum|iron|groceries|package)\b/i;
const SHOPPING_KEYWORDS = /\b(buy|order|purchase|shop|get from store)\b/i;
const FOLLOWUP_KEYWORDS =
  /\b(call|phone|text|email|reply|message|reach out|follow up|contact|write to|send|dm|facetime)\b/i;

/** People-contact phrasing — shopping batch must never win over these. */
const PEOPLE_CONTACT =
  /\b(call|text|email|phone|message|reach out|contact)\b.*\b(mom|dad|mother|father|parent|parents|wife|husband|spouse|sister|brother|family|friend)\b|\b(mom|dad|mother|father|parent|parents)\b.*\b(call|text|email|phone|message)\b/i;

function inferBatchKey(
  text: string,
  originalText: string,
): 'errands' | 'shopping' | 'follow_ups' | null {
  const combined = `${text} ${originalText}`;
  if (ERRAND_KEYWORDS.test(combined)) return 'errands';
  if (FOLLOWUP_KEYWORDS.test(combined) || PEOPLE_CONTACT.test(combined)) {
    return 'follow_ups';
  }
  if (SHOPPING_KEYWORDS.test(combined)) return 'shopping';
  return null;
}

type KnownBatchKey = 'errands' | 'shopping' | 'follow_ups';

function normalizeBatchKey(
  v: string | null | undefined,
): KnownBatchKey | null | undefined {
  if (v == null) return v;
  if (v === 'errands' || v === 'shopping' || v === 'follow_ups') return v;
  return null;
}

/** If the model chose shopping but keywords imply follow-up or errand, fix it. */
function correctShoppingMisbatch(
  batchKey: string | null | undefined,
  text: string,
  originalText: string,
): KnownBatchKey | null | undefined {
  if (batchKey !== 'shopping') return normalizeBatchKey(batchKey);
  const inferred = inferBatchKey(text, originalText);
  if (inferred === 'follow_ups' || inferred === 'errands') return inferred;
  return 'shopping';
}

function allowLifecycleDestructive(c: Confidence): boolean {
  return c === 'high';
}
function allowSnooze(c: Confidence): boolean {
  return c === 'high' || c === 'medium';
}
function allowFollowUp(c: Confidence): boolean {
  return c === 'high';
}

@Injectable()
export class ValidationService {
  private readonly log = new Logger(ValidationService.name);

  /**
   * Validate and sanitize both phases. Drops invalid entries rather than
   * failing the entire pipeline — logs issues for traceability.
   */
  validate(
    extract: ExtractPhaseResult,
    reconcile: ReconcilePhaseResult,
    openTaskIds: Set<string>,
    /** For merge batch_key sanity checks — id → current extract text */
    openTaskTextById?: ReadonlyMap<string, string>,
  ): ValidatedPipeline {
    const issues: ValidationIssue[] = [];

    const cleanExtract = this.validateExtractPhase(extract, issues);
    const cleanReconcile = this.validateReconcilePhase(
      reconcile,
      openTaskIds,
      cleanExtract.new_items.length,
      issues,
      openTaskTextById,
    );

    if (issues.length > 0) {
      const dropped = issues.filter((i) => i.severity === 'drop').length;
      const warned = issues.filter((i) => i.severity === 'warn').length;
      this.log.log(`Validation: ${dropped} dropped, ${warned} warnings`);
    }

    return { extract: cleanExtract, reconcile: cleanReconcile, issues };
  }

  private validateExtractPhase(
    raw: ExtractPhaseResult,
    issues: ValidationIssue[],
  ): ExtractPhaseResult {
    const validItems = raw.new_items.filter((item, i) => {
      if (!item.text?.trim()) {
        issues.push({
          phase: 'extract',
          field: `new_items[${i}].text`,
          message: 'Empty text — dropped',
          severity: 'drop',
        });
        return false;
      }

      if (item.due_at && !parseIso(item.due_at)) {
        issues.push({
          phase: 'extract',
          field: `new_items[${i}].due_at`,
          message: `Unparseable date "${item.due_at}" — cleared`,
          severity: 'warn',
        });
        item.due_at = null;
      }

      if (item.period_start && !parseIso(item.period_start)) {
        item.period_start = null;
        issues.push({
          phase: 'extract',
          field: `new_items[${i}].period_start`,
          message: 'Unparseable — cleared',
          severity: 'warn',
        });
      }
      if (item.period_end && !parseIso(item.period_end)) {
        item.period_end = null;
        issues.push({
          phase: 'extract',
          field: `new_items[${i}].period_end`,
          message: 'Unparseable — cleared',
          severity: 'warn',
        });
      }

      if (!item.batch_key) {
        const corrected = inferBatchKey(item.text, item.original_text);
        if (corrected) {
          item.batch_key = corrected;
          issues.push({
            phase: 'extract',
            field: `new_items[${i}].batch_key`,
            message: `Keyword match → "${corrected}"`,
            severity: 'warn',
          });
        }
      } else {
        const fixed = correctShoppingMisbatch(
          item.batch_key,
          item.text,
          item.original_text,
        );
        if (fixed !== item.batch_key) {
          item.batch_key = fixed as typeof item.batch_key;
          issues.push({
            phase: 'extract',
            field: `new_items[${i}].batch_key`,
            message: `Corrected mis-batched shopping → ${fixed}`,
            severity: 'warn',
          });
        }
      }

      return true;
    });

    const seen = new Set<string>();
    const deduped = validItems.filter((item) => {
      const key = item.text.toLowerCase().trim();
      if (seen.has(key)) {
        issues.push({
          phase: 'extract',
          field: 'new_items',
          message: `Duplicate text "${item.text}" within dump — dropped`,
          severity: 'drop',
        });
        return false;
      }
      seen.add(key);
      return true;
    });

    return { ...raw, new_items: deduped };
  }

  private validateReconcilePhase(
    raw: ReconcilePhaseResult,
    openIds: Set<string>,
    newItemCount: number,
    issues: ValidationIssue[],
    openTaskTextById?: ReadonlyMap<string, string>,
  ): ReconcilePhaseResult {
    const merges = raw.merge_operations.filter((m) => {
      if (!isValidUuid(m.actionable_id) || !openIds.has(m.actionable_id)) {
        issues.push({
          phase: 'reconcile',
          field: 'merge_operations',
          message: `Unknown ID ${m.actionable_id} — dropped`,
          severity: 'drop',
        });
        return false;
      }
      if (m.confidence === 'low') {
        issues.push({
          phase: 'reconcile',
          field: 'merge_operations',
          message: `Low confidence merge for ${m.actionable_id} — dropped`,
          severity: 'drop',
        });
        return false;
      }
      if (m.patch.due_at && !parseIso(m.patch.due_at)) {
        m.patch.due_at = undefined;
        issues.push({
          phase: 'reconcile',
          field: 'merge_operations.patch.due_at',
          message: 'Unparseable date — cleared from patch',
          severity: 'warn',
        });
      }
      if (
        m.patch.batch_key === 'shopping' &&
        openTaskTextById?.has(m.actionable_id)
      ) {
        const taskText = openTaskTextById.get(m.actionable_id) ?? '';
        const fixed = correctShoppingMisbatch('shopping', taskText, '');
        if (fixed === 'follow_ups' || fixed === 'errands') {
          m.patch.batch_key = fixed;
          issues.push({
            phase: 'reconcile',
            field: 'merge_operations.patch.batch_key',
            message: `Reconcile wanted shopping but task text implies ${fixed} — corrected`,
            severity: 'warn',
          });
        }
      }
      return true;
    });

    const lifecycle = raw.lifecycle_commands.filter((cmd) => {
      if (!isValidUuid(cmd.actionable_id) || !openIds.has(cmd.actionable_id)) {
        issues.push({
          phase: 'reconcile',
          field: 'lifecycle_commands',
          message: `Unknown ID ${cmd.actionable_id} — dropped`,
          severity: 'drop',
        });
        return false;
      }
      if (cmd.command === 'snooze') {
        if (!allowSnooze(cmd.confidence)) {
          issues.push({
            phase: 'reconcile',
            field: 'lifecycle_commands',
            message: `Low confidence snooze for ${cmd.actionable_id} — dropped`,
            severity: 'drop',
          });
          return false;
        }
        if (cmd.snooze_until_iso && !parseIso(cmd.snooze_until_iso)) {
          issues.push({
            phase: 'reconcile',
            field: 'lifecycle_commands.snooze_until_iso',
            message: 'Unparseable snooze date — dropped',
            severity: 'drop',
          });
          return false;
        }
      } else if (!allowLifecycleDestructive(cmd.confidence)) {
        issues.push({
          phase: 'reconcile',
          field: 'lifecycle_commands',
          message: `${cmd.command} needs high confidence (got ${cmd.confidence}) — dropped`,
          severity: 'drop',
        });
        return false;
      }
      return true;
    });

    const followUps = raw.follow_up_writes.filter((fu) => {
      if (!isValidUuid(fu.actionable_id) || !openIds.has(fu.actionable_id)) {
        issues.push({
          phase: 'reconcile',
          field: 'follow_up_writes',
          message: `Unknown ID ${fu.actionable_id} — dropped`,
          severity: 'drop',
        });
        return false;
      }
      if (!allowFollowUp(fu.confidence)) {
        issues.push({
          phase: 'reconcile',
          field: 'follow_up_writes',
          message: `Low confidence follow-up — dropped`,
          severity: 'drop',
        });
        return false;
      }
      return true;
    });

    const calendar = raw.calendar_writes.filter((cw) => {
      if (cw.confidence === 'low') {
        issues.push({
          phase: 'reconcile',
          field: 'calendar_writes',
          message: `Low confidence calendar write "${cw.summary}" — dropped`,
          severity: 'drop',
        });
        return false;
      }
      const start = parseIso(cw.start_at);
      const end = parseIso(cw.end_at);
      if (!start || !end) {
        issues.push({
          phase: 'reconcile',
          field: 'calendar_writes',
          message: `Invalid start/end for "${cw.summary}" — dropped`,
          severity: 'drop',
        });
        return false;
      }
      if (end <= start) {
        issues.push({
          phase: 'reconcile',
          field: 'calendar_writes',
          message: `End before start for "${cw.summary}" — dropped`,
          severity: 'drop',
        });
        return false;
      }
      return true;
    });

    const dedups = (raw.deduplications ?? []).filter((d) => {
      if (d.new_item_index < 0 || d.new_item_index >= newItemCount) {
        issues.push({
          phase: 'reconcile',
          field: 'deduplications',
          message: `Invalid index ${d.new_item_index} — dropped`,
          severity: 'drop',
        });
        return false;
      }
      if (!isValidUuid(d.existing_id) || !openIds.has(d.existing_id)) {
        issues.push({
          phase: 'reconcile',
          field: 'deduplications',
          message: `Unknown existing ID ${d.existing_id} — dropped`,
          severity: 'drop',
        });
        return false;
      }
      return true;
    });

    return {
      merge_operations: merges,
      lifecycle_commands: lifecycle,
      follow_up_writes: followUps,
      calendar_writes: calendar,
      deduplications: dedups,
    };
  }
}
