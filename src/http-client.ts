// HTTP client and OpenCode API integration

import { Session, SessionStatus, Message, Result, AsyncResult, AppError } from './types'
import { getConfig } from './config'

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface OpenCodeStatusResponse {
  sessions: OpenCodeSessionInfo[]
  server: {
    id: string
    name: string
    version?: string
    uptime: number
  }
}

export interface OpenCodeSessionInfo {
  id: string
  name: string
  status: SessionStatus
  created_at: string
  last_activity: string
  parent_id?: string
  child_ids: string[]
  project?: string
  branch?: string
  cost?: number
  tokens?: number
  is_long_running: boolean
}

export interface OpenCodeSessionDetails {
  id: string
  name: string
  status: SessionStatus
  created_at: string
  last_activity: string
  parent_id?: string
  child_ids: string[]
  project?: string
  branch?: string
  cost?: number
  tokens?: number
  is_long_running: boolean
  messages: OpenCodeMessage[]
  statistics: {
    total_messages: number
    total_cost: number
    total_tokens: number
    duration_ms: number
  }
}

export interface OpenCodeMessage {
  id: string
  timestamp: string
  type: 'user_input' | 'assistant_response' | 'tool_execution' | 'permission_request' | 'system_message' | 'error_message'
  content: string
  metadata?: {
    tool_name?: string
    tool_args?: Record<string, unknown>
    permission_type?: string
    error_code?: string
    cost?: number
    tokens?: number
  }
}

export interface SendMessageRequest {
  content: string
  type?: 'user_input' | 'system_message'
}

export interface SendMessageResponse {
  message_id: string
  status: 'sent' | 'queued' | 'error'
  error?: string
}

export interface AbortSessionResponse {
  status: 'aborted' | 'error'
  error?: string
}

// ---------------------------------------------------------------------------
// HTTP Client Pool
// ---------------------------------------------------------------------------

export class HTTPClientPool {
  private clients = new Map<string, HTTPClient>()
  private config = getConfig()

  /**
   * Get or create HTTP client for a server
   */
  getClient(serverUrl: string): HTTPClient {
    let client = this.clients.get(serverUrl)
    if (!client) {
      client = new HTTPClient(serverUrl)
      this.clients.set(serverUrl, client)
    }
    return client
  }

  /**
   * Remove client for a server
   */
  removeClient(serverUrl: string): void {
    this.clients.delete(serverUrl)
  }

  /**
   * Clear all clients
   */
  clearAll(): void {
    this.clients.clear()
  }

  /**
   * Get all active client URLs
   */
  getActiveUrls(): string[] {
    return Array.from(this.clients.keys())
  }
}

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

export class HTTPClient {
  private baseUrl: string
  private config = getConfig()

  constructor(serverUrl: string) {
    // Normalize URL by removing trailing slashes and handling multiple slashes
    let normalized = serverUrl.replace(/\/+$/, '') // Remove trailing slashes
    normalized = normalized.replace(/([^:]\/)\/+/g, '$1') // Replace multiple slashes with single slash (except after protocol)
    this.baseUrl = normalized
  }

