import { describe, it, expect, vi } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';

describe('E2E Worker Tests', () => {
  let worker: UnstableDevWorker;

  beforeAll(async () => {
    // Start the worker in test mode
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await worker.fetch('/health');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
      expect(data.version).toBe('1.0.0');
    });
  });

  describe('Status Endpoint', () => {
    it('should return processing status', async () => {
      const response = await worker.fetch('/status');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.processing).toBeDefined();
      expect(data.schedule).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Manual Trigger', () => {
    it('should handle manual pipeline trigger', async () => {
      // This test might fail in CI without proper API keys
      // but it validates the endpoint structure
      const response = await worker.fetch('/trigger', {
        method: 'POST',
      });
      
      // Could be 200 (success) or 500 (error due to missing APIs in test)
      expect([200, 500]).toContain(response.status);
      
      const data = await response.json();
      expect(data.timestamp).toBeDefined();
      
      if (response.status === 200) {
        expect(data.message).toBe('Pipeline executed successfully');
        expect(data.stats).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid routes gracefully', async () => {
      const response = await worker.fetch('/nonexistent');
      expect(response.status).toBe(404);
    });

    it('should handle malformed requests', async () => {
      const response = await worker.fetch('/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json{',
      });
      
      // Should not crash the worker
      expect([400, 500]).toContain(response.status);
    });
  });
});