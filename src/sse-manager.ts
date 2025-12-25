// SSE connection manager for real-time updates from OpenCode servers

import { EventEmitter } from 'node:events'
import { SSEEvent, SessionEvent, SessionUpdateEvent, MessageEvent, PermissionRequestEvent, Result, AppError } from './types'
import { getConfig } from './config'

// ---------------------------------------------------------------------------
// SSE Connection Events
// ---------------------------------------------------------------------------

export interface SSEConnectionEvents {
  'connected': (serverUrl: string) => void
  'disconnected': (serverUrl: string, reason: string) => void
  'reconnecting': (serverUrl: string, attempt: number) => void
  'session_update': (event: SessionUpdateEvent) => void
  'message': (event: MessageEvent) => void
  'permission_request': (event: PermissionRequestEvent) => void
  'error': (error: AppError, serverUrl: string) => void
}

// ---------------------------------------------------------------------------
// SSE Connection State
// ---------------------------------------------------------------------------

export interface SSEConnectionState {
  serverUrl: string
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
  lastConnected?: number
  lastError?: AppError
  reconnectAttempts: number
  maxReconnectAttempts: number
  reconnectDelay: number
  eventSource?: EventSource
}

// ---------------------------------------------------------------------------
// SSE Connection Manager
// ---------------------------------------------------------------------------

export class SSEConnectionManager extends EventEmitter {
  private connections = new Map<string, SSEConnectionState>()
  private config = getConfig()
  private reconnectTimers = new Map<string, NodeJS.Timeout>()

  constructor() {
    super()
  }

  /**
   * Connect to SSE endpoint for a server
   */
  async connect(serverUrl: string): Promise<Result<void>> {
    try {
      // Check if already connected or connecting
      const existing = this.connections.get(serverUrl)
      if (existing && ['connecting', 'connected'].includes(existing.status)) {
        return { success: true }
      }

      // Initialize connection state
      const state: SSEConnectionState = {
        serverUrl,
        status: 'connecting',
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        reconnectDelay: 1000
      }
      this.connections.set(serverUrl, state)

      // Create SSE connection
      const sseUrl = `${serverUrl}/api/events`
      const eventSource = new EventSource(sseUrl)

      state.eventSource = eventSource

      // Set up event handlers
      eventSource.onopen = () => {
        state.status = 'connected'
        state.lastConnected = Date.now()
        state.reconnectAttempts = 0
        state.lastError = undefined
        
        if (this.config.debugFlags.sse) {
          console.log(`SSE connected to ${serverUrl}`)
        }
        
        this.emit('connected', serverUrl)
      }

      eventSource.onerror = (event) => {
        const error: AppError = {
          code: 'NETWORK_ERROR',
          message: 'SSE connection error',
          timestamp: Date.now(),
          recoverable: true
        }
        
        state.lastError = error
        
        if (this.config.debugFlags.sse) {
          console.error(`SSE error for ${serverUrl}:`, event)
        }
        
        this.emit('error', error, serverUrl)
        this.handleConnectionError(serverUrl)
      }

      eventSource.onmessage = (event) => {
        this.handleSSEMessage(serverUrl, event)
      }

      // Handle custom event types
      eventSource.addEventListener('session_update', (event) => {
        this.handleSSEMessage(serverUrl, event as MessageEvent)
      })

      eventSource.addEventListener('message', (event) => {
        this.handleSSEMessage(serverUrl, event as MessageEvent)
      })

      eventSource.addEventListener('permission_request', (event) => {
        this.handleSSEMessage(serverUrl, event as MessageEvent)
      })

      return { success: true }
    } catch (error) {
      const appError: AppError = {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Failed to connect to SSE',
        timestamp: Date.now(),
        recoverable: true
      }

      return {
        success: false,
        error: appError
      }
    }
  }

  /**
   * Disconnect from SSE endpoint for a server
   */
  async disconnect(serverUrl: string): Promise<void> {
    const state = this.connections.get(serverUrl)
    if (!state) {
      return
    }

    // Clear reconnect timer
    const timer = this.reconnectTimers.get(serverUrl)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(serverUrl)
    }

    // Close EventSource
    if (state.eventSource) {
      state.eventSource.close()
      state.eventSource = undefined
    }

    // Update state
    state.status = 'disconnected'
    
    if (this.config.debugFlags.sse) {
      console.log(`SSE disconnected from ${serverUrl}`)
    }
    
