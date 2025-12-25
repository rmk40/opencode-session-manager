// Core data models and types for OpenCode Session Monitor

// ---------------------------------------------------------------------------
// Server and Instance Types
// ---------------------------------------------------------------------------

export interface Server {
  id: string;
  url: string;
  name: string;
  project?: string;
  branch?: string;
  lastSeen: number;
  isHealthy: boolean;
  version?: string;
  sessions: Session[];
}

export interface Instance {
  serverId: string;
  serverUrl: string;
  serverName: string;
  lastAnnouncement: number;
  isStale: boolean;
}

// ---------------------------------------------------------------------------
// Session Types
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  serverId: string;
  serverUrl: string;
  name: string;
  status: SessionStatus;
  createdAt: number;
  lastActivity: number;
  isLongRunning: boolean;
  parentId?: string;
  childIds: string[];
  project?: string;
  branch?: string;
  cost?: number;
  tokens?: number;
  messages: Message[];
  children?: Session[]; // For hierarchical display
}

export type SessionStatus =
  | "idle"
  | "busy"
  | "waiting_for_permission"
  | "completed"
  | "error"
  | "aborted";

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  sessionId: string;
  timestamp: number;
  type: MessageType;
  role: "user" | "assistant" | "system";
  content: string;
  parts?: MessagePart[];
  metadata?: MessageMetadata;
}

export interface MessagePart {
  type: string;
  text?: string;
  content?: string;
  reasoning?: string;
  tool?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  permissionID?: string;
  state?: {
    status: string;
    title?: string;
    input?: Record<string, unknown>;
    output?: string;
  };
}

export type MessageType =
  | "user_input"
  | "assistant_response"
  | "tool_execution"
  | "permission_request"
  | "system_message"
  | "error_message";

export interface MessageMetadata {
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  permissionId?: string;
  permissionType?: string;
  errorCode?: string;
  cost?: number;
  tokens?: number;
}

// ---------------------------------------------------------------------------
// Network Protocol Types
// ---------------------------------------------------------------------------

export interface AnnouncePacket {
  type: "announce";
  serverId: string;
  serverUrl: string;
  serverName: string;
  project?: string;
  branch?: string;
  version?: string;
  timestamp: number;
}

export interface ShutdownPacket {
  type: "shutdown";
  serverId: string;
  timestamp: number;
}

export type UDPPacket = AnnouncePacket | ShutdownPacket;

// ---------------------------------------------------------------------------
// SSE Event Types
// ---------------------------------------------------------------------------

export interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export interface SessionUpdateEvent {
  type: "session_update";
  sessionId: string;
  status: SessionStatus;
  lastActivity: number;
  metadata?: Record<string, unknown>;
}

export interface MessageEvent {
  type: "message";
  sessionId: string;
  message: Message;
}

export interface PermissionRequestEvent {
  type: "permission_request";
  sessionId: string;
  permissionId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  description: string;
}

export type SessionEvent =
  | SessionUpdateEvent
  | MessageEvent
  | PermissionRequestEvent;

// ---------------------------------------------------------------------------
// UI State Types
// ---------------------------------------------------------------------------

export interface AppState {
  servers: Map<string, Server>;
  sessions: Map<string, Session>;
  selectedSessionId?: string;
  currentView: ViewMode;
  groupBy: GroupMode;
  sortBy: SortMode;
  showOnlyActive: boolean;
  expandedGroups: Set<string>;
  notifications: NotificationState;
  error?: AppError | null;
}

export type ViewMode = "list" | "session" | "help";
export type GroupMode = "none" | "project" | "server";
export type SortMode = "name" | "activity" | "created" | "cost";

export interface NotificationState {
  enabled: boolean;
  lastNotified: Map<string, number>;
  pendingPermissions: Set<string>;
}

// ---------------------------------------------------------------------------
// View Models
// ---------------------------------------------------------------------------

export interface SessionGroup {
  id: string;
  name: string;
  sessions: Session[];
  totalCost: number;
  totalTokens: number;
  isExpanded: boolean;
}

export interface SessionListItem {
  session: Session;
  serverName: string;
  isSelected: boolean;
  statusIndicator: string;
  activityIndicator: string;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
  recoverable: boolean;
}

export type ErrorCode =
  | "NETWORK_ERROR"
  | "SERVER_UNREACHABLE"
  | "INVALID_RESPONSE"
  | "SESSION_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN_ERROR";

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

export interface Config {
  port: number;
  staleTimeoutMs: number;
  longRunningMs: number;
  notifyEnabled: boolean;
  debug: boolean;
  debugFlags: {
    sse: boolean;
    state: boolean;
    udp: boolean;
  };
  refreshInterval: number;
  sessionRefreshInterval: number;
  pidFile: string;
  logFile: string;
}

// ---------------------------------------------------------------------------
// Utility Types
// ---------------------------------------------------------------------------

export interface Result<T, E = AppError> {
  success: boolean;
  data?: T;
  error?: E;
}

export type AsyncResult<T, E = AppError> = Promise<Result<T, E>>;

// Type guards
export function isAnnouncePacket(packet: unknown): packet is AnnouncePacket {
  return (
    typeof packet === "object" &&
    packet !== null &&
    "type" in packet &&
    packet.type === "announce" &&
    "serverId" in packet &&
    "serverUrl" in packet &&
    "serverName" in packet
  );
}

export function isShutdownPacket(packet: unknown): packet is ShutdownPacket {
  return (
    typeof packet === "object" &&
    packet !== null &&
    "type" in packet &&
    packet.type === "shutdown" &&
    "serverId" in packet
  );
}

export function isSessionEvent(event: unknown): event is SessionEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    ["session_update", "message", "permission_request"].includes(
      event.type as string,
    )
  );
}
