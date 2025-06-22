import { zodToJsonSchema } from 'zod-to-json-schema';

import { loggingContext } from '@/core/server/http/context';
import {
  Tool,
  ToolBuilder,
  ToolContext,
  ToolInputSchema,
  ToolResult,
} from '@/tools/types';

import {
  SystemTimeInput,
  SystemTimeInputSchema,
  SystemTimeOutput,
} from './types';

/**
 * System Time Tool
 *
 * Provides current system time in various formats with timezone support.
 */

/**
 * Format timestamp according to specified format and timezone
 */
function formatTimestamp(
  date: Date,
  format: string,
  timezone?: string,
  customFormat?: string
): string | number {
  switch (format) {
    case 'iso':
      return timezone !== undefined
        ? `${date
            .toLocaleString('en-US', { timeZone: timezone })
            .replace(' ', 'T')}Z`
        : date.toISOString();

    case 'unix':
      return Math.floor(date.getTime() / 1000);

    case 'human':
      return timezone !== undefined
        ? date.toLocaleString('en-US', {
            timeZone: timezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'long',
          })
        : date.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'long',
          });

    case 'custom':
      if (customFormat === undefined || customFormat === '') {
        throw new Error(
          'Custom format string is required when format is "custom"'
        );
      }
      return formatCustom(date, customFormat, timezone);

    default:
      return date.toISOString();
  }
}

/**
 * Custom date formatting function
 * Supports common format tokens like YYYY, MM, DD, HH, mm, ss
 */
function formatCustom(date: Date, format: string, timezone?: string): string {
  const d =
    timezone !== undefined
      ? new Date(date.toLocaleString('en-US', { timeZone: timezone }))
      : date;

  const tokens: Record<string, string> = {
    YYYY: d.getFullYear().toString(),
    YY: d.getFullYear().toString().slice(-2),
    MM: (d.getMonth() + 1).toString().padStart(2, '0'),
    M: (d.getMonth() + 1).toString(),
    DD: d.getDate().toString().padStart(2, '0'),
    D: d.getDate().toString(),
    HH: d.getHours().toString().padStart(2, '0'),
    H: d.getHours().toString(),
    mm: d.getMinutes().toString().padStart(2, '0'),
    m: d.getMinutes().toString(),
    ss: d.getSeconds().toString().padStart(2, '0'),
    s: d.getSeconds().toString(),
    SSS: d.getMilliseconds().toString().padStart(3, '0'),
  };

  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(token, 'g'), value);
  }

  return result;
}

/**
 * Get timezone information
 */
function getTimezoneInfo(timezone?: string): string {
  if (timezone === undefined || timezone === '') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  // Validate timezone
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

/**
 * System time tool implementation
 */
async function executeSystemTime(
  input: SystemTimeInput,
  _context: ToolContext
): Promise<ToolResult & { data?: SystemTimeOutput }> {
  loggingContext.setContextValue('tool', 'system_time');
  const startTime = Date.now();

  try {
    loggingContext.log('debug', 'Executing system time tool', {
      data: { input },
    });

    // Validate input using Zod schema
    const validatedInput = SystemTimeInputSchema.parse(input);

    // Get current time
    const now = new Date();
    const resolvedTimezone = await Promise.resolve(
      getTimezoneInfo(validatedInput.timezone)
    );

    // Format timestamp according to requested format
    const formattedTimestamp = formatTimestamp(
      now,
      validatedInput.format,
      validatedInput.timezone,
      validatedInput.customFormat
    );

    // Prepare comprehensive output
    const output: SystemTimeOutput = {
      timestamp: formattedTimestamp,
      timezone: resolvedTimezone,
      format: validatedInput.format,
      utc: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      human: now.toLocaleString('en-US', {
        timeZone: resolvedTimezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: validatedInput.includeTimezone ? 'long' : undefined,
      }),
    };

    const executionTime = Date.now() - startTime;

    // Log successful execution
    loggingContext.log('info', 'System time tool executed successfully', {
      format: validatedInput.format,
      timezone: resolvedTimezone,
      executionTime,
    });

    return {
      success: true,
      data: output,
      executionTime,
      timestamp: now.toISOString(),
      metadata: {
        toolVersion: '1.0.0',
        inputValidation: 'passed',
        timezone: resolvedTimezone,
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    loggingContext.log('error', 'System time tool execution failed', {
      data: {
        error: errorMessage,
        input,
        executionTime,
      },
    });

    return {
      success: false,
      error: errorMessage,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: '1.0.0',
        inputValidation: 'failed',
      },
    };
  }
}

/**
 * Create and export the system time tool
 */
export const systemTimeTool: Tool<SystemTimeInput, SystemTimeOutput> =
  new ToolBuilder<SystemTimeInput, SystemTimeOutput>('system_time')
    .description(
      'Get the current system time in various formats with timezone support'
    )
    .inputSchema(
      zodToJsonSchema(SystemTimeInputSchema) as typeof ToolInputSchema
    )
    .examples([
      {
        input: {},
        output: {
          success: true,
          data: {
            timestamp: '2024-01-15T10:30:00.000Z',
            timezone: 'UTC',
            format: 'iso',
            utc: '2024-01-15T10:30:00.000Z',
            unix: 1705316200,
            human:
              'Monday, January 15, 2024 at 10:30:00 AM Coordinated Universal Time',
          },
        },
        description: 'Get current time in default ISO format',
      },
      {
        input: { format: 'unix' },
        output: {
          success: true,
          data: {
            timestamp: 1705316200,
            timezone: 'UTC',
            format: 'unix',
            utc: '2024-01-15T10:30:00.000Z',
            unix: 1705316200,
            human:
              'Monday, January 15, 2024 at 10:30:00 AM Coordinated Universal Time',
          },
        },
        description: 'Get current time as Unix timestamp',
      },
      {
        input: {
          format: 'custom',
          customFormat: 'YYYY-MM-DD HH:mm:ss',
          timezone: 'America/New_York',
        },
        output: {
          success: true,
          data: {
            timestamp: '2024-01-15 05:30:00',
            timezone: 'America/New_York',
            format: 'custom',
            utc: '2024-01-15T10:30:00.000Z',
            unix: 1705316200,
            human:
              'Monday, January 15, 2024 at 5:30:00 AM Eastern Standard Time',
          },
        },
        description: 'Get current time in custom format for specific timezone',
      },
    ])
    .tags(['system', 'time', 'utility', 'core'])
    .version('1.0.0')
    .timeout(5000)
    .implementation(executeSystemTime)
    .build();

/**
 * Export additional utilities for testing and extension
 */
export { executeSystemTime, formatCustom, formatTimestamp, getTimezoneInfo };
