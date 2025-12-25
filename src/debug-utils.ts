// Debug logging and packet inspection tools

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { UDPPacket, SSEEvent, Session, Server, AppError } from './types'
import { getConfig } from './config'

// ---------------------------------------------------------------------------
// Debug Logger
// ---------------------------------------------------------------------------

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export class DebugLogger {
  private config = getConfig()
  private logFile: string
  private logLevel: LogLevel

  constructor(logFile?: string, logLevel: LogLevel = LogLevel.INFO) {
    this.logFile = logFile || this.config.logFile
    this.logLevel = logLevel
    
    // Ensure log directory exists
    const logDir = join(process.cwd(), 'logs')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
  }

  /**
   * Log an error message
   */
  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data)
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, data)
  }

  /**
   * Log an info message
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, data)
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data)
  }

  /**
   * Log a trace message
   */
  trace(message: string, data?: any): void {
    this.log(LogLevel.TRACE, 'TRACE', message, data)
  }

  /**
   * Log a message at the specified level
   */
  private log(level: LogLevel, levelName: string, message: string, data?: any): void {
    if (level > this.logLevel) {
      return
    }

    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level: levelName,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined
    }

    const logLine = `[${timestamp}] ${levelName}: ${message}${data ? `\n${JSON.stringify(data, null, 2)}` : ''}\n`

    // Write to console if debug mode is enabled
    if (this.config.debug) {
      console.log(logLine.trim())
    }

    // Write to file
    try {
      appendFileSync(this.logFile, logLine)
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  /**
   * Clear log file
   */
  clearLog(): void {
    try {
      writeFileSync(this.logFile, '')
    } catch (error) {
      console.error('Failed to clear log file:', error)
    }
  }
}

// ---------------------------------------------------------------------------
// Packet Inspector
// ---------------------------------------------------------------------------

export class PacketInspector {
  private logger: DebugLogger
  private packetLog: string

  constructor(logger?: DebugLogger) {
    this.logger = logger || new DebugLogger()
    this.packetLog = join(process.cwd(), 'logs', 'packets.log')
  }

  /**
   * Inspect UDP packet
   */
  inspectUDPPacket(packet: UDPPacket, source: string): void {
    const inspection = {
      timestamp: new Date().toISOString(),
      type: 'UDP',
      source,
      packet: {
        type: packet.type,
        serverId: packet.serverId,
        ...(packet.type === 'announce' ? {
          serverUrl: packet.serverUrl,
          serverName: packet.serverName,
          version: packet.version
        } : {}),
        timestamp: packet.timestamp
      },
      validation: this.validateUDPPacket(packet)
    }

    this.logPacket(inspection)
    
    if (this.logger) {
      this.logger.debug(`UDP packet received from ${source}`, inspection.packet)
    }
  }

  /**
   * Inspect SSE event
   */
  inspectSSEEvent(event: SSEEvent, source: string): void {
    const inspection = {
      timestamp: new Date().toISOString(),
      type: 'SSE',
      source,
      event: {
        id: event.id,
        event: event.event,
        data: event.data,
        retry: event.retry
      },
      validation: this.validateSSEEvent(event)
    }

    this.logPacket(inspection)
    
    if (this.logger) {
      this.logger.debug(`SSE event received from ${source}`, inspection.event)
    }
  }

  /**
   * Inspect session data
   */
  inspectSession(session: Session, operation: string): void {
    const inspection = {
      timestamp: new Date().toISOString(),
      type: 'SESSION',
      operation,
      session: {
        id: session.id,
        serverId: session.serverId,
        name: session.name,
        status: session.status,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        isLongRunning: session.isLongRunning,
        messageCount: session.messages.length,
        cost: session.cost,
        tokens: session.tokens
      },
      validation: this.validateSession(session)
    }

    this.logPacket(inspection)
    
    if (this.logger) {
      this.logger.debug(`Session ${operation}: ${session.id}`, inspection.session)
    }
  }

  /**
   * Inspect server data
   */
  inspectServer(server: Server, operation: string): void {
    const inspection = {
      timestamp: new Date().toISOString(),
      type: 'SERVER',
      operation,
      server: {
        id: server.id,
        url: server.url,
        name: server.name,
        lastSeen: server.lastSeen,
        isHealthy: server.isHealthy,
        version: server.version,
        sessionCount: server.sessions.length
      },
      validation: this.validateServer(server)
    }

    this.logPacket(inspection)
    
    if (this.logger) {
      this.logger.debug(`Server ${operation}: ${server.id}`, inspection.server)
    }
  }

