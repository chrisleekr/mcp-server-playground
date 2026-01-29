/**
 * @fileoverview MCPEventStore - SSE Resumability Support for MCP Server
 *
 * This module provides Server-Sent Events (SSE) resumability support, enabling
 * clients to reconnect and resume receiving events after a broken connection
 * using the `Last-Event-ID` header per the SSE specification.
 *
 * ## Purpose
 *
 * In distributed systems, network connections can break unexpectedly. Without
 * resumability, clients would miss events that occurred during the disconnection.
 * This EventStore persists events so they can be replayed when clients reconnect.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────┐                  ┌──────────────┐                  ┌─────────┐
 * │  Client │                  │ MCPEventStore│                  │ Storage │
 * └────┬────┘                  └──────┬───────┘                  └────┬────┘
 *      │                              │                               │
 *      │── POST /mcp ────────────────>│                               │
 *      │                              │── storeEvent() ──────────────>│
 *      │                              │   (event + stream index)      │
 *      │<── SSE (id: eventId) ────────│                               │
 *      │                              │                               │
 *      │    [Connection breaks]       │                               │
 *      │                              │                               │
 *      │── GET /mcp ─────────────────>│                               │
 *      │   (Last-Event-ID: xyz)       │                               │
 *      │                              │── replayEventsAfter() ───────>│
 *      │<── SSE (missed events) ──────│                               │
 *      │                              │                               │
 * ```
 *
 * ## Storage Keys
 *
 * The EventStore uses two key patterns in the underlying storage:
 *
 * - `mcp-event:{eventId}` - Individual event data stored as JSON containing:
 *   - `eventId`: Unique identifier (UUID v4)
 *   - `streamId`: The stream this event belongs to
 *   - `message`: The JSON-RPC message payload
 *   - `timestamp`: When the event was stored
 *
 * - `mcp-stream-events:{streamId}` - Ordered list of event IDs for a stream,
 *   enabling efficient replay of events after a given event ID.
 *
 * ## TTL Behavior
 *
 * All keys expire after the configured TTL (default: 1 hour). This ensures
 * automatic cleanup of old events. Note that if a stream index expires before
 * its individual events, those events become orphaned until their own TTL
 * expires - this is acceptable as they are no longer referenceable.
 *
 * ## Concurrency
 *
 * The EventStore uses atomic list operations (`appendToList`) to prevent race
 * conditions when multiple events are stored concurrently for the same stream.
 *
 * @module eventStore
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#resumability-and-redelivery
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */

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
/**
 * EventStore implementation for MCP SSE resumability.
 *
 * Implements the MCP SDK's EventStore interface to enable clients to reconnect
 * and resume receiving events using the Last-Event-ID header.
 */
export class MCPEventStore {
  private storage: Storage;
  private readonly EVENT_KEY_PREFIX = 'mcp-event';
  private readonly STREAM_INDEX_PREFIX = 'mcp-stream-events';
  private readonly EVENT_TTL: number;

  /**
   * Creates a new MCPEventStore instance.
   *
   * @param storage - The storage backend to use (MemoryStorage or ValkeyStorage)
   * @param eventTTL - Time-to-live for stored events in seconds (default: 3600 = 1 hour)
   *
   * @example
   * ```typescript
   * const storage = createStorage(config.storage);
   * const eventStore = new MCPEventStore(storage, 3600);
   * ```
   */
  constructor(storage: Storage, eventTTL: number = 3600) {
    this.storage = storage;
    this.EVENT_TTL = eventTTL;
  }

