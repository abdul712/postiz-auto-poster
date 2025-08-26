import { z } from 'zod';

// Environment validation
export const envSchema = z.object({
  POSTIZ_API_KEY: z.string().min(1, 'Postiz API key is required'),
  FAL_API_KEY: z.string().min(1, 'fal.ai API key is required'),
  FIRECRAWL_API_KEY: z.string().min(1, 'Firecrawl API key is required'),
  SITEMAP_URL: z.string().url('Invalid sitemap URL'),
  PINTEREST_BOARD_ID: z.string().min(1, 'Pinterest board ID is required'),
  POSTS_PER_DAY: z.string().optional(),
  POSTING_HOURS: z.string().optional(),
  POSTIZ_INSTANCE_URL: z.string().url().optional(),
  BRAND_COLORS: z.string().optional(),
  BRAND_FONTS: z.string().optional(),
});

// Scraped content validation
export const scrapedContentSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  content: z.string().optional(),
  metadata: z.object({
    author: z.string().optional(),
    publishedDate: z.string().optional(),
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
  }).optional(),
  mainImage: z.string().url().optional(),
});

// Optimized content validation
export const optimizedContentSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  hashtags: z.array(z.string()).max(30),
  contentType: z.enum(['article', 'product', 'howto', 'lifestyle', 'recipe', 'other']),
});

// Image generation request validation
export const imageGenerationRequestSchema = z.object({
  content: optimizedContentSchema,
  model: z.string().optional(),
  prompt: z.string().optional(),
  fallback: z.boolean().optional(),
});

// Sitemap URL validation
export const sitemapUrlSchema = z.object({
  url: z.string().url(),
  lastmod: z.string().optional(),
  priority: z.number().min(0).max(1).optional(),
  changefreq: z.enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']).optional(),
});

// Database record schemas
export const processedUrlSchema = z.object({
  id: z.number().optional(),
  url: z.string().url(),
  title: z.string().optional(),
  processed_at: z.string().optional(),
  pin_id: z.string().optional(),
  status: z.enum(['pending', 'processed', 'scheduled', 'failed', 'skipped']),
  error_message: z.string().optional(),
  retry_count: z.number().min(0).default(0),
});

export const generatedPinSchema = z.object({
  id: z.number().optional(),
  source_url: z.string().url(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  image_url: z.string().url().optional(),
  image_model: z.string().optional(),
  prompt_used: z.string().optional(),
  postiz_id: z.string().optional(),
  scheduled_for: z.string().optional(),
  created_at: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed', 'cancelled']),
  engagement_score: z.number().min(0).default(0),
  error_message: z.string().optional(),
});

export const sitemapStateSchema = z.object({
  id: z.number().optional(),
  sitemap_url: z.string().url(),
  last_processed: z.string().optional(),
  total_urls: z.number().min(0).default(0),
  processed_urls: z.number().min(0).default(0),
  failed_urls: z.number().min(0).default(0),
  last_error: z.string().optional(),
  processing_status: z.enum(['idle', 'processing', 'error']),
});

// Configuration schemas
export const imageModelSchema = z.object({
  id: z.string(),
  weight: z.number().min(0).max(1),
  strengths: z.array(z.string()),
  costPerMegapixel: z.number().min(0),
  type: z.enum(['photorealistic', 'text-heavy', 'typography']),
});

export const retryConfigSchema = z.object({
  maxAttempts: z.number().min(1).max(10),
  baseDelay: z.number().min(100),
  maxDelay: z.number().min(1000),
  backoffFactor: z.number().min(1),
});

// API response schemas
export const postizResponseSchema = z.object({
  success: z.boolean(),
  postId: z.string().optional(),
  scheduledTime: z.string().optional(),
  error: z.string().optional(),
});

export const falApiResponseSchema = z.object({
  images: z.array(z.object({
    url: z.string().url(),
    width: z.number(),
    height: z.number(),
    content_type: z.string(),
  })),
  prompt: z.string(),
  seed: z.number().optional(),
});

// Content quality validation
export const contentQualitySchema = z.object({
  hasTitle: z.boolean(),
  hasDescription: z.boolean(),
  hasContent: z.boolean(),
  minContentLength: z.number().min(100), // Minimum content length for quality
  isEnglish: z.boolean(),
  hasRelevantKeywords: z.boolean(),
});

// Posting schedule validation
export const postingScheduleSchema = z.object({
  timezone: z.string().default('UTC'),
  optimalHours: z.array(z.number().min(0).max(23)),
  postsPerDay: z.number().min(1).max(20),
  minimumGapMinutes: z.number().min(15).default(60), // Minimum gap between posts
});

// Analytics event validation
export const analyticsEventSchema = z.object({
  event: z.string(),
  data: z.record(z.any()),
  timestamp: z.date(),
});

export type ScrapedContent = z.infer<typeof scrapedContentSchema>;
export type OptimizedContent = z.infer<typeof optimizedContentSchema>;
export type ImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;
export type SitemapUrl = z.infer<typeof sitemapUrlSchema>;
export type ProcessedUrl = z.infer<typeof processedUrlSchema>;
export type GeneratedPin = z.infer<typeof generatedPinSchema>;
export type SitemapState = z.infer<typeof sitemapStateSchema>;
export type ImageModel = z.infer<typeof imageModelSchema>;
export type RetryConfig = z.infer<typeof retryConfigSchema>;
export type PostizResponse = z.infer<typeof postizResponseSchema>;
export type FalApiResponse = z.infer<typeof falApiResponseSchema>;
export type ContentQuality = z.infer<typeof contentQualitySchema>;
export type PostingSchedule = z.infer<typeof postingScheduleSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;