import type { RetryConfig } from '../types/index.js';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
};

/**
 * Exponential backoff with jitter to avoid thundering herd
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
    config.maxDelay
  );
  
  // Add jitter (random ±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponentialDelay + jitter));
}

/**
 * Generic retry function with exponential backoff and jitter
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context: string = 'operation'
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on the last attempt
      if (attempt === config.maxAttempts) {
        break;
      }

      const delay = calculateDelay(attempt, config);
      
      console.warn(
        `${context} failed on attempt ${attempt}/${config.maxAttempts}. ` +
        `Retrying in ${delay}ms. Error: ${lastError.message}`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `${context} failed after ${config.maxAttempts} attempts. ` +
    `Last error: ${lastError!.message}`
  );
}

/**
 * Retry configuration for API calls
 */
export const API_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 2000,
  maxDelay: 10000,
  backoffFactor: 1.5,
};

/**
 * Retry configuration for database operations
 */
export const DB_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelay: 500,
  maxDelay: 5000,
  backoffFactor: 2,
};

/**
 * Retry configuration for image generation (longer delays due to processing time)
 */
export const IMAGE_GENERATION_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 2, // Fewer attempts due to cost
  baseDelay: 5000,
  maxDelay: 15000,
  backoffFactor: 2,
};

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const retryablePatterns = [
    /network/i,
    /timeout/i,
    /rate limit/i,
    /503/i,
    /502/i,
    /504/i,
    /connection/i,
    /temporary/i,
  ];

  return retryablePatterns.some(pattern => 
    pattern.test(error.message) || pattern.test(error.name)
  );
}

/**
 * Conditional retry - only retry if error is retryable
 */
export async function withConditionalRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context: string = 'operation'
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry if error is not retryable or on the last attempt
      if (!isRetryableError(lastError) || attempt === config.maxAttempts) {
        break;
      }

      const delay = calculateDelay(attempt, config);
      
      console.warn(
        `${context} failed on attempt ${attempt}/${config.maxAttempts} ` +
        `with retryable error. Retrying in ${delay}ms. Error: ${lastError.message}`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}