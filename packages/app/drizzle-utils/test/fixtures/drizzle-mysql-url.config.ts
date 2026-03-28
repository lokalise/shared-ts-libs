// biome-ignore lint/style/noDefaultExport: drizzle config convention
export default {
  dialect: 'mysql',
  out: './test/fixtures/migrations-mysql',
  dbCredentials: {
    url: process.env.MYSQL_DATABASE_URL,
  },
}
