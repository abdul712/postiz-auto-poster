import type { Env } from '../types/index.js';

/**
 * Queue message types for different processing operations
 */
export interface QueueMessage {
  type: 'process_url' | 'generate_image' | 'schedule_pin' | 'cleanup';
  data: any;
  retryCount?: number;
  maxRetries?: number;
  createdAt: string;
}

export interface ProcessUrlMessage {
  type: 'process_url';
  data: {
    url: string;
    priority?: number;
  };
}

export interface GenerateImageMessage {
  type: 'generate_image';
  data: {
    pinId: number;
    content: {
      title: string;
      description: string;
      contentType: string;
    };
    modelPreference?: string;
  };
}

export interface SchedulePinMessage {
  type: 'schedule_pin';
  data: {
    pinId: number;
    scheduledTime: string;
  };
}

export interface CleanupMessage {
  type: 'cleanup';
  data: {
    operation: 'old_records' | 'failed_images' | 'expired_cache';
    params?: any;
  };
}

/**
 * Queue management utilities
 */
export class QueueManager {
  constructor(private queue: Queue) {}

  /**
   * Send a message to the processing queue
   */
  async sendMessage(message: QueueMessage): Promise<void> {
    const messageWithDefaults = {
      ...message,
      retryCount: message.retryCount || 0,
      maxRetries: message.maxRetries || 3,
      createdAt: message.createdAt || new Date().toISOString(),
    };

    await this.queue.send(messageWithDefaults);
  }

  /**
   * Send multiple messages in batch
   */
  async sendBatch(messages: QueueMessage[]): Promise<void> {
    const messagesWithDefaults = messages.map(message => ({
      ...message,
      retryCount: message.retryCount || 0,
      maxRetries: message.maxRetries || 3,
      createdAt: message.createdAt || new Date().toISOString(),
    }));

    await this.queue.sendBatch(messagesWithDefaults);
  }

  /**
   * Queue a URL for processing
   */
  async queueUrlProcessing(url: string, priority: number = 0): Promise<void> {
    const message: ProcessUrlMessage = {
      type: 'process_url',
      data: { url, priority },
    };

    await this.sendMessage(message);
  }

  /**
   * Queue image generation
   */
  async queueImageGeneration(
    pinId: number,
    content: { title: string; description: string; contentType: string },
    modelPreference?: string
  ): Promise<void> {
    const message: GenerateImageMessage = {
      type: 'generate_image',
      data: { pinId, content, modelPreference },
    };

    await this.sendMessage(message);
  }

  /**
   * Queue pin scheduling
   */
  async queuePinScheduling(pinId: number, scheduledTime: string): Promise<void> {
    const message: SchedulePinMessage = {
      type: 'schedule_pin',
      data: { pinId, scheduledTime },
    };

    await this.sendMessage(message);
  }

  /**
   * Queue cleanup operation
   */
  async queueCleanup(operation: 'old_records' | 'failed_images' | 'expired_cache', params?: any): Promise<void> {
    const message: CleanupMessage = {
      type: 'cleanup',
      data: { operation, params },
    };

    await this.sendMessage(message);
  }
}

/**
 * Queue consumer/processor
 */
export class QueueProcessor {
  constructor(
    private env: Env,
    private handlers: {
      processUrl?: (url: string, priority: number) => Promise<void>;
      generateImage?: (pinId: number, content: any, modelPreference?: string) => Promise<void>;
      schedulePin?: (pinId: number, scheduledTime: string) => Promise<void>;
      cleanup?: (operation: string, params?: any) => Promise<void>;
    }
  ) {}

  /**
   * Process a queue message
   */
  async processMessage(message: QueueMessage): Promise<void> {
    console.log(`Processing queue message: ${message.type}`);

    try {
      switch (message.type) {
        case 'process_url':
          if (this.handlers.processUrl) {
            await this.handlers.processUrl(message.data.url, message.data.priority || 0);
          }
          break;

        case 'generate_image':
          if (this.handlers.generateImage) {
            await this.handlers.generateImage(
              message.data.pinId,
              message.data.content,
              message.data.modelPreference
            );
          }
          break;

        case 'schedule_pin':
          if (this.handlers.schedulePin) {
            await this.handlers.schedulePin(message.data.pinId, message.data.scheduledTime);
          }
          break;

        case 'cleanup':
          if (this.handlers.cleanup) {
            await this.handlers.cleanup(message.data.operation, message.data.params);
          }
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }

      console.log(`Successfully processed message: ${message.type}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing message ${message.type}: ${errorMessage}`);

      // Check if we should retry
      const retryCount = message.retryCount || 0;
      const maxRetries = message.maxRetries || 3;

      if (retryCount < maxRetries) {
        console.log(`Retrying message ${message.type} (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Requeue with incremented retry count and exponential backoff delay
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30s delay
        
        setTimeout(async () => {
          const retryMessage = {
            ...message,
            retryCount: retryCount + 1,
          };
          
          const queueManager = new QueueManager(this.env.PROCESSING_QUEUE);
          await queueManager.sendMessage(retryMessage);
        }, delay);
      } else {
        console.error(`Message ${message.type} failed after ${maxRetries} attempts, giving up`);
        
        // Log to analytics for monitoring
        if (this.env.ANALYTICS) {
          this.env.ANALYTICS.writeDataPoint({
            blobs: ['queue_message_failed'],
            doubles: [1],
            indexes: [message.type],
          });
        }
      }

      throw error;
    }
  }

  /**
   * Process a batch of messages
   */
  async processBatch(messages: QueueMessage[]): Promise<void> {
    const promises = messages.map(message => this.processMessage(message));
    await Promise.allSettled(promises);
  }
}

/**
 * Priority queue implementation for message ordering
 */
export class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number = 0): void {
    const entry = { item, priority };
    
    // Insert in order of priority (higher priority first)
    let added = false;
    for (let i = 0; i < this.items.length; i++) {
      if (entry.priority > this.items[i]!.priority) {
        this.items.splice(i, 0, entry);
        added = true;
        break;
      }
    }
    
    if (!added) {
      this.items.push(entry);
    }
  }

  dequeue(): T | undefined {
    const entry = this.items.shift();
    return entry?.item;
  }

  peek(): T | undefined {
    return this.items[0]?.item;
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  clear(): void {
    this.items = [];
  }
}