import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { MemoryStorage } from '@/core/storage/memory';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('set and get', () => {
    it('stores and retrieves a value', async () => {
      await storage.set('test-key', 'test-value');
      const result = await storage.get('test-key');
      expect(result).toBe('test-value');
    });

    it('returns null for non-existent key', async () => {
      const result = await storage.get('non-existent');
      expect(result).toBeNull();
    });

    it('overwrites existing value', async () => {
      await storage.set('key', 'value1');
      await storage.set('key', 'value2');
      const result = await storage.get('key');
      expect(result).toBe('value2');
    });
  });

  describe('delete', () => {
    it('removes a key and returns true', async () => {
      await storage.set('to-delete', 'value');
      const deleted = await storage.delete('to-delete');
      expect(deleted).toBe(true);

      const result = await storage.get('to-delete');
      expect(result).toBeNull();
    });

    it('returns false when key does not exist', async () => {
      const deleted = await storage.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('keys', () => {
    it('returns keys matching prefix pattern', async () => {
      await storage.set('prefix:key1', 'value1');
      await storage.set('prefix:key2', 'value2');
      await storage.set('other:key3', 'value3');

      const keys = await storage.keys('prefix:');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('prefix:key1');
      expect(keys).toContain('prefix:key2');
    });

    it('returns empty array when no keys match', async () => {
      await storage.set('key1', 'value1');
      const keys = await storage.keys('nonexistent:');
      expect(keys).toHaveLength(0);
    });
  });

  describe('length', () => {
    it('returns the number of stored items', async () => {
      expect(await storage.length()).toBe(0);

      await storage.set('key1', 'value1');
      expect(await storage.length()).toBe(1);

      await storage.set('key2', 'value2');
      expect(await storage.length()).toBe(2);

      await storage.delete('key1');
      expect(await storage.length()).toBe(1);
    });
  });

  describe('close', () => {
    it('clears all stored items', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      expect(await storage.length()).toBe(2);

      await storage.close();
      expect(await storage.length()).toBe(0);
    });
  });

  describe('TTL', () => {
    it('expires key after TTL', async () => {
      const now = Date.now();
      const spy = spyOn(Date, 'now').mockReturnValue(now);

      await storage.set('expiring-key', 'value', 1);

      const beforeExpiry = await storage.get('expiring-key');
      expect(beforeExpiry).toBe('value');

      spy.mockReturnValue(now + 1500);

      const afterExpiry = await storage.get('expiring-key');
      expect(afterExpiry).toBeNull();

      spy.mockRestore();
    });
  });
});
