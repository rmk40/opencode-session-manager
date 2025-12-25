// Connection manager with server lifecycle management

import { EventEmitter } from 'node:events'
import { Server, Session, Instance, AnnouncePacket, ShutdownPacket, Result, AppError, AsyncResult, SessionUpdateEvent, MessageEvent, PermissionRequestEvent } from './types'
import { UDPDiscovery } from './udp-discovery'
import { HTTPClientPool } from './http-client'
import { SSEConnectionManager } from './sse-manager'
import { convertSessionInfo, convertSessionDetails } from './http-client'
import { getConfig } from './config'

// ---------------------------------------------------------------------------
// Connection Manager Events
// ---------------------------------------------------------------------------

export interface ConnectionManagerEvents {
  server_discovered: [server: Server]
  server_updated: [server: Server]
  server_removed: [serverId: string, reason: string]
  session_updated: [session: Session]
  session_added: [session: Session]
  session_removed: [sessionId: string]
  error: [error: AppError]
}

// ---------------------------------------------------------------------------
// Connection Manager
// ---------------------------------------------------------------------------

export class ConnectionManager extends EventEmitter {
  private servers = new Map<string, Server>()
  private sessions = new Map<string, Session>()
  private instances = new Map<string, Instance>()
  private udpDiscovery: UDPDiscovery
  private httpPool: HTTPClientPool
  private sseManager: SSEConnectionManager
  private config = getConfig()
  private refreshTimer?: NodeJS.Timeout
  private staleCheckTimer?: NodeJS.Timeout

  constructor() {
    super()
    
    this.udpDiscovery = new UDPDiscovery()
    this.httpPool = new HTTPClientPool()
    this.sseManager = new SSEConnectionManager()
    
    this.setupEventHandlers()
  }

  /**
   * Start the connection manager
   */
  async start(): Promise<Result<void>> {
    try {
      // Start UDP discovery
      await this.udpDiscovery.start()
      
      // Start periodic refresh
      this.startPeriodicRefresh()
      
      // Start stale server checking
      this.startStaleServerCheck()
      
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start connection manager',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Stop the connection manager
   */
  async stop(): Promise<void> {
    // Stop timers
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = undefined
    }
    
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer)
      this.staleCheckTimer = undefined
    }
    
    // Stop components
    await this.udpDiscovery.stop()
    await this.sseManager.disconnectAll()
    this.httpPool.clearAll()
    