  /**
   * Stores an event for later retrieval during SSE resumption.
   *
   * Per the MCP spec, the event ID must be globally unique across all streams
   * within the session. We use UUID v4 to ensure uniqueness. The event is stored
   * with its associated stream ID so it can be replayed when a client reconnects.
   *
   * @param streamId - ID of the stream the event belongs to
   * @param message - The JSON-RPC message to store
   * @returns The generated event ID (UUID v4) for the stored event
   *
   * @example
   * ```typescript
   * const eventId = await eventStore.storeEvent('stream-123', {
   *   jsonrpc: '2.0',
   *   method: 'notifications/progress',
   *   params: { progress: 50 }
   * });
   * // eventId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
   * ```
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

    // Atomically append eventId to the stream's event index
    // Using appendToList to prevent race conditions in concurrent scenarios
    const streamIndexKey = `${this.STREAM_INDEX_PREFIX}:${streamId}`;
    const eventCount = await this.storage.appendToList(
      streamIndexKey,
      eventId,
      this.EVENT_TTL
    );

    loggingContext.log('debug', 'Event stored for resumability', {
      data: { eventId, streamId, eventCount },
    });

    return eventId;
  }

  /**
   * Gets the stream ID associated with a given event ID.
   *
   * Used internally during event replay to determine which stream an event
   * belongs to. Returns undefined if the event has expired or was never stored.
   *
   * @param eventId - The event ID to look up
   * @returns The stream ID, or undefined if the event is not found or corrupted
   *
   * @example
   * ```typescript
   * const streamId = await eventStore.getStreamIdForEventId('event-123');
   * if (streamId) {
   *   console.log(`Event belongs to stream: ${streamId}`);
   * }
   * ```
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
      const parsed: unknown = JSON.parse(eventData);
      if (isStoredEvent(parsed)) {
        return parsed.streamId;
      }
      loggingContext.log('warn', 'Invalid stored event format', {
        data: { eventId },
      });
      return undefined;
    } catch {
      loggingContext.log('warn', 'Failed to parse stored event', {
        data: { eventId },
      });
      return undefined;
    }
  }

  /**
   * Replays events that occurred after a given event ID.
   *
   * This method is called when a client reconnects with a `Last-Event-ID` header.
   * It retrieves all events that occurred after the specified event and sends
   * them to the client via the provided send callback, maintaining the original
   * order for SSE compliance.
   *
   * The method fetches events in parallel for efficiency but sends them
   * sequentially to preserve ordering.
   *
   * @param lastEventId - The last event ID the client successfully received
   * @param options - Options object containing the send callback
   * @param options.send - Async callback to send each event to the client
   * @returns The stream ID that the events belong to
   * @throws {Error} If the lastEventId is not found in storage (expired or invalid)
   *
   * @example
   * ```typescript
   * const streamId = await eventStore.replayEventsAfter('event-123', {
   *   send: async (eventId, message) => {
   *     res.write(`id: ${eventId}\ndata: ${JSON.stringify(message)}\n\n`);
   *   }
   * });
   * ```
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

    // Get the stream's event index using atomic list operations
    const streamIndexKey = `${this.STREAM_INDEX_PREFIX}:${streamId}`;
    const eventIds = await this.storage.getList(streamIndexKey);

    if (eventIds.length === 0) {
      loggingContext.log('debug', 'No events to replay for stream', {
        data: { streamId },
      });
      return streamId;
    }

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
   * Cleans up all stored events for a stream.
   *
   * Removes both the individual event entries and the stream's event index.
   * Call this when a stream is closed to free up storage space. Note that
   * events also expire automatically based on the configured TTL.
   *
   * The deletion is performed in parallel for efficiency.
   *
   * @param streamId - The stream ID to clean up
   * @returns Resolves when all events and the stream index have been deleted
   *
   * @example
   * ```typescript
   * // Clean up when transport closes
   * transport.onclose = async () => {
   *   await eventStore.cleanupStream(transport.sessionId);
   * };
   * ```
   */
  public async cleanupStream(streamId: StreamId): Promise<void> {
    const streamIndexKey = `${this.STREAM_INDEX_PREFIX}:${streamId}`;
    const eventIds = await this.storage.getList(streamIndexKey);

    if (eventIds.length > 0) {
      // Delete all events for this stream (use Promise.all for efficiency)
      await Promise.all(
        eventIds.map(eventId =>
          this.storage.delete(`${this.EVENT_KEY_PREFIX}:${eventId}`)
        )
      );
    }

    // Delete the stream index
    await this.storage.delete(streamIndexKey);

    loggingContext.log('debug', 'Cleaned up stream events', {
      data: { streamId, eventsDeleted: eventIds.length },
    });
  }
}
