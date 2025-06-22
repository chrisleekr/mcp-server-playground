import Valkey from 'iovalkey';

import { StorageValkeyConfig } from '@/config/type';
import { loggingContext } from '@/core/server/http/context';

import { Storage } from './types';

export class ValkeyStorage implements Storage {
  private client: Valkey;

  constructor(config: StorageValkeyConfig) {
    try {
      this.client = new Valkey(config.url);
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to create Valkey client', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl !== undefined) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await this.client.del(key);
    return deleted > 0;
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  async keys(pattern: string): Promise<string[]> {
    const keys = await this.client.keys(pattern);
    return keys.map(key => key.replace(pattern, ''));
  }
}
