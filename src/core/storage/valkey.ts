import Valkey from 'iovalkey';

import { type StorageValkeyConfig } from '@/config/type';
import { loggingContext } from '@/core/server/http/context';

import { type Storage } from './types';

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

  async length(): Promise<number> {
    return this.client.dbsize();
  }

  /**
   * Atomically appends a value to a list and optionally sets its TTL.
   *
   * Uses Redis pipeline to execute RPUSH and EXPIRE as a single atomic batch,
   * preventing race conditions where TTL might not be set if the connection
   * fails between the two commands. This is critical for EventStore reliability
   * in clustered deployments.
   *
   * @param key - The key of the list to append to
   * @param value - The value to append to the list
   * @param ttl - Optional TTL in seconds to set/refresh on the list
   * @returns The new length of the list after appending
   *
   * @example
   * // Append event ID to stream index with 1-hour TTL
   * const length = await storage.appendToList('mcp-stream:abc', 'event-123', 3600);
   *
   * @see https://redis.io/docs/latest/commands/rpush/
   * @see https://redis.io/docs/latest/develop/use/pipelining/
   */
  async appendToList(key: string, value: string, ttl?: number): Promise<number> {
    const pipeline = this.client.pipeline();
    pipeline.rpush(key, value);
    if (ttl !== undefined) {
      pipeline.expire(key, ttl);
    }
    const results = await pipeline.exec();

    // Pipeline returns array of [error, result] tuples; first result is RPUSH length
    if (results?.[0] === undefined) {
      loggingContext.log('warn', 'Pipeline execution returned no results', {
        data: { key },
      });
      return 0;
    }

    const [error, length] = results[0];
    if (error !== null) {
      loggingContext.log('error', 'Pipeline RPUSH failed', {
        data: { key },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    return length as number;
  }

  /**
   * Retrieves all values from a list stored at the given key.
   *
   * Uses Redis LRANGE with indices 0 to -1 to fetch the entire list.
   * Returns an empty array if the key does not exist.
   *
   * @param key - The key of the list to retrieve
   * @returns Array of all values in the list, or empty array if key doesn't exist
   *
   * @example
   * // Get all event IDs for a stream
   * const eventIds = await storage.getList('mcp-stream:abc');
   *
   * @see https://redis.io/docs/latest/commands/lrange/
   */
  async getList(key: string): Promise<string[]> {
    return this.client.lrange(key, 0, -1);
  }
}
