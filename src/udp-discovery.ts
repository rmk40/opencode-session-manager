// UDP discovery and network communication layer for OpenCode instances

import { createSocket, Socket } from 'node:dgram'
import { EventEmitter } from 'node:events'
import { URL } from 'node:url'
import { AnnouncePacket, ShutdownPacket, UDPPacket, isAnnouncePacket, isShutdownPacket } from './types'
import { getConfig } from './config'

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface UDPDiscoveryEvents {
  'server_announced': (packet: AnnouncePacket) => void
  'server_shutdown': (packet: ShutdownPacket) => void
  'error': (error: Error) => void
  'listening': (port: number) => void
  'stopped': () => void
}

// ---------------------------------------------------------------------------
// UDP Discovery Manager
// ---------------------------------------------------------------------------

export class UDPDiscovery extends EventEmitter {
  private socket: Socket | null = null
  private isListening = false
  private config = getConfig()

  constructor() {
    super()
  }

  /**
   * Start listening for UDP announcements
   */
  async start(): Promise<void> {
    if (this.isListening) {
      return
    }

    return new Promise((resolve, reject) => {
      this.socket = createSocket('udp4')

      this.socket.on('error', (error) => {
        this.emit('error', error)
        reject(error)
      })

      this.socket.on('message', (buffer, rinfo) => {
        try {
          const packet = this.parsePacket(buffer, rinfo)
          if (packet) {
            this.handlePacket(packet)
          }
        } catch (error) {
          if (this.config.debugFlags.udp) {
            console.error('UDP packet parsing error:', error)
          }
        }
      })

      this.socket.on('listening', () => {
        this.isListening = true
        this.emit('listening', this.config.port)
        resolve()
      })

      this.socket.bind(this.config.port)
    })
  }

  /**
   * Stop listening for UDP announcements
   */
  async stop(): Promise<void> {
    if (!this.socket || !this.isListening) {
      return
    }

    return new Promise((resolve) => {
      this.socket!.close(() => {
        this.isListening = false
        this.socket = null
        this.emit('stopped')
        resolve()
      })
    })
  }

  /**
   * Parse incoming UDP packet
   */
  private parsePacket(buffer: Buffer, rinfo: any): UDPPacket | null {
    try {
      const message = buffer.toString('utf8')
      const data = JSON.parse(message)

      // Validate packet structure
      if (!this.isValidPacket(data)) {
        if (this.config.debugFlags.udp) {
          console.warn('Invalid UDP packet structure:', data)
        }
        return null
      }

      // Normalize server URL
      if (isAnnouncePacket(data)) {
        data.serverUrl = this.normalizeServerUrl(data.serverUrl)
      }

      return data as UDPPacket
    } catch (error) {
      if (this.config.debugFlags.udp) {
        console.error('Failed to parse UDP packet:', error)
      }
      return null
    }
  }

  /**
   * Validate packet structure
   */
  private isValidPacket(data: unknown): boolean {
    return isAnnouncePacket(data) || isShutdownPacket(data)
  }

  /**
   * Handle parsed packet
   */
  private handlePacket(packet: UDPPacket): void {
    if (this.config.debugFlags.udp) {
      console.log('Received UDP packet:', packet)
    }

    if (isAnnouncePacket(packet)) {
      this.emit('server_announced', packet)
    } else if (isShutdownPacket(packet)) {
      this.emit('server_shutdown', packet)
    }
  }

  /**
   * Normalize server URL to ensure it's valid and complete
   */
  private normalizeServerUrl(url: string): string {
    try {
      const parsed = new URL(url)
      
      // Ensure protocol is http or https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Invalid protocol: ${parsed.protocol}`)
      }

      // Ensure port is specified
      if (!parsed.port) {
        parsed.port = parsed.protocol === 'https:' ? '443' : '80'
      }

      return parsed.toString()
    } catch (error) {
      throw new Error(`Invalid server URL: ${url} - ${error}`)
    }
  }

  /**
   * Test connection to a server URL
   */
  async testConnection(serverUrl: string): Promise<boolean> {
    try {
      const url = new URL(serverUrl)
      const response = await fetch(`${url.origin}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })
      
      return response.ok
    } catch (error) {
      if (this.config.debugFlags.udp) {
        console.warn(`Connection test failed for ${serverUrl}:`, error)
      }
      return false
    }
  }

  /**
   * Validate server URL format and reachability
   */
  async validateServerUrl(serverUrl: string): Promise<{ valid: boolean; normalized?: string; error?: string }> {
    try {
      const normalized = this.normalizeServerUrl(serverUrl)
      const isReachable = await this.testConnection(normalized)
      
      return {
        valid: isReachable,
        normalized: isReachable ? normalized : undefined,
        error: isReachable ? undefined : 'Server not reachable'
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get current listening status
   */
  get listening(): boolean {
    return this.isListening
  }

  /**
   * Get current port
   */
  get port(): number {
    return this.config.port
  }
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Create and start a UDP discovery instance
 */
export async function createUDPDiscovery(): Promise<UDPDiscovery> {
  const discovery = new UDPDiscovery()
  await discovery.start()
  return discovery
}

/**
 * Parse a raw UDP message buffer
 */
export function parseUDPMessage(buffer: Buffer): UDPPacket | null {
  try {
    const message = buffer.toString('utf8')
    const data = JSON.parse(message)
    
    if (isAnnouncePacket(data) || isShutdownPacket(data)) {
      return data as UDPPacket
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Create a UDP announcement packet
 */
export function createAnnouncePacket(
  serverId: string,
  serverUrl: string,
  serverName: string,
  version?: string
): AnnouncePacket {
  return {
    type: 'announce',
    serverId,
    serverUrl,
    serverName,
    version,
    timestamp: Date.now()
  }
}

/**
 * Create a UDP shutdown packet
 */
export function createShutdownPacket(serverId: string): ShutdownPacket {
  return {
    type: 'shutdown',
    serverId,
    timestamp: Date.now()
  }
}

/**
 * Serialize a UDP packet to buffer
 */
export function serializePacket(packet: UDPPacket): Buffer {
  return Buffer.from(JSON.stringify(packet), 'utf8')
}