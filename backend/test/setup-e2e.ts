/** Ensure ConfigModule can load before AppModule in e2e (Pool is lazy until first query). */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5432/pem_test';
