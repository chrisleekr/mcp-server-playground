import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';

import { loggingContext } from '@/core/server/http/context';

import { type Storage } from './types';

/**
 * Type aliases matching the MCP SDK's EventStore interface
 */
export type StreamId = string;
export type EventId = string;

/**
 * Stored event structure for persistence
 */
interface StoredEvent {
  eventId: EventId;
  streamId: StreamId;
  message: JSONRPCMessage;
  timestamp: number;
}

/**
 * Type guard to verify parsed JSON is an array of strings (EventId[])
 */
function isEventIdArray(value: unknown): value is EventId[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Type guard to verify parsed JSON is a StoredEvent
 */
function isStoredEvent(value: unknown): value is StoredEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['eventId'] === 'string' &&
    typeof obj['streamId'] === 'string' &&
    typeof obj['message'] === 'object' &&
    obj['message'] !== null &&
    typeof obj['timestamp'] === 'number'
  );
}

/**
 * EventStore implementation for SSE resumability support.
 *
 * This class implements the MCP SDK's EventStore interface, enabling clients
 * to reconnect and resume receiving events after a broken connection using
 * the Last-Event-ID header per the SSE specification.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#resumability-and-redelivery
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */
export class MCPEventStore {
  private storage: Storage;
  private readonly EVENT_KEY_PREFIX = 'mcp-event';
  private readonly STREAM_INDEX_PREFIX = 'mcp-stream-events';
  private readonly EVENT_TTL: number;

  constructor(storage: Storage, eventTTL: number = 3600) {
    this.storage = storage;
    this.EVENT_TTL = eventTTL;
  }

  /**
   * Stores an event for later retrieval.
   *
   * Per the MCP spec, the event ID must be globally unique across all streams
   * within the session. We use UUID v4 to ensure uniqueness.
   *
   * @param streamId - ID of the stream the event belongs to
   * @param message - The JSON-RPC message to store
   * @returns The generated event ID for the stored event
   */
  public async storeEvent(
    streamId: StreamId,
    message: JSONRPCMessage
  ): Promise<EventId> {
    const eventId = uuidv4();
    const storedEvent: StoredEvent = {
      eventId,
      streamId,
      message,
      timestamp: Date.now(),
    };

    // Store the event itself
    await this.storage.set(
      `${this.EVENT_KEY_PREFIX}:${eventId}`,
      JSON.stringify(storedEvent),
      this.EVENT_TTL
    );

    // Update the stream's event index (append eventId to the list)
    const streamIndexKey = `${this.STREAM_INDEX_PREFIX}:${streamId}`;
    const existingIndex = await this.storage.get(streamIndexKey);
    const parsedIndex: unknown =
      existingIndex !== null ? JSON.parse(existingIndex) : [];
    const eventIds: EventId[] = isEventIdArray(parsedIndex) ? parsedIndex : [];
    eventIds.push(eventId);

    await this.storage.set(
      streamIndexKey,
      JSON.stringify(eventIds),
      this.EVENT_TTL
    );

    loggingContext.log('debug', 'Event stored for resumability', {
      data: { eventId, streamId, eventCount: eventIds.length },
    });

    return eventId;
  }

  /**
   * Gets the stream ID associated with a given event ID.
   *
   * @param eventId - The event ID to look up
   * @returns The stream ID, or undefined if not found
   */
  public async getStreamIdForEventId(
    eventId: EventId
  ): Promise<StreamId | undefined> {
    const eventData = await this.storage.get(
      `${this.EVENT_KEY_PREFIX}:${eventId}`
    );

    if (eventData === null) {
      return undefined;
    }

    try {
      const storedEvent = JSON.parse(eventData) as StoredEvent;
      return storedEvent.streamId;
    } catch {
      loggingContext.log('warn', 'Failed to parse stored event', {
        data: { eventId },
      });
      return undefined;
    }
  }

  /**
   * Replays events after a given event ID.
   *
   * This method is called when a client reconnects with a Last-Event-ID header.
   * It retrieves all events that occurred after the specified event and sends
   * them to the client via the provided send callback.
   *
   * @param lastEventId - The last event ID the client received
   * @param send - Callback to send events to the client
   * @returns The stream ID for the replayed events
   */
  public async replayEventsAfter(
    lastEventId: EventId,
    {
      send,
    }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    // First, get the stream ID for the last event
    const streamId = await this.getStreamIdForEventId(lastEventId);

    if (streamId === undefined) {
      loggingContext.log('warn', 'Could not find stream for event ID', {
        data: { lastEventId },
      });
      throw new Error(`Event ID not found: ${lastEventId}`);
    }

    // Get the stream's event index
    const streamIndexKey = `${this.STREAM_INDEX_PREFIX}:${streamId}`;
    const existingIndex = await this.storage.get(streamIndexKey);

    if (existingIndex === null) {
      loggingContext.log('debug', 'No events to replay for stream', {
        data: { streamId },
      });
      return streamId;
    }

    const parsedEventIds: unknown = JSON.parse(existingIndex);
    const eventIds: EventId[] = isEventIdArray(parsedEventIds)
      ? parsedEventIds
      : [];

    // Find the index of the last event and replay everything after
    const lastEventIndex = eventIds.indexOf(lastEventId);

    if (lastEventIndex === -1) {
      loggingContext.log('warn', 'Last event ID not found in stream index', {
        data: { lastEventId, streamId },
      });
      return streamId;
    }

    // Get all events after the last received event
    const eventsToReplay = eventIds.slice(lastEventIndex + 1);

    loggingContext.log('debug', 'Replaying events for stream', {
      data: {
        streamId,
        lastEventId,
        eventsToReplay: eventsToReplay.length,
      },
    });

    // Fetch all events in parallel for efficiency
    const eventDataList = await Promise.all(
      eventsToReplay.map(async eventId => ({
        eventId,
        data: await this.storage.get(`${this.EVENT_KEY_PREFIX}:${eventId}`),
      }))
    );

    // Send events sequentially to maintain order (required for SSE resumability)
    for (const { eventId, data } of eventDataList) {
      if (data !== null) {
        try {
          const parsed: unknown = JSON.parse(data);
          if (isStoredEvent(parsed)) {
            // eslint-disable-next-line no-await-in-loop -- Sequential order required for SSE
            await send(eventId, parsed.message);
          }
        } catch (error) {
          loggingContext.log('error', 'Failed to replay event', {
            data: { eventId },
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return streamId;
  }

  /**
   * Cleans up expired events for a stream.
   * Call this periodically or when a stream is closed.
   *
   * @param streamId - The stream ID to clean up
   */
  public async cleanupStream(streamId: StreamId): Promise<void> {
    const streamIndexKey = `${this.STREAM_INDEX_PREFIX}:${streamId}`;
    const existingIndex = await this.storage.get(streamIndexKey);

    if (existingIndex !== null) {
      const parsedCleanupIndex: unknown = JSON.parse(existingIndex);
      const eventIds: EventId[] = isEventIdArray(parsedCleanupIndex)
        ? parsedCleanupIndex
        : [];

      // Delete all events for this stream (use Promise.all for efficiency)
      await Promise.all(
        eventIds.map(eventId =>
          this.storage.delete(`${this.EVENT_KEY_PREFIX}:${eventId}`)
        )
      );

      // Delete the stream index
      await this.storage.delete(streamIndexKey);

      loggingContext.log('debug', 'Cleaned up stream events', {
        data: { streamId, eventsDeleted: eventIds.length },
      });
    }
  }
}
