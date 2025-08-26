import type { Env, SitemapUrl, SitemapState } from '../types/index.js';
import { sitemapUrlSchema } from '../schemas/validation.js';
import { DatabaseStorage, KVStorage } from '../utils/storage.js';
import { withRetry, API_RETRY_CONFIG } from '../utils/retry.js';

/**
 * XML sitemap parser and URL extractor
 */
export class SitemapProcessor {
  private db: DatabaseStorage;
  private cache: KVStorage;

  constructor(private env: Env) {
    this.db = new DatabaseStorage(env.DB);
    this.cache = new KVStorage(env.CACHE, 3600); // 1 hour cache
  }

  /**
   * Process a sitemap URL and extract all URLs
   */
  async processSitemap(sitemapUrl: string): Promise<SitemapUrl[]> {
    console.log(`Processing sitemap: ${sitemapUrl}`);

    // Check cache first
    const cached = await this.cache.get<SitemapUrl[]>(`sitemap:${sitemapUrl}`);
    if (cached) {
      console.log('Using cached sitemap data');
      return cached;
    }

    // Update processing status
    await this.updateSitemapState(sitemapUrl, { processing_status: 'processing' });

    try {
      const urls = await this.fetchAndParseSitemap(sitemapUrl);
      const filteredUrls = this.filterUrls(urls);

      // Cache the results
      await this.cache.put(`sitemap:${sitemapUrl}`, filteredUrls);

      // Update state
      await this.updateSitemapState(sitemapUrl, {
        processing_status: 'idle',
        last_processed: new Date().toISOString(),
        total_urls: filteredUrls.length,
      });

      console.log(`Successfully processed sitemap: ${filteredUrls.length} URLs found`);
      return filteredUrls;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing sitemap: ${errorMessage}`);

      // Update error state
      await this.updateSitemapState(sitemapUrl, {
        processing_status: 'error',
        last_error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Fetch and parse XML sitemap
   */
  private async fetchAndParseSitemap(sitemapUrl: string): Promise<SitemapUrl[]> {
    return withRetry(async () => {
      const response = await fetch(sitemapUrl, {
        headers: {
          'User-Agent': 'Postiz Auto-Poster/1.0 (Cloudflare Workers)',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseXmlSitemap(xmlText, sitemapUrl);
    }, API_RETRY_CONFIG, `fetchSitemap(${sitemapUrl})`);
  }

  /**
   * Parse XML sitemap content
   */
  private parseXmlSitemap(xmlContent: string, baseUrl: string): SitemapUrl[] {
    const urls: SitemapUrl[] = [];

    // Handle sitemap index (nested sitemaps)
    const sitemapMatches = xmlContent.matchAll(/<sitemap>[\s\S]*?<\/sitemap>/g);
    if (sitemapMatches) {
      for (const match of sitemapMatches) {
        const sitemapContent = match[0] || '';
        const locMatch = sitemapContent.match(/<loc>(.*?)<\/loc>/);
        if (locMatch && locMatch[1]) {
          console.log(`Found nested sitemap: ${locMatch[1]}`);
          // Note: In a real implementation, we might want to recursively process nested sitemaps
          // For now, we'll just log them
        }
      }
    }

    // Parse URL entries
    const urlMatches = xmlContent.matchAll(/<url>[\s\S]*?<\/url>/g);
    
    for (const match of urlMatches) {
      const urlContent = match[0] || '';
      
      const locMatch = urlContent.match(/<loc>(.*?)<\/loc>/);
      if (!locMatch || !locMatch[1]) continue;

      const url = locMatch[1].trim();
      
      // Extract optional metadata
      const lastmodMatch = urlContent.match(/<lastmod>(.*?)<\/lastmod>/);
      const priorityMatch = urlContent.match(/<priority>(.*?)<\/priority>/);
      const changefreqMatch = urlContent.match(/<changefreq>(.*?)<\/changefreq>/);

      try {
        const sitemapUrl: SitemapUrl = {
          url,
          lastmod: lastmodMatch?.[1]?.trim(),
          priority: priorityMatch?.[1] ? parseFloat(priorityMatch[1]) : undefined,
          changefreq: changefreqMatch?.[1]?.trim() as any,
        };

        // Validate the URL
        const validated = sitemapUrlSchema.parse(sitemapUrl);
        urls.push(validated);

      } catch (error) {
        console.warn(`Invalid URL in sitemap: ${url}`, error);
      }
    }

    return urls;
  }

  /**
   * Filter URLs based on patterns and rules
   */
  private filterUrls(urls: SitemapUrl[]): SitemapUrl[] {
    const filtered = urls.filter(url => {
      // Skip non-HTML URLs
      if (url.url.match(/\.(xml|pdf|jpg|jpeg|png|gif|css|js|ico|svg)$/i)) {
        return false;
      }

      // Skip admin/system URLs
      if (url.url.match(/\/(admin|wp-admin|login|register|checkout|cart|account)/i)) {
        return false;
      }

      // Skip pagination URLs
      if (url.url.match(/[\?&]page=\d+/i)) {
        return false;
      }

      // Skip URLs that are too long
      if (url.url.length > 500) {
        return false;
      }

      return true;
    });

    // Sort by priority and last modified date
    return filtered.sort((a, b) => {
      // Higher priority first
      if (a.priority !== undefined && b.priority !== undefined) {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
      }

      // More recent lastmod first
      if (a.lastmod && b.lastmod) {
        return new Date(b.lastmod).getTime() - new Date(a.lastmod).getTime();
      }

      return 0;
    });
  }

  /**
   * Get new URLs that haven't been processed yet
   */
  async getNewUrls(sitemapUrl: string, limit: number = 10): Promise<SitemapUrl[]> {
    const allUrls = await this.processSitemap(sitemapUrl);
    const newUrls: SitemapUrl[] = [];

    for (const sitemapUrl of allUrls) {
      if (newUrls.length >= limit) break;

      // Check if URL has already been processed
      const existing = await this.db.getProcessedUrl(sitemapUrl.url);
      if (!existing) {
        newUrls.push(sitemapUrl);
      }
    }

    console.log(`Found ${newUrls.length} new URLs to process`);
    return newUrls;
  }

  /**
   * Mark URLs as pending for processing
   */
  async markUrlsAsPending(urls: SitemapUrl[]): Promise<void> {
    for (const url of urls) {
      try {
        await this.db.createProcessedUrl({
          url: url.url,
          status: 'pending',
          retry_count: 0,
        });
      } catch (error) {
        // URL might already exist, which is fine
        console.warn(`Could not mark URL as pending: ${url.url}`, error);
      }
    }

    console.log(`Marked ${urls.length} URLs as pending for processing`);
  }

  /**
   * Get sitemap processing state
   */
  async getSitemapState(sitemapUrl: string): Promise<SitemapState | null> {
    return this.db.getSitemapState(sitemapUrl);
  }

  /**
   * Update sitemap processing state
   */
  private async updateSitemapState(
    sitemapUrl: string, 
    updates: Partial<Omit<SitemapState, 'id' | 'sitemap_url'>>
  ): Promise<void> {
    const currentState = await this.db.getSitemapState(sitemapUrl);
    
    const newState: Omit<SitemapState, 'id'> = {
      sitemap_url: sitemapUrl,
      total_urls: 0,
      processed_urls: 0,
      failed_urls: 0,
      processing_status: 'idle',
      ...currentState,
      ...updates,
    };

    await this.db.upsertSitemapState(newState);
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    totalUrls: number;
    pendingUrls: number;
    processedUrls: number;
    failedUrls: number;
    successRate: number;
  }> {
    const stats = await this.db.getProcessingStats();
    
    const successRate = stats.total > 0 
      ? (stats.processed / stats.total) * 100 
      : 0;

    return {
      totalUrls: stats.total,
      pendingUrls: stats.pending,
      processedUrls: stats.processed,
      failedUrls: stats.failed,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Clean up old processed URLs
   */
  async cleanupOldRecords(daysOld: number = 30): Promise<number> {
    const deleted = await this.db.cleanupOldRecords(daysOld);
    console.log(`Cleaned up ${deleted} old records`);
    return deleted;
  }
}