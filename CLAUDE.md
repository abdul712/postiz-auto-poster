# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Postiz Auto-Poster** - An automated Pinterest content scheduling system that scrapes websites via sitemap, generates AI images, and schedules posts through Postiz. Built for Cloudflare Workers with scheduled execution.

## Architecture

### Core Services Architecture
```
Sitemap URL → Scraper (Firecrawl) → Content Processor → Image Generator (fal.ai) → Pinterest Optimizer → Postiz Scheduler
                                           ↓                      ↓                      ↓
                                    Cloudflare D1          Cloudflare KV          Cloudflare Queue
```

### Key Components
- **Sitemap Processor**: Parses XML sitemaps, extracts URLs, manages processing state
- **Content Scraper**: Uses Firecrawl MCP for intelligent extraction of titles, descriptions, metadata
- **Image Generator**: Multi-model fal.ai integration for varied output:
  - FLUX.1 dev: Photorealistic images (40% weight)
  - Qwen-Image: Superior text rendering (30% weight)
  - Ideogram V2: Typography & posters (30% weight)
- **Postiz Scheduler**: Manages post scheduling via Postiz API with rate limiting and retry logic

## Development Commands

```bash
# Installation
npm install

# Local development
npm run dev                  # Start local dev server with Miniflare
npm run dev:remote          # Connect to remote Cloudflare resources

# Building
npm run build               # Build for production
npm run type-check          # TypeScript type checking

# Testing
npm run test                # Run unit tests
npm run test:integration    # Run integration tests
npm run test:e2e           # End-to-end tests

# Deployment
npm run deploy:staging      # Deploy to staging environment
npm run deploy:production   # Deploy to production
wrangler secret put <KEY>   # Set environment secrets

# Database
npm run db:migrate          # Run D1 migrations
npm run db:seed            # Seed test data
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

## File Structure

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
- Multi-model approach for output variety:
  - FLUX.1 dev: $0.025/megapixel - photorealistic content
  - Qwen-Image: ~$0.020/megapixel - text-heavy designs
  - Ideogram V2: ~$0.030/megapixel - typography/posters
- Weighted random selection with content-based preferences
- Generate Pinterest-optimized 2:3 aspect ratio (1000x1500px)
- Cache successful prompts per model for consistency
- Implement fallback chain: primary model → secondary → tertiary

### Scheduling Logic
- Process sitemap every 6 hours
- Limit to 10 new URLs per run (Worker CPU constraints)
- Distribute posts across optimal Pinterest posting times
- Maximum 1 post per hour to avoid spam

## API Integration Patterns

### Postiz API
```typescript
// Always use the SDK, not direct API calls
import Postiz from '@postiz/node';
const postiz = new Postiz(env.POSTIZ_API_KEY);

// Schedule posts with retry logic
await withRetry(() => postiz.post({
  content: description,
  platforms: ['pinterest'],
  scheduleTime: scheduledTime,
  mediaUrls: [imageUrl]
}));
```

### fal.ai Image Generation
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
  image_size: "portrait_4_5", // Pinterest optimal
  num_images: 1
});

// Fallback on failure
if (!response.success && fallbackModels.length > 0) {
  return await tryFallbackModel(fallbackModels, content);
}
```

### Firecrawl Scraping
```typescript
// Use MCP tool for intelligent extraction
const scraped = await firecrawl.scrape({
  url: targetUrl,
  formats: ["markdown"],
  onlyMainContent: true
});
```

## Database Schema

### D1 Tables
- `processed_urls`: Track scraped URLs and their status
- `generated_pins`: Store pin metadata and scheduling info
- `sitemap_state`: Maintain sitemap processing progress

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

## Testing Approach

### Unit Tests
Focus on pure functions: prompt generation, content parsing, scheduling logic

### Integration Tests
Mock external APIs, test service interactions

### E2E Tests
Use Miniflare for local Worker environment simulation

## Deployment Pipeline

1. **Local Development**: Miniflare emulation
2. **Staging**: Separate Cloudflare account/zone
3. **Production**: Main Cloudflare Workers deployment

### Monitoring
- Cloudflare Analytics for performance metrics
- Logflare/Baselime for structured logging
- Custom KV metrics for business logic

## Model-Specific Implementation Notes

### Qwen-Image Optimizations
- Best for pins with quotes, tips, or lists
- Excels at maintaining font consistency in edits
- Supports nuanced art style specifications
- Use for "how-to" infographics with text steps

### Ideogram V2 Optimizations
- Ideal for logo-style pins and brand content
- Superior typography handling for titles
- Best for poster-style layouts
- Use "auto" style parameter for balanced output

### FLUX.1 Dev Optimizations
- Best for product photography pins
- Excellent for lifestyle and scenery backgrounds
- Use detailed prompts for best results
- Add "8k resolution, professional photography" to prompts

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

## Common Tasks

### Adding a New Scraping Source
1. Extend `src/services/scraper.ts` with new extraction rules
2. Update content validation schema in `src/schemas/validation.ts`
3. Add source-specific tests

### Modifying Image Generation
1. Update prompts in `src/services/imageGenerator.ts`
2. Test with different content types
3. Monitor fal.ai costs in dashboard

### Adjusting Posting Schedule
1. Modify cron expression in `wrangler.toml`
2. Update distribution logic in `src/services/scheduler.ts`
3. Consider timezone implications

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

## Important Patterns

### State Management
Always save processing state to D1 between operations to handle Worker restarts gracefully.

### Retry Logic
Use exponential backoff for all external API calls with jitter to avoid thundering herd.

### Queue Processing
Leverage Cloudflare Queues for operations that might exceed Worker time limits.

### Content Validation
Validate scraped content quality before expensive operations like image generation.