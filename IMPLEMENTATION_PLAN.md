# Pinterest Auto-Poster Implementation Plan

## Project Overview
An automated Pinterest scheduling application that scrapes website content from sitemaps, generates images using AI, and schedules posts via Postiz. Built for Cloudflare Workers with scheduled execution.

## Architecture

### Core Components

#### 1. **Sitemap Processor** (`src/services/sitemap.ts`)
- Parse XML sitemaps to extract URLs
- Support for nested sitemap indices
- Filter and prioritize URLs based on patterns
- Maintain processed URL tracking in KV storage

#### 2. **Content Scraper** (`src/services/scraper.ts`)
- Use Firecrawl MCP for intelligent web scraping
- Extract title, description, and key content
- Identify main images and metadata
- Generate content summaries using AI

#### 3. **Image Generator** (`src/services/imageGenerator.ts`)
- Integrate with fal.ai API (FLUX.1 models)
- Generate Pinterest-optimized images (1000x1500px)
- Add text overlays with titles
- Support brand consistency templates

#### 4. **Pinterest Content Optimizer** (`src/services/pinterest.ts`)
- Generate Pinterest-optimized descriptions
- Add relevant hashtags
- Create compelling pin titles
- Format for maximum engagement

#### 5. **Postiz Scheduler** (`src/services/scheduler.ts`)
- Integrate with Postiz API
- Queue pins for optimal posting times
- Distribute posts across schedule
- Handle rate limiting and retries

#### 6. **Cloudflare Worker** (`src/index.ts`)
- Main entry point
- Scheduled trigger handler
- Error handling and logging
- Performance monitoring

## Technology Stack

### Core Technologies
- **Runtime**: Cloudflare Workers (TypeScript)
- **Scraping**: Firecrawl API
- **Image Generation**: fal.ai (FLUX.1 dev)
- **Scheduling**: Postiz API
- **Storage**: Cloudflare KV & D1
- **Queue**: Cloudflare Queues

### Dependencies
```json
{
  "@postiz/node": "latest",
  "@cloudflare/workers-types": "^4.x",
  "hono": "^4.x",
  "zod": "^3.x",
  "date-fns": "^3.x"
}
```

## Database Schema (D1)

### Tables

#### `processed_urls`
```sql
CREATE TABLE processed_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  pin_id TEXT,
  status TEXT CHECK(status IN ('pending', 'processed', 'scheduled', 'failed'))
);
```

#### `generated_pins`
```sql
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
```

#### `sitemap_state`
```sql
CREATE TABLE sitemap_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sitemap_url TEXT UNIQUE NOT NULL,
  last_processed DATETIME,
  total_urls INTEGER,
  processed_urls INTEGER
);
```

## Environment Variables

```env
# API Keys
POSTIZ_API_KEY=your_postiz_api_key
FAL_API_KEY=your_fal_ai_key
FIRECRAWL_API_KEY=your_firecrawl_key

# Configuration
SITEMAP_URL=https://example.com/sitemap.xml
PINTEREST_BOARD_ID=your_board_id
POSTS_PER_DAY=5
POSTING_HOURS=9,12,15,18,21

# Optional
POSTIZ_INSTANCE_URL=https://api.postiz.com
BRAND_COLORS=#FF0000,#00FF00
BRAND_FONTS=Arial,Helvetica
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
1. **Day 1-2**: Project setup
   - Initialize Cloudflare Workers project
   - Configure TypeScript and build tools
   - Set up local development environment
   - Create basic Worker structure

2. **Day 3-4**: Storage setup
   - Configure Cloudflare KV namespaces
   - Set up D1 database with schema
   - Implement basic CRUD operations
   - Create data models with Zod

3. **Day 5-7**: API integrations
   - Integrate Postiz SDK
   - Set up fal.ai client
   - Configure Firecrawl connection
   - Test all API endpoints

### Phase 2: Content Pipeline (Week 2)
1. **Day 8-9**: Sitemap processing
   - XML parsing logic
   - URL extraction and filtering
   - State management for processing
   - Error handling for malformed sitemaps

2. **Day 10-11**: Web scraping
   - Firecrawl integration
   - Content extraction rules
   - Metadata parsing
   - Content quality validation

3. **Day 12-14**: Content optimization
   - Pinterest-specific formatting
   - SEO-optimized descriptions
   - Hashtag generation
   - Content length optimization

### Phase 3: Image Generation (Week 3)
1. **Day 15-16**: fal.ai integration
   - API client setup
   - Prompt engineering for Pinterest
   - Image size optimization
   - Error handling and retries

2. **Day 17-18**: Template system
   - Brand consistency templates
   - Text overlay system
   - Color scheme management
   - Font selection logic

3. **Day 19-21**: Image optimization
   - Pinterest aspect ratio (2:3)
   - File size optimization
   - Quality settings
   - Batch processing

### Phase 4: Scheduling & Automation (Week 4)
1. **Day 22-23**: Scheduling logic
   - Optimal posting time algorithm
   - Rate limiting implementation
   - Queue management
   - Retry mechanisms

2. **Day 24-25**: Cron job setup
   - Cloudflare scheduled triggers
   - Processing intervals
   - State management
   - Error recovery

3. **Day 26-28**: Testing & deployment
   - Unit tests for core functions
   - Integration testing
   - Performance optimization
   - Production deployment

## API Endpoints

### Admin API (Optional)
```typescript
// GET /api/status
// Returns current processing status

