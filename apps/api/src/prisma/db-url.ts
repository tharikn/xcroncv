/** Builds the Prisma URL: DATABASE_URL (no schema needed) + DB_SCHEMA. */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const base = env.DATABASE_URL;
  const schema = env.DB_SCHEMA?.trim();
  if (!base || !schema) return base;
  const url = new URL(base);
  url.searchParams.set('schema', schema);
  return url.toString();
}
