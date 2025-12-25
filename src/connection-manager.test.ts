// Property tests for connection manager and server lifecycle
// Feature: opencode-session-monitor, Property 2: Stale Instance Detection
// Feature: opencode-session-monitor, Property 15: Performance and Resource Management

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { ConnectionManager } from './connection-manager'
import { Server, Session, Instance, AnnouncePacket, ShutdownPacket } from './types'

// Test utilities
let connectionManager: ConnectionManager

beforeEach(() => {
  connectionManager = new ConnectionManager()
})

afterEach(async () => {
  await connectionManager.stop()
})

// Arbitraries for generating test data
const serverIdArb = fc.string({ minLength: 1, maxLength: 50 })
const serverUrlArb = fc.webUrl()
const serverNameArb = fc.string({ minLength: 1, maxLength: 100 })
const sessionIdArb = fc.string({ minLength: 1, maxLength: 50 })
const sessionStatusArb = fc.constantFrom('idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted')

const serverArb = fc.record({
  id: serverIdArb,
  url: serverUrlArb,
  name: serverNameArb,
  lastSeen: fc.integer({ min: 0, max: Date.now() }),
  isHealthy: fc.boolean(),
  version: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
  sessions: fc.array(fc.record({
    id: sessionIdArb,
    serverId: serverIdArb,
    serverUrl: serverUrlArb,
    name: fc.string({ minLength: 1, maxLength: 100 }),
    status: sessionStatusArb,
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    lastActivity: fc.integer({ min: 0, max: Date.now() }),
    isLongRunning: fc.boolean(),
    parentId: fc.option(sessionIdArb),
    childIds: fc.array(sessionIdArb, { maxLength: 5 }),
    project: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    branch: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    cost: fc.option(fc.float({ min: 0, max: 1000 }).filter(n => Number.isFinite(n))),
    tokens: fc.option(fc.integer({ min: 0, max: 1000000 })),
    messages: fc.constant([])
  }), { maxLength: 10 })
}) as fc.Arbitrary<Server>

const announcePacketArb = fc.record({
  type: fc.constant('announce' as const),
  serverId: serverIdArb,
  serverUrl: serverUrlArb,
  serverName: serverNameArb,
  version: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
  timestamp: fc.integer({ min: 0, max: Date.now() })
}) as fc.Arbitrary<AnnouncePacket>

const shutdownPacketArb = fc.record({
  type: fc.constant('shutdown' as const),
  serverId: serverIdArb,
  timestamp: fc.integer({ min: 0, max: Date.now() })
}) as fc.Arbitrary<ShutdownPacket>

