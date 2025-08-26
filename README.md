# Pinterest Auto-Poster

An automated Pinterest content scheduling system that scrapes websites via sitemap, generates AI images, and schedules posts through Postiz. Built for Cloudflare Workers with scheduled execution.

## 🚀 Features

- **Automated Content Discovery**: Scrapes sitemaps to find new content
- **Multi-Model AI Image Generation**: Uses 3 fal.ai models for varied output
  - FLUX.1 dev: Photorealistic images (40% weight)
  - Qwen-Image: Superior text rendering (30% weight)
  - Ideogram V2: Typography & posters (30% weight)
- **Pinterest Optimization**: Generates Pinterest-friendly descriptions and hashtags
- **Smart Scheduling**: Optimal posting times with rate limiting
- **Content Quality Assessment**: Filters low-quality content automatically
- **Performance Analytics**: Tracks model performance and costs
- **Retry Logic**: Robust error handling with exponential backoff

## 🏗️ Architecture

```
Sitemap URL → Scraper (Firecrawl) → Content Processor → Image Generator (fal.ai) → Pinterest Optimizer → Postiz Scheduler
                                           ↓                      ↓                      ↓
                                    Cloudflare D1          Cloudflare KV          Cloudflare Queue
```

## 📦 Installation

### Prerequisites

1. [Node.js](https://nodejs.org/) (18+ required)
2. [Cloudflare account](https://cloudflare.com/) with Workers enabled
3. API keys for:
   - [Postiz](https://postiz.com/)
   - [fal.ai](https://fal.ai/)
   - [Firecrawl](https://firecrawl.dev/)

### Local Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd postiz-auto-poster
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .dev.vars.example .dev.vars
   # Edit .dev.vars with your API keys
   ```

3. **Set up Cloudflare resources**
   ```bash
   # Create D1 database
   npx wrangler d1 create postiz-auto-poster
   
   # Create KV namespaces
   npx wrangler kv:namespace create CACHE
   npx wrangler kv:namespace create PROMPTS
   
   # Create R2 bucket for images
   npx wrangler r2 bucket create postiz-images
   
   # Create Queue for processing
   npx wrangler queues create postiz-processing-queue
   ```

4. **Update wrangler.toml**
   Update the IDs in `wrangler.toml` with the actual IDs from the previous step.

5. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

6. **Start local development**
   ```bash
   npm run dev
   ```

## 🔧 Configuration

### Environment Variables

Set these via `wrangler secret put <KEY>` for production or in `.dev.vars` for local development:

```bash
# Required API Keys
POSTIZ_API_KEY=your_postiz_api_key
FAL_API_KEY=your_fal_ai_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key

# Configuration
SITEMAP_URL=https://example.com/sitemap.xml
PINTEREST_BOARD_ID=your_pinterest_board_id

# Optional
POSTS_PER_DAY=5
POSTING_HOURS=9,12,15,18,21
POSTIZ_INSTANCE_URL=https://api.postiz.com
BRAND_COLORS=#FF6B6B,#4ECDC4,#45B7D1
BRAND_FONTS=Roboto,Arial,Helvetica
```

### Scheduling

The worker runs every 6 hours by default. Modify the cron expression in `wrangler.toml`:

```toml
[triggers]
crons = ["0 */6 * * *"]  # Every 6 hours
```

## 🧪 Testing

### Run Tests

```bash
# Unit tests
npm run test

# Integration tests  
npm run test:integration

# End-to-end tests
npm run test:e2e

# Type checking
npm run type-check
```

### Test Coverage

The test suite aims for >80% coverage and includes:

- **Unit Tests**: Core functions (sitemap parsing, image generation, content optimization)
- **Integration Tests**: Service interactions and API mocking
- **E2E Tests**: Full worker functionality with Miniflare

## 🚀 Deployment

### Staging Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Set secrets
wrangler secret put POSTIZ_API_KEY --env staging
wrangler secret put FAL_API_KEY --env staging
wrangler secret put FIRECRAWL_API_KEY --env staging
# ... repeat for all secrets
```

### Production Deployment

```bash
# Deploy to production
npm run deploy:production

# Set production secrets
wrangler secret put POSTIZ_API_KEY --env production
# ... repeat for all secrets
```

## How It Works

1. **Sitemap Processing**: Every 6 hours, the system fetches and parses your website's sitemap
2. **Content Extraction**: Firecrawl intelligently extracts titles, descriptions, and metadata
3. **Image Generation**: fal.ai creates Pinterest-optimized images (1000x1500px) based on content
4. **Smart Scheduling**: Posts are distributed across optimal Pinterest posting times
5. **Reliable Delivery**: Postiz API handles the actual posting to Pinterest

## Cost Estimation

- **Cloudflare Workers**: Free tier (100k requests/day)
- **fal.ai**: ~$25/month (1000 images)
- **Firecrawl**: ~$50/month (based on usage)
- **Postiz**: Based on subscription plan

**Total**: ~$75-150/month depending on volume

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **Web Scraping**: Firecrawl API
- **Image Generation**: fal.ai (FLUX.1 dev model)
- **Scheduling**: Postiz API
- **Storage**: Cloudflare D1 & KV
- **Queue System**: Cloudflare Queues

## Documentation

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Detailed technical roadmap
- [Claude.md](./CLAUDE.md) - Development guidelines for AI assistants

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please use the GitHub issues tracker.

## Acknowledgments

- [Postiz](https://postiz.com) - Social media scheduling platform
- [Firecrawl](https://firecrawl.dev) - Intelligent web scraping
- [fal.ai](https://fal.ai) - AI image generation
- [Cloudflare Workers](https://workers.cloudflare.com) - Serverless platform