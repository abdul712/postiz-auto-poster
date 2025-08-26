import type { Env, ScrapedContent } from '../types/index.js';
import { scrapedContentSchema } from '../schemas/validation.js';
import { withRetry, API_RETRY_CONFIG } from '../utils/retry.js';
import { KVStorage } from '../utils/storage.js';

/**
 * Firecrawl API client for intelligent web content extraction
 */
export class ContentScraper {
  private cache: KVStorage;
  private baseUrl = 'https://api.firecrawl.dev/v1';

  constructor(private env: Env) {
    this.cache = new KVStorage(env.CACHE, 86400); // 24 hour cache
  }

  /**
   * Scrape content from a URL using Firecrawl
   */
  async scrapeUrl(url: string): Promise<ScrapedContent | null> {
    console.log(`Scraping content from: ${url}`);

    // Check cache first
    const cacheKey = `scraped:${url}`;
    const cached = await this.cache.get<ScrapedContent>(cacheKey);
    if (cached) {
      console.log('Using cached scraped content');
      return cached;
    }

    try {
      const content = await this.fetchWithFirecrawl(url);
      if (!content) return null;

      // Cache the result
      await this.cache.put(cacheKey, content);

      return content;

    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return null;
    }
  }

  /**
   * Fetch and process content using Firecrawl API
   */
  private async fetchWithFirecrawl(url: string): Promise<ScrapedContent | null> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
          includeHtml: true,
          includeTags: ['title', 'description', 'keywords', 'author', 'date'],
          excludeTags: ['nav', 'footer', 'aside', 'header', '.advertisement', '.popup'],
          waitFor: 2000, // Wait 2 seconds for dynamic content
          screenshot: false, // We don't need screenshots
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.data) {
        throw new Error('Firecrawl API returned no data');
      }

      return this.extractContentFromFirecrawlResponse(data.data, url);

    }, API_RETRY_CONFIG, `firecrawl(${url})`);
  }

  /**
   * Extract structured content from Firecrawl response
   */
  private extractContentFromFirecrawlResponse(data: any, url: string): ScrapedContent | null {
    try {
      // Extract main content
      const markdown = data.markdown || '';
      const html = data.html || '';
      const metadata = data.metadata || {};

      // Extract title (prefer metadata, then fallback to content extraction)
      let title = metadata.title || '';
      if (!title && markdown) {
        const titleMatch = markdown.match(/^# (.+)$/m);
        title = titleMatch?.[1] || '';
      }

      // Extract description
      let description = metadata.description || '';
      if (!description && markdown) {
        // Try to extract first paragraph after title
        const contentLines = markdown.split('\n').filter(line => line.trim());
        const firstParagraph = contentLines.find(line => 
          !line.startsWith('#') && 
          !line.startsWith('*') && 
          !line.startsWith('-') &&
          line.length > 50
        );
        description = firstParagraph || '';
      }

      // Extract main image
      let mainImage = metadata.image || metadata['og:image'] || '';
      if (!mainImage && html) {
        const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
        mainImage = imgMatch?.[1] || '';
      }

      // Clean up content
      title = this.cleanText(title);
      description = this.cleanText(description);
      
      // Validate minimum content requirements
      if (!title || title.length < 5) {
        console.warn(`Insufficient title content for ${url}: "${title}"`);
        return null;
      }

      const scrapedContent: ScrapedContent = {
        url,
        title: title.substring(0, 200), // Limit title length
        description: description ? description.substring(0, 500) : undefined,
        content: markdown.substring(0, 2000), // Limit content for processing
        metadata: {
          author: metadata.author || metadata['article:author'],
          publishedDate: metadata.date || metadata['article:published_time'],
          tags: this.extractTags(metadata.keywords),
          category: this.inferCategory(title, description, markdown),
        },
        mainImage: this.validateImageUrl(mainImage),
      };

      // Validate the scraped content
      const validated = scrapedContentSchema.parse(scrapedContent);
      return validated;

    } catch (error) {
      console.error('Error extracting content from Firecrawl response:', error);
      return null;
    }
  }

  /**
   * Clean and normalize text content
   */
  private cleanText(text: string): string {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[\r\n\t]/g, ' ') // Remove line breaks and tabs
      .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Remove control characters
      .trim()
      .substring(0, 1000); // Reasonable length limit
  }

  /**
   * Extract tags from keywords string
   */
  private extractTags(keywords?: string): string[] {
    if (!keywords) return [];
    
    const tags = keywords
      .split(/[,;|]/)
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0 && tag.length < 30)
      .slice(0, 10); // Limit number of tags

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Infer content category based on content analysis
   */
  private inferCategory(title: string, description: string, content: string): string {
    const text = `${title} ${description} ${content}`.toLowerCase();

    // Define category keywords
    const categories = {
      'recipe': ['recipe', 'cooking', 'ingredients', 'cook', 'bake', 'kitchen', 'food'],
      'howto': ['how to', 'tutorial', 'guide', 'step', 'instructions', 'diy', 'tips'],
      'product': ['review', 'product', 'buy', 'purchase', 'price', 'sale', 'deal'],
      'lifestyle': ['lifestyle', 'health', 'fitness', 'wellness', 'beauty', 'fashion'],
      'article': ['news', 'article', 'blog', 'story', 'update', 'information'],
    };

    let bestCategory = 'other';
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(categories)) {
      const score = keywords.reduce((sum, keyword) => {
        const count = (text.match(new RegExp(keyword, 'g')) || []).length;
        return sum + count;
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    return bestCategory;
  }

  /**
   * Validate and normalize image URL
   */
  private validateImageUrl(imageUrl?: string): string | undefined {
    if (!imageUrl) return undefined;
    
    try {
      const url = new URL(imageUrl);
      
      // Only allow http/https
      if (!['http:', 'https:'].includes(url.protocol)) {
        return undefined;
      }

      // Check for common image extensions
      const imageExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;
      if (!imageExtensions.test(url.pathname) && !imageUrl.includes('og:image')) {
        return undefined;
      }

      return imageUrl;
    } catch {
      return undefined;
    }
  }

  /**
   * Assess content quality for Pinterest suitability
   */
  async assessContentQuality(content: ScrapedContent): Promise<{
    score: number;
    reasons: string[];
    suitable: boolean;
  }> {
    let score = 0;
    const reasons: string[] = [];

    // Check title quality
    if (content.title && content.title.length >= 10) {
      score += 20;
      reasons.push('Good title length');
    } else {
      reasons.push('Title too short');
    }

    // Check description quality
    if (content.description && content.description.length >= 50) {
      score += 20;
      reasons.push('Good description length');
    } else {
      reasons.push('Description missing or too short');
    }

    // Check content length
    if (content.content && content.content.length >= 200) {
      score += 20;
      reasons.push('Sufficient content length');
    } else {
      reasons.push('Content too short');
    }

    // Check for main image
    if (content.mainImage) {
      score += 15;
      reasons.push('Has main image');
    } else {
      reasons.push('No main image found');
    }

    // Check metadata completeness
    if (content.metadata?.category && content.metadata.category !== 'other') {
      score += 10;
      reasons.push('Clear content category');
    }

    if (content.metadata?.tags && content.metadata.tags.length > 0) {
      score += 10;
      reasons.push('Has relevant tags');
    }

    // Check for Pinterest-friendly content types
    const pinterestFriendlyTypes = ['recipe', 'howto', 'lifestyle', 'product'];
    if (content.metadata?.category && pinterestFriendlyTypes.includes(content.metadata.category)) {
      score += 5;
      reasons.push('Pinterest-friendly content type');
    }

    return {
      score,
      reasons,
      suitable: score >= 60, // Require 60% quality score
    };
  }

  /**
   * Batch scrape multiple URLs
   */
  async scrapeMultipleUrls(urls: string[]): Promise<Map<string, ScrapedContent | null>> {
    const results = new Map<string, ScrapedContent | null>();

    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      
      const promises = batch.map(async (url) => {
        const content = await this.scrapeUrl(url);
        results.set(url, content);
      });

      await Promise.allSettled(promises);
      
      // Add small delay between batches
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}