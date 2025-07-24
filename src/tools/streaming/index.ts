/* eslint-disable max-lines-per-function */
import { setTimeout } from 'node:timers/promises';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { loggingContext } from '@/core/server/http/context';
import {
  ToolBuilder,
  ToolContext,
  ToolInputSchema,
  ToolResult,
} from '@/tools/types';

import packageJson from '../../../package.json';
import { sendProgressNotification } from '../notification';
import { StreamingInput, StreamingInputSchema, StreamingOutput } from './types';

/**
 * Streaming tool that simulates real-time data streaming
 *
 * BUT it seems not working as expected. Just leave it here for now.
 */
async function* executeStreaming(
  input: StreamingInput,
  context: ToolContext
): AsyncGenerator<ToolResult & { data?: StreamingOutput }> {
  loggingContext.setContextValue('tool', 'streaming');
  const startTime = Date.now();
  const progressToken = context.progressToken;

  try {
    loggingContext.log('info', 'Starting streaming', {
      data: { input, progressToken },
    });

    const validatedInput = StreamingInputSchema.parse(input);
    const { dataType, count, intervalMs } = validatedInput;
    const dataPoints: Array<{
      timestamp: string;
      index: number;
      value: unknown;
    }> = [];

    // Send initial progress
    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 0,
        total: count,
        message: `Starting ${dataType} streaming (${count} points, ${intervalMs}ms intervals)`,
      });
    }

    // Generate and stream data points
    for (let i = 1; i <= count; i++) {
      // Generate data point based on type
      const dataPoint = generateDataPoint(dataType, i);
      const timestamp = new Date().toISOString();

      dataPoints.push({
        timestamp,
        index: i,
        value: dataPoint,
      });

      // Send progress update
      if (context.server) {
        await sendProgressNotification(context.server, {
          progressToken,
          progress: i,
          total: count,
          message: `Streamed ${i}/${count} ${dataType} data points`,
        });
      }

      const executionTime = Date.now() - startTime;
      const output: StreamingOutput = {
        dataType,
        count: validatedInput.count,
        intervalMs,
        totalDuration: executionTime,
        dataPoints: [...dataPoints], // Create a copy for each yield
        completedAt: timestamp,
      };

      // Yield intermediate result for streaming
      yield {
        success: true,
        data: output,
        executionTime,
        timestamp,
        metadata: {
          toolVersion: packageJson.version,
          dataType,
          currentPoint: i,
          totalPoints: count,
          streamingEnabled: true,
          isIntermediate: i < count,
        },
      };

      loggingContext.log('debug', `Streaming data point ${i} generated`, {
        data: { dataPoint, timestamp },
      });

      // Wait for the specified interval (except for the last iteration)
      if (i < count) {
        await setTimeout(intervalMs);
      }
    }

    // Final completion notification
    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: count,
        total: count,
        message: `${dataType} streaming completed successfully`,
      });
    }

    const totalExecutionTime = Date.now() - startTime;
    const finalOutput: StreamingOutput = {
      dataType,
      count,
      intervalMs,
      totalDuration: totalExecutionTime,
      dataPoints,
      completedAt: new Date().toISOString(),
    };

    loggingContext.log('info', 'Streaming completed', {
      data: { totalExecutionTime, pointsGenerated: dataPoints.length },
    });

    // Final yield with completion
    yield {
      success: true,
      data: finalOutput,
      executionTime: totalExecutionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: packageJson.version,
        dataType,
        totalPoints: count,
        streamingEnabled: true,
        isIntermediate: false,
        completed: true,
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    // Send error notification
    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: -1,
        total: input.count,
        message: `Streaming failed: ${errorMessage}`,
      });
    }

    loggingContext.log('error', 'Streaming failed', {
      data: { error: errorMessage, input, executionTime },
    });

    yield {
      success: false,
      error: errorMessage,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: packageJson.version,
        inputValidation: 'failed',
      },
    };
  }
}

/**
 * Generate sample data point based on data type
 */
function generateDataPoint(dataType: string, index: number): unknown {
  switch (dataType) {
    case 'metrics':
      return {
        cpu: Math.round(Math.random() * 100 * 100) / 100,
        memory: Math.round((50 + Math.random() * 40) * 100) / 100,
        disk: Math.round((20 + Math.random() * 30) * 100) / 100,
        network: Math.round(Math.random() * 1000 * 100) / 100,
      };
    case 'stock_prices':
      return {
        symbol: 'DEMO',
        price: Math.round((100 + Math.random() * 50) * 100) / 100,
        volume: Math.floor(Math.random() * 10000),
        change: Math.round((Math.random() * 10 - 5) * 100) / 100,
      };
    case 'sensor_data':
      return {
        temperature: Math.round((20 + Math.random() * 15) * 100) / 100,
        humidity: Math.round((40 + Math.random() * 40) * 100) / 100,
        pressure: Math.round((1000 + Math.random() * 50) * 100) / 100,
        light: Math.floor(Math.random() * 1000),
      };
    case 'custom':
    default:
      return {
        id: `data_${index}`,
        value: Math.round(Math.random() * 1000),
        category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
        active: Math.random() > 0.5,
      };
  }
}

/**
 * Create and export the streaming tool
 */
export const streamingTool = new ToolBuilder<StreamingInput, StreamingOutput>(
  'streaming'
)
  .description('Simulate real-time streaming data with live updates')
  .inputSchema(zodToJsonSchema(StreamingInputSchema) as typeof ToolInputSchema)
  .examples([
    {
      input: { dataType: 'metrics', count: 5, intervalMs: 1000 },
      output: {
        success: true,
        data: {
          dataType: 'metrics',
          count: 5,
          intervalMs: 1000,
          totalDuration: 5000,
          dataPoints: [
            {
              timestamp: '2024-01-15T10:30:00.000Z',
              index: 1,
              value: { cpu: 45.2, memory: 67.8, disk: 35.1, network: 234.5 },
            },
          ],
          completedAt: '2024-01-15T10:30:05.000Z',
        },
      },
      description: 'Stream system metrics data in real-time',
    },
    {
      input: { dataType: 'stock_prices', count: 3, intervalMs: 2000 },
      output: {
        success: true,
        data: {
          dataType: 'stock_prices',
          count: 3,
          intervalMs: 2000,
          totalDuration: 6000,
          dataPoints: [
            {
              timestamp: '2024-01-15T10:30:00.000Z',
              index: 1,
              value: {
                symbol: 'DEMO',
                price: 125.45,
                volume: 5678,
                change: 2.3,
              },
            },
          ],
          completedAt: '2024-01-15T10:30:06.000Z',
        },
      },
      description: 'Stream stock price data with live updates',
    },
  ])
  .tags(['streaming', 'real-time', 'data'])
  .version(packageJson.version)
  .timeout(30000) // 30 second timeout
  .streamingImplementation(executeStreaming)
  .build();
