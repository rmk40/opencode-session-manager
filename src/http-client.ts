// HTTP client and OpenCode API integration using OpenCode SDK

import { Session, SessionStatus, Message, AsyncResult } from "./types";
import { getConfig } from "./config";

// ---------------------------------------------------------------------------
// SDK Integration
// ---------------------------------------------------------------------------

let createOpencodeClient: any = null;
let sdkInitialized = false;

/**
 * Initialize the OpenCode SDK
 */
export async function initSDK(): Promise<boolean> {
  if (sdkInitialized) return true;

  try {
    const sdk = await import("@opencode-ai/sdk");
    createOpencodeClient =
      sdk.createOpencodeClient || (sdk as any).default?.createOpencodeClient;

    if (!createOpencodeClient) {
      throw new Error("createOpencodeClient not found in SDK module");
    }

    sdkInitialized = true;
    return true;
  } catch (error) {
    console.error("Failed to load OpenCode SDK:", error);
    return false;
  }
}

/**
 * Create an OpenCode SDK client
 */
function createSDKClient(baseUrl: string): any {
  if (!createOpencodeClient) return null;
  return createOpencodeClient({ baseUrl });
}

// ---------------------------------------------------------------------------
// SDK Response Types (matching OpenCode SDK)
// ---------------------------------------------------------------------------

export interface OpenCodeStatusResponse {
  [sessionId: string]: {
    type: string;
    status?: string;
    name?: string;
    title?: string;
    created_at?: string;
    last_activity?: string;
    is_long_running?: boolean;
    parent_id?: string;
    parentID?: string;
    child_ids?: string[];
    project?: string;
    branch?: string;
    cost?: number;
    tokens?: number;
  };
}

export interface OpenCodeSessionInfo {
  id: string;
  name?: string;
  title?: string;
  parent_id?: string;
  parentID?: string;
  child_ids?: string[];
  directory?: string;
  status?: string;
  project?: string;
  branch?: string;
  cost?: number;
  tokens?: number;
  created_at?: string;
  last_activity?: string;
  is_long_running?: boolean;
}

export interface OpenCodeSessionDetails extends OpenCodeSessionInfo {
  messages?: OpenCodeMessage[];
  statistics?: {
    total_messages?: number;
    total_cost?: number;
    total_tokens?: number;
    duration_ms?: number;
  };
}

export interface OpenCodeMessage {
  info: {
    id: string;
    sessionID: string;
    role: "user" | "assistant" | "system";
    time: {
      created: number;
    };
    cost?: number;
    tokens?: {
      input: number;
      output: number;
    };
  };
  parts: Array<{
    type: string;
    text?: string;
    reasoning?: string;
    tool?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    permissionID?: string;
    content?: string;
    state?: {
      status: string;
      title?: string;
      input?: Record<string, unknown>;
      output?: string;
    };
  }>;
}

export interface SendMessageRequest {
  content: string;
  type?: "user_input" | "system_message";
}

export interface SendMessageResponse {
  message_id: string;
  status: "sent" | "queued" | "error";
  error?: string;
}

export interface AbortSessionResponse {
  status: "aborted" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// SDK Client Pool
// ---------------------------------------------------------------------------

export class HTTPClientPool {
  private clients = new Map<string, HTTPClient>();

  /**
   * Initialize SDK if not already done
   */
  async initialize(): Promise<boolean> {
    return await initSDK();
  }

  /**
   * Get or create HTTP client for a server
   */
  async getClient(serverUrl: string): Promise<HTTPClient | null> {
    // Ensure SDK is initialized
    if (!(await this.initialize())) {
      return null;
    }

    let client = this.clients.get(serverUrl);
    if (!client) {
      client = new HTTPClient(serverUrl);
      this.clients.set(serverUrl, client);
    }
    return client;
  }

  /**
   * Remove client for a server
   */
  removeClient(serverUrl: string): void {
    this.clients.delete(serverUrl);
  }

  /**
   * Clear all clients
   */
  clearAll(): void {
    this.clients.clear();
  }

  /**
   * Get all active client URLs
   */
  getActiveUrls(): string[] {
    return Array.from(this.clients.keys());
  }
}

// ---------------------------------------------------------------------------
// SDK Client
// ---------------------------------------------------------------------------

export class HTTPClient {
  private baseUrl: string;
  private config = getConfig();
  private sdkClient: any = null;

  constructor(serverUrl: string) {
    // Normalize URL by removing trailing slashes and handling multiple slashes
    let normalized = serverUrl.replace(/\/+$/, ""); // Remove trailing slashes
    normalized = normalized.replace(/([^:]\/)\/+/g, "$1"); // Replace multiple slashes with single slash (except after protocol)
    this.baseUrl = normalized;

    // Create SDK client
    this.sdkClient = createSDKClient(this.baseUrl);
  }

