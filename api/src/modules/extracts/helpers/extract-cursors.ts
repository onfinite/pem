export function encodeCursor(d: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ d: d.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

export function decodeCursor(raw: string): { d: Date; id: string } | null {
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      d?: string;
      i?: string;
    };
    if (typeof j.d !== 'string' || typeof j.i !== 'string') return null;
    const dt = new Date(j.d);
    return Number.isNaN(dt.getTime()) ? null : { d: dt, id: j.i };
  } catch {
    return null;
  }
}

export function encodeOpenCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ ca: createdAt.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

export function decodeOpenCursor(
  raw: string,
): { createdAt: Date; id: string } | null {
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      ca?: string;
      i?: string;
    };
    if (typeof j.ca !== 'string' || typeof j.i !== 'string') return null;
    const dt = new Date(j.ca);
    return Number.isNaN(dt.getTime()) ? null : { createdAt: dt, id: j.i };
  } catch {
    return null;
  }
}
