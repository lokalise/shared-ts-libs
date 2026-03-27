// biome-ignore lint/style/noDefaultExport: drizzle config convention
export default {
  dialect: 'sqlite',
  out: './test/fixtures/migrations',
  dbCredentials: {
    url: 'sqlite://test.db',
  },
}