  /**
   * Inspect error
   */
  inspectError(error: AppError, context: string): void {
    const inspection = {
      timestamp: new Date().toISOString(),
      type: 'ERROR',
      context,
      error: {
        code: error.code,
        message: error.message,
        timestamp: error.timestamp,
        recoverable: error.recoverable,
        details: error.details
      }
    }

    this.logPacket(inspection)
    
    if (this.logger) {
      this.logger.error(`Error in ${context}: ${error.message}`, inspection.error)
    }
  }

  /**
   * Validate UDP packet structure
   */
  private validateUDPPacket(packet: UDPPacket): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    if (!packet.type || !['announce', 'shutdown'].includes(packet.type)) {
      issues.push('Invalid or missing packet type')
    }

    if (!packet.serverId || typeof packet.serverId !== 'string') {
      issues.push('Invalid or missing serverId')
    }

    if (!packet.timestamp || typeof packet.timestamp !== 'number') {
      issues.push('Invalid or missing timestamp')
    }

    if (packet.type === 'announce') {
      const announcePacket = packet as any
      if (!announcePacket.serverUrl || typeof announcePacket.serverUrl !== 'string') {
        issues.push('Invalid or missing serverUrl for announce packet')
      }
      if (!announcePacket.serverName || typeof announcePacket.serverName !== 'string') {
        issues.push('Invalid or missing serverName for announce packet')
      }
    }

    return { valid: issues.length === 0, issues }
  }

  /**
   * Validate SSE event structure
   */
  private validateSSEEvent(event: SSEEvent): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    if (!event.data) {
      issues.push('Missing event data')
    }

    try {
      const parsedData = JSON.parse(event.data)
      if (!parsedData.type) {
        issues.push('Event data missing type field')
      }
    } catch (error) {
      issues.push('Event data is not valid JSON')
    }

    return { valid: issues.length === 0, issues }
  }

  /**
   * Validate session structure
   */
  private validateSession(session: Session): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    if (!session.id || typeof session.id !== 'string') {
      issues.push('Invalid or missing session ID')
    }

    if (!session.serverId || typeof session.serverId !== 'string') {
      issues.push('Invalid or missing server ID')
    }

    if (!session.serverUrl || typeof session.serverUrl !== 'string') {
      issues.push('Invalid or missing server URL')
    }

    if (!session.name || typeof session.name !== 'string') {
      issues.push('Invalid or missing session name')
    }

    if (!['idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted'].includes(session.status)) {
      issues.push('Invalid session status')
    }

    if (typeof session.createdAt !== 'number' || session.createdAt <= 0) {
      issues.push('Invalid createdAt timestamp')
    }

    if (typeof session.lastActivity !== 'number' || session.lastActivity <= 0) {
      issues.push('Invalid lastActivity timestamp')
    }

    if (session.lastActivity < session.createdAt) {
      issues.push('lastActivity is before createdAt')
    }

    if (!Array.isArray(session.messages)) {
      issues.push('Messages is not an array')
    }

    if (!Array.isArray(session.childIds)) {
      issues.push('childIds is not an array')
    }

    return { valid: issues.length === 0, issues }
  }

  /**
   * Validate server structure
   */
  private validateServer(server: Server): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    if (!server.id || typeof server.id !== 'string') {
      issues.push('Invalid or missing server ID')
    }

    if (!server.url || typeof server.url !== 'string') {
      issues.push('Invalid or missing server URL')
    }

    if (!server.name || typeof server.name !== 'string') {
      issues.push('Invalid or missing server name')
    }

    if (typeof server.lastSeen !== 'number' || server.lastSeen <= 0) {
      issues.push('Invalid lastSeen timestamp')
    }

    if (typeof server.isHealthy !== 'boolean') {
      issues.push('Invalid isHealthy flag')
    }

    if (!Array.isArray(server.sessions)) {
      issues.push('Sessions is not an array')
    }

    return { valid: issues.length === 0, issues }
  }

  /**
   * Log packet inspection data
   */
  private logPacket(inspection: any): void {
    const logLine = JSON.stringify(inspection) + '\n'
    
    try {
      appendFileSync(this.packetLog, logLine)
    } catch (error) {
      console.error('Failed to write to packet log:', error)
    }
  }

  /**
   * Clear packet log
   */
  clearPacketLog(): void {
    try {
      writeFileSync(this.packetLog, '')
    } catch (error) {
      console.error('Failed to clear packet log:', error)
    }
  }
}

