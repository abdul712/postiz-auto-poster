import type { 
  Env, 
  ProcessedUrl, 
  GeneratedPin, 
  SitemapState, 
  ModelPerformance,
  PromptLibraryEntry 
} from '../types/index.js';
import { 
  processedUrlSchema, 
  generatedPinSchema, 
  sitemapStateSchema 
} from '../schemas/validation.js';
import { withRetry, DB_RETRY_CONFIG } from './retry.js';

/**
 * KV Storage utilities
 */
export class KVStorage {
  constructor(private kv: KVNamespace, private ttl: number = 86400) {} // 24 hours default

  async get<T>(key: string): Promise<T | null> {
    const value = await this.kv.get(key, 'json');
    return value as T | null;
  }

  async put<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: ttl || this.ttl,
    });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const result = await this.kv.list({ prefix });
    return result.keys.map(key => key.name);
  }
}

/**
 * D1 Database operations
 */
export class DatabaseStorage {
  constructor(private db: D1Database) {}

  // Processed URLs operations
  async getProcessedUrl(url: string): Promise<ProcessedUrl | null> {
    return withRetry(async () => {
      const result = await this.db
        .prepare('SELECT * FROM processed_urls WHERE url = ?')
        .bind(url)
        .first();
      
      if (!result) return null;
      
      const parsed = processedUrlSchema.parse(result);
      return parsed;
    }, DB_RETRY_CONFIG, 'getProcessedUrl');
  }

  async createProcessedUrl(data: Omit<ProcessedUrl, 'id'>): Promise<number> {
    return withRetry(async () => {
      const validated = processedUrlSchema.omit({ id: true }).parse(data);
      
      const result = await this.db
        .prepare(
          'INSERT INTO processed_urls (url, title, status, retry_count) VALUES (?, ?, ?, ?) RETURNING id'
        )
        .bind(validated.url, validated.title, validated.status, validated.retry_count)
        .first<{ id: number }>();
      
      if (!result?.id) {
        throw new Error('Failed to create processed URL record');
      }
      
      return result.id;
    }, DB_RETRY_CONFIG, 'createProcessedUrl');
  }

  async updateProcessedUrl(id: number, updates: Partial<ProcessedUrl>): Promise<void> {
    return withRetry(async () => {
      const sets: string[] = [];
      const values: any[] = [];
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id') {
          sets.push(`${key} = ?`);
          values.push(value);
        }
      });
      
      if (sets.length === 0) return;
      
      values.push(id);
      
