// biome-ignore lint/style/noDefaultExport: drizzle config convention
export default {
  dialect: 'cockroachdb',
  out: './test/fixtures/migrations-cockroachdb',
  dbCredentials: {
    url: process.env.COCKROACHDB_DATABASE_URL,
  },
}
