export type AppConfig = {
  env: string;
  port: number;
  database: { url: string };
  clerk: {
    webhookSecret: string | undefined;
    jwksUrl: string | undefined;
    jwtIssuer: string | undefined;
  };
  cors: { origins: string[] };
  tavily: { apiKey: string | undefined };
  /** SerpAPI (Google Shopping, Maps, organic) — structured search. */
  serpApi: { apiKey: string | undefined };
  openai: {
    apiKey: string | undefined;
    model: string;
    /** Main prep agent (tool loop). */
    agentModel: string;
  };
  redisUrl: string | undefined;
  /** Max tool/steps for agentic flows (classification uses structured output, not steps). */
  agentMaxSteps: number;
  /** Extra headroom for composite multi-section briefs (tool loop). */
  compositeAgentMaxSteps: number;
  /**
   * When true (default), composite preps run **parallel sub-agents** per lane, then merge
   * for the formatter. Set `COMPOSITE_FANOUT_ENABLED=false` to use a single agent loop.
   */
  compositeFanoutEnabled: boolean;
  compositeFanoutMaxLanes: number;
  compositeFanoutMaxStepsPerLane: number;
  compositeFanoutPlanTimeoutMs: number;
  /**
   * After parallel lanes, a **merge** LLM (no tools) unifies transcripts before COMPOSITE_BRIEF formatting.
   * Set `COMPOSITE_MERGE_ENABLED=false` to pass raw lane concatenation to the formatter.
   */
  compositeMergeEnabled: boolean;
  compositeMergeTimeoutMs: number;
  /** Timeout for gpt-4o-mini composite-vs-single detection (ms). */
  compositeDetectTimeoutMs: number;
  /** `generateText` timeout for the main prep agent (ms). */
  prepAgentTimeoutMs: number;
  /** `generateText` timeout for the structured JSON formatter (ms). */
  prepStructureTimeoutMs: number;
};

export default (): AppConfig => {
  const originsRaw = process.env.ALLOWED_ORIGINS ?? 'https://heypem.com';
  const origins = originsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_SYNC;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DATABASE_URL_SYNC is required');
  }

  return {
    env: process.env.ENV ?? process.env.NODE_ENV ?? 'dev',
    port: Number.parseInt(process.env.PORT ?? '8000', 10),
    database: { url: databaseUrl },
    clerk: {
      webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
      jwksUrl: process.env.CLERK_JWKS_URL,
      jwtIssuer: process.env.CLERK_JWT_ISSUER,
    },
    cors: { origins },
    tavily: {
      apiKey: process.env.TAVILY_API_KEY,
    },
    serpApi: {
      apiKey: process.env.SERP_API_KEY,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      agentModel: process.env.OPENAI_AGENT_MODEL ?? 'gpt-4o',
    },
    redisUrl: process.env.REDIS_URL,
    agentMaxSteps: Number.parseInt(process.env.AGENT_MAX_STEPS ?? '8', 10),
    compositeAgentMaxSteps: Number.parseInt(
      process.env.COMPOSITE_AGENT_MAX_STEPS ?? '14',
      10,
    ),
    compositeFanoutEnabled: process.env.COMPOSITE_FANOUT_ENABLED !== 'false',
    compositeFanoutMaxLanes: Number.parseInt(
      process.env.COMPOSITE_FANOUT_MAX_LANES ?? '4',
      10,
    ),
    compositeFanoutMaxStepsPerLane: Number.parseInt(
      process.env.COMPOSITE_FANOUT_MAX_STEPS_PER_LANE ?? '8',
      10,
    ),
    compositeFanoutPlanTimeoutMs: Number.parseInt(
      process.env.COMPOSITE_FANOUT_PLAN_TIMEOUT_MS ?? '20000',
      10,
    ),
    compositeMergeEnabled: process.env.COMPOSITE_MERGE_ENABLED !== 'false',
    compositeMergeTimeoutMs: Number.parseInt(
      process.env.COMPOSITE_MERGE_TIMEOUT_MS ?? '120000',
      10,
    ),
    compositeDetectTimeoutMs: Number.parseInt(
      process.env.COMPOSITE_DETECT_TIMEOUT_MS ?? '25000',
      10,
    ),
    prepAgentTimeoutMs: Number.parseInt(
      process.env.PREP_AGENT_TIMEOUT_MS ?? '600000',
      10,
    ),
    prepStructureTimeoutMs: Number.parseInt(
      process.env.PREP_STRUCTURE_TIMEOUT_MS ?? '120000',
      10,
    ),
  };
};
