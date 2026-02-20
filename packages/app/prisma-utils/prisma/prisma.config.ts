import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// biome-ignore lint/style/noDefaultExport: prisma config requires default export
export default defineConfig({
  datasource: { url: env('DATABASE_URL') },
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
})
