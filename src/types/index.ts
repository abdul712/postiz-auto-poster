// Type definitions for Pinterest Auto-Poster

export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  CACHE: KVNamespace;
  PROMPTS: KVNamespace;
  PROCESSING_QUEUE: Queue;
  IMAGES: R2Bucket;
  ANALYTICS: AnalyticsEngineDataset;

  // API Keys
  POSTIZ_API_KEY: string;
  FAL_API_KEY: string;
  FIRECRAWL_API_KEY: string;

  // Configuration
  SITEMAP_URL: string;
  PINTEREST_BOARD_ID: string;
  POSTS_PER_DAY?: string;
  POSTING_HOURS?: string;
  POSTIZ_INSTANCE_URL?: string;
  BRAND_COLORS?: string;
  BRAND_FONTS?: string;
}

export interface ProcessedUrl {
  id?: number;
  url: string;
  title?: string;
  processed_at?: string;
  pin_id?: string;
  status: 'pending' | 'processed' | 'scheduled' | 'failed' | 'skipped';
  error_message?: string;
  retry_count: number;
}

export interface GeneratedPin {
  id?: number;
  source_url: string;
  title: string;
  description?: string;
  image_url?: string;
  image_model?: string;
  prompt_used?: string;
  postiz_id?: string;
  scheduled_for?: string;
  created_at?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled';
  engagement_score: number;
  error_message?: string;
}

export interface SitemapState {
  id?: number;
  sitemap_url: string;
  last_processed?: string;
  total_urls: number;
  processed_urls: number;
  failed_urls: number;
  last_error?: string;
  processing_status: 'idle' | 'processing' | 'error';
}

export interface ModelPerformance {
  id?: number;
  model_id: string;
  date: string;
  total_generations: number;
  successful_generations: number;
  average_generation_time: number;
  total_cost: number;
  average_engagement: number;
  created_at?: string;
}

export interface PromptLibraryEntry {
  id?: number;
  model_id: string;
  content_type: string;
  prompt_template: string;
  success_rate: number;
  usage_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface ImageModel {
  id: string;
  weight: number;
  strengths: string[];
  costPerMegapixel: number;
  type: 'photorealistic' | 'text-heavy' | 'typography';
}

export interface ScrapedContent {
  url: string;
  title: string;
  description?: string;
  content?: string;
  metadata?: {
    author?: string;
    publishedDate?: string;
    tags?: string[];
    category?: string;
  };
  mainImage?: string;
}

export interface OptimizedContent {
  title: string;
  description: string;
  hashtags: string[];
  contentType: 'article' | 'product' | 'howto' | 'lifestyle' | 'recipe' | 'other';
}

export interface ImageGenerationRequest {
  content: OptimizedContent;
  model?: string;
  prompt?: string;
  fallback?: boolean;
}

export interface ImageGenerationResponse {
  success: boolean;
  imageUrl?: string;
  model: string;
  prompt: string;
  generationTime: number;
  cost: number;
  error?: string;
}

export interface PostizScheduleRequest {
  content: string;
  platforms: string[];
  scheduleTime: Date;
  mediaUrls: string[];
  boardId?: string;
}

export interface SitemapUrl {
  url: string;
  lastmod?: string;
  priority?: number;
  changefreq?: string;
}

export interface ProcessingStats {
  totalProcessed: number;
  successful: number;
  failed: number;
  pending: number;
  currentBatch: number;
  estimatedCompletion?: Date;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export interface WorkerAnalytics {
  event: string;
  data: Record<string, any>;
  timestamp: Date;
}

// Cloudflare Types
export interface ScheduledEvent {
  type: string;
  scheduledTime: number;
  cron: string;
}