/* eslint-disable @typescript-eslint/require-await */
import { setTimeout } from 'timers/promises';

import { Storage } from './types';

export class MemoryStorage implements Storage {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl !== undefined) {
      setTimeout(ttl * 1000)
        .then(() => {
          this.store.delete(key);
        })
        .catch(() => {
          // ignore error
        });
    }

    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async close(): Promise<void> {
    this.store.clear();
  }

  async keys(pattern: string): Promise<string[]> {
    return Array.from(this.store.keys()).filter(key => key.startsWith(pattern));
  }
}
