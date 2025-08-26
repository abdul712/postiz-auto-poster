import type { Env, ImageModel, OptimizedContent, ImageGenerationResponse } from '../types/index.js';
import { withRetry, IMAGE_GENERATION_RETRY_CONFIG } from '../utils/retry.js';
import { DatabaseStorage, KVStorage } from '../utils/storage.js';

/**
 * Multi-model AI image generator using fal.ai
 */
export class ImageGenerator {
  private db: DatabaseStorage;
  private cache: KVStorage;
  private models: ImageModel[];

  constructor(private env: Env) {
    this.db = new DatabaseStorage(env.DB);
    this.cache = new KVStorage(env.PROMPTS, 86400 * 7); // 7 day cache for prompts

    // Define available image generation models with weights
    this.models = [
      {
        id: 'fal-ai/flux/dev',
        weight: 0.4, // 40% of generations
        strengths: ['photorealistic', 'landscapes', 'products', 'lifestyle'],
        costPerMegapixel: 0.025,
        type: 'photorealistic',
      },
      {
        id: 'fal-ai/qwen-image',
        weight: 0.3, // 30% of generations
        strengths: ['text-rendering', 'quotes', 'infographics', 'howto'],
        costPerMegapixel: 0.020,
        type: 'text-heavy',
      },
      {
        id: 'fal-ai/ideogram/v2',
        weight: 0.3, // 30% of generations
        strengths: ['typography', 'logos', 'posters', 'graphic-design'],
        costPerMegapixel: 0.030,
        type: 'typography',
      },
    ];
  }

