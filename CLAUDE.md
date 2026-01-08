# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Current Phase**: Planning & Documentation (Pre-implementation)

This project is in the planning phase. The documentation describes the intended architecture and implementation, but **no source code has been implemented yet**. The repository currently contains:
- Documentation (README.md, IMPLEMENTATION_PLAN.md)
- GitHub Actions workflows for Claude Code integration
- This guidance file

## Project Overview

**Postiz Auto-Poster** - An automated Pinterest content scheduling system that will scrape websites via sitemap, generate AI images, and schedule posts through Postiz. Designed for Cloudflare Workers with scheduled execution.

## Intended Architecture

### Core Services Architecture
```
Sitemap URL → Scraper (Firecrawl) → Content Processor → Image Generator (fal.ai) → Pinterest Optimizer → Postiz Scheduler
                                           ↓                      ↓                      ↓
                                    Cloudflare D1          Cloudflare KV          Cloudflare Queue
```

### Planned Components
- **Sitemap Processor**: Parses XML sitemaps, extracts URLs, manages processing state
- **Content Scraper**: Uses Firecrawl for intelligent extraction of titles, descriptions, metadata
- **Image Generator**: Multi-model fal.ai integration for varied output:
  - FLUX.1 dev: Photorealistic images (40% weight)
  - Qwen-Image: Superior text rendering (30% weight)
  - Ideogram V2: Typography & posters (30% weight)
- **Postiz Scheduler**: Manages post scheduling via Postiz API with rate limiting and retry logic

## Repository Structure

### Current Structure (Actual)
```
postiz-auto-poster/
├── .github/
│   └── workflows/
│       ├── claude.yml              # Claude Code GitHub Action for @claude mentions
│       └── claude-code-review.yml  # Automated PR review workflow
├── .gitignore                      # Standard Node.js/Cloudflare ignores
├── CLAUDE.md                       # This file - AI assistant guidance
├── IMPLEMENTATION_PLAN.md          # Detailed technical roadmap
├── LICENSE                         # MIT License
└── README.md                       # Project documentation
```

### Target Structure (To Be Implemented)
```
src/
├── index.ts                 # Main Worker entry point & scheduled trigger
├── services/
│   ├── sitemap.ts          # Sitemap parsing and URL extraction
│   ├── scraper.ts          # Firecrawl integration for content extraction
│   ├── imageGenerator.ts   # fal.ai integration for image generation
│   ├── pinterest.ts        # Pinterest content optimization
│   └── scheduler.ts        # Postiz API integration for scheduling
├── utils/
│   ├── storage.ts          # KV and D1 database operations
│   ├── queue.ts            # Cloudflare Queue management
│   └── retry.ts            # Exponential backoff retry logic
├── types/
│   └── index.ts            # TypeScript type definitions
└── schemas/
    └── validation.ts       # Zod schemas for data validation
```

## Getting Started (For Implementation)

### Prerequisites
- Node.js 18+
- npm or pnpm
- Cloudflare account with Workers enabled
- Wrangler CLI (`npm install -g wrangler`)

### Initial Setup Steps
```bash
# 1. Initialize the project
npm init -y

# 2. Install dependencies
npm install hono zod date-fns @fal-ai/serverless-client
npm install -D @cloudflare/workers-types typescript wrangler vitest

# 3. Create wrangler.toml configuration
# 4. Set up D1 database and KV namespaces
# 5. Configure secrets with wrangler secret put
```

### Planned Development Commands
```bash
npm run dev                  # Start local dev server with Miniflare
npm run dev:remote          # Connect to remote Cloudflare resources
npm run build               # Build for production
npm run type-check          # TypeScript type checking
npm run test                # Run unit tests
npm run test:integration    # Run integration tests
npm run deploy:staging      # Deploy to staging environment
npm run deploy:production   # Deploy to production
npm run db:migrate          # Run D1 migrations
```

## Environment Configuration

