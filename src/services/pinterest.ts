import type { Env, ScrapedContent, OptimizedContent } from '../types/index.js';
import { optimizedContentSchema } from '../schemas/validation.js';
import { KVStorage } from '../utils/storage.js';

/**
 * Pinterest content optimizer for maximum engagement
 */
export class PinterestOptimizer {
  private cache: KVStorage;
  private hashtagSets: Record<string, string[]>;

  constructor(private env: Env) {
    this.cache = new KVStorage(env.CACHE, 3600); // 1 hour cache
    
    // Pre-defined hashtag sets for different content types
    this.hashtagSets = {
      recipe: [
        'recipe', 'cooking', 'homemade', 'delicious', 'foodie', 'yummy',
        'dinner', 'lunch', 'breakfast', 'healthy', 'easy', 'quickrecipe',
        'homecooking', 'foodblog', 'tasty', 'mealprep', 'comfort food'
      ],
      howto: [
        'diy', 'howto', 'tutorial', 'tips', 'guide', 'stepbystep',
        'learn', 'skill', 'craft', 'handmade', 'creative', 'project',
        'instructions', 'technique', 'beginner', 'easy', 'simple'
      ],
      lifestyle: [
        'lifestyle', 'wellness', 'selfcare', 'motivation', 'inspiration',
        'mindfulness', 'health', 'fitness', 'productivity', 'goals',
        'happiness', 'mentalhealth', 'wellbeing', 'positivity', 'growth'
      ],
      product: [
        'review', 'product', 'recommendation', 'shopping', 'deal',
        'musthave', 'affiliate', 'purchase', 'quality', 'worth it',
        'comparison', 'honest review', 'tested', 'recommended'
      ],
      article: [
        'blog', 'article', 'read', 'information', 'learn', 'knowledge',
        'insights', 'tips', 'advice', 'expert', 'guide', 'resources',
        'content', 'educational', 'informative'
      ],
      other: [
        'pinterest', 'pinteresting', 'save', 'ideas', 'inspiration',
        'creative', 'discover', 'explore', 'trending', 'popular',
        'viral', 'share', 'love', 'amazing', 'beautiful'
      ]
    };
  }

  /**
   * Optimize scraped content for Pinterest
   */
  async optimizeContent(content: ScrapedContent): Promise<OptimizedContent> {
    console.log(`Optimizing content for Pinterest: ${content.title}`);

    // Check cache first
    const cacheKey = `optimized:${content.url}`;
    const cached = await this.cache.get<OptimizedContent>(cacheKey);
    if (cached) {
      console.log('Using cached optimized content');
      return cached;
    }

    try {
      const optimized = await this.performOptimization(content);
      
      // Validate the optimized content
      const validated = optimizedContentSchema.parse(optimized);
      
      // Cache the result
      await this.cache.put(cacheKey, validated);
      
      return validated;

    } catch (error) {
      console.error('Error optimizing content:', error);
      // Return a basic optimization as fallback
      return this.createFallbackOptimization(content);
    }
  }

  /**
   * Perform the actual content optimization
   */
  private async performOptimization(content: ScrapedContent): Promise<OptimizedContent> {
    const contentType = content.metadata?.category || 'other';
    
    // Optimize title for Pinterest
    const optimizedTitle = this.optimizeTitle(content.title);
    
    // Generate Pinterest-optimized description
    const optimizedDescription = this.generateDescription(content, contentType);
    
    // Generate relevant hashtags
    const hashtags = this.generateHashtags(content, contentType);

    return {
      title: optimizedTitle,
      description: optimizedDescription,
      hashtags,
      contentType: contentType as OptimizedContent['contentType'],
    };
  }