  /**
   * Generate an image based on optimized content
   */
  async generateImage(content: OptimizedContent, preferredModel?: string): Promise<ImageGenerationResponse> {
    console.log(`Generating image for content: ${content.title}`);

    const startTime = Date.now();
    let selectedModel = preferredModel ? 
      this.models.find(m => m.id === preferredModel) : 
      this.selectModelForContent(content);

    if (!selectedModel) {
      selectedModel = this.selectRandomModel();
    }

    console.log(`Selected model: ${selectedModel.id} (${selectedModel.type})`);

    try {
      // Generate optimized prompt for the selected model
      const prompt = await this.generatePrompt(content, selectedModel);
      
      // Generate image
      const result = await this.callFalApi(selectedModel.id, prompt);
      
      const generationTime = Date.now() - startTime;
      const cost = this.calculateCost(selectedModel, 1000, 1500); // Pinterest size

      // Record performance metrics
      await this.recordModelPerformance(selectedModel.id, generationTime, cost, true);

      // Cache successful prompt
      await this.cacheSuccessfulPrompt(selectedModel.id, content.contentType, prompt);

      return {
        success: true,
        imageUrl: result.imageUrl,
        model: selectedModel.id,
        prompt,
        generationTime,
        cost,
      };

    } catch (error) {
      const generationTime = Date.now() - startTime;
      console.error(`Image generation failed with ${selectedModel.id}:`, error);

      // Record failed performance
      await this.recordModelPerformance(selectedModel.id, generationTime, 0, false);

      // Try fallback models
      const fallbackModels = this.models.filter(m => m.id !== selectedModel.id);
      for (const fallbackModel of fallbackModels) {
        console.log(`Trying fallback model: ${fallbackModel.id}`);
        
        try {
          const fallbackPrompt = await this.generatePrompt(content, fallbackModel);
          const fallbackResult = await this.callFalApi(fallbackModel.id, fallbackPrompt);
          
          const fallbackTime = Date.now() - startTime;
          const fallbackCost = this.calculateCost(fallbackModel, 1000, 1500);

          await this.recordModelPerformance(fallbackModel.id, fallbackTime, fallbackCost, true);
          await this.cacheSuccessfulPrompt(fallbackModel.id, content.contentType, fallbackPrompt);

          return {
            success: true,
            imageUrl: fallbackResult.imageUrl,
            model: fallbackModel.id,
            prompt: fallbackPrompt,
            generationTime: fallbackTime,
            cost: fallbackCost,
          };

        } catch (fallbackError) {
          console.error(`Fallback model ${fallbackModel.id} also failed:`, fallbackError);
          await this.recordModelPerformance(fallbackModel.id, Date.now() - startTime, 0, false);
        }
      }

      // All models failed
      return {
        success: false,
        model: selectedModel.id,
        prompt: '',
        generationTime: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Select model based on content type and characteristics
   */
  private selectModelForContent(content: OptimizedContent): ImageModel | null {
    const { contentType, title, description } = content;
    const text = `${title} ${description}`.toLowerCase();

    // Content-based model selection logic
    if (contentType === 'howto' || text.includes('how to') || text.includes('tutorial')) {
      return this.models.find(m => m.type === 'text-heavy'); // Qwen for text-heavy content
    }

    if (contentType === 'recipe' && (text.includes('ingredients') || text.includes('steps'))) {
      return this.models.find(m => m.type === 'text-heavy'); // Qwen for recipe instructions
    }

    if (contentType === 'product' || text.includes('review') || text.includes('product')) {
      return this.models.find(m => m.type === 'photorealistic'); // FLUX for product photos
    }

    if (text.includes('quote') || text.includes('inspiration') || text.includes('motivation')) {
      return this.models.find(m => m.type === 'typography'); // Ideogram for quotes
    }

    // Default to weighted random selection
    return null;
  }

  /**
   * Select model using weighted random selection
   */
  private selectRandomModel(): ImageModel {
    const random = Math.random();
    let cumulativeWeight = 0;

    for (const model of this.models) {
      cumulativeWeight += model.weight;
      if (random <= cumulativeWeight) {
        return model;
      }
    }

    // Fallback to first model
    return this.models[0]!;
  }

  /**
   * Generate optimized prompt for specific model
   */
  private async generatePrompt(content: OptimizedContent, model: ImageModel): Promise<string> {
    const cacheKey = `prompt:${model.id}:${content.contentType}`;
    
    // Try to get cached successful prompt template
    const cachedTemplate = await this.cache.get<string>(cacheKey);
    if (cachedTemplate) {
      return this.customizePrompt(cachedTemplate, content);
    }

    // Generate new prompt based on model type
    let basePrompt = '';
    const { title, description, contentType } = content;

    switch (model.type) {
      case 'photorealistic':
        basePrompt = this.generateFluxPrompt(title, description, contentType);
        break;
      case 'text-heavy':
        basePrompt = this.generateQwenPrompt(title, description, contentType);
        break;
      case 'typography':
        basePrompt = this.generateIdeogramPrompt(title, description, contentType);
        break;
    }

    return basePrompt;
  }

  /**
   * Generate FLUX.1 dev optimized prompt (photorealistic)
   */
  private generateFluxPrompt(title: string, description: string, contentType: string): string {
    const baseElements = [
      'ultra realistic',
      'professional photography',
      '8k resolution',
      'high quality',
      'detailed',
    ];

    let sceneDescription = '';
    switch (contentType) {
      case 'recipe':
        sceneDescription = 'beautifully plated food, professional food photography, appetizing, clean background';
        break;
      case 'lifestyle':
        sceneDescription = 'modern lifestyle scene, bright natural lighting, contemporary setting';
        break;
      case 'product':
        sceneDescription = 'product showcase, clean minimal background, professional product photography';
        break;
      case 'howto':
        sceneDescription = 'hands demonstrating process, clear step-by-step visual, instructional photography';
        break;
      default:
        sceneDescription = 'visually appealing scene related to the topic';
    }

    const colorScheme = this.env.BRAND_COLORS ? 
      `incorporating brand colors: ${this.env.BRAND_COLORS}` : 
      'vibrant colors that work well on Pinterest';

    return `${title} - ${sceneDescription}, ${baseElements.join(', ')}, ${colorScheme}, Pinterest optimized aspect ratio, professional composition`;
  }

  /**
   * Generate Qwen-Image optimized prompt (text-heavy)
   */
  private generateQwenPrompt(title: string, description: string, contentType: string): string {
    const textElements = [
      'clear text rendering',
      'readable typography',
      'high contrast text',
      'professional design',
    ];

    let layoutDescription = '';
    switch (contentType) {
      case 'howto':
        layoutDescription = 'step-by-step infographic layout, numbered steps, clear instructions';
        break;
      case 'recipe':
        layoutDescription = 'recipe card design, ingredient list, cooking instructions';
        break;
      case 'article':
        layoutDescription = 'article preview design, headline and summary text';
        break;
      default:
        layoutDescription = 'informative text layout, well-organized information';
    }

    const fontStyle = this.env.BRAND_FONTS ? 
      `using fonts: ${this.env.BRAND_FONTS}` : 
      'modern readable fonts';

    return `"${title}" - ${layoutDescription}, ${textElements.join(', ')}, ${fontStyle}, Pinterest vertical format, engaging visual hierarchy`;
  }

  /**
   * Generate Ideogram V2 optimized prompt (typography)
   */
  private generateIdeogramPrompt(title: string, description: string, contentType: string): string {
    const designElements = [
      'modern graphic design',
      'bold typography',
      'Pinterest aesthetic',
      'professional layout',
      'eye-catching design',
    ];

    let styleDescription = '';
    if (title.includes('quote') || description.includes('quote')) {
      styleDescription = 'inspirational quote design, motivational poster style';
    } else if (contentType === 'howto') {
      styleDescription = 'tutorial poster design, step-by-step visual guide';
    } else {
      styleDescription = 'modern poster design, informative and visually appealing';
    }

    return `"${title}" - ${styleDescription}, ${designElements.join(', ')}, vertical Pinterest format, high impact visual design`;
  }

  /**
   * Customize prompt template with specific content
   */
  private customizePrompt(template: string, content: OptimizedContent): string {
    return template
      .replace(/\{title\}/g, content.title)
      .replace(/\{description\}/g, content.description || '')
      .replace(/\{contentType\}/g, content.contentType);
  }

  /**
   * Call fal.ai API for image generation
   */
  private async callFalApi(modelId: string, prompt: string): Promise<{ imageUrl: string }> {
    return withRetry(async () => {
      const response = await fetch(`https://fal.run/${modelId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${this.env.FAL_API_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          image_size: 'portrait_4_5', // Pinterest optimal 4:5 aspect ratio
          num_images: 1,
          enable_safety_checker: true,
          output_format: 'jpeg',
          output_quality: 95,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`fal.ai API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.images || data.images.length === 0) {
        throw new Error('No images generated by fal.ai');
      }

      return {
        imageUrl: data.images[0].url,
      };

    }, IMAGE_GENERATION_RETRY_CONFIG, `falApi(${modelId})`);
  }

  /**
   * Calculate generation cost based on model and image size
   */
  private calculateCost(model: ImageModel, width: number, height: number): number {
    const megapixels = (width * height) / 1_000_000;
    return megapixels * model.costPerMegapixel;
  }

  /**
   * Record model performance for optimization
   */
  private async recordModelPerformance(
    modelId: string, 
    generationTime: number, 
    cost: number, 
    success: boolean
  ): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      await this.db.recordModelPerformance({
        model_id: modelId,
        date: today,
        total_generations: 1,
        successful_generations: success ? 1 : 0,
        average_generation_time: generationTime,
        total_cost: cost,
        average_engagement: 0, // Will be updated later based on actual post performance
      });

    } catch (error) {
      console.error('Failed to record model performance:', error);
    }
  }

  /**
   * Cache successful prompt for reuse
   */
  private async cacheSuccessfulPrompt(modelId: string, contentType: string, prompt: string): Promise<void> {
    try {
      const cacheKey = `prompt:${modelId}:${contentType}`;
      await this.cache.put(cacheKey, prompt);

      // Also save to database prompt library
      await this.db.savePromptTemplate({
        model_id: modelId,
        content_type: contentType,
        prompt_template: prompt,
        success_rate: 1.0,
        usage_count: 1,
      });

    } catch (error) {
      console.error('Failed to cache successful prompt:', error);
    }
  }

  /**
   * Get model performance statistics
   */
  async getModelStats(): Promise<Array<{
    modelId: string;
    totalGenerations: number;
    successRate: number;
    avgGenerationTime: number;
    totalCost: number;
  }>> {
    // This would require a database query to aggregate performance data
    // Implementation would depend on the specific analytics needs
    return [];
  }

  /**
   * Update model weights based on performance
   */
  async optimizeModelWeights(): Promise<void> {
    // Get recent performance data and adjust model weights
    // This is an advanced feature that could be implemented to
    // automatically optimize model selection based on success rates
    console.log('Model weight optimization not yet implemented');
  }
}