Required environment variables (set via `wrangler secret put`):
```
POSTIZ_API_KEY          # Postiz API authentication
FAL_API_KEY            # fal.ai API key for image generation
FIRECRAWL_API_KEY      # Firecrawl API for web scraping
SITEMAP_URL            # Target website sitemap
PINTEREST_BOARD_ID     # Postiz Pinterest board identifier
```

## GitHub Workflows

### Claude Code Action (`claude.yml`)
Responds to `@claude` mentions in:
- Issue comments
- PR review comments
- Issues (opened/assigned)
- PR reviews

### Claude Code Review (`claude-code-review.yml`)
Automatically reviews all new PRs for:
- Code quality and best practices
- Potential bugs or issues
- Performance considerations
- Security concerns
- Test coverage

## Key Technical Decisions

### Why Cloudflare Workers?
- Serverless with automatic scaling
- Built-in cron triggers for scheduling
- Integrated KV storage and D1 database
- Global edge network for API calls
- Cost-effective for scheduled tasks

### Why Firecrawl over Playwright?
- Optimized for content extraction
- Lower latency than browser automation
- Better suited for Cloudflare Worker constraints
- Built-in AI-powered content understanding

### Image Generation Strategy
Multi-model approach for output variety:
- FLUX.1 dev: $0.025/megapixel - photorealistic content
- Qwen-Image: ~$0.020/megapixel - text-heavy designs
- Ideogram V2: ~$0.030/megapixel - typography/posters

Features:
- Weighted random selection with content-based preferences
- Generate Pinterest-optimized 2:3 aspect ratio (1000x1500px)
- Cache successful prompts per model for consistency
- Implement fallback chain: primary model → secondary → tertiary

### Scheduling Logic
- Process sitemap every 6 hours
- Limit to 10 new URLs per run (Worker CPU constraints)
- Distribute posts across optimal Pinterest posting times
- Maximum 1 post per hour to avoid spam

## Implementation Patterns

### API Integration - Postiz
```typescript
// Always use retry logic for external API calls
import { withRetry } from './utils/retry';

await withRetry(() => postiz.post({
  content: description,
  platforms: ['pinterest'],
  scheduleTime: scheduledTime,
  mediaUrls: [imageUrl]
}));
```

### API Integration - fal.ai
```typescript
// Multi-model selection with weighted random
const models = [
  { id: "fal-ai/flux/dev", weight: 0.4, type: "photorealistic" },
  { id: "fal-ai/qwen-image", weight: 0.3, type: "text-heavy" },
  { id: "fal-ai/ideogram/v2", weight: 0.3, type: "typography" }
];

// Select model based on content or random weight
const selectedModel = selectModelByContent(content) || weightedRandom(models);

// Generate with model-specific prompts
const response = await fal.run(selectedModel.id, {
  prompt: generateOptimizedPrompt(content, selectedModel.type),
  image_size: "portrait_4_5",
  num_images: 1
});
```

### API Integration - Firecrawl
```typescript
const scraped = await firecrawl.scrape({
  url: targetUrl,
  formats: ["markdown"],
  onlyMainContent: true
});
```

## Database Schema (D1)

### Tables
```sql
-- Track scraped URLs and their status
CREATE TABLE processed_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  pin_id TEXT,
  status TEXT CHECK(status IN ('pending', 'processed', 'scheduled', 'failed'))
);

-- Store pin metadata and scheduling info
CREATE TABLE generated_pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  postiz_id TEXT,
  scheduled_for DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT CHECK(status IN ('draft', 'scheduled', 'published', 'failed'))
);

-- Maintain sitemap processing progress
CREATE TABLE sitemap_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sitemap_url TEXT UNIQUE NOT NULL,
  last_processed DATETIME,
  total_urls INTEGER,
  processed_urls INTEGER
);
```

### KV Namespaces
- `CACHE`: Temporary storage for API responses
- `PROMPTS`: Successful image generation prompts

## Error Handling Patterns