  /**
   * Optimize title for Pinterest engagement
   */
  private optimizeTitle(originalTitle: string): string {
    let title = originalTitle.trim();
    
    // Remove excessive punctuation
    title = title.replace(/[!]{2,}/g, '!').replace(/[?]{2,}/g, '?');
    
    // Add engagement-driving prefixes for certain content
    const engagementPrefixes = {
      recipe: ['Easy', 'Quick', 'Delicious', 'Perfect', 'Best Ever'],
      howto: ['How to', 'Easy Way to', 'Simple Steps to', 'Ultimate Guide to'],
      lifestyle: ['Transform Your', 'Discover the', 'The Secret to', 'Amazing Ways to'],
      product: ['Honest Review:', 'Must-Have:', 'Best', 'Top-Rated'],
    };

    // Add power words for engagement
    const powerWords = ['Ultimate', 'Essential', 'Amazing', 'Incredible', 'Perfect', 'Best'];
    
    // Limit title length for Pinterest optimization
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }

    return title;
  }

  /**
   * Generate Pinterest-optimized description
   */
  private generateDescription(content: ScrapedContent, contentType: string): string {
    const { title, description, metadata } = content;
    
    // Start with the original description or extract from content
    let desc = description || this.extractDescriptionFromContent(content.content || '');
    
    // Add context based on content type
    const contextAdditions = {
      recipe: 'Save this recipe for later! ',
      howto: 'Follow this step-by-step guide: ',
      lifestyle: 'Discover how to improve your lifestyle: ',
      product: 'Check out this honest review: ',
      article: 'Learn something new: ',
      other: 'Pin this for inspiration: ',
    };

    const context = contextAdditions[contentType as keyof typeof contextAdditions] || '';
    
    // Add call-to-action phrases
    const callToActions = [
      'Save for later!',
      'Pin this!',
      'Don\'t forget to save!',
      'Click to read more!',
      'Swipe to learn more!',
    ];
    
    const randomCTA = callToActions[Math.floor(Math.random() * callToActions.length)];
    
    // Combine elements
    let optimizedDesc = `${context}${desc}`;
    
    // Add author attribution if available
    if (metadata?.author) {
      optimizedDesc += ` | By ${metadata.author}`;
    }
    
    // Add CTA
    optimizedDesc += ` ${randomCTA}`;
    
    // Clean up and limit length
    optimizedDesc = this.cleanDescription(optimizedDesc);
    
    // Ensure it's within Pinterest's limits
    if (optimizedDesc.length > 500) {
      optimizedDesc = optimizedDesc.substring(0, 497) + '...';
    }
    
    return optimizedDesc;
  }

  /**
   * Extract description from content if none exists
   */
  private extractDescriptionFromContent(content: string): string {
    if (!content) return '';
    
    // Remove markdown formatting
    const cleanContent = content
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`([^`]+)`/g, '$1'); // Remove inline code
    
    // Find first substantial paragraph
    const paragraphs = cleanContent
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 30 && !p.startsWith('*') && !p.startsWith('-'));
    
    return paragraphs[0]?.substring(0, 200) || '';
  }

  /**
   * Clean and normalize description text
   */
  private cleanDescription(description: string): string {
    return description
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[\r\n\t]/g, ' ') // Remove line breaks
      .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Remove control characters
      .trim();
  }

  /**
   * Generate relevant hashtags for Pinterest
   */
  private generateHashtags(content: ScrapedContent, contentType: string): string[] {
    const hashtags = new Set<string>();
    const { title, description, metadata } = content;
    const text = `${title} ${description || ''}`.toLowerCase();
    
    // Add base hashtags for content type
    const baseHashtags = this.hashtagSets[contentType] || this.hashtagSets.other;
    baseHashtags.slice(0, 8).forEach(tag => hashtags.add(tag));
    
    // Add hashtags from metadata tags
    if (metadata?.tags) {
      metadata.tags.slice(0, 5).forEach(tag => {
        if (tag.length >= 3 && tag.length <= 20) {
          hashtags.add(tag.toLowerCase().replace(/\s+/g, ''));
        }
      });
    }
    
    // Extract hashtags from content
    const extractedHashtags = this.extractHashtagsFromText(text);
    extractedHashtags.forEach(tag => hashtags.add(tag));
    
    // Add trending/seasonal hashtags
    const seasonalHashtags = this.getSeasonalHashtags();
    seasonalHashtags.slice(0, 2).forEach(tag => hashtags.add(tag));
    
    // Convert to array and limit
    const finalHashtags = Array.from(hashtags)
      .filter(tag => tag.length >= 3 && tag.length <= 30)
      .slice(0, 30); // Pinterest allows up to 30 hashtags
    
    return finalHashtags;
  }

  /**
   * Extract potential hashtags from text content
   */
  private extractHashtagsFromText(text: string): string[] {
    const hashtags: string[] = [];
    
    // Common Pinterest-friendly keywords
    const keywords = [
      'diy', 'recipe', 'home', 'decor', 'fashion', 'beauty', 'fitness',
      'travel', 'wedding', 'party', 'gift', 'holiday', 'summer', 'winter',
      'healthy', 'easy', 'quick', 'simple', 'cheap', 'budget', 'free',
      'vintage', 'modern', 'rustic', 'minimalist', 'cozy', 'elegant'
    ];
    
    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        hashtags.push(keyword);
      }
    });
    
    return hashtags;
  }

  /**
   * Get seasonal/trending hashtags
   */
  private getSeasonalHashtags(): string[] {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    
    const seasonalMap: Record<number, string[]> = {
      12: ['winter', 'christmas', 'holiday', 'newyear'],
      1: ['winter', 'newyear', 'january', 'resolutions'],
      2: ['winter', 'valentine', 'february', 'love'],
      3: ['spring', 'march', 'easter', 'renewal'],
      4: ['spring', 'april', 'easter', 'fresh'],
      5: ['spring', 'may', 'mothers day', 'garden'],
      6: ['summer', 'june', 'graduation', 'fathers day'],
      7: ['summer', 'july', 'vacation', 'outdoor'],
      8: ['summer', 'august', 'vacation', 'back to school'],
      9: ['fall', 'september', 'autumn', 'back to school'],
      10: ['fall', 'october', 'halloween', 'autumn'],
      11: ['fall', 'november', 'thanksgiving', 'gratitude'],
    };
    
    return seasonalMap[month] || ['trending', 'popular'];
  }

  /**
   * Create fallback optimization if main optimization fails
   */
  private createFallbackOptimization(content: ScrapedContent): OptimizedContent {
    return {
      title: content.title.substring(0, 100),
      description: content.description?.substring(0, 200) || `Check out this interesting content: ${content.title}`,
      hashtags: ['pinterest', 'interesting', 'content', 'discover'],
      contentType: 'other',
    };
  }

  /**
   * A/B test different optimization strategies
   */
  async generateVariations(content: ScrapedContent, count: number = 2): Promise<OptimizedContent[]> {
    const variations: OptimizedContent[] = [];
    
    for (let i = 0; i < count; i++) {
      // Create slight variations in titles and descriptions
      const variation = await this.optimizeContent(content);
      
      // Modify for variation
      if (i === 1) {
        // Variation 1: More direct title
        variation.title = this.makeMoreDirect(variation.title);
        variation.description = this.makeShorterDescription(variation.description);
      }
      
      variations.push(variation);
    }
    
    return variations;
  }

  /**
   * Make title more direct and action-oriented
   */
  private makeMoreDirect(title: string): string {
    const actionWords = ['Get', 'Make', 'Create', 'Build', 'Learn', 'Discover'];
    const randomAction = actionWords[Math.floor(Math.random() * actionWords.length)];
    
    if (!title.toLowerCase().startsWith(randomAction!.toLowerCase())) {
      return `${randomAction}: ${title}`;
    }
    
    return title;
  }

  /**
   * Create shorter, punchier description
   */
  private makeShorterDescription(description: string): string {
    const sentences = description.split('.').filter(s => s.trim());
    if (sentences.length > 1) {
      return sentences[0]?.trim() + '.';
    }
    
    return description.substring(0, 150) + '...';
  }

  /**
   * Analyze content performance and optimize future content
   */
  async analyzePerformance(pinId: string, engagementScore: number): Promise<void> {
    // This would analyze what worked well and adjust optimization strategies
    console.log(`Analyzing performance for pin ${pinId}: ${engagementScore}`);
  }
}