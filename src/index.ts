import { Hono } from 'hono';
import type { Env, ScheduledEvent, ProcessingStats } from './types/index.js';
import { envSchema } from './schemas/validation.js';
import { SitemapProcessor } from './services/sitemap.js';
import { ContentScraper } from './services/scraper.js';
import { ImageGenerator } from './services/imageGenerator.js';
import { PinterestOptimizer } from './services/pinterest.js';
import { PostizScheduler } from './services/scheduler.js';
import { DatabaseStorage } from './utils/storage.js';
import { QueueManager, QueueProcessor } from './utils/queue.js';

/**
 * Main Cloudflare Worker for Pinterest Auto-Poster
 */
const app = new Hono<{ Bindings: Env }>();

/**
 * Main processing pipeline
 */
async function processPinterestPipeline(env: Env): Promise<ProcessingStats> {
  console.log('Starting Pinterest auto-poster processing pipeline');

  // Validate environment variables
  const envValidation = envSchema.safeParse(env);
  if (!envValidation.success) {
    console.error('Environment validation failed:', envValidation.error);
    throw new Error('Invalid environment configuration');
  }

  // Initialize services
  const sitemapProcessor = new SitemapProcessor(env);
  const contentScraper = new ContentScraper(env);
  const imageGenerator = new ImageGenerator(env);
  const pinterestOptimizer = new PinterestOptimizer(env);
  const postizScheduler = new PostizScheduler(env);
  const db = new DatabaseStorage(env.DB);

  const stats: ProcessingStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    pending: 0,
    currentBatch: 0,
  };

  try {
    console.log('Step 1: Processing sitemap for new URLs');
    // Process sitemap to find new URLs (limit to 10 per run to avoid Worker timeout)
    const newUrls = await sitemapProcessor.getNewUrls(env.SITEMAP_URL, 10);
    
    if (newUrls.length === 0) {
      console.log('No new URLs found in sitemap');
      return stats;
    }

    // Mark URLs as pending
    await sitemapProcessor.markUrlsAsPending(newUrls);
    stats.pending = newUrls.length;

    console.log(`Step 2: Processing ${newUrls.length} new URLs`);
    
    for (const sitemapUrl of newUrls) {
      try {
        stats.currentBatch++;
        console.log(`Processing URL ${stats.currentBatch}/${newUrls.length}: ${sitemapUrl.url}`);

        // Step 2: Scrape content
        console.log('  - Scraping content...');
        const scrapedContent = await contentScraper.scrapeUrl(sitemapUrl.url);
        
        if (!scrapedContent) {
          console.log('  - Content scraping failed, skipping URL');
          await db.updateProcessedUrl(
            (await db.getProcessedUrl(sitemapUrl.url))?.id || 0,
            { status: 'failed', error_message: 'Content scraping failed' }
          );
          stats.failed++;
          continue;
        }

        // Step 3: Assess content quality
        console.log('  - Assessing content quality...');
        const qualityAssessment = await contentScraper.assessContentQuality(scrapedContent);
        
        if (!qualityAssessment.suitable) {
          console.log(`  - Content quality insufficient (${qualityAssessment.score}/100), skipping`);
          await db.updateProcessedUrl(
            (await db.getProcessedUrl(sitemapUrl.url))?.id || 0,
            { 
              status: 'skipped', 
              error_message: `Quality too low: ${qualityAssessment.reasons.join(', ')}` 
            }
          );
          stats.failed++;
          continue;
        }

        // Step 4: Optimize content for Pinterest
        console.log('  - Optimizing content for Pinterest...');
        const optimizedContent = await pinterestOptimizer.optimizeContent(scrapedContent);

        // Step 5: Generate image
        console.log('  - Generating AI image...');
        const imageResult = await imageGenerator.generateImage(optimizedContent);
        
        if (!imageResult.success || !imageResult.imageUrl) {
          console.log(`  - Image generation failed: ${imageResult.error}`);
          await db.updateProcessedUrl(
            (await db.getProcessedUrl(sitemapUrl.url))?.id || 0,
            { 
              status: 'failed', 
              error_message: `Image generation failed: ${imageResult.error}` 
            }
          );
          stats.failed++;
          continue;
        }

        // Step 6: Create pin record
        console.log('  - Creating pin record...');
        const pinId = await db.createGeneratedPin({
          source_url: sitemapUrl.url,
          title: optimizedContent.title,
          description: optimizedContent.description,
          image_url: imageResult.imageUrl,
          image_model: imageResult.model,
          prompt_used: imageResult.prompt,
          status: 'draft',
          engagement_score: 0,
        });

        // Step 7: Schedule the pin
        console.log('  - Scheduling pin...');
        const scheduleResult = await postizScheduler.schedulePin(
          pinId,
          optimizedContent,
          imageResult.imageUrl,
          sitemapUrl.url
        );

        if (scheduleResult.success) {
          console.log(`  - Successfully scheduled pin for ${scheduleResult.scheduledTime}`);
          
          // Mark URL as processed
          await db.updateProcessedUrl(
            (await db.getProcessedUrl(sitemapUrl.url))?.id || 0,
            { 
              status: 'processed',
              pin_id: scheduleResult.postizId,
            }
          );
          
          stats.successful++;
        } else {
          console.log(`  - Scheduling failed: ${scheduleResult.error}`);
          await db.updateProcessedUrl(
            (await db.getProcessedUrl(sitemapUrl.url))?.id || 0,
            { 
              status: 'failed', 
              error_message: `Scheduling failed: ${scheduleResult.error}` 
            }
          );
          stats.failed++;
        }

        stats.totalProcessed++;

        // Add small delay to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`Error processing URL ${sitemapUrl.url}:`, error);
        
        try {
          await db.updateProcessedUrl(
            (await db.getProcessedUrl(sitemapUrl.url))?.id || 0,
            { 
              status: 'failed', 
              error_message: error instanceof Error ? error.message : String(error),
              retry_count: ((await db.getProcessedUrl(sitemapUrl.url))?.retry_count || 0) + 1,
            }
          );
        } catch (dbError) {
          console.error('Failed to update URL status:', dbError);
        }

        stats.failed++;
        stats.totalProcessed++;
      }
    }

    // Step 8: Cleanup old records (weekly)
    if (Math.random() < 0.02) { // ~2% chance, roughly once per week with 6-hour intervals
      console.log('Performing cleanup of old records...');
      const deletedCount = await sitemapProcessor.cleanupOldRecords(30);
      console.log(`Cleaned up ${deletedCount} old records`);
    }

    console.log('Processing pipeline completed');
    console.log(`Results: ${stats.successful} successful, ${stats.failed} failed, ${stats.totalProcessed} total`);

    return stats;

  } catch (error) {
    console.error('Processing pipeline failed:', error);
    
    // Log analytics event
    if (env.ANALYTICS) {
      env.ANALYTICS.writeDataPoint({
        blobs: ['pipeline_error'],
        doubles: [1],
        indexes: [error instanceof Error ? error.message : String(error)],
      });
    }

    throw error;
  }
}