  /**
   * Get server status and session list
   */
  async getStatus(): AsyncResult<OpenCodeStatusResponse> {
    try {
      const response = await this.fetch('/api/status')
      if (!response.ok) {
        return {
          success: false,
          error: {
            code: 'SERVER_UNREACHABLE',
            message: `Server returned ${response.status}: ${response.statusText}`,
            timestamp: Date.now(),
            recoverable: true
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: data as OpenCodeStatusResponse
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown network error',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Get detailed session information
   */
  async getSessionDetails(sessionId: string): AsyncResult<OpenCodeSessionDetails> {
    try {
      const response = await this.fetch(`/api/sessions/${sessionId}`)
      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: {
              code: 'SESSION_NOT_FOUND',
              message: `Session ${sessionId} not found`,
              timestamp: Date.now(),
              recoverable: false
            }
          }
        }

        return {
          success: false,
          error: {
            code: 'SERVER_UNREACHABLE',
            message: `Server returned ${response.status}: ${response.statusText}`,
            timestamp: Date.now(),
            recoverable: true
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: data as OpenCodeSessionDetails
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown network error',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Send message to session
   */
  async sendMessage(sessionId: string, request: SendMessageRequest): AsyncResult<SendMessageResponse> {
    try {
      const response = await this.fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: {
              code: 'SESSION_NOT_FOUND',
              message: `Session ${sessionId} not found`,
              timestamp: Date.now(),
              recoverable: false
            }
          }
        }

        if (response.status === 403) {
          return {
            success: false,
            error: {
              code: 'PERMISSION_DENIED',
              message: 'Permission denied to send message',
              timestamp: Date.now(),
              recoverable: false
            }
          }
        }

        return {
          success: false,
          error: {
            code: 'SERVER_UNREACHABLE',
            message: `Server returned ${response.status}: ${response.statusText}`,
            timestamp: Date.now(),
            recoverable: true
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: data as SendMessageResponse
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown network error',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Abort session
   */
  async abortSession(sessionId: string): AsyncResult<AbortSessionResponse> {
    try {
      const response = await this.fetch(`/api/sessions/${sessionId}/abort`, {
        method: 'POST'
      })

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: {
              code: 'SESSION_NOT_FOUND',
              message: `Session ${sessionId} not found`,
              timestamp: Date.now(),
              recoverable: false
            }
          }
        }

        return {
          success: false,
          error: {
            code: 'SERVER_UNREACHABLE',
            message: `Server returned ${response.status}: ${response.statusText}`,
            timestamp: Date.now(),
            recoverable: true
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: data as AbortSessionResponse
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown network error',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Test server health
   */
  async testHealth(): AsyncResult<boolean> {
    try {
      const response = await this.fetch('/health', {
        signal: AbortSignal.timeout(5000)
      })
      
      return {
        success: true,
        data: response.ok
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Health check failed',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Internal fetch wrapper with debugging
   */
  private async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    
    if (this.config.debug) {
      console.log(`HTTP ${options?.method || 'GET'} ${url}`)
    }

    const response = await fetch(url, {
      ...options,
      signal: options?.signal || AbortSignal.timeout(10000), // 10 second default timeout
    })

    if (this.config.debug) {
      console.log(`HTTP ${response.status} ${response.statusText}`)
    }

    return response
  }

  /**
   * Get base URL
   */
  get url(): string {
    return this.baseUrl
  }
}

// ---------------------------------------------------------------------------
// Data Conversion Utilities
// ---------------------------------------------------------------------------

/**
 * Convert OpenCode session info to internal Session type
 */
export function convertSessionInfo(
  sessionInfo: OpenCodeSessionInfo,
  serverId: string,
  serverUrl: string
): Session {
  return {
    id: sessionInfo.id,
    serverId,
    serverUrl,
    name: sessionInfo.name,
    status: sessionInfo.status,
    createdAt: new Date(sessionInfo.created_at).getTime(),
    lastActivity: new Date(sessionInfo.last_activity).getTime(),
    isLongRunning: sessionInfo.is_long_running,
    parentId: sessionInfo.parent_id,
    childIds: sessionInfo.child_ids,
    project: sessionInfo.project,
    branch: sessionInfo.branch,
    cost: sessionInfo.cost,
    tokens: sessionInfo.tokens,
    messages: [] // Messages loaded separately
  }
}

/**
 * Convert OpenCode session details to internal Session type
 */
export function convertSessionDetails(
  sessionDetails: OpenCodeSessionDetails,
  serverId: string,
  serverUrl: string
): Session {
  return {
    id: sessionDetails.id,
    serverId,
    serverUrl,
    name: sessionDetails.name,
    status: sessionDetails.status,
    createdAt: new Date(sessionDetails.created_at).getTime(),
    lastActivity: new Date(sessionDetails.last_activity).getTime(),
    isLongRunning: sessionDetails.is_long_running,
    parentId: sessionDetails.parent_id,
    childIds: sessionDetails.child_ids,
    project: sessionDetails.project,
    branch: sessionDetails.branch,
    cost: sessionDetails.cost,
    tokens: sessionDetails.tokens,
    messages: sessionDetails.messages.map(convertMessage)
  }
}

/**
 * Convert OpenCode message to internal Message type
 */
export function convertMessage(message: OpenCodeMessage): Message {
  return {
    id: message.id,
    sessionId: '', // Will be set by caller
    timestamp: new Date(message.timestamp).getTime(),
    type: message.type,
    content: message.content,
    metadata: message.metadata
  }
}

// ---------------------------------------------------------------------------
// Global Client Pool Instance
// ---------------------------------------------------------------------------

export const httpClientPool = new HTTPClientPool()