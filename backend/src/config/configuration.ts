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
  openai: { apiKey: string | undefined; model: string };
  redisUrl: string | undefined;
  /** Max tool/steps for agentic flows (classification uses structured output, not steps). */
  agentMaxSteps: number;
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
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    },
    redisUrl: process.env.REDIS_URL,
    agentMaxSteps: Number.parseInt(process.env.AGENT_MAX_STEPS ?? '8', 10),
  };
};
