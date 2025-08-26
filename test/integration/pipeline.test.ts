import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Env } from '../../src/types/index.js';
import { SitemapProcessor } from '../../src/services/sitemap.js';
import { ContentScraper } from '../../src/services/scraper.js';
import { PinterestOptimizer } from '../../src/services/pinterest.js';

// Mock environment for integration tests
const mockEnv: Env = {
  DB: {} as D1Database,
  CACHE: {} as KVNamespace,
  PROMPTS: {} as KVNamespace,
  PROCESSING_QUEUE: {} as Queue,
  IMAGES: {} as R2Bucket,
  ANALYTICS: {} as AnalyticsEngineDataset,
  POSTIZ_API_KEY: 'test-postiz-key',
  FAL_API_KEY: 'test-fal-key',
  FIRECRAWL_API_KEY: 'test-firecrawl-key',
  SITEMAP_URL: 'https://example.com/sitemap.xml',
  PINTEREST_BOARD_ID: 'test-board-id',
};

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Integration Tests - Content Processing Pipeline', () => {
  let sitemapProcessor: SitemapProcessor;
  let contentScraper: ContentScraper;
  let pinterestOptimizer: PinterestOptimizer;

  beforeEach(() => {
    sitemapProcessor = new SitemapProcessor(mockEnv);
    contentScraper = new ContentScraper(mockEnv);
    pinterestOptimizer = new PinterestOptimizer(mockEnv);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Sitemap to Content Pipeline', () => {
    it('should process sitemap and extract URLs for scraping', async () => {
      // Mock sitemap XML response
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/recipe/chocolate-cookies</loc>
            <lastmod>2024-01-15</lastmod>
            <priority>0.8</priority>
          </url>
          <url>
            <loc>https://example.com/tutorial/how-to-paint</loc>
            <lastmod>2024-01-14</lastmod>
            <priority>0.7</priority>
          </url>
          <url>
            <loc>https://example.com/admin/dashboard</loc>
          </url>
        </urlset>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(sitemapXml),
      });

      // Mock storage operations
      const mockSitemap = sitemapProcessor as any;
      mockSitemap.cache = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      };
      mockSitemap.db = {
        upsertSitemapState: vi.fn().mockResolvedValue(undefined),
        getSitemapState: vi.fn().mockResolvedValue(null),
        getProcessedUrl: vi.fn().mockResolvedValue(null),
        createProcessedUrl: vi.fn().mockResolvedValue(1),
      };

      const urls = await sitemapProcessor.processSitemap(mockEnv.SITEMAP_URL);
      
      // Should filter out admin URLs and return valid content URLs
      expect(urls).toHaveLength(2);
      expect(urls[0]!.url).toBe('https://example.com/recipe/chocolate-cookies');
      expect(urls[1]!.url).toBe('https://example.com/tutorial/how-to-paint');

      // Should prioritize by priority value
      expect(urls[0]!.priority).toBe(0.8);
      expect(urls[1]!.priority).toBe(0.7);
    });
  });

  describe('Content Scraping to Optimization Pipeline', () => {
    it('should scrape content and optimize it for Pinterest', async () => {
      const testUrl = 'https://example.com/recipe/chocolate-cookies';
      
      // Mock Firecrawl API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            markdown: '# Perfect Chocolate Chip Cookies\n\nThese are the best cookies you\'ll ever make. With simple ingredients and easy steps, you can create bakery-quality cookies at home.',
            html: '<h1>Perfect Chocolate Chip Cookies</h1><p>These are the best cookies...</p>',
            metadata: {
              title: 'Perfect Chocolate Chip Cookies',
              description: 'These are the best cookies you\'ll ever make',
              keywords: 'cookies, baking, chocolate chip, recipe',
              author: 'Jane Baker',
            },
          },
        }),
      });

      // Mock cache operations
      const mockScraper = contentScraper as any;
      mockScraper.cache = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const mockOptimizer = pinterestOptimizer as any;
      mockOptimizer.cache = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      };

      // Test the pipeline: scrape -> optimize
      const scrapedContent = await contentScraper.scrapeUrl(testUrl);
      expect(scrapedContent).toBeDefined();
      expect(scrapedContent!.title).toBe('Perfect Chocolate Chip Cookies');
      expect(scrapedContent!.description).toBe('These are the best cookies you\'ll ever make');
      expect(scrapedContent!.metadata?.category).toBe('recipe');

      const optimizedContent = await pinterestOptimizer.optimizeContent(scrapedContent!);
      expect(optimizedContent.title).toBe('Perfect Chocolate Chip Cookies');
      expect(optimizedContent.description).toContain('Save this recipe for later!');
      expect(optimizedContent.hashtags).toContain('recipe');
      expect(optimizedContent.hashtags).toContain('cookies');
      expect(optimizedContent.contentType).toBe('recipe');
    });

    it('should handle content quality assessment', async () => {
      const testUrl = 'https://example.com/low-quality';
      
      // Mock low-quality content response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            markdown: '# Short\n\nToo short.',
            metadata: {
              title: 'Short',
              description: 'Too short',
            },
          },
        }),
      });

      const mockScraper = contentScraper as any;
      mockScraper.cache = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const scrapedContent = await contentScraper.scrapeUrl(testUrl);
      expect(scrapedContent).toBeDefined();

      const qualityAssessment = await contentScraper.assessContentQuality(scrapedContent!);
      
      expect(qualityAssessment.suitable).toBe(false);
      expect(qualityAssessment.score).toBeLessThan(60);
      expect(qualityAssessment.reasons).toContain('Title too short');
      expect(qualityAssessment.reasons).toContain('Content too short');
    });
  });

  describe('Full Content Processing Chain', () => {
    it('should process from sitemap URL to Pinterest-ready content', async () => {
      // Step 1: Mock sitemap
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/tutorial/diy-bookshelf</loc>
            <priority>0.9</priority>
          </url>
        </urlset>`;

      // Step 2: Mock content scraping
      const firecrawlResponse = {
        success: true,
        data: {
          markdown: '# How to Build a DIY Bookshelf\n\nBuilding your own bookshelf is a rewarding project that can save money and provide custom storage. This step-by-step guide will walk you through creating a beautiful, sturdy bookshelf using basic tools and materials.',
          metadata: {
            title: 'How to Build a DIY Bookshelf',
            description: 'Complete guide to building your own custom bookshelf',
            keywords: 'diy, woodworking, bookshelf, tutorial, home improvement',
            author: 'DIY Expert',
          },
        },
      };

      // Setup mocks in sequence
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(sitemapXml),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(firecrawlResponse),
        });

      // Mock storage for all services
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const mockDB = {
        upsertSitemapState: vi.fn().mockResolvedValue(undefined),
        getSitemapState: vi.fn().mockResolvedValue(null),
        getProcessedUrl: vi.fn().mockResolvedValue(null),
        createProcessedUrl: vi.fn().mockResolvedValue(1),
      };

      // Apply mocks
      (sitemapProcessor as any).cache = mockCache;
      (sitemapProcessor as any).db = mockDB;
      (contentScraper as any).cache = mockCache;
      (pinterestOptimizer as any).cache = mockCache;

      // Execute the full pipeline
      const urls = await sitemapProcessor.processSitemap(mockEnv.SITEMAP_URL);
      expect(urls).toHaveLength(1);
      
      const targetUrl = urls[0]!.url;
      const scrapedContent = await contentScraper.scrapeUrl(targetUrl);
      expect(scrapedContent).toBeDefined();
      
      const qualityCheck = await contentScraper.assessContentQuality(scrapedContent!);
      expect(qualityCheck.suitable).toBe(true);
      
      const optimizedContent = await pinterestOptimizer.optimizeContent(scrapedContent!);
      
      // Verify final optimized content
      expect(optimizedContent.title).toBe('How to Build a DIY Bookshelf');
      expect(optimizedContent.description).toContain('Follow this step-by-step guide:');
      expect(optimizedContent.hashtags).toContain('diy');
      expect(optimizedContent.hashtags).toContain('howto');
      expect(optimizedContent.hashtags).toContain('tutorial');
      expect(optimizedContent.contentType).toBe('howto');
    });

    it('should handle errors gracefully in the pipeline', async () => {
      // Mock sitemap fetch error
      mockFetch.mockRejectedValueOnce(new Error('Sitemap fetch failed'));

      const mockDB = {
        upsertSitemapState: vi.fn().mockResolvedValue(undefined),
        getSitemapState: vi.fn().mockResolvedValue(null),
      };

      (sitemapProcessor as any).db = mockDB;

      await expect(
        sitemapProcessor.processSitemap(mockEnv.SITEMAP_URL)
      ).rejects.toThrow('Sitemap fetch failed');

      // Should update error state
      expect(mockDB.upsertSitemapState).toHaveBeenCalledWith(
        expect.objectContaining({
          processing_status: 'error',
          last_error: 'Sitemap fetch failed',
        })
      );
    });
  });

  describe('Batch Processing', () => {
    it('should handle multiple URLs efficiently', async () => {
      const urls = [
        'https://example.com/recipe1',
        'https://example.com/recipe2',
        'https://example.com/recipe3',
      ];

      // Mock responses for all URLs
      urls.forEach((url, index) => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              markdown: `# Recipe ${index + 1}\n\nDelicious recipe number ${index + 1}`,
              metadata: {
                title: `Recipe ${index + 1}`,
                description: `Delicious recipe number ${index + 1}`,
              },
            },
          }),
        });
      });

      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      };
      (contentScraper as any).cache = mockCache;

      const results = await contentScraper.scrapeMultipleUrls(urls);

      expect(results.size).toBe(3);
      expect(results.get('https://example.com/recipe1')).toBeDefined();
      expect(results.get('https://example.com/recipe2')).toBeDefined();
      expect(results.get('https://example.com/recipe3')).toBeDefined();

      // Verify all were processed
      urls.forEach(url => {
        const content = results.get(url);
        expect(content).toBeDefined();
        expect(content!.url).toBe(url);
      });
    });
  });
});