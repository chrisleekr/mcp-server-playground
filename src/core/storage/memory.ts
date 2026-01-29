/* eslint-disable @typescript-eslint/require-await */
import { type Storage } from './types';

interface StoredValue {
  value: string;
  expiresAt?: number;
}

const CLEANUP_THRESHOLD = 100;

interface StoredList {
  values: string[];
  expiresAt?: number;
}

export class MemoryStorage implements Storage {
  private store: Map<string, StoredValue> = new Map();
  private listStore: Map<string, StoredList> = new Map();
  private operationCount = 0;

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, stored] of this.store.entries()) {
      if (stored.expiresAt !== undefined && now >= stored.expiresAt) {
        this.store.delete(key);
      }
    }
    for (const [key, stored] of this.listStore.entries()) {
      if (stored.expiresAt !== undefined && now >= stored.expiresAt) {
        this.listStore.delete(key);
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

  /**
   * Deletes a key from storage.
   *
   * Checks both the regular key-value store and the list store,
   * since EventStore uses lists for stream indexes.
   *
   * @param key - The key to delete
   * @returns true if the key was found and deleted from either store
   */
  async delete(key: string): Promise<boolean> {
    const deletedFromStore = this.store.delete(key);
    const deletedFromList = this.listStore.delete(key);
    return deletedFromStore || deletedFromList;
  }

  async close(): Promise<void> {
    this.store.clear();
    this.listStore.clear();
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

  async appendToList(
    key: string,
    value: string,
    ttl?: number
  ): Promise<number> {
    this.operationCount++;
    if (this.operationCount >= CLEANUP_THRESHOLD) {
      this.cleanupExpired();
      this.operationCount = 0;
    }

    const now = Date.now();
    const existing = this.listStore.get(key);

    // Check if list exists and is not expired
    if (
      existing !== undefined &&
      (existing.expiresAt === undefined || now < existing.expiresAt)
    ) {
      existing.values.push(value);
      // Update TTL if provided
      if (ttl !== undefined) {
        existing.expiresAt = now + ttl * 1000;
      }
      return existing.values.length;
    }

    // Create new list
    const newList: StoredList =
      ttl !== undefined
        ? { values: [value], expiresAt: now + ttl * 1000 }
        : { values: [value] };
    this.listStore.set(key, newList);
    return 1;
  }

  async getList(key: string): Promise<string[]> {
    const now = Date.now();
    const stored = this.listStore.get(key);

    if (stored === undefined) {
      return [];
    }

    if (stored.expiresAt !== undefined && now >= stored.expiresAt) {
      this.listStore.delete(key);
      return [];
    }

    return [...stored.values];
  }
}
