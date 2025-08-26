import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SitemapProcessor } from '../../src/services/sitemap.js';
import type { Env } from '../../src/types/index.js';

// Mock environment
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

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SitemapProcessor', () => {
  let sitemapProcessor: SitemapProcessor;

  beforeEach(() => {
    sitemapProcessor = new SitemapProcessor(mockEnv);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('XML parsing', () => {
    it('should parse basic sitemap XML correctly', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/page1</loc>
            <lastmod>2024-01-15</lastmod>
            <priority>0.8</priority>
            <changefreq>weekly</changefreq>
          </url>
          <url>
            <loc>https://example.com/page2</loc>
            <lastmod>2024-01-10</lastmod>
            <priority>0.6</priority>
          </url>
        </urlset>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockXml),
      });

      // Mock the cache and database methods
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      const mockUpsertSitemapState = vi.fn().mockResolvedValue(undefined);
      const mockGetSitemapState = vi.fn().mockResolvedValue(null);

      // Access private methods through type casting for testing
      const processor = sitemapProcessor as any;
      processor.cache = { get: mockGet, put: mockPut };
      processor.db = { 
        upsertSitemapState: mockUpsertSitemapState,
        getSitemapState: mockGetSitemapState,
      };

      const urls = await sitemapProcessor.processSitemap('https://example.com/sitemap.xml');

      expect(urls).toHaveLength(2);
      expect(urls[0]).toMatchObject({
        url: 'https://example.com/page1',
        lastmod: '2024-01-15',
        priority: 0.8,
        changefreq: 'weekly',
      });
      expect(urls[1]).toMatchObject({
        url: 'https://example.com/page2',
        lastmod: '2024-01-10',
        priority: 0.6,
      });
    });

    it('should filter out non-HTML URLs', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://example.com/image.jpg</loc></url>
          <url><loc>https://example.com/document.pdf</loc></url>
          <url><loc>https://example.com/style.css</loc></url>
          <url><loc>https://example.com/page2</loc></url>
        </urlset>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockXml),
      });

      const mockGet = vi.fn().mockResolvedValue(null);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      const mockUpsertSitemapState = vi.fn().mockResolvedValue(undefined);
      const mockGetSitemapState = vi.fn().mockResolvedValue(null);

      const processor = sitemapProcessor as any;
      processor.cache = { get: mockGet, put: mockPut };
      processor.db = { 
        upsertSitemapState: mockUpsertSitemapState,
        getSitemapState: mockGetSitemapState,
      };

      const urls = await sitemapProcessor.processSitemap('https://example.com/sitemap.xml');

      expect(urls).toHaveLength(2);
      expect(urls.map(u => u.url)).toEqual([
        'https://example.com/page1',
        'https://example.com/page2',
      ]);
    });

    it('should filter out admin URLs', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://example.com/admin/dashboard</loc></url>
          <url><loc>https://example.com/wp-admin/login</loc></url>
          <url><loc>https://example.com/login</loc></url>
          <url><loc>https://example.com/page2</loc></url>
        </urlset>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockXml),
      });

      const mockGet = vi.fn().mockResolvedValue(null);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      const mockUpsertSitemapState = vi.fn().mockResolvedValue(undefined);
      const mockGetSitemapState = vi.fn().mockResolvedValue(null);

      const processor = sitemapProcessor as any;
      processor.cache = { get: mockGet, put: mockPut };
      processor.db = { 
        upsertSitemapState: mockUpsertSitemapState,
        getSitemapState: mockGetSitemapState,
      };

      const urls = await sitemapProcessor.processSitemap('https://example.com/sitemap.xml');

      expect(urls).toHaveLength(2);
      expect(urls.map(u => u.url)).toEqual([
        'https://example.com/page1',
        'https://example.com/page2',
      ]);
    });
  });

  describe('URL prioritization', () => {
    it('should sort URLs by priority (higher first)', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/low-priority</loc>
            <priority>0.3</priority>
          </url>
          <url>
            <loc>https://example.com/high-priority</loc>
            <priority>0.9</priority>
          </url>
          <url>
            <loc>https://example.com/medium-priority</loc>
            <priority>0.6</priority>
          </url>
        </urlset>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockXml),
      });

      const mockGet = vi.fn().mockResolvedValue(null);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      const mockUpsertSitemapState = vi.fn().mockResolvedValue(undefined);
      const mockGetSitemapState = vi.fn().mockResolvedValue(null);

      const processor = sitemapProcessor as any;
      processor.cache = { get: mockGet, put: mockPut };
      processor.db = { 
        upsertSitemapState: mockUpsertSitemapState,
        getSitemapState: mockGetSitemapState,
      };

      const urls = await sitemapProcessor.processSitemap('https://example.com/sitemap.xml');

      expect(urls).toHaveLength(3);
      expect(urls[0]!.url).toBe('https://example.com/high-priority');
      expect(urls[1]!.url).toBe('https://example.com/medium-priority');
      expect(urls[2]!.url).toBe('https://example.com/low-priority');
    });
  });

  describe('Error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const mockUpsertSitemapState = vi.fn().mockResolvedValue(undefined);
      const mockGetSitemapState = vi.fn().mockResolvedValue(null);

      const processor = sitemapProcessor as any;
      processor.db = { 
        upsertSitemapState: mockUpsertSitemapState,
        getSitemapState: mockGetSitemapState,
      };

      await expect(
        sitemapProcessor.processSitemap('https://example.com/sitemap.xml')
      ).rejects.toThrow('Network error');

      expect(mockUpsertSitemapState).toHaveBeenCalledWith(
        expect.objectContaining({
          processing_status: 'error',
          last_error: 'Network error',
        })
      );
    });

    it('should handle malformed XML gracefully', async () => {
      const malformedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/page1</loc>
            <!-- Missing closing tag -->
        </urlset>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(malformedXml),
      });

      const mockGet = vi.fn().mockResolvedValue(null);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      const mockUpsertSitemapState = vi.fn().mockResolvedValue(undefined);
      const mockGetSitemapState = vi.fn().mockResolvedValue(null);

      const processor = sitemapProcessor as any;
      processor.cache = { get: mockGet, put: mockPut };
      processor.db = { 
        upsertSitemapState: mockUpsertSitemapState,
        getSitemapState: mockGetSitemapState,
      };

      // Should still parse what it can
      const urls = await sitemapProcessor.processSitemap('https://example.com/sitemap.xml');
      
      expect(urls).toHaveLength(1);
      expect(urls[0]!.url).toBe('https://example.com/page1');
    });
  });

  describe('Caching', () => {
    it('should use cached results when available', async () => {
      const cachedUrls = [
        { url: 'https://example.com/cached1' },
        { url: 'https://example.com/cached2' },
      ];

      const mockGet = vi.fn().mockResolvedValue(cachedUrls);
      const processor = sitemapProcessor as any;
      processor.cache = { get: mockGet };

      const urls = await sitemapProcessor.processSitemap('https://example.com/sitemap.xml');

      expect(mockGet).toHaveBeenCalledWith('sitemap:https://example.com/sitemap.xml');
      expect(urls).toEqual(cachedUrls);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});