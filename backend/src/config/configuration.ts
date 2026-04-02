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
  openai: { apiKey: string | undefined };
  sentry: { dsn: string | undefined };
  defaultRateLimit: string | undefined;
  maxRequestSize: string | undefined;
  redisUrl: string | undefined;
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
    },
    sentry: {
      dsn: process.env.SENTRY_SDK_DSN,
    },
    defaultRateLimit: process.env.DEFAULT_RATE_LIMIT,
    maxRequestSize: process.env.MAX_REQUEST_SIZE,
    redisUrl: process.env.REDIS_URL,
  };
};