/**
 * Queue message handler
 */
async function handleQueueMessage(message: any, env: Env): Promise<void> {
  const queueProcessor = new QueueProcessor(env, {
    async processUrl(url: string, priority: number) {
      console.log(`Queue: Processing URL ${url} with priority ${priority}`);
      // Individual URL processing would go here
      // For now, we'll just log it as the main pipeline handles batches
    },

    async generateImage(pinId: number, content: any, modelPreference?: string) {
      console.log(`Queue: Generating image for pin ${pinId}`);
      const imageGenerator = new ImageGenerator(env);
      const result = await imageGenerator.generateImage(content, modelPreference);
      
      if (result.success && result.imageUrl) {
        const db = new DatabaseStorage(env.DB);
        await db.updateGeneratedPin(pinId, {
          image_url: result.imageUrl,
          image_model: result.model,
          prompt_used: result.prompt,
        });
      }
    },

    async schedulePin(pinId: number, scheduledTime: string) {
      console.log(`Queue: Scheduling pin ${pinId} for ${scheduledTime}`);
      // Pin scheduling logic would go here
    },

    async cleanup(operation: string, params?: any) {
      console.log(`Queue: Running cleanup operation ${operation}`);
      if (operation === 'old_records') {
        const sitemapProcessor = new SitemapProcessor(env);
        await sitemapProcessor.cleanupOldRecords(params?.daysOld || 30);
      }
    },
  });

  await queueProcessor.processMessage(message);
}

/**
 * Health check endpoint
 */
app.get('/health', async (c) => {
  try {
    const env = c.env;
    const db = new DatabaseStorage(env.DB);
    const stats = await db.getProcessingStats();
    
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats,
      version: '1.0.0',
    });
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * Status endpoint for monitoring
 */
app.get('/status', async (c) => {
  try {
    const env = c.env;
    const sitemapProcessor = new SitemapProcessor(env);
    const postizScheduler = new PostizScheduler(env);
    
    const [processingStats, scheduleStats, sitemapState] = await Promise.all([
      sitemapProcessor.getProcessingStats(),
      postizScheduler.getScheduleStats(),
      sitemapProcessor.getSitemapState(env.SITEMAP_URL),
    ]);

    return c.json({
      processing: processingStats,
      schedule: scheduleStats,
      sitemap: sitemapState,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * Manual trigger endpoint (for testing)
 */
app.post('/trigger', async (c) => {
  try {
    const env = c.env;
    const stats = await processPinterestPipeline(env);
    
    return c.json({
      message: 'Pipeline executed successfully',
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * Default export for Cloudflare Workers
 */
export default {
  /**
   * Fetch handler for HTTP requests
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  /**
   * Scheduled event handler (cron jobs)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Scheduled event triggered: ${event.cron} at ${new Date(event.scheduledTime).toISOString()}`);

    try {
      // Record analytics
      if (env.ANALYTICS) {
        env.ANALYTICS.writeDataPoint({
          blobs: ['scheduled_trigger'],
          doubles: [1],
          indexes: [event.cron],
        });
      }

      const stats = await processPinterestPipeline(env);
      
      console.log('Scheduled processing completed successfully');
      console.log('Stats:', JSON.stringify(stats, null, 2));

      // Record success metrics
      if (env.ANALYTICS) {
        env.ANALYTICS.writeDataPoint({
          blobs: ['processing_success'],
          doubles: [stats.successful, stats.failed, stats.totalProcessed],
          indexes: ['batch_complete'],
        });
      }

    } catch (error) {
      console.error('Scheduled processing failed:', error);

      // Record error metrics
      if (env.ANALYTICS) {
        env.ANALYTICS.writeDataPoint({
          blobs: ['processing_error'],
          doubles: [1],
          indexes: [error instanceof Error ? error.message : String(error)],
        });
      }

      // Don't rethrow - we don't want to break the cron schedule
    }
  },

  /**
   * Queue message handler
   */
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Processing queue batch with ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      try {
        await handleQueueMessage(message.body, env);
        message.ack();
      } catch (error) {
        console.error('Queue message processing failed:', error);
        message.retry();
      }
    }
  },
};