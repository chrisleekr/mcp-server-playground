import { z } from 'zod';

/**
 * Input schema for streaming tool
 */
export const StreamingInputSchema = z.object({
  dataType: z
    .enum(['metrics', 'stock_prices', 'sensor_data', 'custom'])
    .default('metrics'),
  count: z.number().min(1).max(50).default(5),
  intervalMs: z.number().min(100).max(5000).default(1000),
});

export type StreamingInput = z.infer<typeof StreamingInputSchema>;

/**
 * Output schema for streaming tool
 */
export interface StreamingOutput {
  dataType: string;
  count: number;
  intervalMs: number;
  totalDuration: number;
  dataPoints: Array<{
    timestamp: string;
    index: number;
    value: unknown;
  }>;
  completedAt: string;
}
