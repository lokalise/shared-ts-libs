// biome-ignore lint/style/noDefaultExport: drizzle config convention
export default {
  dialect: 'postgresql',
  out: './test/fixtures/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
}