    this.emit('disconnected', serverUrl, 'manual')
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const serverUrls = Array.from(this.connections.keys())
    await Promise.all(serverUrls.map(url => this.disconnect(url)))
    this.connections.clear()
  }

  /**
   * Get connection state for a server
   */
  getConnectionState(serverUrl: string): SSEConnectionState | undefined {
    return this.connections.get(serverUrl)
  }

  /**
   * Get all connection states
   */
  getAllConnectionStates(): Map<string, SSEConnectionState> {
    return new Map(this.connections)
  }

  /**
   * Check if connected to a server
   */
  isConnected(serverUrl: string): boolean {
    const state = this.connections.get(serverUrl)
    return state?.status === 'connected'
  }

  /**
   * Handle SSE message
   */
  private handleSSEMessage(serverUrl: string, event: MessageEvent): void {
    try {
      const sseEvent = this.parseSSEEvent(event)
      if (!sseEvent) {
        return
      }

      const sessionEvent = this.parseSessionEvent(sseEvent)
      if (!sessionEvent) {
        return
      }

      if (this.config.debugFlags.sse) {
        console.log(`SSE event from ${serverUrl}:`, sessionEvent)
      }

      // Emit typed events
      switch (sessionEvent.type) {
        case 'session_update':
          this.emit('session_update', sessionEvent as SessionUpdateEvent)
          break
        case 'message':
          this.emit('message', sessionEvent as MessageEvent)
          break
        case 'permission_request':
          this.emit('permission_request', sessionEvent as PermissionRequestEvent)
          break
      }
    } catch (error) {
      const appError: AppError = {
        code: 'INVALID_RESPONSE',
        message: error instanceof Error ? error.message : 'Failed to parse SSE message',
        timestamp: Date.now(),
        recoverable: true
      }

      if (this.config.debugFlags.sse) {
        console.error(`SSE message parsing error for ${serverUrl}:`, error)
      }

      this.emit('error', appError, serverUrl)
    }
  }

  /**
   * Parse SSE event from MessageEvent
   */
  private parseSSEEvent(event: MessageEvent): SSEEvent | null {
    try {
      const sseEvent: SSEEvent = {
        id: (event as any).lastEventId,
        event: (event as any).type,
        data: event.data
      }

      return sseEvent
    } catch (error) {
      if (this.config.debugFlags.sse) {
        console.error('Failed to parse SSE event:', error)
      }
      return null
    }
  }

  /**
   * Parse session event from SSE event data
   */
  private parseSessionEvent(sseEvent: SSEEvent): SessionEvent | null {
    try {
      const data = JSON.parse(sseEvent.data)
      
      // Validate event structure
      if (!data.type || !data.sessionId) {
        return null
      }

      return data as SessionEvent
    } catch (error) {
      if (this.config.debugFlags.sse) {
        console.error('Failed to parse session event:', error)
      }
      return null
    }
  }

  /**
   * Handle connection error and implement reconnection logic
   */
  private handleConnectionError(serverUrl: string): void {
    const state = this.connections.get(serverUrl)
    if (!state) {
      return
    }

    // Close existing connection
    if (state.eventSource) {
      state.eventSource.close()
      state.eventSource = undefined
    }

    // Check if we should attempt reconnection
    if (state.reconnectAttempts >= state.maxReconnectAttempts) {
      state.status = 'failed'
      this.emit('disconnected', serverUrl, 'max_retries_exceeded')
      return
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      state.reconnectDelay * Math.pow(2, state.reconnectAttempts),
      30000 // Max 30 seconds
    )

    state.status = 'reconnecting'
    state.reconnectAttempts++

    if (this.config.debugFlags.sse) {
      console.log(`SSE reconnecting to ${serverUrl} in ${delay}ms (attempt ${state.reconnectAttempts})`)
    }

    this.emit('reconnecting', serverUrl, state.reconnectAttempts)

    // Schedule reconnection
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(serverUrl)
      this.connect(serverUrl)
    }, delay)

    this.reconnectTimers.set(serverUrl, timer)
  }
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Create and configure SSE connection manager
 */
export function createSSEManager(): SSEConnectionManager {
  return new SSEConnectionManager()
}

/**
 * Parse SSE event data string
 */
export function parseSSEData(data: string): SessionEvent | null {
  try {
    const parsed = JSON.parse(data)
    
    if (!parsed.type || !parsed.sessionId) {
      return null
    }

    return parsed as SessionEvent
  } catch {
    return null
  }
}

/**
 * Validate session event structure
 */
export function isValidSessionEvent(event: unknown): event is SessionEvent {
  if (typeof event !== 'object' || event === null) {
    return false
  }

  const e = event as any
  
  if (typeof e.type !== 'string' || typeof e.sessionId !== 'string') {
    return false
  }

  const validTypes = ['session_update', 'message', 'permission_request']
  return validTypes.includes(e.type)
}

/**
 * Create session update event
 */
export function createSessionUpdateEvent(
  sessionId: string,
  status: string,
  lastActivity: number,
  metadata?: Record<string, unknown>
): SessionUpdateEvent {
  return {
    type: 'session_update',
    sessionId,
    status: status as any,
    lastActivity,
    metadata
  }
}

/**
 * Create message event
 */
export function createMessageEvent(
  sessionId: string,
  message: any
): MessageEvent {
  return {
    type: 'message',
    sessionId,
    message
  }
}

/**
 * Create permission request event
 */
export function createPermissionRequestEvent(
  sessionId: string,
  permissionId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  description: string
): PermissionRequestEvent {
  return {
    type: 'permission_request',
    sessionId,
    permissionId,
    toolName,
    toolArgs,
    description
  }
}

// ---------------------------------------------------------------------------
// Global SSE Manager Instance
// ---------------------------------------------------------------------------

export const sseManager = createSSEManager()