// POST /api/sitemap
// Manually trigger sitemap processing

// GET /api/pins
// List generated pins with pagination

// POST /api/pins/:id/reschedule
// Reschedule a specific pin

// DELETE /api/pins/:id
// Cancel a scheduled pin

// GET /api/stats
// Analytics and performance metrics
```

## Scheduling Logic

### Processing Schedule
```typescript
// Run every 6 hours
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // 1. Check sitemap for new URLs
    // 2. Process up to 10 new URLs
    // 3. Generate images for processed content
    // 4. Schedule pins across next 24 hours
    // 5. Clean up old processed data
  }
}
```

### Posting Distribution
- Analyze optimal posting times for Pinterest
- Distribute posts evenly across peak hours
- Avoid posting too frequently (max 1 per hour)
- Consider timezone of target audience

## Error Handling

### Retry Strategy
1. **API Failures**: Exponential backoff with max 3 retries
2. **Image Generation**: Fallback to simpler prompts
3. **Scraping Failures**: Mark URL as failed, continue with next
4. **Scheduling Conflicts**: Queue for next available slot

### Monitoring
- Cloudflare Analytics for performance
- Custom metrics in KV for tracking
- Error logs with context
- Daily summary reports

## Security Considerations

1. **API Key Management**
   - Store in Cloudflare secrets
   - Never commit to repository
   - Rotate regularly

2. **Rate Limiting**
   - Implement per-API limits
   - Queue overflow protection
   - Graceful degradation

3. **Content Validation**
   - Sanitize scraped content
   - Validate image dimensions
   - Check for inappropriate content

## Performance Optimization

1. **Caching Strategy**
   - Cache scraped content for 24 hours
   - Store generated images in R2
   - Reuse successful prompts

2. **Batch Processing**
   - Process multiple URLs in parallel
   - Batch API requests where possible
   - Optimize database queries

3. **Resource Limits**
   - Cloudflare Worker CPU limits (10ms-50ms)
   - Memory constraints (128MB)
   - Subrequest limits (50)

## Testing Strategy

### Unit Tests
- Sitemap parser
- Content extractor
- Image prompt generator
- Scheduling algorithm

### Integration Tests
- API connections
- Database operations
- End-to-end flow

### Load Testing
- Concurrent processing
- API rate limits
- Database performance

## Deployment

### Cloudflare Configuration
```toml
# wrangler.toml
name = "postiz-auto-poster"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "CACHE"
id = "your_kv_id"

[[d1_databases]]
binding = "DB"
database_name = "postiz-auto-poster"
database_id = "your_db_id"

[triggers]
crons = ["0 */6 * * *"]
```

### Deployment Steps
1. Install dependencies: `npm install`
2. Build project: `npm run build`
3. Deploy to Cloudflare: `wrangler deploy`
4. Configure secrets: `wrangler secret put <KEY>`
5. Verify scheduled triggers
6. Monitor initial runs

## Future Enhancements

1. **Multi-platform Support**
   - Instagram via Postiz
   - Twitter/X integration
   - LinkedIn articles

2. **Advanced AI Features**
   - A/B testing for descriptions
   - Engagement prediction
   - Trending hashtag integration

3. **Analytics Dashboard**
   - Performance metrics
   - Best performing content
   - Scheduling optimization

4. **Content Variations**
   - Multiple images per URL
   - Different description styles
   - Seasonal adjustments

## Success Metrics

1. **Processing Metrics**
   - URLs processed per day
   - Success rate of scraping
   - Image generation success rate

2. **Posting Metrics**
   - Pins scheduled per day
   - Scheduling success rate
   - API error rates

3. **Performance Metrics**
   - Worker execution time
   - Memory usage
   - API response times

## Cost Estimation

### Monthly Costs (Estimate)
- Cloudflare Workers: Free tier (100k requests/day)
- Cloudflare KV: Free tier (100k reads/day)
- Cloudflare D1: Free tier (5GB storage)
- fal.ai: ~$25/month (1000 images @ $0.025/megapixel)
- Firecrawl: ~$50/month (depending on usage)
- Postiz: Based on subscription plan

Total: ~$75-150/month depending on volume