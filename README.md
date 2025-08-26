# Postiz Auto-Poster

An automated Pinterest content scheduling system that scrapes websites via sitemap, generates AI-powered images, and schedules posts through Postiz. Built on Cloudflare Workers for serverless execution.

## Features

- 🕷️ **Automated Web Scraping**: Parses sitemaps and extracts content using Firecrawl
- 🎨 **AI Image Generation**: Creates Pinterest-optimized images using fal.ai (FLUX.1)
- 📅 **Smart Scheduling**: Automatically schedules posts via Postiz API
- ⚡ **Serverless Architecture**: Runs on Cloudflare Workers with scheduled triggers
- 🔄 **Reliable Processing**: Built-in retry logic and state management
- 📊 **Pinterest Optimization**: Content and images tailored for Pinterest engagement

## Architecture

```
Sitemap → Firecrawl → Content Processing → fal.ai → Pinterest Optimizer → Postiz
            ↓              ↓                 ↓              ↓               ↓
      Cloudflare D1   Cloudflare KV    Image Cache    Queue System    Scheduler
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account
- API keys for:
  - Postiz
  - fal.ai
  - Firecrawl

### Installation

```bash
# Clone the repository
git clone https://github.com/abdul712/postiz-auto-poster.git
cd postiz-auto-poster

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your API keys

# Deploy to Cloudflare Workers
npm run deploy
```

### Configuration

Set the following secrets in Cloudflare Workers:

```bash
wrangler secret put POSTIZ_API_KEY
wrangler secret put FAL_API_KEY
wrangler secret put FIRECRAWL_API_KEY
wrangler secret put SITEMAP_URL
wrangler secret put PINTEREST_BOARD_ID
```

## Development

```bash
# Start local development server
npm run dev

# Run tests
npm run test

# Type checking
npm run type-check

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
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