    // Clear state
    this.servers.clear()
    this.sessions.clear()
    this.instances.clear()
  }

  /**
   * Get all servers
   */
  getServers(): Map<string, Server> {
    return new Map(this.servers)
  }

  /**
   * Get server by ID
   */
  getServer(serverId: string): Server | undefined {
    return this.servers.get(serverId)
  }

  /**
   * Get all sessions
   */
  getSessions(): Map<string, Session> {
    return new Map(this.sessions)
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get sessions for a server
   */
  getSessionsForServer(serverId: string): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.serverId === serverId)
  }

  /**
   * Get active sessions (not completed or aborted)
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => 
      !['completed', 'aborted', 'error'].includes(s.status)
    )
  }

  /**
   * Get long-running sessions
   */
  getLongRunningSessions(): Session[] {
    const now = Date.now()
    const threshold = this.config.longRunningMs
    
    return Array.from(this.sessions.values()).filter(s => {
      const duration = now - s.createdAt
      return duration > threshold || s.isLongRunning
    })
  }

  /**
   * Refresh sessions for a specific server
   */
  async refreshServer(serverId: string): AsyncResult<void> {
    const server = this.servers.get(serverId)
    if (!server) {
      return {
        success: false,
        error: {
          code: 'SERVER_UNREACHABLE',
          message: `Server ${serverId} not found`,
          timestamp: Date.now(),
          recoverable: false
        }
      }
    }

    try {
      const client = this.httpPool.getClient(server.url)
      const statusResult = await client.getStatus()
      
      if (!statusResult.success) {
        server.isHealthy = false
        this.servers.set(serverId, server)
        return {
          success: false,
          error: statusResult.error
        }
      }

      const status = statusResult.data!
      
      // Update server info
      server.isHealthy = true
      server.version = status.server.version
      server.sessions = status.sessions.map(sessionInfo => 
        convertSessionInfo(sessionInfo, serverId, server.url)
      )
      
      this.servers.set(serverId, server)
      this.emit('server_updated', server)
      
      // Update sessions
      this.updateSessionsFromServer(server)
      
      return { success: true }
    } catch (error) {
      const appError: AppError = {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Failed to refresh server',
        timestamp: Date.now(),
        recoverable: true
      }
      
      // Mark server as unhealthy
      server.isHealthy = false
      this.servers.set(serverId, server)
      
      return {
        success: false,
        error: appError
      }
    }
  }

  /**
   * Refresh all servers
   */
  async refreshAllServers(): Promise<void> {
    const serverIds = Array.from(this.servers.keys())
    await Promise.allSettled(serverIds.map(id => this.refreshServer(id)))
  }

  /**
   * Get detailed session information
   */
  async getSessionDetails(sessionId: string): AsyncResult<Session> {
    const session = this.sessions.get(sessionId)
    if (!session) {
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

    try {
      const client = this.httpPool.getClient(session.serverUrl)
      const detailsResult = await client.getSessionDetails(sessionId)
      
      if (!detailsResult.success) {
        return {
          success: false,
          error: detailsResult.error
        }
      }

      const details = detailsResult.data!
      const detailedSession = convertSessionDetails(details, session.serverId, session.serverUrl)
      
      // Update session in memory
      this.sessions.set(sessionId, detailedSession)
      this.emit('session_updated', detailedSession)
      
      return {
        success: true,
        data: detailedSession
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get session details',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Send message to session
   */
  async sendMessage(sessionId: string, content: string): AsyncResult<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
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

    try {
      const client = this.httpPool.getClient(session.serverUrl)
      const result = await client.sendMessage(sessionId, { content, type: 'user_input' })
      
      if (result.success) {
        // Refresh session to get updated state
        await this.refreshServer(session.serverId)
        return { success: true }
      }
      
      return {
        success: false,
        error: result.error
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to send message',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Abort session
   */
  async abortSession(sessionId: string): AsyncResult<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
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

    try {
      const client = this.httpPool.getClient(session.serverUrl)
      const result = await client.abortSession(sessionId)
      
      if (result.success) {
        // Refresh session to get updated state
        await this.refreshServer(session.serverId)
        return { success: true }
      }
      
      return {
        success: false,
        error: result.error
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to abort session',
          timestamp: Date.now(),
          recoverable: true
        }
      }
    }
  }

  /**
   * Setup event handlers for UDP discovery and SSE
   */
  private setupEventHandlers(): void {
    // UDP Discovery events
    this.udpDiscovery.on('server_announced', (packet: AnnouncePacket) => {
      this.handleServerAnnouncement(packet)
    })

    this.udpDiscovery.on('server_shutdown', (packet: ShutdownPacket) => {
      this.handleServerShutdown(packet)
    })

    this.udpDiscovery.on('error', (error: Error) => {
      this.emit('error', {
        code: 'NETWORK_ERROR',
        message: error.message,
        timestamp: Date.now(),
        recoverable: true
      })
    })

    // SSE events
    this.sseManager.on('session_update', (event: SessionUpdateEvent) => {
      this.handleSessionUpdate(event)
    })

    this.sseManager.on('message', (event: MessageEvent) => {
      this.handleSessionMessage(event)
    })

    this.sseManager.on('permission_request', (event: PermissionRequestEvent) => {
      this.handlePermissionRequest(event)
    })

    this.sseManager.on('error', (error: AppError) => {
      this.emit('error', error)
    })
  }

  /**
   * Handle server announcement from UDP
   */
  private async handleServerAnnouncement(packet: AnnouncePacket): Promise<void> {
    const existingServer = this.servers.get(packet.serverId)
    
    if (existingServer) {
      // Update existing server
      existingServer.url = packet.serverUrl
      existingServer.name = packet.serverName
      existingServer.lastSeen = packet.timestamp
      existingServer.version = packet.version
      existingServer.isHealthy = true
      
      this.servers.set(packet.serverId, existingServer)
      this.emit('server_updated', existingServer)
    } else {
      // Create new server
      const server: Server = {
        id: packet.serverId,
        url: packet.serverUrl,
        name: packet.serverName,
        lastSeen: packet.timestamp,
        isHealthy: true,
        version: packet.version,
        sessions: []
      }
      
      this.servers.set(packet.serverId, server)
      this.emit('server_discovered', server)
      
      // Connect to SSE for real-time updates
      await this.sseManager.connect(packet.serverUrl)
    }
    
    // Update instance tracking
    const instance: Instance = {
      serverId: packet.serverId,
      serverUrl: packet.serverUrl,
      serverName: packet.serverName,
      lastAnnouncement: packet.timestamp,
      isStale: false
    }
    
    this.instances.set(packet.serverId, instance)
    
    // Refresh server data
    await this.refreshServer(packet.serverId)
  }

  /**
   * Handle server shutdown from UDP
   */
  private async handleServerShutdown(packet: ShutdownPacket): Promise<void> {
    const server = this.servers.get(packet.serverId)
    if (server) {
      // Disconnect SSE
      await this.sseManager.disconnect(server.url)
      
      // Remove HTTP client
      this.httpPool.removeClient(server.url)
      
      // Remove server and its sessions
      this.servers.delete(packet.serverId)
      this.instances.delete(packet.serverId)
      
      // Remove sessions for this server
      const sessionsToRemove = Array.from(this.sessions.entries())
        .filter(([_, session]) => session.serverId === packet.serverId)
        .map(([sessionId, _]) => sessionId)
      
      for (const sessionId of sessionsToRemove) {
        this.sessions.delete(sessionId)
        this.emit('session_removed', sessionId)
      }
      
      this.emit('server_removed', packet.serverId, 'shutdown')
    }
  }

  /**
   * Handle session update from SSE
   */
  private handleSessionUpdate(event: SessionUpdateEvent): void {
    const session = this.sessions.get(event.sessionId)
    if (session) {
      session.status = event.status
      session.lastActivity = event.lastActivity
      
      this.sessions.set(event.sessionId, session)
      this.emit('session_updated', session)
    }
  }

  /**
   * Handle session message from SSE
   */
  private handleSessionMessage(event: MessageEvent): void {
    const session = this.sessions.get(event.sessionId)
    if (session) {
      // Add message to session
      const message = {
        ...event.message,
        sessionId: event.sessionId
      }
      
      session.messages.push(message)
      session.lastActivity = Date.now()
      
      this.sessions.set(event.sessionId, session)
      this.emit('session_updated', session)
    }
  }

  /**
   * Handle permission request from SSE
   */
  private handlePermissionRequest(event: PermissionRequestEvent): void {
    // Permission requests are handled by the UI layer
    // Just update session status if needed
    const session = this.sessions.get(event.sessionId)
    if (session && session.status !== 'waiting_for_permission') {
      session.status = 'waiting_for_permission'
      session.lastActivity = Date.now()
      
      this.sessions.set(event.sessionId, session)
      this.emit('session_updated', session)
    }
  }

  /**
   * Update sessions from server data
   */
  private updateSessionsFromServer(server: Server): void {
    const existingSessionIds = new Set(
      Array.from(this.sessions.values())
        .filter(s => s.serverId === server.id)
        .map(s => s.id)
    )
    
    const newSessionIds = new Set(server.sessions.map(s => s.id))
    
    // Add new sessions
    for (const session of server.sessions) {
      const existing = this.sessions.get(session.id)
      if (existing) {
        // Update existing session
        const updated = { ...existing, ...session }
        this.sessions.set(session.id, updated)
        this.emit('session_updated', updated)
      } else {
        // Add new session
        this.sessions.set(session.id, session)
        this.emit('session_added', session)
      }
    }
    
    // Remove sessions that no longer exist
    for (const sessionId of existingSessionIds) {
      if (!newSessionIds.has(sessionId)) {
        this.sessions.delete(sessionId)
        this.emit('session_removed', sessionId)
      }
    }
  }

  /**
   * Start periodic refresh of all servers
   */
  private startPeriodicRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.refreshAllServers()
    }, this.config.sessionRefreshInterval)
  }

  /**
   * Start periodic stale server checking
   */
  private startStaleServerCheck(): void {
    this.staleCheckTimer = setInterval(() => {
      this.checkStaleServers()
    }, this.config.staleTimeoutMs)
  }

  /**
   * Check for stale servers and remove them
   */
  private checkStaleServers(): void {
    const now = Date.now()
    const staleThreshold = this.config.staleTimeoutMs
    
    for (const [serverId, instance] of this.instances) {
      const timeSinceLastSeen = now - instance.lastAnnouncement
      
      if (timeSinceLastSeen > staleThreshold) {
        instance.isStale = true
        
        // Remove stale server
        const server = this.servers.get(serverId)
        if (server) {
          this.handleServerShutdown({ type: 'shutdown', serverId, timestamp: now })
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Global Connection Manager Instance
// ---------------------------------------------------------------------------

export const connectionManager = new ConnectionManager()