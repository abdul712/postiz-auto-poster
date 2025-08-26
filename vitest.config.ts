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
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        reportsDirectory: './coverage',
        thresholds: {
          global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
          },
        },
      },
    },
  })
)