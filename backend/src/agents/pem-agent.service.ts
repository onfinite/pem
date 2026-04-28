import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import {
  extractJsonMiddleware,
  generateText,
  Output,
  wrapLanguageModel,
} from 'ai';
import { DateTime } from 'luxon';
import { z } from 'zod';

import { formatChatRecallStamp } from '@/chat/utils/format-chat-recall-stamp';
import {
  dedupeAgentLikeOutput,
  dedupeExtractionLike,
} from '@/background/queues/chat/filter-deduped-creates';
import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';

import {
  calendarDeleteSchema,
  calendarUpdateSchema,
  calendarWriteSchema,
  completeActionSchema,
  extractActionSchema,
  memoryWriteSchema,
  pemAgentOutputSchema,
  pemExtractionOutputSchema,
  pemOrchestrationOutputSchema,
  recurrenceDetectionSchema,
  rsvpActionSchema,
  schedulingSchema,
  updateActionSchema,
  type PemAgentOutput,
  type PemExtractionOutput,
  type PemOrchestrationOutput,
  coerceOrchestrationSummaryUpdate,
} from '@/agents/pem-agent.schemas';

import {
  JSON_RECOVERY_EXTRACTION,
  JSON_RECOVERY_ORCHESTRATION,
  JSON_RECOVERY_SYSTEM,
  SYSTEM_EXTRACTION,
  SYSTEM_MONOLITHIC,
  SYSTEM_ORCHESTRATION,
} from '@/agents/pem-agent.system-prompts';

const PEM_AGENT_STRUCTURED_ATTEMPTS = 3;
const PEM_EXTRACTION_ATTEMPTS = 3;
const PEM_ORCHESTRATION_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractionIsEmpty(e: PemExtractionOutput): boolean {
  return (
    e.creates.length === 0 &&
    e.updates.length === 0 &&
    e.completions.length === 0
  );
}

/** Programmatic gate (Anthropic): re-check when model returns no work but text looks actionable. */
const MAX_MESSAGE_CHARS = 4000;

function truncateForPrompt(content: string): string {
  if (content.length <= MAX_MESSAGE_CHARS) return content;
  return (
    content.slice(0, MAX_MESSAGE_CHARS) + '\n\n(message truncated for length)'
  );
}

function messageLikelyContainsTasks(content: string): boolean {
  const t = content.trim();
  if (t.length < 10) return false;
  if (/User photo caption:/i.test(t)) {
    if (
      /\b(should|need to|have to|must|got to|gotta|todo|to-?do|tasks?|remind|my list|things i|stuff i|on my plate|appointments?|schedule)\b/i.test(
        t,
      )
    ) {
      return true;
    }
  }
  if (t.length > 60) return true;
  return /\b(need|must|have to|should|don't forget|dont forget|remind|pick up|pickup|grab|buy|call|email|text|schedule|tomorrow|tonight|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|errands|groceries|shopping|appointment|meeting|deadline|worried|concern|miss|missing|afraid|scared|prioritize|important|urgent|focus|stuff to do|things to do)\b/i.test(
    t,
  );
}