      await this.db
        .prepare(`UPDATE processed_urls SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();
    }, DB_RETRY_CONFIG, 'updateProcessedUrl');
  }

  async getPendingUrls(limit: number = 10): Promise<ProcessedUrl[]> {
    return withRetry(async () => {
      const results = await this.db
        .prepare('SELECT * FROM processed_urls WHERE status = ? ORDER BY processed_at ASC LIMIT ?')
        .bind('pending', limit)
        .all();
      
      return results.results.map(row => processedUrlSchema.parse(row));
    }, DB_RETRY_CONFIG, 'getPendingUrls');
  }

  // Generated Pins operations
  async createGeneratedPin(data: Omit<GeneratedPin, 'id'>): Promise<number> {
    return withRetry(async () => {
      const validated = generatedPinSchema.omit({ id: true }).parse(data);
      
      const result = await this.db
        .prepare(
          `INSERT INTO generated_pins 
           (source_url, title, description, image_url, image_model, prompt_used, 
            postiz_id, scheduled_for, status, engagement_score) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
           RETURNING id`
        )
        .bind(
          validated.source_url,
          validated.title,
          validated.description,
          validated.image_url,
          validated.image_model,
          validated.prompt_used,
          validated.postiz_id,
          validated.scheduled_for,
          validated.status,
          validated.engagement_score
        )
        .first<{ id: number }>();
      
      if (!result?.id) {
        throw new Error('Failed to create generated pin record');
      }
      
      return result.id;
    }, DB_RETRY_CONFIG, 'createGeneratedPin');
  }

  async updateGeneratedPin(id: number, updates: Partial<GeneratedPin>): Promise<void> {
    return withRetry(async () => {
      const sets: string[] = [];
      const values: any[] = [];
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id') {
          sets.push(`${key} = ?`);
          values.push(value);
        }
      });
      
      if (sets.length === 0) return;
      
      values.push(id);
      
      await this.db
        .prepare(`UPDATE generated_pins SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();
    }, DB_RETRY_CONFIG, 'updateGeneratedPin');
  }

  async getScheduledPins(limit: number = 50): Promise<GeneratedPin[]> {
    return withRetry(async () => {
      const results = await this.db
        .prepare(`
          SELECT * FROM generated_pins 
          WHERE status = 'scheduled' AND scheduled_for <= datetime('now') 
          ORDER BY scheduled_for ASC 
          LIMIT ?
        `)
        .bind(limit)
        .all();
      
      return results.results.map(row => generatedPinSchema.parse(row));
    }, DB_RETRY_CONFIG, 'getScheduledPins');
  }

  // Sitemap State operations
  async getSitemapState(sitemapUrl: string): Promise<SitemapState | null> {
    return withRetry(async () => {
      const result = await this.db
        .prepare('SELECT * FROM sitemap_state WHERE sitemap_url = ?')
        .bind(sitemapUrl)
        .first();
      
      if (!result) return null;
      
      return sitemapStateSchema.parse(result);
    }, DB_RETRY_CONFIG, 'getSitemapState');
  }

  async upsertSitemapState(data: Omit<SitemapState, 'id'>): Promise<void> {
    return withRetry(async () => {
      const validated = sitemapStateSchema.omit({ id: true }).parse(data);
      
      await this.db
        .prepare(`
          INSERT INTO sitemap_state 
          (sitemap_url, last_processed, total_urls, processed_urls, failed_urls, last_error, processing_status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(sitemap_url) DO UPDATE SET
            last_processed = excluded.last_processed,
            total_urls = excluded.total_urls,
            processed_urls = excluded.processed_urls,
            failed_urls = excluded.failed_urls,
            last_error = excluded.last_error,
            processing_status = excluded.processing_status
        `)
        .bind(
          validated.sitemap_url,
          validated.last_processed,
          validated.total_urls,
          validated.processed_urls,
          validated.failed_urls,
          validated.last_error,
          validated.processing_status
        )
        .run();
    }, DB_RETRY_CONFIG, 'upsertSitemapState');
  }

  // Model Performance tracking
  async recordModelPerformance(data: Omit<ModelPerformance, 'id'>): Promise<void> {
    return withRetry(async () => {
      await this.db
        .prepare(`
          INSERT INTO model_performance 
          (model_id, date, total_generations, successful_generations, average_generation_time, total_cost, average_engagement)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(model_id, date) DO UPDATE SET
            total_generations = total_generations + excluded.total_generations,
            successful_generations = successful_generations + excluded.successful_generations,
            average_generation_time = (average_generation_time + excluded.average_generation_time) / 2,
            total_cost = total_cost + excluded.total_cost,
            average_engagement = (average_engagement + excluded.average_engagement) / 2
        `)
        .bind(
          data.model_id,
          data.date,
          data.total_generations,
          data.successful_generations,
          data.average_generation_time,
          data.total_cost,
          data.average_engagement
        )
        .run();
    }, DB_RETRY_CONFIG, 'recordModelPerformance');
  }

  // Prompt Library operations
  async getPromptTemplate(modelId: string, contentType: string): Promise<PromptLibraryEntry | null> {
    return withRetry(async () => {
      const result = await this.db
        .prepare(`
          SELECT * FROM prompt_library 
          WHERE model_id = ? AND content_type = ? 
          ORDER BY success_rate DESC, usage_count DESC 
          LIMIT 1
        `)
        .bind(modelId, contentType)
        .first();
      
      return result as PromptLibraryEntry | null;
    }, DB_RETRY_CONFIG, 'getPromptTemplate');
  }

  async savePromptTemplate(data: Omit<PromptLibraryEntry, 'id'>): Promise<void> {
    return withRetry(async () => {
      await this.db
        .prepare(`
          INSERT INTO prompt_library 
          (model_id, content_type, prompt_template, success_rate, usage_count)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
          data.model_id,
          data.content_type,
          data.prompt_template,
          data.success_rate,
          data.usage_count
        )
        .run();
    }, DB_RETRY_CONFIG, 'savePromptTemplate');
  }

  async updatePromptPerformance(id: number, successRate: number): Promise<void> {
    return withRetry(async () => {
      await this.db
        .prepare(`
          UPDATE prompt_library 
          SET success_rate = ?, usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `)
        .bind(successRate, id)
        .run();
    }, DB_RETRY_CONFIG, 'updatePromptPerformance');
  }

  // Analytics and cleanup operations
  async getProcessingStats(): Promise<{
    total: number;
    pending: number;
    processed: number;
    failed: number;
    scheduled: number;
  }> {
    return withRetry(async () => {
      const result = await this.db
        .prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled
          FROM processed_urls
        `)
        .first();
      
      return {
        total: Number(result?.total || 0),
        pending: Number(result?.pending || 0),
        processed: Number(result?.processed || 0),
        failed: Number(result?.failed || 0),
        scheduled: Number(result?.scheduled || 0),
      };
    }, DB_RETRY_CONFIG, 'getProcessingStats');
  }

  async cleanupOldRecords(daysOld: number = 30): Promise<number> {
    return withRetry(async () => {
      const result = await this.db
        .prepare(`
          DELETE FROM processed_urls 
          WHERE processed_at < datetime('now', '-' || ? || ' days') 
          AND status IN ('processed', 'failed')
        `)
        .bind(daysOld)
        .run();
      
      return result.changes || 0;
    }, DB_RETRY_CONFIG, 'cleanupOldRecords');
  }
}