  /**
   * Get all sessions from server and merge with their status
   */
  async getSessions(
    serverId: string,
    project?: string,
    branch?: string,
  ): AsyncResult<Session[]> {
    if (!this.sdkClient) {
      return {
        success: false,
        error: {
          code: "SDK_NOT_AVAILABLE",
          message: "OpenCode SDK not available",
          timestamp: Date.now(),
          recoverable: false,
        },
      };
    }

    try {
      // Fetch both list and status in parallel
      const [listResponse, statusResponse] = await Promise.all([
        this.sdkClient.session.list(),
        this.sdkClient.session.status(),
      ]);

      const sessions: any[] = listResponse.data || [];
      const statusMap: Record<string, any> = statusResponse.data || {};

      const convertedSessions = sessions.map((s) => {
        const statusData = statusMap[s.id] || { type: "idle" };
        return convertSessionInfo(
          s.id,
          { ...s, ...statusData },
          serverId,
          this.baseUrl,
          project,
          branch,
        );
      });

      return {
        success: true,
        data: convertedSessions,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown SDK error",
          timestamp: Date.now(),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Get server status and session list using SDK
   * @deprecated Use getSessions
   */
  async getStatus(): AsyncResult<OpenCodeStatusResponse> {
    if (!this.sdkClient) {
      return {
        success: false,
        error: {
          code: "SDK_NOT_AVAILABLE",
          message: "OpenCode SDK not available",
          timestamp: Date.now(),
          recoverable: false,
        },
      };
    }

    try {
      const response = await this.sdkClient.session.status();

      return {
        success: true,
        data: response.data || {},
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown SDK error",
          timestamp: Date.now(),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Get detailed session information using SDK
   */
  async getSessionDetails(
    sessionId: string,
  ): AsyncResult<OpenCodeSessionDetails> {
    if (!this.sdkClient) {
      return {
        success: false,
        error: {
          code: "SDK_NOT_AVAILABLE",
          message: "OpenCode SDK not available",
          timestamp: Date.now(),
          recoverable: false,
        },
      };
    }

    try {
      // Fetch both session info and messages
      const [sessionResponse, messagesResponse] = await Promise.all([
        this.sdkClient.session.get({ path: { id: sessionId } }),
        this.sdkClient.session.messages({ path: { id: sessionId } }),
      ]);

      if (!sessionResponse.data) {
        return {
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: `Session ${sessionId} not found`,
            timestamp: Date.now(),
            recoverable: false,
          },
        };
      }

      const sessionData = sessionResponse.data;
      const messagesData = messagesResponse.data || [];

      return {
        success: true,
        data: {
          ...sessionData,
          messages: messagesData,
        } as unknown as OpenCodeSessionDetails,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown SDK error",
          timestamp: Date.now(),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Send message to session (not implemented in current SDK)
   */
  async sendMessage(
    _sessionId: string,
    _request: SendMessageRequest,
  ): AsyncResult<SendMessageResponse> {
    return {
      success: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Send message not implemented in current SDK",
        timestamp: Date.now(),
        recoverable: false,
      },
    };
  }

  /**
   * Abort session using SDK
   */
  async abortSession(sessionId: string): AsyncResult<AbortSessionResponse> {
    if (!this.sdkClient) {
      return {
        success: false,
        error: {
          code: "SDK_NOT_AVAILABLE",
          message: "OpenCode SDK not available",
          timestamp: Date.now(),
          recoverable: false,
        },
      };
    }

    try {
      await this.sdkClient.session.abort({
        path: { id: sessionId },
      });

      return {
        success: true,
        data: { status: "aborted" },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown SDK error",
          timestamp: Date.now(),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Resolve a permission request using SDK
   */
  async resolvePermission(
    sessionId: string,
    permissionId: string,
    response: "once" | "always" | "reject",
  ): AsyncResult<void> {
    if (!this.sdkClient) {
      return {
        success: false,
        error: {
          code: "SDK_NOT_AVAILABLE",
          message: "OpenCode SDK not available",
          timestamp: Date.now(),
          recoverable: false,
        },
      };
    }

    try {
      await this.sdkClient.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response },
      });

      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown SDK error",
          timestamp: Date.now(),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Test server health using SDK
   */
  async testHealth(): AsyncResult<boolean> {
    if (!this.sdkClient) {
      return {
        success: false,
        error: {
          code: "SDK_NOT_AVAILABLE",
          message: "OpenCode SDK not available",
          timestamp: Date.now(),
          recoverable: false,
        },
      };
    }

    try {
      // Try to get status as a health check
      const result = await this.getStatus();
      return {
        success: true,
        data: result.success,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message:
            error instanceof Error ? error.message : "Health check failed",
          timestamp: Date.now(),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Subscribe to server events using SDK
   */
  async subscribe(onEvent: (event: any) => void): Promise<void> {
    if (!this.sdkClient) return;

    try {
      const response = await this.sdkClient.event.subscribe();
      if (response.stream) {
        for await (const event of response.stream) {
          onEvent(event);
        }
      }
    } catch (error) {
      if (this.config.debug) {
        console.error(`SSE stream error for ${this.baseUrl}:`, error);
      }
    }
  }

  /**
   * Get base URL
   */
  get url(): string {
    return this.baseUrl;
  }
}

// ---------------------------------------------------------------------------
// Data Conversion Utilities
// ---------------------------------------------------------------------------

/**
 * Map SDK status strings to our SessionStatus enum
 */
function mapSDKStatusToSessionStatus(sdkStatus: string): SessionStatus {
  switch (sdkStatus.toLowerCase()) {
    case "idle":
      return "idle";
    case "busy":
    case "running":
      return "busy";
    case "pending":
      return "waiting_for_permission";
    case "completed":
      return "completed";
    case "error":
      return "error";
    case "aborted":
      return "aborted";
    default:
      return "idle";
  }
}

/**
 * Convert OpenCode message to internal Message type
 */
export function convertMessage(message: OpenCodeMessage): Message {
  const { info, parts } = message;

  // Concatenate all text and reasoning parts for backward compatibility / simple views
  const textParts = parts
    .filter((p) => ["text", "reasoning"].includes(p.type))
    .map((p) => p.text || p.content || "")
    .filter(Boolean);

  const textContent = textParts.join("\n");

  // Find first tool execution or permission request
  const toolPart = parts.find((p) =>
    ["tool", "permission", "call"].includes(p.type),
  );

  return {
    id: info.id,
    sessionId: info.sessionID,
    timestamp: info.time.created,
    role: info.role,
    type:
      info.role === "user"
        ? "user_input"
        : toolPart
          ? toolPart.type === "permission"
            ? "permission_request"
            : "tool_execution"
          : "assistant_response",
    content: textContent || toolPart?.text || toolPart?.content || "",
    parts: parts.map((p) => ({
      ...p,
      tool: p.tool || p.toolName,
      toolName: p.toolName || p.tool,
    })),
    metadata: {
      toolName: toolPart?.toolName || (toolPart as any)?.name,
      toolArgs: toolPart?.toolArgs || (toolPart as any)?.args,
      cost: info.cost,
      tokens: info.tokens?.output,
    },
  };
}

/**
 * Convert OpenCode SDK session info to internal Session type
 */
export function convertSessionInfo(
  sessionId: string,
  statusData: any,
  serverId: string,
  serverUrl: string,
  project?: string,
  branch?: string,
): Session {
  const status =
    typeof statusData === "string"
      ? statusData
      : statusData?.type || statusData?.status || "idle";

  return {
    id: sessionId,
    serverId,
    serverUrl,
    name:
      statusData?.name ||
      statusData?.title ||
      `Session ${sessionId.slice(0, 8)}`,
    status: mapSDKStatusToSessionStatus(status),
    createdAt: statusData?.created_at
      ? new Date(statusData.created_at).getTime()
      : statusData?.time?.created || Date.now(),
    lastActivity: statusData?.last_activity
      ? new Date(statusData.last_activity).getTime()
      : statusData?.time?.updated || Date.now(),
    isLongRunning:
      statusData?.is_long_running || statusData?.isLongRunning || false,
    parentId: statusData?.parent_id || statusData?.parentID || undefined,
    childIds: statusData?.child_ids || [],
    project:
      statusData?.project || statusData?.projectID || project || undefined,
    branch: statusData?.branch || branch || undefined,
    cost: statusData?.cost || undefined,
    tokens: statusData?.tokens || undefined,
    messages: [], // Messages loaded separately
  };
}

/**
 * @deprecated Use convertSessionInfo
 */
export const convertSessionFromStatus = convertSessionInfo;

/**
 * Convert OpenCode SDK session details to internal Session type
 */
export function convertSessionDetails(
  sessionDetails: any,
  serverId: string,
  serverUrl: string,
): Session {
  return {
    id: sessionDetails.id,
    serverId,
    serverUrl,
    name:
      sessionDetails.name ||
      sessionDetails.title ||
      `Session ${sessionDetails.id.slice(0, 8)}`,
    status: mapSDKStatusToSessionStatus(sessionDetails.status || "idle"),
    createdAt: sessionDetails.created_at
      ? new Date(sessionDetails.created_at).getTime()
      : sessionDetails.time?.created || Date.now(),
    lastActivity: sessionDetails.last_activity
      ? new Date(sessionDetails.last_activity).getTime()
      : sessionDetails.time?.updated || Date.now(),
    isLongRunning:
      sessionDetails.is_long_running || sessionDetails.isLongRunning || false,
    parentId: sessionDetails.parent_id || sessionDetails.parentID || undefined,
    childIds: sessionDetails.child_ids || [],
    project: sessionDetails.project || sessionDetails.projectID || undefined,
    branch: sessionDetails.branch || undefined,
    cost: sessionDetails.cost || undefined,
    tokens: sessionDetails.tokens || undefined,
    messages: (sessionDetails.messages || []).map((m: any) =>
      convertMessage(m),
    ),
  };
}

// ---------------------------------------------------------------------------
// Global Client Pool Instance
// ---------------------------------------------------------------------------

export const httpClientPool = new HTTPClientPool();
