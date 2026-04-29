export type SnoozeUntil =
  | 'later_today'
  | 'tomorrow'
  | 'weekend'
  | 'next_week'
  | 'holding';

export type ExtractQueryFilters = {
  status?: 'open' | 'inbox' | 'snoozed' | 'closed';
  batch_key?: string;
  tone?: string;
  exclude_tone?: string;
  urgency?: string;
};

/** When `'agent'`, skip user audit row — caller must log (e.g. chat `logEntry`). */
export type ExtractMutationAudit = {
  initiatedBy?: 'user' | 'agent';
  /** Client surface (e.g. `task_drawer`) — stored on log payload when present. */
  surface?: string;
  /** Correlation id from client or proxy — stored as `request_id` on log payload. */
  requestId?: string;
};
