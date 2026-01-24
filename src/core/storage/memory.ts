/* eslint-disable @typescript-eslint/require-await */
import { type Storage } from './types';

interface StoredValue {
  value: string;
  expiresAt?: number;
}

const CLEANUP_THRESHOLD = 100;

export class MemoryStorage implements Storage {
  private store: Map<string, StoredValue> = new Map();
  private operationCount = 0;

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, stored] of this.store.entries()) {
      if (stored.expiresAt !== undefined && now >= stored.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const stored = this.store.get(key);
    if (stored === undefined) {
      return null;
    }

    if (stored.expiresAt !== undefined && Date.now() >= stored.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return stored.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.operationCount++;
    if (this.operationCount >= CLEANUP_THRESHOLD) {
      this.cleanupExpired();
      this.operationCount = 0;
    }

    const stored: StoredValue =
      ttl !== undefined
        ? { value, expiresAt: Date.now() + ttl * 1000 }
        : { value };
    this.store.set(key, stored);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async close(): Promise<void> {
    this.store.clear();
  }

  async keys(pattern: string): Promise<string[]> {
    const now = Date.now();
    return Array.from(this.store.entries())
      .filter(([, stored]) => {
        if (stored.expiresAt !== undefined && now >= stored.expiresAt) {
          return false;
        }
        return true;
      })
      .map(([key]) => key)
      .filter(key => key.startsWith(pattern));
  }

  async length(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const stored of this.store.values()) {
      if (stored.expiresAt === undefined || now < stored.expiresAt) {
        count++;
      }
    }
    return count;
  }
}