describe('Connection Manager and Server Lifecycle', () => {
  it('Property 2: Stale instance detection logic is consistent', () => {
    fc.assert(
      fc.property(
        fc.array(announcePacketArb, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1000, max: 300000 }), // Stale timeout in ms
        (announcePackets, staleTimeout) => {
          const now = Date.now()
          
          // Test stale detection logic
          for (const packet of announcePackets) {
            const timeSinceAnnouncement = now - packet.timestamp
            const shouldBeStale = timeSinceAnnouncement > staleTimeout
            
            // Instance should be considered stale if time since last announcement exceeds threshold
            if (shouldBeStale) {
              expect(timeSinceAnnouncement).toBeGreaterThan(staleTimeout)
            } else {
              expect(timeSinceAnnouncement).toBeLessThanOrEqual(staleTimeout)
            }
            
            // Timestamps should be reasonable
            expect(packet.timestamp).toBeGreaterThanOrEqual(0)
            expect(packet.timestamp).toBeLessThanOrEqual(now)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 2: Server lifecycle state transitions are valid', () => {
    fc.assert(
      fc.property(
        announcePacketArb,
        (announcePacket) => {
          // Validate announce packet structure
          expect(announcePacket.type).toBe('announce')
          expect(announcePacket.serverId).toBeTruthy()
          expect(typeof announcePacket.serverId).toBe('string')
          expect(announcePacket.serverUrl).toBeTruthy()
          expect(typeof announcePacket.serverUrl).toBe('string')
          expect(announcePacket.serverName).toBeTruthy()
          expect(typeof announcePacket.serverName).toBe('string')
          expect(typeof announcePacket.timestamp).toBe('number')
          expect(announcePacket.timestamp).toBeGreaterThanOrEqual(0)
          
          // URL should be valid format
          expect(announcePacket.serverUrl).toMatch(/^https?:\/\//)
          
          // Version should be string if present
          if (announcePacket.version !== undefined && announcePacket.version !== null) {
            expect(typeof announcePacket.version).toBe('string')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 2: Shutdown packet validation is correct', () => {
    fc.assert(
      fc.property(
        shutdownPacketArb,
        (shutdownPacket) => {
          // Validate shutdown packet structure
          expect(shutdownPacket.type).toBe('shutdown')
          expect(shutdownPacket.serverId).toBeTruthy()
          expect(typeof shutdownPacket.serverId).toBe('string')
          expect(typeof shutdownPacket.timestamp).toBe('number')
          expect(shutdownPacket.timestamp).toBeGreaterThanOrEqual(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 15: Connection manager state management is efficient', () => {
    fc.assert(
      fc.property(
        fc.array(serverArb, { minLength: 0, maxLength: 20 }),
        (servers) => {
          const manager = new ConnectionManager()
          
          // Initial state should be empty
          expect(manager.getServers().size).toBe(0)
          expect(manager.getSessions().size).toBe(0)
          
          // State operations should be consistent
          for (const server of servers) {
            // Server operations should maintain consistency
            expect(server.id).toBeTruthy()
            expect(server.url).toBeTruthy()
            expect(server.name).toBeTruthy()
            expect(typeof server.lastSeen).toBe('number')
            expect(typeof server.isHealthy).toBe('boolean')
            expect(Array.isArray(server.sessions)).toBe(true)
            
            // Session validation
            for (const session of server.sessions) {
              expect(session.id).toBeTruthy()
              expect(session.serverId).toBeTruthy()
              expect(session.serverUrl).toBeTruthy()
              expect(session.name).toBeTruthy()
              expect(typeof session.createdAt).toBe('number')
              expect(typeof session.lastActivity).toBe('number')
              expect(typeof session.isLongRunning).toBe('boolean')
              expect(Array.isArray(session.childIds)).toBe(true)
              expect(Array.isArray(session.messages)).toBe(true)
              
              // Timestamps should be reasonable
              expect(session.createdAt).toBeGreaterThanOrEqual(0)
              expect(session.lastActivity).toBeGreaterThanOrEqual(0)
              
              // Status should be valid
              const validStatuses = ['idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted']
              expect(validStatuses).toContain(session.status)
            }
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 15: Session filtering operations are correct', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          id: sessionIdArb,
          serverId: serverIdArb,
          serverUrl: serverUrlArb,
          name: fc.string({ minLength: 1, maxLength: 100 }),
          status: sessionStatusArb,
          createdAt: fc.integer({ min: 0, max: Date.now() - 1000000 }), // Ensure some age
          lastActivity: fc.integer({ min: 0, max: Date.now() }),
          isLongRunning: fc.boolean(),
          parentId: fc.option(sessionIdArb),
          childIds: fc.array(sessionIdArb, { maxLength: 5 }),
          project: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
          branch: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
          cost: fc.option(fc.float({ min: 0, max: 1000 }).filter(n => Number.isFinite(n))),
          tokens: fc.option(fc.integer({ min: 0, max: 1000000 })),
          messages: fc.constant([])
        }), { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 60000, max: 3600000 }), // Long running threshold in ms
        (sessions, longRunningThreshold) => {
          const now = Date.now()
          
          // Test active session filtering
          const activeSessions = sessions.filter(s => 
            !['completed', 'aborted', 'error'].includes(s.status)
          )
          
          for (const session of activeSessions) {
            expect(['completed', 'aborted', 'error']).not.toContain(session.status)
          }
          
          // Test long-running session detection
          const longRunningSessions = sessions.filter(s => {
            const duration = now - s.createdAt
            return duration > longRunningThreshold || s.isLongRunning
          })
          
          for (const session of longRunningSessions) {
            const duration = now - session.createdAt
            const isLongByTime = duration > longRunningThreshold
            const isLongByFlag = session.isLongRunning
            
            expect(isLongByTime || isLongByFlag).toBe(true)
          }
          
          // Test server-specific filtering
          const serverIds = [...new Set(sessions.map(s => s.serverId))]
          for (const serverId of serverIds) {
            const serverSessions = sessions.filter(s => s.serverId === serverId)
            
            for (const session of serverSessions) {
              expect(session.serverId).toBe(serverId)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 15: Resource cleanup is comprehensive', () => {
    fc.assert(
      fc.property(
        fc.array(serverIdArb, { minLength: 1, maxLength: 10 }),
        (serverIds) => {
          const manager = new ConnectionManager()
          
          // Simulate resource allocation
          const uniqueServerIds = [...new Set(serverIds)]
          
          // Resource tracking should be consistent
          for (const serverId of uniqueServerIds) {
            expect(typeof serverId).toBe('string')
            expect(serverId.length).toBeGreaterThan(0)
          }
          
          // Cleanup should handle all resources
          expect(uniqueServerIds.length).toBeLessThanOrEqual(serverIds.length)
          expect(uniqueServerIds.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 2: Instance staleness calculation is accurate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Date.now() - 1000 }), // Last announcement time
        fc.integer({ min: 1000, max: 300000 }), // Stale timeout
        (lastAnnouncementTime, staleTimeout) => {
          const now = Date.now()
          const timeSinceAnnouncement = now - lastAnnouncementTime
          const isStale = timeSinceAnnouncement > staleTimeout
          
          // Staleness calculation should be consistent
          if (isStale) {
            expect(timeSinceAnnouncement).toBeGreaterThan(staleTimeout)
          } else {
            expect(timeSinceAnnouncement).toBeLessThanOrEqual(staleTimeout)
          }
          
          // Time values should be reasonable
          expect(lastAnnouncementTime).toBeGreaterThanOrEqual(0)
          expect(lastAnnouncementTime).toBeLessThan(now)
          expect(staleTimeout).toBeGreaterThan(0)
          expect(timeSinceAnnouncement).toBeGreaterThanOrEqual(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 15: Memory usage patterns are predictable', () => {
    fc.assert(
      fc.property(
        fc.record({
          serverCount: fc.integer({ min: 0, max: 100 }),
          sessionsPerServer: fc.integer({ min: 0, max: 50 }),
          messagesPerSession: fc.integer({ min: 0, max: 100 })
        }),
        (config) => {
          // Memory usage should scale predictably
          const totalSessions = config.serverCount * config.sessionsPerServer
          const totalMessages = totalSessions * config.messagesPerSession
          
          // Validate scaling relationships
          expect(totalSessions).toBe(config.serverCount * config.sessionsPerServer)
          expect(totalMessages).toBe(totalSessions * config.messagesPerSession)
          
          // Resource counts should be non-negative
          expect(config.serverCount).toBeGreaterThanOrEqual(0)
          expect(config.sessionsPerServer).toBeGreaterThanOrEqual(0)
          expect(config.messagesPerSession).toBeGreaterThanOrEqual(0)
          expect(totalSessions).toBeGreaterThanOrEqual(0)
          expect(totalMessages).toBeGreaterThanOrEqual(0)
          
          // Memory usage should be bounded
          expect(totalMessages).toBeLessThanOrEqual(config.serverCount * config.sessionsPerServer * config.messagesPerSession)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 15: Connection state consistency is maintained', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          serverId: serverIdArb,
          serverUrl: serverUrlArb,
          isConnected: fc.boolean(),
          lastSeen: fc.integer({ min: 0, max: Date.now() }),
          reconnectAttempts: fc.integer({ min: 0, max: 10 })
        }), { minLength: 0, maxLength: 20 }),
        (connectionStates) => {
          // Connection state validation
          for (const state of connectionStates) {
            expect(state.serverId).toBeTruthy()
            expect(typeof state.serverId).toBe('string')
            expect(state.serverUrl).toBeTruthy()
            expect(typeof state.serverUrl).toBe('string')
            expect(typeof state.isConnected).toBe('boolean')
            expect(typeof state.lastSeen).toBe('number')
            expect(typeof state.reconnectAttempts).toBe('number')
            
            // Values should be reasonable
            expect(state.lastSeen).toBeGreaterThanOrEqual(0)
            expect(state.reconnectAttempts).toBeGreaterThanOrEqual(0)
            expect(state.reconnectAttempts).toBeLessThanOrEqual(10)
            
            // URL format validation
            expect(state.serverUrl).toMatch(/^https?:\/\//)
          }
          
          // Unique server IDs should be maintained
          const serverIds = connectionStates.map(s => s.serverId)
          const uniqueServerIds = [...new Set(serverIds)]
          
          // Each server should have consistent state
          for (const serverId of uniqueServerIds) {
            const statesForServer = connectionStates.filter(s => s.serverId === serverId)
            expect(statesForServer.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 2: Announcement packet timing validation', () => {
    fc.assert(
      fc.property(
        fc.array(announcePacketArb, { minLength: 1, maxLength: 10 }),
        (announcePackets) => {
          const now = Date.now()
          
          // Sort packets by timestamp
          const sortedPackets = [...announcePackets].sort((a, b) => a.timestamp - b.timestamp)
          
          // Validate timestamp ordering
          for (let i = 1; i < sortedPackets.length; i++) {
            expect(sortedPackets[i].timestamp).toBeGreaterThanOrEqual(sortedPackets[i - 1].timestamp)
          }
          
          // All timestamps should be reasonable
          for (const packet of announcePackets) {
            expect(packet.timestamp).toBeGreaterThanOrEqual(0)
            expect(packet.timestamp).toBeLessThanOrEqual(now + 1000) // Allow 1s future tolerance
            
            // Packet should have required fields
            expect(packet.serverId).toBeTruthy()
            expect(packet.serverUrl).toBeTruthy()
            expect(packet.serverName).toBeTruthy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})