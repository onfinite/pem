import { DateTime } from 'luxon';

import type { ExtractRow } from '@/database/schemas/index';
import {
  collapseRecurringRowsForDisplay,
  getRecurrenceSeriesId,
  isRecurringExtract,
} from '@/extracts/recurring-series-display';

function row(p: Partial<ExtractRow> & { id: string }): ExtractRow {
  return {
    userId: 'u1',
    messageId: null,
    source: 'dump',
    extractText: 't',
    originalText: 't',
    status: 'inbox',
    tone: 'confident',
    urgency: 'none',
    batchKey: null,
    listId: null,
    priority: null,
    isOrganizer: false,
    reminderAt: null,
    reminderSent: false,
    dueAt: null,
    periodStart: null,
    periodEnd: null,
    periodLabel: null,
    timezonePending: false,
    snoozedUntil: null,
    closedAt: null,
    pemNote: null,
    recommendedAt: null,
    draftText: null,
    externalEventId: null,
    calendarConnectionId: null,
    eventStartAt: null,
    eventEndAt: null,
    eventLocation: null,
    scheduledAt: null,
    durationMinutes: null,
    autoScheduled: false,
    schedulingReason: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    rsvpStatus: null,
    isAllDay: false,
    isDeadline: false,
    energyLevel: null,
    meta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  } as ExtractRow;
}

describe('isRecurringExtract / getRecurrenceSeriesId', () => {
  it('false for plain task', () => {
    const r = row({ id: 'a' });
    expect(isRecurringExtract(r)).toBe(false);
    expect(getRecurrenceSeriesId(r)).toBeNull();
  });

  it('true for child', () => {
    const r = row({ id: 'c', recurrenceParentId: 'p' });
    expect(isRecurringExtract(r)).toBe(true);
    expect(getRecurrenceSeriesId(r)).toBe('p');
  });

  it('true for parent with rule', () => {
    const r = row({
      id: 'p',
      recurrenceRule: { freq: 'daily', interval: 1 },
    });
    expect(isRecurringExtract(r)).toBe(true);
    expect(getRecurrenceSeriesId(r)).toBe('p');
  });
});

describe('collapseRecurringRowsForDisplay', () => {
  const zone = 'America/Los_Angeles';

  it('keeps all non-recurring rows', () => {
    const a = row({ id: 'a' });
    const b = row({ id: 'b' });
    const now = DateTime.fromISO('2026-04-16T12:00:00', { zone });
    const out = collapseRecurringRowsForDisplay([a, b], now);
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('keeps one child for today when parent and children exist', () => {
    const parent = row({
      id: 'p',
      recurrenceRule: { freq: 'daily', interval: 1 },
      periodStart: DateTime.fromISO('2026-04-15', { zone }).toJSDate(),
      periodEnd: DateTime.fromISO('2026-04-15', { zone })
        .endOf('day')
        .toJSDate(),
    });
    const mon = row({
      id: 'm',
      recurrenceParentId: 'p',
      periodStart: DateTime.fromISO('2026-04-14', { zone })
        .startOf('day')
        .toJSDate(),
      periodEnd: DateTime.fromISO('2026-04-14', { zone })
        .endOf('day')
        .toJSDate(),
      dueAt: DateTime.fromISO('2026-04-14', { zone }).toJSDate(),
    });
    const tue = row({
      id: 't',
      recurrenceParentId: 'p',
      periodStart: DateTime.fromISO('2026-04-15', { zone })
        .startOf('day')
        .toJSDate(),
      periodEnd: DateTime.fromISO('2026-04-15', { zone })
        .endOf('day')
        .toJSDate(),
      dueAt: DateTime.fromISO('2026-04-15', { zone }).toJSDate(),
    });
    const wed = row({
      id: 'w',
      recurrenceParentId: 'p',
      periodStart: DateTime.fromISO('2026-04-16', { zone })
        .startOf('day')
        .toJSDate(),
      periodEnd: DateTime.fromISO('2026-04-16', { zone })
        .endOf('day')
        .toJSDate(),
      dueAt: DateTime.fromISO('2026-04-16', { zone }).toJSDate(),
    });
    const now = DateTime.fromISO('2026-04-16T10:00:00', { zone });
    const out = collapseRecurringRowsForDisplay([parent, mon, tue, wed], now);
    expect(out.map((x) => x.id).sort()).toEqual(['w']);
  });

  it('returns parent only when no children', () => {
    const parent = row({
      id: 'p',
      recurrenceRule: { freq: 'daily', interval: 1 },
      periodStart: DateTime.fromISO('2026-04-16', { zone })
        .startOf('day')
        .toJSDate(),
      periodEnd: DateTime.fromISO('2026-04-16', { zone })
        .endOf('day')
        .toJSDate(),
    });
    const now = DateTime.fromISO('2026-04-16T12:00:00', { zone });
    const out = collapseRecurringRowsForDisplay([parent], now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('p');
  });
});
