import { DateTime } from 'luxon';

import { startOfIsoWeekMonday } from '../../../chat/utils/start-of-iso-week';

export type QuestionTemporalRange = {
  start: Date;
  end: Date;
  label: string;
};

function dayRange(
  nowZ: DateTime,
  offsetDays: number,
  label: string,
): QuestionTemporalRange {
  const d = nowZ.plus({ days: offsetDays });
  return {
    start: d.startOf('day').toUTC().toJSDate(),
    end: d.endOf('day').toUTC().toJSDate(),
    label,
  };
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.toLowerCase() as (typeof MONTHS)[number]);
}

type Matcher = (q: string, nowZ: DateTime) => QuestionTemporalRange | null;

const matchers: Matcher[] = [];

matchers.push((q, nowZ) => {
  if (/\bwhat did we talk about on this day\b/i.test(q)) {
    return dayRange(nowZ, 0, 'today');
  }
  if (
    /\b(remind me when|when did we discuss|what did we discuss|what were we talking about|what did we talk about)\b/i.test(
      q,
    ) &&
    /\b(today|this\s+day|on\s+this\s+day)\b/i.test(q)
  ) {
    return dayRange(nowZ, 0, 'today');
  }
  if (
    /\b(remind me when|when did we discuss|what did we discuss|what were we talking about|what did we talk about)\b/i.test(
      q,
    ) &&
    /\b(yesterday)\b/i.test(q)
  ) {
    return dayRange(nowZ, -1, 'yesterday');
  }
  return null;
});

matchers.push((q, nowZ) => {
  if (!/\b(today|this\s+day|on\s+this\s+day)\b/i.test(q)) return null;
  if (
    !/\b(talk|discuss|discussed|said|conversation|spoke|chat|mention|discussing)\b/i.test(
      q,
    )
  ) {
    return null;
  }
  return dayRange(nowZ, 0, 'today');
});

matchers.push((q, nowZ) => {
  if (!/\b(yesterday)\b/i.test(q)) return null;
  if (
    !/\b(talk|discuss|discussed|said|conversation|spoke|chat|mention|discussing)\b/i.test(
      q,
    )
  ) {
    return null;
  }
  return dayRange(nowZ, -1, 'yesterday');
});

matchers.push((q, nowZ) => {
  const re =
    /\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const m = re.exec(q);
  if (!m) return null;
  const map: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };
  const target = map[m[1].toLowerCase()];
  if (!target) return null;
  let d = nowZ.startOf('day').minus({ days: 1 });
  for (let i = 0; i < 14 && d.weekday !== target; i++) {
    d = d.minus({ days: 1 });
  }
  if (d.weekday !== target) return null;
  const md = d.toFormat('M/d/yyyy');
  return {
    start: d.startOf('day').toUTC().toJSDate(),
    end: d.endOf('day').toUTC().toJSDate(),
    label: `last ${d.toFormat('cccc')}, ${md}`,
  };
});

matchers.push((q, nowZ) => {
  if (!/\b(?:this time|this day|around now)\s+last year\b/i.test(q))
    return null;
  const anchor = nowZ.minus({ years: 1 });
  const start = anchor.minus({ days: 7 }).startOf('day');
  const end = anchor.plus({ days: 7 }).endOf('day');
  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    label: `around ${end.toFormat('MMMM d')} last year`,
  };
});

matchers.push((q, nowZ) => {
  if (!/\blast\s+year\b/i.test(q)) return null;
  const y = nowZ.year - 1;
  const start = DateTime.fromObject(
    { year: y, month: 1, day: 1 },
    { zone: nowZ.zone },
  );
  const end = DateTime.fromObject(
    { year: y, month: 12, day: 31 },
    { zone: nowZ.zone },
  );
  return {
    start: start.startOf('day').toUTC().toJSDate(),
    end: end.endOf('day').toUTC().toJSDate(),
    label: String(y),
  };
});

matchers.push((q, nowZ) => {
  const m =
    /\blast\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.exec(
      q,
    );
  if (!m) return null;
  const idx = monthIndex(m[1]);
  if (idx < 0) return null;
  const year = idx >= nowZ.month - 1 ? nowZ.year - 1 : nowZ.year;
  const start = DateTime.fromObject(
    { year, month: idx + 1, day: 1 },
    { zone: nowZ.zone },
  );
  const end = start.endOf('month');
  return {
    start: start.startOf('day').toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    label: `${MONTHS[idx]} ${year}`,
  };
});

matchers.push((q, nowZ) => {
  const m =
    /\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.exec(
      q,
    );
  if (!m) return null;
  const idx = monthIndex(m[1]);
  if (idx < 0) return null;
  const year = idx >= nowZ.month - 1 ? nowZ.year - 1 : nowZ.year;
  const start = DateTime.fromObject(
    { year, month: idx + 1, day: 1 },
    { zone: nowZ.zone },
  );
  const end = start.endOf('month');
  return {
    start: start.startOf('day').toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    label: `${MONTHS[idx]} ${year}`,
  };
});

matchers.push((q, nowZ) => {
  const m = /\b(\d+)\s+months?\s+ago\b/i.exec(q);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 24) return null;
  const start = nowZ.minus({ months: n }).startOf('month');
  const end = start.endOf('month');
  return {
    start: start.startOf('day').toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    label: `${n} month${n > 1 ? 's' : ''} ago`,
  };
});

matchers.push((q, nowZ) => {
  if (!/\blast\s+month\b/i.test(q)) return null;
  const start = nowZ.minus({ months: 1 }).startOf('month');
  const end = start.endOf('month');
  return {
    start: start.startOf('day').toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    label: 'last month',
  };
});

matchers.push((q, nowZ) => {
  if (!/\blast\s+week\b/i.test(q)) return null;
  const thisMon = startOfIsoWeekMonday(nowZ);
  const start = thisMon.minus({ weeks: 1 });
  const end = thisMon.minus({ days: 1 }).endOf('day');
  return {
    start: start.startOf('day').toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    label: `last week (${start.toFormat('M/d')}\u2013${end.toFormat('M/d/yyyy')})`,
  };
});

matchers.push((q, nowZ) => {
  if (!/\blast\s+summer\b/i.test(q)) return null;
  const year = nowZ.month > 8 ? nowZ.year : nowZ.year - 1;
  const start = DateTime.fromObject(
    { year, month: 6, day: 1 },
    { zone: nowZ.zone },
  );
  const end = DateTime.fromObject(
    { year, month: 8, day: 31 },
    { zone: nowZ.zone },
  );
  return {
    start: start.startOf('day').toUTC().toJSDate(),
    end: end.endOf('day').toUTC().toJSDate(),
    label: `summer ${year}`,
  };
});

export function detectQuestionTemporalRange(
  question: string,
  now: Date,
  userTimeZone: string | null | undefined,
): QuestionTemporalRange | null {
  const zone = userTimeZone?.trim() || 'UTC';
  const nowZ = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(zone);
  const q = question.trim();
  if (!q) return null;
  for (const fn of matchers) {
    const hit = fn(q, nowZ);
    if (hit) return hit;
  }
  return null;
}