// ---------------------------------------------------------------------------
// Performance Monitor
// ---------------------------------------------------------------------------

export class PerformanceMonitor {
  private logger: DebugLogger
  private metrics = new Map<string, { count: number; totalTime: number; minTime: number; maxTime: number }>()
  private activeOperations = new Map<string, number>()

  constructor(logger?: DebugLogger) {
    this.logger = logger || new DebugLogger()
  }

  /**
   * Start timing an operation
   */
  startOperation(operationId: string, operationType: string): void {
    const startTime = performance.now()
    this.activeOperations.set(operationId, startTime)
    
    if (this.logger) {
      this.logger.trace(`Started operation: ${operationType} (${operationId})`)
    }
  }

  /**
   * End timing an operation
   */
  endOperation(operationId: string, operationType: string): number {
    const startTime = this.activeOperations.get(operationId)
    if (!startTime) {
      if (this.logger) {
        this.logger.warn(`No start time found for operation: ${operationType} (${operationId})`)
      }
      return 0
    }

    const endTime = performance.now()
    const duration = endTime - startTime
    
    this.activeOperations.delete(operationId)
    this.recordMetric(operationType, duration)
    
    if (this.logger) {
      this.logger.trace(`Completed operation: ${operationType} (${operationId}) in ${duration.toFixed(2)}ms`)
    }

    return duration
  }

  /**
   * Record a metric
   */
  recordMetric(operationType: string, duration: number): void {
    const existing = this.metrics.get(operationType)
    
    if (existing) {
      existing.count++
      existing.totalTime += duration
      existing.minTime = Math.min(existing.minTime, duration)
      existing.maxTime = Math.max(existing.maxTime, duration)
    } else {
      this.metrics.set(operationType, {
        count: 1,
        totalTime: duration,
        minTime: duration,
        maxTime: duration
      })
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): Record<string, { count: number; avgTime: number; minTime: number; maxTime: number; totalTime: number }> {
    const result: Record<string, any> = {}
    
    for (const [operationType, metrics] of this.metrics) {
      result[operationType] = {
        count: metrics.count,
        avgTime: metrics.totalTime / metrics.count,
        minTime: metrics.minTime,
        maxTime: metrics.maxTime,
        totalTime: metrics.totalTime
      }
    }
    
    return result
  }

  /**
   * Log performance summary
   */
  logSummary(): void {
    const metrics = this.getMetrics()
    
    if (this.logger) {
      this.logger.info('Performance Summary', metrics)
    }
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics.clear()
    this.activeOperations.clear()
  }
}

// ---------------------------------------------------------------------------
// Global Debug Instances
// ---------------------------------------------------------------------------

export const debugLogger = new DebugLogger()
export const packetInspector = new PacketInspector(debugLogger)
export const performanceMonitor = new PerformanceMonitor(debugLogger)

// ---------------------------------------------------------------------------
// Debug Utilities
// ---------------------------------------------------------------------------

export function enableDebugMode(): void {
  debugLogger.setLogLevel(LogLevel.DEBUG)
  debugLogger.info('Debug mode enabled')
}

export function enableTraceMode(): void {
  debugLogger.setLogLevel(LogLevel.TRACE)
  debugLogger.info('Trace mode enabled')
}

export function clearAllLogs(): void {
  debugLogger.clearLog()
  packetInspector.clearPacketLog()
  debugLogger.info('All logs cleared')
}

export function dumpSystemState(servers: Map<string, Server>, sessions: Map<string, Session>): void {
  const systemState = {
    timestamp: new Date().toISOString(),
    servers: Array.from(servers.values()).map(server => ({
      id: server.id,
      url: server.url,
      name: server.name,
      isHealthy: server.isHealthy,
      sessionCount: server.sessions.length
    })),
    sessions: Array.from(sessions.values()).map(session => ({
      id: session.id,
      serverId: session.serverId,
      name: session.name,
      status: session.status,
      isLongRunning: session.isLongRunning,
      messageCount: session.messages.length
    })),
    metrics: performanceMonitor.getMetrics()
  }

  debugLogger.info('System state dump', systemState)
}