1. **API Failures**: Exponential backoff with 3 retries max
2. **Worker Timeout**: Process in batches, save state between runs
3. **Rate Limiting**: Queue overflow to next scheduled run
4. **Content Issues**: Skip and log, continue with next item

## Performance Constraints

### Cloudflare Worker Limits
- CPU: 10ms (free) / 50ms (paid) per request
- Memory: 128MB per invocation
- Subrequests: 50 per invocation
- Duration: 30 seconds max

### Optimization Strategies
- Batch API calls where possible
- Use Cloudflare Queue for async processing
- Cache expensive operations in KV
- Implement progressive processing (state saving)

## Model-Specific Implementation Notes

### FLUX.1 Dev
- Best for product photography pins
- Excellent for lifestyle and scenery backgrounds
- Use detailed prompts for best results
- Add "8k resolution, professional photography" to prompts

### Qwen-Image
- Best for pins with quotes, tips, or lists
- Excels at maintaining font consistency in edits
- Supports nuanced art style specifications
- Use for "how-to" infographics with text steps

### Ideogram V2
- Ideal for logo-style pins and brand content
- Superior typography handling for titles
- Best for poster-style layouts
- Use "auto" style parameter for balanced output

### Model Rotation Strategy
```typescript
// Track model usage to ensure variety
const modelUsageTracker = {
  'fal-ai/flux/dev': 0,
  'fal-ai/qwen-image': 0,
  'fal-ai/ideogram/v2': 0
};

// Balance usage across models
function selectNextModel() {
  const leastUsed = Object.entries(modelUsageTracker)
    .sort(([,a], [,b]) => a - b)[0][0];
  modelUsageTracker[leastUsed]++;
  return leastUsed;
}
```

## Wrangler Configuration

### wrangler.toml Template
```toml
name = "postiz-auto-poster"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "CACHE"
id = "your_kv_id"

[[kv_namespaces]]
binding = "PROMPTS"
id = "your_prompts_kv_id"

[[d1_databases]]
binding = "DB"
database_name = "postiz-auto-poster"
database_id = "your_db_id"

[triggers]
crons = ["0 */6 * * *"]
```

## Security Notes

- Never log API keys or sensitive data
- Validate all external input with Zod schemas
- Sanitize scraped content before processing
- Implement rate limiting for any public endpoints
- Use Cloudflare secrets for all credentials

## Debugging Tips

- Use `wrangler tail` for real-time logs
- Check D1 queries with `wrangler d1 execute`
- Monitor KV operations in Cloudflare dashboard
- Test cron triggers with `wrangler dev --test-scheduled`

## AI Assistant Guidelines

When helping implement this project:

1. **Follow the implementation plan** in `IMPLEMENTATION_PLAN.md` for phased development
2. **Start with infrastructure**: package.json, wrangler.toml, TypeScript config
3. **Implement services incrementally**: sitemap → scraper → image generator → scheduler
4. **Use TypeScript strict mode** and Zod for runtime validation
5. **Write tests alongside code** using Vitest
6. **Keep Worker CPU limits in mind** - batch and queue appropriately
7. **Use the established patterns** for retry logic and error handling

### Priority Order for Implementation
1. Project setup (package.json, tsconfig.json, wrangler.toml)
2. Type definitions and schemas
3. Utility functions (storage, retry, queue)
4. Core services (sitemap, scraper)
5. Image generation service
6. Pinterest optimization
7. Scheduler and main Worker entry point
8. Tests and documentation

## Cost Estimation

### Monthly Costs (1000 images/month)
- Cloudflare Workers: Free tier (100k requests/day)
- Cloudflare KV: Free tier (100k reads/day)
- Cloudflare D1: Free tier (5GB storage)
- fal.ai: ~$75/month (mixed models)
- Firecrawl: ~$50/month
- Postiz: Based on subscription

**Total**: ~$125-200/month depending on volume

## References

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Detailed technical roadmap
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [fal.ai Documentation](https://fal.ai/docs)
- [Postiz API](https://docs.postiz.com/)
- [Firecrawl Docs](https://docs.firecrawl.dev/)
