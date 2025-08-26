import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PinterestOptimizer } from '../../src/services/pinterest.js';
import type { Env, ScrapedContent } from '../../src/types/index.js';

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

describe('PinterestOptimizer', () => {
  let optimizer: PinterestOptimizer;

  beforeEach(() => {
    optimizer = new PinterestOptimizer(mockEnv);
    vi.clearAllMocks();
  });

  describe('Title optimization', () => {
    it('should keep good titles unchanged', () => {
      const optimizer_private = optimizer as any;
      const title = 'How to Make Perfect Chocolate Chip Cookies';
      const optimized = optimizer_private.optimizeTitle(title);
      
      expect(optimized).toBe(title);
    });

    it('should remove excessive punctuation', () => {
      const optimizer_private = optimizer as any;
      const title = 'Amazing Recipe!!! So Good???';
      const optimized = optimizer_private.optimizeTitle(title);
      
      expect(optimized).toBe('Amazing Recipe! So Good?');
    });

    it('should truncate overly long titles', () => {
      const optimizer_private = optimizer as any;
      const longTitle = 'This is a very long title that exceeds the Pinterest recommended length limit and should be truncated appropriately';
      const optimized = optimizer_private.optimizeTitle(longTitle);
      
      expect(optimized.length).toBeLessThanOrEqual(100);
      expect(optimized.endsWith('...')).toBe(true);
    });
  });

  describe('Description generation', () => {
    it('should generate engaging description for recipe content', () => {
      const content: ScrapedContent = {
        url: 'https://example.com/recipe',
        title: 'Chocolate Chip Cookies',
        description: 'Delicious homemade cookies perfect for any occasion',
        metadata: { category: 'recipe' },
      };

      const optimizer_private = optimizer as any;
      const description = optimizer_private.generateDescription(content, 'recipe');
      
      expect(description).toContain('Save this recipe for later!');
      expect(description).toContain('Delicious homemade cookies');
      expect(description).toMatch(/(Save for later!|Pin this!|Don't forget to save!|Click to read more!|Swipe to learn more!)/);
    });

    it('should generate description for how-to content', () => {
      const content: ScrapedContent = {
        url: 'https://example.com/tutorial',
        title: 'How to Paint a Room',
        description: 'Step by step guide for painting your bedroom',
        metadata: { category: 'howto', author: 'DIY Expert' },
      };

      const optimizer_private = optimizer as any;
      const description = optimizer_private.generateDescription(content, 'howto');
      
      expect(description).toContain('Follow this step-by-step guide:');
      expect(description).toContain('Step by step guide for painting');
      expect(description).toContain('By DIY Expert');
    });

    it('should handle missing description by extracting from content', () => {
      const content: ScrapedContent = {
        url: 'https://example.com/article',
        title: 'Great Article Title',
        content: 'This is the first substantial paragraph of content that should be extracted as description. This is more content that continues the article.',
        metadata: { category: 'article' },
      };

      const optimizer_private = optimizer as any;
      const description = optimizer_private.generateDescription(content, 'article');
      
      expect(description).toContain('This is the first substantial paragraph');
    });

    it('should limit description length appropriately', () => {
      const content: ScrapedContent = {
        url: 'https://example.com/long',
        title: 'Long Content',
        description: 'This is a very long description '.repeat(50), // Very long description
        metadata: { category: 'other' },
      };

      const optimizer_private = optimizer as any;
      const description = optimizer_private.generateDescription(content, 'other');
      
      expect(description.length).toBeLessThanOrEqual(500);
    });
  });

  describe('Hashtag generation', () => {
    it('should generate relevant hashtags for recipe content', () => {
      const content: ScrapedContent = {
        url: 'https://example.com/recipe',
        title: 'Chocolate Chip Cookies Recipe',
        description: 'Easy homemade cookies for dessert',
        metadata: {
          category: 'recipe',
          tags: ['baking', 'dessert', 'sweet'],
        },
      };

      const optimizer_private = optimizer as any;
      const hashtags = optimizer_private.generateHashtags(content, 'recipe');
      
      expect(hashtags).toContain('recipe');
      expect(hashtags).toContain('cooking');
      expect(hashtags).toContain('baking');
      expect(hashtags).toContain('dessert');
      expect(hashtags.length).toBeGreaterThan(5);
      expect(hashtags.length).toBeLessThanOrEqual(30);
    });

    it('should generate hashtags for how-to content', () => {
      const content: ScrapedContent = {
        url: 'https://example.com/tutorial',
        title: 'How to Build a Bookshelf',
        description: 'DIY tutorial for creating custom storage',
        metadata: {
          category: 'howto',
          tags: ['woodworking', 'furniture'],
        },
      };

      const optimizer_private = optimizer as any;
      const hashtags = optimizer_private.generateHashtags(content, 'howto');
      
      expect(hashtags).toContain('diy');
      expect(hashtags).toContain('howto');
      expect(hashtags).toContain('tutorial');
      expect(hashtags).toContain('woodworking');
      expect(hashtags).toContain('furniture');
    });

    it('should include seasonal hashtags', () => {
      const optimizer_private = optimizer as any;
      
      // Mock Date to December for Christmas hashtags
      const mockDate = new Date('2024-12-15');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);
      
      const seasonalHashtags = optimizer_private.getSeasonalHashtags();
      
      expect(seasonalHashtags).toContain('winter');
      expect(seasonalHashtags).toContain('christmas');
      
      vi.restoreAllMocks();
    });

    it('should extract hashtags from text content', () => {
      const optimizer_private = optimizer as any;
      const text = 'This is about diy home decor and vintage furniture';
      
      const extracted = optimizer_private.extractHashtagsFromText(text);
      
      expect(extracted).toContain('diy');
      expect(extracted).toContain('home');
      expect(extracted).toContain('decor');
      expect(extracted).toContain('vintage');
    });

    it('should limit hashtag length and remove duplicates', () => {
      const content: ScrapedContent = {
        url: 'https://example.com/test',
        title: 'Test Recipe with Recipe Cooking',
        description: 'Recipe for cooking test recipe',
        metadata: {
          category: 'recipe',
          tags: ['recipe', 'cooking', 'test'], // Duplicates
        },
      };

      const optimizer_private = optimizer as any;
      const hashtags = optimizer_private.generateHashtags(content, 'recipe');
      
      // Should remove duplicates
      const uniqueHashtags = new Set(hashtags);
      expect(hashtags.length).toBe(uniqueHashtags.size);
      
      // Should not exceed 30 hashtags
      expect(hashtags.length).toBeLessThanOrEqual(30);
      
      // All hashtags should be reasonable length
      hashtags.forEach(tag => {
        expect(tag.length).toBeGreaterThanOrEqual(3);
        expect(tag.length).toBeLessThanOrEqual(30);
      });
    });
  });

  describe('Content optimization flow', () => {
    it('should optimize complete content successfully', async () => {
      const content: ScrapedContent = {
        url: 'https://example.com/recipe',
        title: 'Perfect Chocolate Chip Cookies',
        description: 'The best recipe for soft and chewy chocolate chip cookies',
        metadata: {
          category: 'recipe',
          author: 'Baker Jane',
          tags: ['baking', 'cookies', 'dessert'],
        },
      };

      // Mock cache miss
      const optimizer_private = optimizer as any;
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      optimizer_private.cache = { get: mockGet, put: mockPut };

      const result = await optimizer.optimizeContent(content);

      expect(result.title).toBe('Perfect Chocolate Chip Cookies');
      expect(result.description).toContain('Save this recipe for later!');
      expect(result.description).toContain('best recipe for soft and chewy');
      expect(result.hashtags).toContain('recipe');
      expect(result.hashtags).toContain('baking');
      expect(result.contentType).toBe('recipe');
      
      // Should cache the result
      expect(mockPut).toHaveBeenCalledWith(
        `optimized:${content.url}`,
        result
      );
    });

    it('should use cached result when available', async () => {
      const content: ScrapedContent = {
        url: 'https://example.com/cached',
        title: 'Test Title',
        description: 'Test description',
      };

      const cachedResult = {
        title: 'Cached Title',
        description: 'Cached description',
        hashtags: ['cached', 'test'],
        contentType: 'other' as const,
      };

      const optimizer_private = optimizer as any;
      const mockGet = vi.fn().mockResolvedValue(cachedResult);
      optimizer_private.cache = { get: mockGet };

      const result = await optimizer.optimizeContent(content);

      expect(result).toEqual(cachedResult);
      expect(mockGet).toHaveBeenCalledWith(`optimized:${content.url}`);
    });

    it('should handle optimization errors with fallback', async () => {
      const content: ScrapedContent = {
        url: 'https://example.com/error',
        title: 'Test Title',
        description: 'Test description',
      };

      // Mock cache and processing errors
      const optimizer_private = optimizer as any;
      const mockGet = vi.fn().mockRejectedValue(new Error('Cache error'));
      optimizer_private.cache = { get: mockGet };

      const result = await optimizer.optimizeContent(content);

      // Should return fallback optimization
      expect(result.title).toBe('Test Title');
      expect(result.description).toContain('Check out this interesting content');
      expect(result.hashtags).toEqual(['pinterest', 'interesting', 'content', 'discover']);
      expect(result.contentType).toBe('other');
    });
  });

  describe('Content variations', () => {
    it('should generate multiple variations of optimized content', async () => {
      const content: ScrapedContent = {
        url: 'https://example.com/variations',
        title: 'Test Recipe',
        description: 'A delicious test recipe for everyone',
        metadata: { category: 'recipe' },
      };

      const optimizer_private = optimizer as any;
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      optimizer_private.cache = { get: mockGet, put: mockPut };

      const variations = await optimizer.generateVariations(content, 2);

      expect(variations).toHaveLength(2);
      expect(variations[0]).toBeDefined();
      expect(variations[1]).toBeDefined();
      
      // Variations should be different
      expect(variations[0]!.title !== variations[1]!.title || 
             variations[0]!.description !== variations[1]!.description).toBe(true);
    });
  });
});