import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageGenerator } from '../../src/services/imageGenerator.js';
import type { Env, OptimizedContent } from '../../src/types/index.js';

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
  BRAND_COLORS: '#FF6B6B,#4ECDC4',
  BRAND_FONTS: 'Roboto,Arial',
};

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ImageGenerator', () => {
  let imageGenerator: ImageGenerator;

  beforeEach(() => {
    imageGenerator = new ImageGenerator(mockEnv);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Model selection', () => {
    it('should select text-heavy model for howto content', () => {
      const content: OptimizedContent = {
        title: 'How to Make Perfect Pancakes',
        description: 'Step by step tutorial for making fluffy pancakes',
        hashtags: ['howto', 'cooking', 'tutorial'],
        contentType: 'howto',
      };

      const generator = imageGenerator as any;
      const selectedModel = generator.selectModelForContent(content);
      
      expect(selectedModel).toBeDefined();
      expect(selectedModel.type).toBe('text-heavy');
    });

    it('should select photorealistic model for product content', () => {
      const content: OptimizedContent = {
        title: 'Best Camera for Photography Review',
        description: 'Detailed review of the latest camera product',
        hashtags: ['product', 'review', 'camera'],
        contentType: 'product',
      };

      const generator = imageGenerator as any;
      const selectedModel = generator.selectModelForContent(content);
      
      expect(selectedModel).toBeDefined();
      expect(selectedModel.type).toBe('photorealistic');
    });

    it('should select typography model for quote content', () => {
      const content: OptimizedContent = {
        title: 'Inspirational Quote About Success',
        description: 'Motivational quote to inspire your day',
        hashtags: ['quote', 'inspiration', 'motivation'],
        contentType: 'other',
      };

      const generator = imageGenerator as any;
      const selectedModel = generator.selectModelForContent(content);
      
      expect(selectedModel).toBeDefined();
      expect(selectedModel.type).toBe('typography');
    });

    it('should return null for generic content (triggering random selection)', () => {
      const content: OptimizedContent = {
        title: 'General Article Title',
        description: 'General article description',
        hashtags: ['article', 'general'],
        contentType: 'article',
      };

      const generator = imageGenerator as any;
      const selectedModel = generator.selectModelForContent(content);
      
      expect(selectedModel).toBeNull();
    });
  });

  describe('Weighted random selection', () => {
    it('should select a model using weighted random selection', () => {
      const generator = imageGenerator as any;
      const selectedModel = generator.selectRandomModel();
      
      expect(selectedModel).toBeDefined();
      expect(['fal-ai/flux/dev', 'fal-ai/qwen-image', 'fal-ai/ideogram/v2'])
        .toContain(selectedModel.id);
    });

    it('should respect model weights over multiple selections', () => {
      const generator = imageGenerator as any;
      const selections: Record<string, number> = {};
      
      // Run many selections to test weight distribution
      for (let i = 0; i < 1000; i++) {
        const model = generator.selectRandomModel();
        selections[model.id] = (selections[model.id] || 0) + 1;
      }
      
      // FLUX should be selected most often (40% weight)
      expect(selections['fal-ai/flux/dev']).toBeGreaterThan(selections['fal-ai/qwen-image']);
      expect(selections['fal-ai/flux/dev']).toBeGreaterThan(selections['fal-ai/ideogram/v2']);
      
      // All models should be selected at least once
      expect(selections['fal-ai/flux/dev']).toBeGreaterThan(0);
      expect(selections['fal-ai/qwen-image']).toBeGreaterThan(0);
      expect(selections['fal-ai/ideogram/v2']).toBeGreaterThan(0);
    });
  });

  describe('Prompt generation', () => {
    it('should generate FLUX-optimized prompt for photorealistic content', async () => {
      const content: OptimizedContent = {
        title: 'Delicious Homemade Pizza',
        description: 'Perfect recipe for pizza night',
        hashtags: ['recipe', 'pizza', 'homemade'],
        contentType: 'recipe',
      };

      const generator = imageGenerator as any;
      const mockGet = vi.fn().mockResolvedValue(null); // No cached prompt
      generator.cache = { get: mockGet };

      const model = { id: 'fal-ai/flux/dev', type: 'photorealistic' };
      const prompt = await generator.generatePrompt(content, model);
      
      expect(prompt).toContain('Delicious Homemade Pizza');
      expect(prompt).toContain('ultra realistic');
      expect(prompt).toContain('professional photography');
      expect(prompt).toContain('8k resolution');
      expect(prompt).toContain('Pinterest optimized');
    });

    it('should generate Qwen-optimized prompt for text-heavy content', async () => {
      const content: OptimizedContent = {
        title: 'How to Learn Programming',
        description: 'Step by step guide for beginners',
        hashtags: ['howto', 'programming', 'tutorial'],
        contentType: 'howto',
      };

      const generator = imageGenerator as any;
      const mockGet = vi.fn().mockResolvedValue(null);
      generator.cache = { get: mockGet };

      const model = { id: 'fal-ai/qwen-image', type: 'text-heavy' };
      const prompt = await generator.generatePrompt(content, model);
      
      expect(prompt).toContain('How to Learn Programming');
      expect(prompt).toContain('clear text rendering');
      expect(prompt).toContain('step-by-step infographic');
      expect(prompt).toContain('Pinterest vertical format');
    });

    it('should generate Ideogram-optimized prompt for typography content', async () => {
      const content: OptimizedContent = {
        title: 'Success Quote',
        description: 'Inspirational quote design',
        hashtags: ['quote', 'inspiration', 'design'],
        contentType: 'other',
      };

      const generator = imageGenerator as any;
      const mockGet = vi.fn().mockResolvedValue(null);
      generator.cache = { get: mockGet };

      const model = { id: 'fal-ai/ideogram/v2', type: 'typography' };
      const prompt = await generator.generatePrompt(content, model);
      
      expect(prompt).toContain('Success Quote');
      expect(prompt).toContain('modern graphic design');
      expect(prompt).toContain('bold typography');
      expect(prompt).toContain('Pinterest aesthetic');
    });

    it('should use cached prompt template when available', async () => {
      const content: OptimizedContent = {
        title: 'Test Title',
        description: 'Test description',
        hashtags: [],
        contentType: 'recipe',
      };

      const cachedTemplate = 'Cached template for {title} - {description}';
      const generator = imageGenerator as any;
      const mockGet = vi.fn().mockResolvedValue(cachedTemplate);
      generator.cache = { get: mockGet };

      const model = { id: 'fal-ai/flux/dev', type: 'photorealistic' };
      const prompt = await generator.generatePrompt(content, model);
      
      expect(prompt).toBe('Cached template for Test Title - Test description');
    });
  });

  describe('Image generation', () => {
    it('should successfully generate image with primary model', async () => {
      const content: OptimizedContent = {
        title: 'Test Recipe',
        description: 'A delicious test recipe',
        hashtags: ['recipe', 'test'],
        contentType: 'recipe',
      };

      // Mock successful fal.ai API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          images: [{ url: 'https://example.com/generated-image.jpg' }],
        }),
      });

      // Mock database and cache methods
      const generator = imageGenerator as any;
      const mockCacheGet = vi.fn().mockResolvedValue(null);
      const mockCachePut = vi.fn().mockResolvedValue(undefined);
      const mockRecordPerformance = vi.fn().mockResolvedValue(undefined);
      const mockSavePromptTemplate = vi.fn().mockResolvedValue(undefined);

      generator.cache = { get: mockCacheGet, put: mockCachePut };
      generator.db = { 
        recordModelPerformance: mockRecordPerformance,
        savePromptTemplate: mockSavePromptTemplate,
      };

      const result = await imageGenerator.generateImage(content);

      expect(result.success).toBe(true);
      expect(result.imageUrl).toBe('https://example.com/generated-image.jpg');
      expect(result.model).toBeDefined();
      expect(result.prompt).toBeDefined();
      expect(result.generationTime).toBeGreaterThan(0);
      expect(result.cost).toBeGreaterThan(0);
    });

    it('should fallback to secondary model on primary failure', async () => {
      const content: OptimizedContent = {
        title: 'Test Recipe',
        description: 'A delicious test recipe',
        hashtags: ['recipe', 'test'],
        contentType: 'recipe',
      };

      // Mock primary model failure, then success with fallback
      mockFetch
        .mockRejectedValueOnce(new Error('Primary model failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            images: [{ url: 'https://example.com/fallback-image.jpg' }],
          }),
        });

      const generator = imageGenerator as any;
      const mockCacheGet = vi.fn().mockResolvedValue(null);
      const mockCachePut = vi.fn().mockResolvedValue(undefined);
      const mockRecordPerformance = vi.fn().mockResolvedValue(undefined);
      const mockSavePromptTemplate = vi.fn().mockResolvedValue(undefined);

      generator.cache = { get: mockCacheGet, put: mockCachePut };
      generator.db = { 
        recordModelPerformance: mockRecordPerformance,
        savePromptTemplate: mockSavePromptTemplate,
      };

      const result = await imageGenerator.generateImage(content);

      expect(result.success).toBe(true);
      expect(result.imageUrl).toBe('https://example.com/fallback-image.jpg');
      expect(mockRecordPerformance).toHaveBeenCalledTimes(2); // Failed + successful
    });

    it('should return failure when all models fail', async () => {
      const content: OptimizedContent = {
        title: 'Test Recipe',
        description: 'A delicious test recipe',
        hashtags: ['recipe', 'test'],
        contentType: 'recipe',
      };

      // Mock all models failing
      mockFetch.mockRejectedValue(new Error('All models failed'));

      const generator = imageGenerator as any;
      const mockCacheGet = vi.fn().mockResolvedValue(null);
      const mockRecordPerformance = vi.fn().mockResolvedValue(undefined);

      generator.cache = { get: mockCacheGet };
      generator.db = { recordModelPerformance: mockRecordPerformance };

      const result = await imageGenerator.generateImage(content);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.imageUrl).toBeUndefined();
    });
  });

  describe('Cost calculation', () => {
    it('should calculate cost correctly based on model and dimensions', () => {
      const generator = imageGenerator as any;
      const model = {
        id: 'fal-ai/flux/dev',
        costPerMegapixel: 0.025,
        weight: 0.4,
        strengths: ['photorealistic'],
        type: 'photorealistic' as const,
      };

      const cost = generator.calculateCost(model, 1000, 1500);
      
      // 1000 x 1500 = 1,500,000 pixels = 1.5 megapixels
      // 1.5 * 0.025 = 0.0375
      expect(cost).toBe(0.0375);
    });

    it('should calculate different costs for different models', () => {
      const generator = imageGenerator as any;
      
      const fluxModel = {
        costPerMegapixel: 0.025,
        weight: 0.4,
        strengths: ['photorealistic'],
        type: 'photorealistic' as const,
      };

      const qwenModel = {
        costPerMegapixel: 0.020,
        weight: 0.3,
        strengths: ['text-heavy'],
        type: 'text-heavy' as const,
      };

      const fluxCost = generator.calculateCost(fluxModel, 1000, 1500);
      const qwenCost = generator.calculateCost(qwenModel, 1000, 1500);

      expect(fluxCost).toBeGreaterThan(qwenCost);
      expect(fluxCost).toBe(0.0375);
      expect(qwenCost).toBe(0.030);
    });
  });
});