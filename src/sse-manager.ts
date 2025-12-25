// SSE connection manager for real-time updates from OpenCode servers

import { EventEmitter } from "node:events";
import {
  SessionUpdateEvent,
  MessageEvent,
  PermissionRequestEvent,
  Result,
  AppError,
} from "./types";
import { getConfig } from "./config";
import { httpClientPool } from "./http-client";

// ---------------------------------------------------------------------------
// SSE Connection Events
// ---------------------------------------------------------------------------

export interface SSEConnectionEvents {
  connected: (serverUrl: string) => void;
  disconnected: (serverUrl: string, reason: string) => void;
  reconnecting: (serverUrl: string, attempt: number) => void;
  session_update: (event: SessionUpdateEvent) => void;
  message: (event: MessageEvent) => void;
  permission_request: (event: PermissionRequestEvent) => void;
  error: (error: AppError, serverUrl: string) => void;
}

// ---------------------------------------------------------------------------
// SSE Connection State
// ---------------------------------------------------------------------------

export interface SSEConnectionState {
  serverUrl: string;
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "failed";
  lastConnected?: number;
  lastError?: AppError;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  abortController?: AbortController;
}

// ---------------------------------------------------------------------------
// SSE Connection Manager
// ---------------------------------------------------------------------------

export class SSEConnectionManager extends EventEmitter {
  private connections = new Map<string, SSEConnectionState>();
  private config = getConfig();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    super();
  }

  /**
   * Connect to SSE endpoint for a server
   */
  async connect(serverUrl: string): Promise<Result<void>> {
    try {
      // Normalize server URL
      const normalizedUrl = serverUrl.replace(/\/+$/, "");

      // Check if already connected or connecting
      const existing = this.connections.get(normalizedUrl);
      if (existing && ["connecting", "connected"].includes(existing.status)) {
        return { success: true };
      }

      // Initialize connection state
      const state: SSEConnectionState = {
        serverUrl: normalizedUrl,
        status: "connecting",
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        reconnectDelay: 1000,
      };
      this.connections.set(normalizedUrl, state);

      // Start subscription in background
      this.startSubscription(normalizedUrl);

      return { success: true };
    } catch (error) {
      const appError: AppError = {
        code: "NETWORK_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to connect to SSE",
        timestamp: Date.now(),
        recoverable: true,
      };

      return {
        success: false,
        error: appError,
      };
    }
  }

  /**
   * Start subscription using SDK client
   */
  private async startSubscription(serverUrl: string): Promise<void> {
    const state = this.connections.get(serverUrl);
    if (!state) return;

    try {
      const client = await httpClientPool.getClient(serverUrl);
      if (!client) {
        throw new Error("Failed to get HTTP client for SSE");
      }

      state.status = "connected";
      state.lastConnected = Date.now();
      state.reconnectAttempts = 0;
      this.emit("connected", serverUrl);

      await client.subscribe((event) => {
        this.handleSDKEvent(serverUrl, event);
      });

      // If subscribe completes, it means connection was closed
      state.status = "disconnected";
      this.emit("disconnected", serverUrl, "connection_closed");
      this.handleConnectionError(serverUrl);
    } catch (error) {
      const appError: AppError = {
        code: "NETWORK_ERROR",
        message:
          error instanceof Error ? error.message : "SSE subscription failed",
        timestamp: Date.now(),
        recoverable: true,
      };

      state.lastError = appError;
      this.emit("error", appError, serverUrl);
      this.handleConnectionError(serverUrl);
    }
  }

  /**
   * Handle event from SDK
   */
  private handleSDKEvent(serverUrl: string, event: any): void {
    if (this.config.debugFlags.sse) {
      console.log(`SSE event from ${serverUrl}:`, event);
    }

    // Map SDK events to our internal events
    // Based on opencode SDK types.gen.ts
    const type = event.type;
    const props = event.properties;

    if (!type || !props) return;

    switch (type) {
      case "session.status":
        this.emit("session_update", {
          type: "session_update",
          sessionId: props.sessionID,
          status: props.status.type === "busy" ? "busy" : props.status.type,
          lastActivity: Date.now(),
        });
        break;
      case "message.updated":
        this.emit("message", {
          type: "message",
          sessionId: props.info.sessionID,
          message: {
            id: props.info.id,
            sessionId: props.info.sessionID,
            timestamp: props.info.time.created,
            type:
              props.info.role === "user" ? "user_input" : "assistant_response",
            content: "", // Content is usually in parts, but we'll get it from refresh if needed
          },
        });
        break;
      case "permission.updated":
        this.emit("permission_request", {
          type: "permission_request",
          sessionId: props.sessionID,
          permissionId: props.id,
          toolName: props.title,
          toolArgs: props.metadata || {},
          description: props.title,
        });
        break;
    }
  }

  /**
   * Disconnect from SSE endpoint for a server
   */
  async disconnect(serverUrl: string): Promise<void> {
    const state = this.connections.get(serverUrl);
    if (!state) return;

    // Clear reconnect timer
    const timer = this.reconnectTimers.get(serverUrl);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverUrl);
    }

    state.status = "disconnected";
    this.emit("disconnected", serverUrl, "manual");
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const serverUrls = Array.from(this.connections.keys());
    await Promise.all(serverUrls.map((url) => this.disconnect(url)));
    this.connections.clear();
  }

  /**
   * Get connection state for a server
   */
  getConnectionState(serverUrl: string): SSEConnectionState | undefined {
    return this.connections.get(serverUrl);
  }

  /**
   * Get all connection states
   */
  getAllConnectionStates(): Map<string, SSEConnectionState> {
    return new Map(this.connections);
  }

  /**
   * Check if connected to a server
   */
  isConnected(serverUrl: string): boolean {
    const state = this.connections.get(serverUrl);
    return state?.status === "connected";
  }

  /**
   * Handle connection error and implement reconnection logic
   */
  private handleConnectionError(serverUrl: string): void {
    const state = this.connections.get(serverUrl);
    if (!state || state.status === "disconnected") return;

    // Check if we should attempt reconnection
    if (state.reconnectAttempts >= state.maxReconnectAttempts) {
      state.status = "failed";
      this.emit("disconnected", serverUrl, "max_retries_exceeded");
      return;
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      state.reconnectDelay * Math.pow(2, state.reconnectAttempts),
      30000, // Max 30 seconds
    );

    state.status = "reconnecting";
    state.reconnectAttempts++;

    if (this.config.debugFlags.sse) {
      console.log(
        `SSE reconnecting to ${serverUrl} in ${delay}ms (attempt ${state.reconnectAttempts})`,
      );
    }

    this.emit("reconnecting", serverUrl, state.reconnectAttempts);

    // Schedule reconnection
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(serverUrl);
      this.startSubscription(serverUrl);
    }, delay);

    this.reconnectTimers.set(serverUrl, timer);
  }
}

/**
 * Create and configure SSE connection manager
 */
export function createSSEManager(): SSEConnectionManager {
  return new SSEConnectionManager();
}

/**
 * @deprecated Use SDK event handling
 */
export function parseSSEData(data: string): any {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * @deprecated Use SDK event handling
 */
export function isValidSessionEvent(event: any): boolean {
  return !!(event && event.type);
}

/**
 * @deprecated Use handleSDKEvent
 */
export function createSessionUpdateEvent(
  sessionId: string,
  status: any,
  lastActivity: number,
  metadata?: any,
): SessionUpdateEvent {
  return { type: "session_update", sessionId, status, lastActivity, metadata };
}

/**
 * @deprecated Use handleSDKEvent
 */
export function createMessageEvent(
  sessionId: string,
  message: any,
): MessageEvent {
  return { type: "message", sessionId, message };
}

/**
 * @deprecated Use handleSDKEvent
 */
export function createPermissionRequestEvent(
  sessionId: string,
  permissionId: string,
  toolName: string,
  toolArgs: any,
  description: string,
): PermissionRequestEvent {
  return {
    type: "permission_request",
    sessionId,
    permissionId,
    toolName,
    toolArgs,
    description,
  };
}

export const sseManager = new SSEConnectionManager();
