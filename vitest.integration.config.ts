import { defineConfig } from 'vitest/config'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineConfig(
  defineWorkersConfig({
    test: {
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
        },
      },
      include: ['test/integration/**/*.test.ts'],
      timeout: 30000,
    },
  })
)