/** Follow-up after image_reference_only Pem reply: explicit plan / short yes + prior user photo in thread. */
function shortAffirmationToPlanRecentPhoto(params: {
  messageContent: string;
  recentMessages: { role: string; content: string; created_at: string }[];
}): boolean {
  const t = params.messageContent.trim();
  if (t.length > 60) return false;
  const hasPriorUserPhoto = params.recentMessages.some(
    (m) => m.role === 'user' && /\[Photo:/i.test(m.content),
  );
  if (!hasPriorUserPhoto) return false;

  if (/\b(plan it|add tasks?|turn it into tasks?)\b/i.test(t)) return true;
  if (/\b(yes|sure|ok|okay|yeah).{0,18}\bplan\b/i.test(t)) return true;
  if (
    t.length <= 22 &&
    /^(y(es)?|sure|ok(ay)?|go ahead|do it)\s*!*$/i.test(t)
  ) {
    return true;
  }
  return false;
}

const DEFAULT_ORCHESTRATION: PemOrchestrationOutput = {
  response_text: 'Got it.',
  calendar_writes: [],
  memory_writes: [],
  calendar_updates: [],
  calendar_deletes: [],
  scheduling: [],
  recurrence_detections: [],
  rsvp_actions: [],
  summary_update: null,
  polished_text: null,
  detected_theme: null,
};

@Injectable()
export class PemAgentService {
  private readonly log = new Logger(PemAgentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
  ) {}

  async run(params: {
    messageContent: string;
    isLongVoiceMemo?: boolean;
    userTimezone: string | null;
    openExtracts: {
      id: string;
      text: string;
      status: string;
      tone: string;
      urgency: string;
      batch_key: string | null;
      due_at: string | null;
      period_label: string | null;
    }[];
    calendarEvents: {
      id: string;
      summary: string;
      start_at: string;
      end_at: string;
      location: string | null;
      description: string | null;
      is_organizer: boolean;
      source: string;
    }[];
    memorySection: string;
    recentMessages: { role: string; content: string; created_at: string }[];
    ragContext: string;
    /** Captions + vision for the "From your photos" strip — same as Ask prompt injection. */
    photoRecallContext?: string;
    userName: string | null;
    userSummary: string | null;
    schedulingContext?: string;
    userPreferences?: string;
    recentClosedSection?: string;
    todayCalendarSection?: string;
    userActivityLine?: string;
    userLists?: { id: string; name: string }[];
    contacts?: {
      email: string;
      name: string | null;
      meetingCount: number;
      lastMetAt: Date | null;
    }[];
    /** Normalized task-text keys already on open or recently closed tasks — applied before orchestration so the reply matches persisted actions. */
    dedupeActiveTaskKeys?: string[];
    dedupeClosedTaskKeys?: string[];
    /** Fetched link summaries + metadata (not raw page markdown). */
    linkContext?: string;
  }): Promise<PemAgentOutput> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const openai = createOpenAI({ apiKey });
    const agentModel = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    const prompt = this.buildUserPrompt(params);

    const fallback: PemAgentOutput = {
      response_text: "Got it. I'll keep that in mind.",
      creates: [],
      updates: [],
      completions: [],
      calendar_writes: [],
      memory_writes: [],
      calendar_updates: [],
      calendar_deletes: [],
      scheduling: [],
      recurrence_detections: [],
      rsvp_actions: [],
      summary_update: null,
      polished_text: null,
      detected_theme: null,
    };

    const baseModel = openai(agentModel);
    const model = wrapLanguageModel({
      model: baseModel,
      middleware: extractJsonMiddleware(),
    });

    const activeDedupe = new Set(params.dedupeActiveTaskKeys ?? []);
    const closedDedupe = new Set(params.dedupeClosedTaskKeys ?? []);
    const dedupeExtraction = (e: PemExtractionOutput): PemExtractionOutput =>
      dedupeExtractionLike(e, activeDedupe, closedDedupe);

    /** Prompt chaining: extraction → orchestration (Anthropic “workflows” pattern). */
    let extraction = await this.runExtractionPhase(
      openai,
      agentModel,
      model,
      prompt,
    );
    extraction = dedupeExtraction(extraction);

    this.log.log(
      `PemAgent extraction: creates=${extraction.creates.length} updates=${extraction.updates.length} completions=${extraction.completions.length}`,
    );

    if (
      extractionIsEmpty(extraction) &&
      (messageLikelyContainsTasks(params.messageContent) ||
        shortAffirmationToPlanRecentPhoto(params))
    ) {
      this.log.warn(
        'PemAgent: empty extraction for likely-actionable message; nudged retry',
      );
      const photoNudge = /Image description:|Image — full detail/i.test(
        params.messageContent,
      )
        ? ' If the image detail block lists errands, appointments, or checklist lines (especially with times), emit one create per distinct line unless it already exists in open tasks — Pem already routed this message as organize-from-photo.'
        : shortAffirmationToPlanRecentPhoto(params)
          ? ' The user is confirming they want inbox items from their latest photo: read the most recent user line in "## Recent conversation" that contains [Photo: ...] and emit one create per distinct actionable line from that vision text (times → due_at / periods). Do not leave creates empty if that block lists concrete to-dos or appointments.'
          : '';
      extraction = await this.runExtractionPhase(
        openai,
        agentModel,
        model,
        `${prompt}\n\nIMPORTANT: The user message almost certainly contains at least one actionable item (buy/do/call/remember/time/worry/deadline/concern). Populate creates, updates, or completions — do not leave all three arrays empty unless there is truly nothing to capture. "I'm worried about missing X deadline" = update or create a task about X.${photoNudge}`,
      );
      extraction = dedupeExtraction(extraction);

      this.log.log(
        `PemAgent extraction retry: creates=${extraction.creates.length} updates=${extraction.updates.length} completions=${extraction.completions.length}`,
      );
    }
    if (
      extractionIsEmpty(extraction) &&
      (messageLikelyContainsTasks(params.messageContent) ||
        shortAffirmationToPlanRecentPhoto(params))
    ) {
      this.log.warn('PemAgent: monolithic fallback after extraction gate');
      const mono = await this.runMonolithicPhase(
        openai,
        agentModel,
        model,
        prompt,
        fallback,
      );
      const monoDeduped = dedupeAgentLikeOutput(
        mono,
        activeDedupe,
        closedDedupe,
      );
      this.log.log(
        `PemAgent monolithic result: creates=${monoDeduped.creates.length} updates=${monoDeduped.updates.length} completions=${monoDeduped.completions.length}`,
      );
      return monoDeduped;
    }

    const orchPrompt = `${prompt}\n\n## Locked extraction\n${JSON.stringify(extraction)}`;
    const orchestration = await this.runOrchestrationPhase(
      openai,
      agentModel,
      model,
      orchPrompt,
      extraction,
    );

    return { ...extraction, ...orchestration };
  }

  private buildUserPrompt(params: {
    messageContent: string;
    isLongVoiceMemo?: boolean;
    userTimezone: string | null;
    openExtracts: {
      id: string;
      text: string;
      status: string;
      tone: string;
      urgency: string;
      batch_key: string | null;
      due_at: string | null;
      period_label: string | null;
    }[];
    calendarEvents: {
      id: string;
      summary: string;
      start_at: string;
      end_at: string;
      location: string | null;
      description: string | null;
      is_organizer: boolean;
      source: string;
    }[];
    memorySection: string;
    recentMessages: { role: string; content: string; created_at: string }[];
    ragContext: string;
    /** Captions + vision for the "From your photos" strip — same as Ask prompt injection. */
    photoRecallContext?: string;
    userName: string | null;
    userSummary: string | null;
    schedulingContext?: string;
    userPreferences?: string;
    recentClosedSection?: string;
    todayCalendarSection?: string;
    userActivityLine?: string;
    userLists?: { id: string; name: string }[];
    contacts?: {
      email: string;
      name: string | null;
      meetingCount: number;
      lastMetAt: Date | null;
    }[];
    linkContext?: string;
  }): string {
    const tz = params.userTimezone ?? 'UTC';
    const nowLocal = DateTime.now().setZone(tz);
    const fmt = (iso: string) => {
      const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz);
      return dt.isValid ? dt.toFormat('ccc MMM d, h:mm a') : iso;
    };

    const cappedExtracts = params.openExtracts.slice(0, 60);
    const extraExtracts = params.openExtracts.length - cappedExtracts.length;

    const openTasksSection =
      cappedExtracts.length > 0
        ? cappedExtracts
            .map((e) => {
              const parts = [e.text];
              if (e.due_at) parts.push(`due: ${fmt(e.due_at)}`);
              if (e.period_label) parts.push(e.period_label);
              if (e.batch_key) parts.push(`[${e.batch_key}]`);
              return `- [${e.id}] ${parts.join(' | ')} (${e.status}, ${e.urgency})`;
            })
            .join('\n') +
          (extraExtracts > 0
            ? `\n(${extraExtracts} more tasks not shown — ask the user to be specific if they reference one not listed)`
            : '')
        : '(no open tasks)';

    const cappedEvents = params.calendarEvents.slice(0, 30);
    const calendarSection =
      cappedEvents.length > 0
        ? cappedEvents
            .map((e) => {
              const loc = e.location ? ` at ${e.location}` : '';
              const origin =
                e.source === 'calendar' && !e.is_organizer ? ' [invited]' : '';
              const desc = e.description
                ? ` — ${e.description.slice(0, 300)}`
                : '';
              return `- [${e.id}] ${e.summary}: ${fmt(e.start_at)} to ${fmt(e.end_at)}${loc}${origin}${desc}`;
            })
            .join('\n')
        : '(no upcoming events)';

    const nowJs = DateTime.now().toJSDate();
    const recentSection =
      params.recentMessages.length > 0
        ? params.recentMessages
            .map((m) => {
              const dt = DateTime.fromISO(m.created_at, {
                zone: 'utc',
              }).setZone(tz);
              const stamp = formatChatRecallStamp(dt.toJSDate(), nowJs, tz);
              const body = m.content?.slice(0, 300) ?? '';
              return `[${stamp}] ${m.role === 'user' ? 'User' : 'Pem'}: ${body}`;
            })
            .join('\n')
        : '';

    const summaryBlock = params.userSummary
      ? `## About the user\n${params.userSummary}`
      : '## About the user\n(No summary yet — learn about them from conversation)';

    const addressingBlock = params.userName
      ? `## Addressing the user\n- Preferred name: ${params.userName}\n- Use it naturally when it fits (not every message). Never invent or use a different name.\n`
      : `## Addressing the user\n- Name is not on file. Do not guess a name. If it feels natural, you may ask what they prefer to be called.\n`;

    return `${summaryBlock}

${addressingBlock}
Current time: ${nowLocal.toFormat('cccc, MMMM d, yyyy h:mm a ZZZZ')} (${tz})

## Open tasks
${openTasksSection}

## User's lists
${params.userLists && params.userLists.length > 0 ? params.userLists.map((l) => `- ${l.name}`).join('\n') : '(no lists yet — defaults: Shopping, Errands)'}

## Calendar (upcoming)
${calendarSection}

## Contacts
${this.buildContactsSection(params.contacts)}

## Memory
${params.memorySection || '(none yet)'}

## Recent conversation
${recentSection || '(start of conversation)'}

${params.userActivityLine ? `## Activity\n${params.userActivityLine}\n\n` : ''}${params.todayCalendarSection ? `## Today (timed items on your list)\n${params.todayCalendarSection}\n\n` : ''}${params.recentClosedSection ? `## Recently closed (off their list — do not recreate the same item unless they clearly want it back)\n${params.recentClosedSection}\n\n` : ''}${params.ragContext ? `## Related past context (vector memory)\n${params.ragContext}\n\n` : ''}${params.photoRecallContext ? `## Recalled chat photos (same thumbnails the app may show)\n${params.photoRecallContext}\n\n## Recalled photos vs open tasks\nWhen they ask what is on a shopping, grocery, Costco, or errand list, compare open tasks (especially batch_key shopping or errands) to the recalled photo captions and detail. If something they clearly intended to buy appears in those photos but is missing from open tasks, mention it once in plain language (not on your list yet). Never invent grocery items; only obvious gaps from the photo or caption.\n\n` : ''}${params.linkContext ? `${params.linkContext}\n\n` : ''}${params.schedulingContext ? `## Free time slots\n${params.schedulingContext}\n\n` : ''}${params.userPreferences ? `## Scheduling preferences\n${params.userPreferences}\n\n` : ''}${params.isLongVoiceMemo ? `## Note: This is a long voice memo (500+ words). Keep response to 3 sentences max. polished_text should be a 2-3 sentence summary, not a cleaned transcript.\n\n` : ''}## User message
"${truncateForPrompt(params.messageContent)}"`;
  }

  private buildContactsSection(
    contacts?: {
      email: string;
      name: string | null;
      meetingCount: number;
      lastMetAt: Date | null;
    }[],
  ): string {
    if (!contacts || contacts.length === 0) return '(none yet)';
    return contacts
      .map((c) => {
        const label = c.name ? `${c.name} <${c.email}>` : c.email;
        const meta: string[] = [];
        if (c.meetingCount > 0)
          meta.push(
            `${c.meetingCount} meeting${c.meetingCount === 1 ? '' : 's'}`,
          );
        if (c.lastMetAt)
          meta.push(`last met ${c.lastMetAt.toISOString().slice(0, 10)}`);
        return meta.length > 0
          ? `- ${label} (${meta.join(', ')})`
          : `- ${label}`;
      })
      .join('\n');
  }

  private async runExtractionPhase(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    model: Parameters<typeof generateText>[0]['model'],
    prompt: string,
  ): Promise<PemExtractionOutput> {
    const empty: PemExtractionOutput = {
      creates: [],
      updates: [],
      completions: [],
    };

    for (let attempt = 0; attempt < PEM_EXTRACTION_ATTEMPTS; attempt++) {
      try {
        const result = await generateText({
          model,
          system: SYSTEM_EXTRACTION,
          prompt,
          output: Output.object({ schema: pemExtractionOutputSchema }),
          temperature: 0.15,
          maxRetries: 1,
          maxOutputTokens: 4096,
          providerOptions: { openai: { strictJsonSchema: false } },
        });

        if (result.output != null) {
          return result.output;
        }

        const raw = result.text?.trim();
        this.log.warn(
          `PemAgent extraction attempt ${attempt + 1}: no object. finish=${result.finishReason}, text=${raw?.slice(0, 200)}`,
        );
        const recovered = this.tryRecoverExtractionFromRaw(raw);
        if (recovered) {
          this.log.warn(
            `PemAgent: extraction recovered from model text (attempt ${attempt + 1})`,
          );
          return recovered;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `PemAgent extraction attempt ${attempt + 1}/${PEM_EXTRACTION_ATTEMPTS}: ${msg}`,
        );
        if (attempt < PEM_EXTRACTION_ATTEMPTS - 1) {
          await sleep(350 * (attempt + 1));
        }
      }
    }

    try {
      const recovered = await this.runExtractionJsonRecovery(
        openai,
        agentModel,
        prompt,
      );
      if (recovered) {
        this.log.warn('PemAgent: extraction JSON recovery produced output');
        return recovered;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`PemAgent extraction recovery error: ${msg}`);
    }

    return empty;
  }

  private async runOrchestrationPhase(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    model: Parameters<typeof generateText>[0]['model'],
    orchPrompt: string,
    extraction: PemExtractionOutput,
  ): Promise<PemOrchestrationOutput> {
    for (let attempt = 0; attempt < PEM_ORCHESTRATION_ATTEMPTS; attempt++) {
      try {
        const result = await generateText({
          model,
          system: SYSTEM_ORCHESTRATION,
          prompt: orchPrompt,
          output: Output.object({ schema: pemOrchestrationOutputSchema }),
          temperature: 0.35,
          maxRetries: 1,
          maxOutputTokens: 4096,
          providerOptions: { openai: { strictJsonSchema: false } },
        });

        if (result.output != null) {
          return result.output;
        }

        const raw = result.text?.trim();
        this.log.warn(
          `PemAgent orchestration attempt ${attempt + 1}: no object. finish=${result.finishReason}, text=${raw?.slice(0, 200)}`,
        );
        const recovered = this.tryRecoverOrchestrationFromRaw(raw);
        if (recovered) {
          this.log.warn(
            `PemAgent: orchestration recovered from model text (attempt ${attempt + 1})`,
          );
          return recovered;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const rawText =
          e != null &&
          typeof e === 'object' &&
          'text' in e &&
          typeof (e as Record<string, unknown>).text === 'string'
            ? ((e as Record<string, unknown>).text as string).slice(0, 300)
            : undefined;
        this.log.warn(
          `PemAgent orchestration attempt ${attempt + 1}/${PEM_ORCHESTRATION_ATTEMPTS}: ${msg}`,
        );
        if (rawText) {
          this.log.debug(`PemAgent orchestration raw text: ${rawText}`);
          const recovered = this.tryRecoverOrchestrationFromRaw(rawText);
          if (recovered) {
            this.log.warn(
              `PemAgent: orchestration recovered from error text (attempt ${attempt + 1})`,
            );
            return recovered;
          }
        }
        if (attempt < PEM_ORCHESTRATION_ATTEMPTS - 1) {
          await sleep(350 * (attempt + 1));
        }
      }
    }

    try {
      const recovered = await this.runOrchestrationJsonRecovery(
        openai,
        agentModel,
        orchPrompt,
      );
      if (recovered) {
        this.log.warn('PemAgent: orchestration JSON recovery produced output');
        return recovered;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`PemAgent orchestration recovery error: ${msg}`);
    }

    this.log.warn(
      'PemAgent: orchestration failed after retries — synthesizing response from extraction',
    );
    return this.synthesizeOrchestration(extraction);
  }

  private async runMonolithicPhase(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    model: Parameters<typeof generateText>[0]['model'],
    prompt: string,
    fallback: PemAgentOutput,
  ): Promise<PemAgentOutput> {
    for (let attempt = 0; attempt < PEM_AGENT_STRUCTURED_ATTEMPTS; attempt++) {
      try {
        const result = await generateText({
          model,
          system: SYSTEM_MONOLITHIC,
          prompt,
          output: Output.object({ schema: pemAgentOutputSchema }),
          temperature: 0.25,
          maxRetries: 1,
          maxOutputTokens: 4096,
          providerOptions: { openai: { strictJsonSchema: false } },
        });

        if (result.output != null) {
          return result.output;
        }

        const raw = result.text?.trim();
        this.log.warn(
          `PemAgent monolithic attempt ${attempt + 1}: no object. finish=${result.finishReason}, text=${raw?.slice(0, 200)}`,
        );
        const recovered = this.tryRecoverFromRawText(raw, fallback);
        if (recovered) {
          this.log.warn(
            `PemAgent: monolithic recovered from model text (attempt ${attempt + 1})`,
          );
          return recovered;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `PemAgent monolithic attempt ${attempt + 1}/${PEM_AGENT_STRUCTURED_ATTEMPTS}: ${msg}`,
        );
        if (attempt < PEM_AGENT_STRUCTURED_ATTEMPTS - 1) {
          await sleep(350 * (attempt + 1));
        }
      }
    }

    try {
      const recovered = await this.runJsonRecoveryPass(
        openai,
        agentModel,
        prompt,
        fallback,
      );
      if (recovered) {
        this.log.warn('PemAgent: monolithic JSON recovery produced output');
        return recovered;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`PemAgent monolithic recovery error: ${msg}`);
    }

    this.log.error('PemAgent: monolithic path failed — using minimal fallback');
    return fallback;
  }

  private synthesizeOrchestration(
    extraction: PemExtractionOutput,
  ): PemOrchestrationOutput {
    const bits: string[] = [];
    if (extraction.creates.length > 0) {
      bits.push(
        `I added ${extraction.creates.length} thing${extraction.creates.length === 1 ? '' : 's'} to your list.`,
      );
    }
    if (extraction.updates.length > 0) {
      bits.push(
        `Updated ${extraction.updates.length} item${extraction.updates.length === 1 ? '' : 's'}.`,
      );
    }
    if (extraction.completions.length > 0) {
      bits.push(
        `Checked off ${extraction.completions.length} item${extraction.completions.length === 1 ? '' : 's'}.`,
      );
    }
    return {
      ...DEFAULT_ORCHESTRATION,
      response_text: bits.join(' ') || DEFAULT_ORCHESTRATION.response_text,
    };
  }

  private tryRecoverExtractionFromRaw(
    raw: string | undefined | null,
  ): PemExtractionOutput | null {
    if (!raw?.trim()) return null;
    const normalized = this.stripMarkdownJsonFence(raw.trim());
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
    const result = pemExtractionOutputSchema.safeParse(parsed);
    if (result.success) return result.data;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return this.recoverPartialExtractionOutput(
      parsed as Record<string, unknown>,
    );
  }

  private recoverPartialExtractionOutput(
    o: Record<string, unknown>,
  ): PemExtractionOutput | null {
    const mapArr = <T>(v: unknown, schema: z.ZodType<T>): T[] =>
      Array.isArray(v)
        ? v.flatMap((item) => {
            const r = schema.safeParse(item);
            return r.success ? [r.data] : [];
          })
        : [];

    const creates = mapArr(o.creates, extractActionSchema);
    const updates = mapArr(o.updates, updateActionSchema);
    const completions = mapArr(o.completions, completeActionSchema);
    if (creates.length + updates.length + completions.length === 0) return null;
    return { creates, updates, completions };
  }

  private async runExtractionJsonRecovery(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    userPrompt: string,
  ): Promise<PemExtractionOutput | null> {
    const model = openai(agentModel);
    const { text } = await generateText({
      model,
      system: JSON_RECOVERY_EXTRACTION,
      prompt: userPrompt,
      temperature: 0.1,
      maxRetries: 2,
      maxOutputTokens: 4096,
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    return this.tryRecoverExtractionFromRaw(text);
  }

  private tryRecoverOrchestrationFromRaw(
    raw: string | undefined | null,
  ): PemOrchestrationOutput | null {
    if (!raw?.trim()) return null;
    const normalized = this.stripMarkdownJsonFence(raw.trim());
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
    const result = pemOrchestrationOutputSchema.safeParse(parsed);
    if (result.success) return result.data;
    if (!result.success) {
      this.log.debug(
        `PemAgent orchestration safeParse errors: ${JSON.stringify(result.error.issues.slice(0, 5))}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    return this.recoverPartialOrchestrationOutput(
      parsed as Record<string, unknown>,
    );
  }

  private recoverPartialOrchestrationOutput(
    o: Record<string, unknown>,
  ): PemOrchestrationOutput | null {
    const mapArr = <T>(v: unknown, schema: z.ZodType<T>, label: string): T[] =>
      Array.isArray(v)
        ? v.flatMap((item, i) => {
            const r = schema.safeParse(item);
            if (!r.success) {
              this.log.debug(
                `PemAgent partial recovery dropped ${label}[${i}]: ${JSON.stringify(r.error.issues.slice(0, 3))}`,
              );
            }
            return r.success ? [r.data] : [];
          })
        : [];

    const calendar_writes = mapArr(
      o.calendar_writes,
      calendarWriteSchema,
      'calendar_writes',
    );
    const memory_writes = mapArr(
      o.memory_writes,
      memoryWriteSchema,
      'memory_writes',
    );
    const calendar_updates = mapArr(
      o.calendar_updates,
      calendarUpdateSchema,
      'calendar_updates',
    );
    const calendar_deletes = mapArr(
      o.calendar_deletes,
      calendarDeleteSchema,
      'calendar_deletes',
    );
    const scheduling = mapArr(o.scheduling, schedulingSchema, 'scheduling');
    const recurrence_detections = mapArr(
      o.recurrence_detections,
      recurrenceDetectionSchema,
      'recurrence_detections',
    );
    const rsvp_actions = mapArr(
      o.rsvp_actions,
      rsvpActionSchema,
      'rsvp_actions',
    );

    const hasWork =
      calendar_writes.length > 0 ||
      memory_writes.length > 0 ||
      calendar_updates.length > 0 ||
      calendar_deletes.length > 0 ||
      scheduling.length > 0 ||
      recurrence_detections.length > 0 ||
      rsvp_actions.length > 0;

    let response_text =
      typeof o.response_text === 'string' && o.response_text.trim()
        ? o.response_text.trim()
        : '';

    if (!response_text && hasWork) {
      const bits: string[] = [];
      if (calendar_writes.length) bits.push(`Scheduled on your calendar.`);
      if (memory_writes.length) bits.push(`Saved to memory.`);
      if (calendar_updates.length) bits.push(`Updated calendar events.`);
      if (calendar_deletes.length) bits.push(`Removed calendar events.`);
      if (scheduling.length) bits.push(`Suggested times.`);
      if (rsvp_actions.length) bits.push(`Updated RSVPs.`);
      response_text = bits.join(' ') || "I've got that.";
    }

    if (!response_text) return null;

    return {
      response_text,
      calendar_writes,
      memory_writes,
      calendar_updates,
      calendar_deletes,
      scheduling,
      recurrence_detections,
      rsvp_actions,
      summary_update: coerceOrchestrationSummaryUpdate(o.summary_update),
      polished_text:
        typeof o.polished_text === 'string' ? o.polished_text : null,
      detected_theme:
        typeof o.detected_theme === 'string' ? o.detected_theme : null,
    };
  }

  private async runOrchestrationJsonRecovery(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    userPrompt: string,
  ): Promise<PemOrchestrationOutput | null> {
    const model = openai(agentModel);
    const { text } = await generateText({
      model,
      system: JSON_RECOVERY_ORCHESTRATION,
      prompt: userPrompt,
      temperature: 0.15,
      maxRetries: 2,
      maxOutputTokens: 4096,
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    return this.tryRecoverOrchestrationFromRaw(text);
  }

  /**
   * Last resort: same prompt context, no structured-output mode — parse JSON from text.
   */
  private async runJsonRecoveryPass(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    userPrompt: string,
    fallback: PemAgentOutput,
  ): Promise<PemAgentOutput | null> {
    const model = openai(agentModel);
    const { text } = await generateText({
      model,
      system: JSON_RECOVERY_SYSTEM,
      prompt: userPrompt,
      temperature: 0.2,
      maxRetries: 2,
      maxOutputTokens: 4096,
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    return this.tryRecoverFromRawText(text, fallback);
  }

  private tryRecoverFromRawText(
    raw: string | undefined | null,
    fallback: PemAgentOutput,
  ): PemAgentOutput | null {
    if (!raw?.trim()) return null;

    const normalized = this.stripMarkdownJsonFence(raw.trim());
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (raw.length > 10) {
        return { ...fallback, response_text: normalized.slice(0, 2000) };
      }
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      if (raw.length > 10) {
        return { ...fallback, response_text: normalized.slice(0, 2000) };
      }
      return null;
    }

    const result = pemAgentOutputSchema.safeParse(parsed);
    if (result.success) return result.data;

    if (typeof parsed !== 'object' || parsed === null) return null;

    const o = parsed as Record<string, unknown>;
    const recovered = this.recoverPartialAgentOutput(o);
    if (recovered) {
      this.log.warn(
        `Partial schema match — recovered fields without full Zod pass`,
      );
      return recovered;
    }

    return null;
  }

  /** Remove ```json ... ``` wrappers models sometimes add despite instructions. */
  private stripMarkdownJsonFence(s: string): string {
    let t = s.trim();
    if (t.startsWith('```')) {
      t = t.replace(/^```(?:json)?\s*\n?/i, '');
      t = t.replace(/\n?```\s*$/i, '');
    }
    return t.trim();
  }

  /** Build output from loose JSON when full schema validation fails. */
  private recoverPartialAgentOutput(
    o: Record<string, unknown>,
  ): PemAgentOutput | null {
    const mapArr = <T>(v: unknown, schema: z.ZodType<T>): T[] =>
      Array.isArray(v)
        ? v.flatMap((item) => {
            const r = schema.safeParse(item);
            return r.success ? [r.data] : [];
          })
        : [];

    const creates = mapArr(o.creates, extractActionSchema);
    const updates = mapArr(o.updates, updateActionSchema);
    const completions = mapArr(o.completions, completeActionSchema);
    const calendar_writes = mapArr(o.calendar_writes, calendarWriteSchema);
    const memory_writes = mapArr(o.memory_writes, memoryWriteSchema);
    const calendar_updates = mapArr(o.calendar_updates, calendarUpdateSchema);
    const calendar_deletes = mapArr(o.calendar_deletes, calendarDeleteSchema);
    const scheduling = mapArr(o.scheduling, schedulingSchema);
    const recurrence_detections = mapArr(
      o.recurrence_detections,
      recurrenceDetectionSchema,
    );
    const rsvp_actions = mapArr(o.rsvp_actions, rsvpActionSchema);

    const hasWork =
      creates.length > 0 ||
      updates.length > 0 ||
      completions.length > 0 ||
      calendar_writes.length > 0 ||
      memory_writes.length > 0 ||
      calendar_updates.length > 0 ||
      calendar_deletes.length > 0 ||
      scheduling.length > 0 ||
      recurrence_detections.length > 0 ||
      rsvp_actions.length > 0;

    let response_text =
      typeof o.response_text === 'string' && o.response_text.trim()
        ? o.response_text.trim()
        : '';

    if (!response_text && hasWork) {
      const bits: string[] = [];
      if (creates.length) bits.push(`Added ${creates.length} item(s).`);
      if (calendar_writes.length) bits.push(`Scheduled on your calendar.`);
      if (updates.length) bits.push(`Updated ${updates.length} item(s).`);
      if (completions.length) bits.push(`Marked ${completions.length} done.`);
      if (memory_writes.length) bits.push(`Saved to memory.`);
      response_text = bits.join(' ') || "I've got that.";
    }

    if (!response_text) return null;

    return {
      response_text,
      creates,
      updates,
      completions,
      calendar_writes,
      memory_writes,
      calendar_updates,
      calendar_deletes,
      scheduling,
      recurrence_detections,
      rsvp_actions,
      summary_update: coerceOrchestrationSummaryUpdate(o.summary_update),
      polished_text:
        typeof o.polished_text === 'string' ? o.polished_text : null,
      detected_theme:
        typeof o.detected_theme === 'string' ? o.detected_theme : null,
    };
  }
}
