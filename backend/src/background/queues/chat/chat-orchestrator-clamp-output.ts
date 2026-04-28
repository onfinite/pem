import type { PemAgentOutput } from '@/agents/pem-agent.schemas';

const SAFETY_CAPS = {
  creates: 10,
  updates: 10,
  completions: 10,
  calendar_writes: 5,
  calendar_updates: 5,
  calendar_deletes: 3,
  scheduling: 10,
  recurrence_detections: 10,
  rsvp_actions: 5,
  memory_writes: 10,
} as const;

export function clampAgentOutput(output: PemAgentOutput): PemAgentOutput {
  return {
    ...output,
    creates: output.creates.slice(0, SAFETY_CAPS.creates),
    updates: output.updates.slice(0, SAFETY_CAPS.updates),
    completions: output.completions.slice(0, SAFETY_CAPS.completions),
    calendar_writes: output.calendar_writes.slice(
      0,
      SAFETY_CAPS.calendar_writes,
    ),
    calendar_updates: output.calendar_updates.slice(
      0,
      SAFETY_CAPS.calendar_updates,
    ),
    calendar_deletes: output.calendar_deletes.slice(
      0,
      SAFETY_CAPS.calendar_deletes,
    ),
    scheduling: output.scheduling.slice(0, SAFETY_CAPS.scheduling),
    recurrence_detections: output.recurrence_detections.slice(
      0,
      SAFETY_CAPS.recurrence_detections,
    ),
    rsvp_actions: output.rsvp_actions.slice(0, SAFETY_CAPS.rsvp_actions),
    memory_writes: output.memory_writes.slice(0, SAFETY_CAPS.memory_writes),
  };
}
