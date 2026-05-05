import { buildRedisTcpUrlFromUpstashRest } from '@/core/redis/build-redis-tcp-url';

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
  openai: {
    apiKey: string | undefined;
    model: string;
    agentModel: string;
  };
  /** TCP URL for BullMQ + ioredis (SSE pub/sub). From REDIS_URL or derived from Upstash REST. */
  redisUrl: string | undefined;
  /** Upstash REST credentials for `@upstash/redis` when both env vars are set. */
  upstash: { restUrl: string; restToken: string } | undefined;
  googleCalendar: {
    clientId: string | undefined;
    clientSecret: string | undefined;
    redirectUri: string | undefined;
    webhookUrl: string | undefined;
    /** HMAC secret for signing OAuth `state` (prevents userId tampering on callback). */
    oauthStateSecret: string | undefined;
  };
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

  const env = process.env.ENV ?? process.env.NODE_ENV ?? 'dev';
  if (env === 'prod' && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is required in production');
  }

  const redisUrlExplicit = process.env.REDIS_URL?.trim();
  const redisUrlDerived = buildRedisTcpUrlFromUpstashRest(
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.UPSTASH_REDIS_REST_TOKEN,
  );
  const redisUrl = redisUrlExplicit || redisUrlDerived;

  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const upstash =
    restUrl && restToken ? { restUrl, restToken } : undefined;

  return {
    env,
    port: Number.parseInt(process.env.PORT ?? '8000', 10),
    database: { url: databaseUrl },
    clerk: {
      webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
      jwksUrl: process.env.CLERK_JWKS_URL,
      jwtIssuer: process.env.CLERK_JWT_ISSUER,
    },
    cors: { origins },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      agentModel: process.env.OPENAI_AGENT_MODEL ?? 'gpt-4o',
    },
    redisUrl,
    upstash,
    googleCalendar: {
      clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
      webhookUrl: process.env.GOOGLE_CALENDAR_WEBHOOK_URL,
      oauthStateSecret: process.env.GOOGLE_OAUTH_STATE_SECRET,
    },
  };
};
