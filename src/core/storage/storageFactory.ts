import { StorageConfig } from '@/config/type';

import { MemoryStorage } from './memory';
import { Storage } from './types';
import { ValkeyStorage } from './valkey';

export function createStorage(config: StorageConfig): Storage {
  switch (config.type) {
    case 'memory':
      return new MemoryStorage();
    case 'valkey':
      return new ValkeyStorage(config.valkey);
    default:
      throw new Error(`Unsupported storage type: ${config.type as string}`);
  }
}
