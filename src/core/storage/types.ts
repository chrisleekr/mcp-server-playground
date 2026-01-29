/**
 * Storage interface for key-value and list operations.
 *
 * Provides a pluggable storage abstraction that can be implemented by
 * different backends (MemoryStorage for development, ValkeyStorage for production).
 *
 * @see MemoryStorage - In-memory implementation for development/testing
 * @see ValkeyStorage - Redis-compatible implementation for production clusters
 */
export interface Storage {
  /**
   * Retrieves a value by key.
   *
   * @param key - The key to look up
   * @returns The stored value, or null if the key doesn't exist or has expired
   */
  get(key: string): Promise<string | null>;

  /**
   * Stores a value with an optional TTL.
   *
   * @param key - The key to store the value under
   * @param value - The string value to store
   * @param ttl - Optional time-to-live in seconds; if omitted, the key never expires
   */
  set(key: string, value: string, ttl?: number): Promise<void>;

  /**
   * Deletes a key from storage.
   *
   * For implementations with separate list storage (like MemoryStorage),
   * this should also delete from the list store.
   *
   * @param key - The key to delete
   * @returns true if the key existed and was deleted, false otherwise
   */
  delete(key: string): Promise<boolean>;

  /**
   * Finds all keys matching a pattern prefix.
   *
   * @param pattern - The prefix pattern to match (e.g., 'session:')
   * @returns Array of matching keys
   */
  keys(pattern: string): Promise<string[]>;

  /**
   * Closes the storage connection and releases resources.
   *
   * For in-memory storage, this clears all data.
   * For Valkey/Redis, this closes the client connection.
   */
  close(): Promise<void>;

  /**
   * Returns the total number of keys in storage.
   *
   * @returns The count of stored keys (excluding expired keys)
   */
  length(): Promise<number>;

  /**
   * Atomically appends a value to a list stored at key.
   *
   * Creates the list if it doesn't exist. This operation is atomic to prevent
   * race conditions when multiple concurrent operations append to the same list.
   * Used by EventStore to maintain ordered lists of event IDs per stream.
   *
   * @param key - The key of the list
   * @param value - The value to append to the end of the list
   * @param ttl - Optional TTL in seconds; refreshes the TTL on each append
   * @returns The new length of the list after appending
   */
  appendToList(key: string, value: string, ttl?: number): Promise<number>;

  /**
   * Retrieves all values from a list stored at key.
   *
   * Returns values in insertion order (oldest first).
   * Used by EventStore to retrieve event IDs for replay.
   *
   * @param key - The key of the list
   * @returns Array of values in order, or empty array if key doesn't exist
   */
  getList(key: string): Promise<string[]>;
}
