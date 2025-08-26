import type { Env, OptimizedContent, GeneratedPin } from '../types/index.js';
import { withRetry, API_RETRY_CONFIG } from '../utils/retry.js';
import { DatabaseStorage } from '../utils/storage.js';
import { addHours, addDays, format, isWeekend } from 'date-fns';

/**
 * Postiz scheduler for Pinterest posts with optimal timing
 */
export class PostizScheduler {
  private db: DatabaseStorage;
  private optimalHours: number[];
  private postsPerDay: number;
  private minGapMinutes: number;

  constructor(private env: Env) {
    this.db = new DatabaseStorage(env.DB);
    
    // Parse posting configuration from environment
    this.postsPerDay = parseInt(env.POSTS_PER_DAY || '5', 10);
    this.minGapMinutes = 60; // Minimum 1 hour gap between posts
    
    // Parse optimal posting hours (default: 9, 12, 15, 18, 21)
    this.optimalHours = env.POSTING_HOURS
      ? env.POSTING_HOURS.split(',').map(h => parseInt(h.trim(), 10))
      : [9, 12, 15, 18, 21];
  }

  /**
   * Schedule a pin for optimal posting time
   */
  async schedulePin(
    pinId: number,
    content: OptimizedContent,
    imageUrl: string,
    sourceUrl: string
  ): Promise<{ success: boolean; scheduledTime?: Date; postizId?: string; error?: string }> {
    console.log(`Scheduling pin ${pinId} for posting`);

    try {
      // Find optimal posting time
      const scheduledTime = await this.findOptimalPostingTime();
      
      // Create Postiz post
      const postizResponse = await this.createPostizPost(content, imageUrl, scheduledTime);
      
      if (!postizResponse.success) {
        return {
          success: false,
          error: postizResponse.error || 'Failed to create Postiz post',
        };
      }

      // Update pin record with scheduling info
      await this.db.updateGeneratedPin(pinId, {
        postiz_id: postizResponse.postId,
        scheduled_for: scheduledTime.toISOString(),
        status: 'scheduled',
      });

      console.log(`Successfully scheduled pin ${pinId} for ${format(scheduledTime, 'yyyy-MM-dd HH:mm')}`);

      return {
        success: true,
        scheduledTime,
        postizId: postizResponse.postId,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error scheduling pin ${pinId}:`, errorMessage);

      // Update pin with error status
      await this.db.updateGeneratedPin(pinId, {
        status: 'failed',
        error_message: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Create post in Postiz
   */
  private async createPostizPost(
    content: OptimizedContent,
    imageUrl: string,
    scheduledTime: Date
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    return withRetry(async () => {
      // Format content for Pinterest
      const postContent = this.formatContentForPinterest(content);
      
      const response = await fetch('https://api.postiz.com/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.POSTIZ_API_KEY}`,
        },
        body: JSON.stringify({
          content: postContent,
          platforms: ['pinterest'],
          scheduleTime: scheduledTime.toISOString(),
          mediaUrls: [imageUrl],
          pinterest: {
            boardId: this.env.PINTEREST_BOARD_ID,
            title: content.title,
            description: content.description,
            link: '', // We could add the source URL here if desired
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Postiz API error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Postiz API returned error: ${data.error || 'Unknown error'}`);
      }

      return {
        success: true,
        postId: data.postId,
      };

    }, API_RETRY_CONFIG, 'createPostizPost');
  }

  /**
   * Format content for Pinterest posting
   */
  private formatContentForPinterest(content: OptimizedContent): string {
    const { title, description, hashtags } = content;
    
    // Combine title and description
    let formattedContent = `${title}\n\n${description}`;
    
    // Add hashtags (Pinterest supports up to 30)
    if (hashtags.length > 0) {
      const hashtagString = hashtags
        .slice(0, 30)
        .map(tag => `#${tag}`)
        .join(' ');
      
      formattedContent += `\n\n${hashtagString}`;
    }
    
    // Ensure content doesn't exceed Pinterest's limits (500 chars for description)
    if (formattedContent.length > 500) {
      formattedContent = formattedContent.substring(0, 497) + '...';
    }
    
    return formattedContent;
  }

  /**
   * Find optimal posting time avoiding conflicts
   */
  private async findOptimalPostingTime(): Promise<Date> {
    const now = new Date();
    let targetDate = new Date(now);
    
    // Start from next optimal hour
    targetDate = this.getNextOptimalTime(targetDate);
    
    // Check for conflicts and find next available slot
    let attempts = 0;
    const maxAttempts = 50; // Prevent infinite loop
    
    while (attempts < maxAttempts) {
      const isSlotAvailable = await this.isTimeSlotAvailable(targetDate);
      
      if (isSlotAvailable) {
        return targetDate;
      }
      
      // Move to next optimal time
      targetDate = this.getNextOptimalTime(addHours(targetDate, 1));
      attempts++;
    }
    
    // Fallback: schedule for tomorrow at the first optimal hour
    const tomorrow = addDays(now, 1);
    tomorrow.setHours(this.optimalHours[0]!, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Get next optimal posting time
   */
  private getNextOptimalTime(from: Date): Date {
    const target = new Date(from);
    const currentHour = target.getHours();
    
    // Find next optimal hour today
    const nextHourToday = this.optimalHours.find(hour => hour > currentHour);
    
    if (nextHourToday) {
      target.setHours(nextHourToday, 0, 0, 0);
      return target;
    }
    
    // Move to next day, first optimal hour
    const nextDay = addDays(target, 1);
    nextDay.setHours(this.optimalHours[0]!, 0, 0, 0);
    
    // Skip weekends if configured (Pinterest is actually good on weekends, so we won't skip)
    return nextDay;
  }

  /**
   * Check if time slot is available (no other posts scheduled within minimum gap)
   */
  private async isTimeSlotAvailable(targetTime: Date): Promise<boolean> {
    const gapStart = addHours(targetTime, -1); // 1 hour before
    const gapEnd = addHours(targetTime, 1); // 1 hour after
    
    try {
      // Query for existing scheduled posts in the time window
      const conflictingPosts = await this.db.getScheduledPins(100); // Get a reasonable batch
      
      const conflicts = conflictingPosts.filter(pin => {
        if (!pin.scheduled_for) return false;
        
        const scheduledTime = new Date(pin.scheduled_for);
        return scheduledTime >= gapStart && scheduledTime <= gapEnd;
      });
      
      return conflicts.length === 0;

    } catch (error) {
      console.error('Error checking time slot availability:', error);
      return false; // Conservative approach - assume slot is not available on error
    }
  }

  /**
   * Get posting schedule statistics
   */
  async getScheduleStats(): Promise<{
    totalScheduled: number;
    postsToday: number;
    postsThisWeek: number;
    nextAvailableSlot: Date;
    averageGapHours: number;
  }> {
    try {
      const scheduledPins = await this.db.getScheduledPins(200);
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - now.getDay()); // Start of week
      
      const postsToday = scheduledPins.filter(pin => 
        pin.scheduled_for && format(new Date(pin.scheduled_for), 'yyyy-MM-dd') === today
      ).length;
      
      const postsThisWeek = scheduledPins.filter(pin => 
        pin.scheduled_for && new Date(pin.scheduled_for) >= thisWeekStart
      ).length;
      
      const nextAvailableSlot = await this.findOptimalPostingTime();
      
      // Calculate average gap between posts
      const sortedPosts = scheduledPins
        .filter(pin => pin.scheduled_for)
        .map(pin => new Date(pin.scheduled_for!))
        .sort((a, b) => a.getTime() - b.getTime());
      
      let totalGapHours = 0;
      let gapCount = 0;
      
      for (let i = 1; i < sortedPosts.length; i++) {
        const gap = (sortedPosts[i]!.getTime() - sortedPosts[i - 1]!.getTime()) / (1000 * 60 * 60);
        totalGapHours += gap;
        gapCount++;
      }
      
      const averageGapHours = gapCount > 0 ? totalGapHours / gapCount : 0;
      
      return {
        totalScheduled: scheduledPins.length,
        postsToday,
        postsThisWeek,
        nextAvailableSlot,
        averageGapHours: Math.round(averageGapHours * 100) / 100,
      };

    } catch (error) {
      console.error('Error getting schedule stats:', error);
      return {
        totalScheduled: 0,
        postsToday: 0,
        postsThisWeek: 0,
        nextAvailableSlot: new Date(),
        averageGapHours: 0,
      };
    }
  }

  /**
   * Cancel a scheduled post
   */
  async cancelScheduledPost(pinId: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Get the pin details
      const pins = await this.db.getScheduledPins(1000);
      const pin = pins.find(p => p.id === pinId);
      
      if (!pin || !pin.postiz_id) {
        return {
          success: false,
          error: 'Pin not found or not scheduled',
        };
      }

      // Cancel in Postiz
      const cancelResult = await this.cancelPostizPost(pin.postiz_id);
      
      if (!cancelResult.success) {
        return cancelResult;
      }

      // Update pin status
      await this.db.updateGeneratedPin(pinId, {
        status: 'cancelled',
      });

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error cancelling scheduled post ${pinId}:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Cancel post in Postiz
   */
  private async cancelPostizPost(postizId: string): Promise<{ success: boolean; error?: string }> {
    return withRetry(async () => {
      const response = await fetch(`https://api.postiz.com/posts/${postizId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.env.POSTIZ_API_KEY}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Failed to cancel Postiz post: ${response.status} - ${errorData.error}`);
      }

      return { success: true };

    }, API_RETRY_CONFIG, 'cancelPostizPost');
  }

  /**
   * Reschedule a post to a different time
   */
  async reschedulePost(pinId: number, newTime: Date): Promise<{ success: boolean; error?: string }> {
    try {
      // Cancel current schedule
      const cancelResult = await this.cancelScheduledPost(pinId);
      if (!cancelResult.success) {
        return cancelResult;
      }

      // Get pin data for rescheduling
      const pins = await this.db.getScheduledPins(1000);
      const pin = pins.find(p => p.id === pinId);
      
      if (!pin) {
        return {
          success: false,
          error: 'Pin not found',
        };
      }

      // Create new schedule
      const content: OptimizedContent = {
        title: pin.title,
        description: pin.description || '',
        hashtags: [], // We'd need to store hashtags separately to reschedule
        contentType: 'other', // We'd need to store content type to reschedule
      };

      const scheduleResult = await this.schedulePin(pinId, content, pin.image_url || '', pin.source_url);
      
      return {
        success: scheduleResult.success,
        error: scheduleResult.error,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Update posting frequency based on performance
   */
  async optimizePostingFrequency(): Promise<void> {
    // This could analyze engagement metrics and adjust posting frequency
    // Implementation would require integration with Pinterest Analytics
    console.log('Posting frequency optimization not yet implemented');
  }
}