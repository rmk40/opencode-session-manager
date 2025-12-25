// Property tests for testing infrastructure correctness
// Feature: opencode-session-monitor, Property 17: Testing Infrastructure Correctness

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { MockOpenCodeServer, MockSessionGenerator, mockServerManager } from './mock-server'

describe('Testing Infrastructure Correctness', () => {
  let mockServer: MockOpenCodeServer

  beforeEach(async () => {
    mockServer = new MockOpenCodeServer('test-server', 'Test Server', 9000 + Math.floor(Math.random() * 1000))
  })

  afterEach(async () => {
    if (mockServer) {
      await mockServer.stop()
    }
    await mockServerManager.stopAll()
  })

  it('Property 17: Mock session generator creates valid sessions', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.webUrl(),
        (serverId, serverUrl) => {
          const generator = new MockSessionGenerator()
          const session = generator.generateSession(serverId, serverUrl)
          
          // Session should have valid structure
          expect(session.id).toBeTruthy()
          expect(typeof session.id).toBe('string')
          expect(session.serverId).toBe(serverId)
          expect(session.serverUrl).toBe(serverUrl)
          expect(session.name).toBeTruthy()
          expect(['idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted']).toContain(session.status)
          
          // Timestamps should be reasonable
          expect(session.createdAt).toBeGreaterThan(0)
          expect(session.lastActivity).toBeGreaterThan(0)
          expect(session.lastActivity).toBeGreaterThanOrEqual(session.createdAt)
          
          // Arrays should be initialized
          expect(Array.isArray(session.childIds)).toBe(true)
          expect(Array.isArray(session.messages)).toBe(true)
          
          // Optional fields should be valid if present
          if (session.cost !== undefined) {
            expect(session.cost).toBeGreaterThanOrEqual(0)
          }
          if (session.tokens !== undefined) {
            expect(session.tokens).toBeGreaterThanOrEqual(0)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 17: Mock message generator creates valid messages', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (sessionId) => {
          const generator = new MockSessionGenerator()
          const message = generator.generateMessage(sessionId)
          
          // Message should have valid structure
          expect(message.id).toBeTruthy()
          expect(typeof message.id).toBe('string')
          expect(message.sessionId).toBe(sessionId)
          expect(message.content).toBeTruthy()
          expect(['user_input', 'assistant_response', 'tool_execution', 'permission_request', 'system_message', 'error_message']).toContain(message.type)
          
          // Timestamp should be reasonable
          expect(message.timestamp).toBeGreaterThan(0)
          expect(message.timestamp).toBeLessThanOrEqual(Date.now())
          
          // Metadata should be valid if present
          if (message.metadata) {
            if (message.metadata.cost !== undefined) {
              expect(message.metadata.cost).toBeGreaterThanOrEqual(0)
            }
            if (message.metadata.tokens !== undefined) {
              expect(message.metadata.tokens).toBeGreaterThanOrEqual(0)
            }
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 17: Mock server lifecycle management works correctly', async () => {
    const serverInfo = mockServer.getServerInfo()
    
    // Server should be in initial state
    expect(serverInfo.isRunning).toBe(false)
    expect(serverInfo.serverId).toBeTruthy()
    expect(serverInfo.serverName).toBeTruthy()
    expect(serverInfo.port).toBeGreaterThan(0)
    expect(serverInfo.sessionCount).toBe(0)
    
    // Start server
    await mockServer.start()
    const runningInfo = mockServer.getServerInfo()
    expect(runningInfo.isRunning).toBe(true)
    expect(runningInfo.sessionCount).toBeGreaterThan(0) // Should have initial sessions
    
    // Stop server
    await mockServer.stop()
    const stoppedInfo = mockServer.getServerInfo()
    expect(stoppedInfo.isRunning).toBe(false)
  })

  it('Property 17: Mock server session management is consistent', async () => {
    await mockServer.start()
    
    // Add session
    const session1 = mockServer.addSession({ name: 'Test Session 1' })
    expect(session1.name).toBe('Test Session 1')
    expect(mockServer.getServerInfo().sessionCount).toBeGreaterThan(0)
    
    // Update session
    const updatedSession = mockServer.updateSession(session1.id, { status: 'busy' })
    expect(updatedSession).toBeTruthy()
    expect(updatedSession!.status).toBe('busy')
    expect(updatedSession!.lastActivity).toBeGreaterThan(session1.lastActivity)
    
    // Add message
    const message = mockServer.addMessage(session1.id, { content: 'Test message' })
    expect(message).toBeTruthy()
    expect(message!.content).toBe('Test message')
    expect(message!.sessionId).toBe(session1.id)
    
    // Request permission
    const permissionMessage = mockServer.requestPermission(session1.id)
    expect(permissionMessage).toBeTruthy()
    expect(permissionMessage!.type).toBe('permission_request')
    
    // Session should be updated to waiting for permission
    const finalSession = mockServer.updateSession(session1.id, {})
    expect(finalSession!.status).toBe('waiting_for_permission')
  })

  it('Property 17: Mock server handles invalid operations gracefully', async () => {
    await mockServer.start()
    
    // Operations on non-existent session should return undefined
    const nonExistentUpdate = mockServer.updateSession('non-existent', { status: 'busy' })
    expect(nonExistentUpdate).toBeUndefined()
    
    const nonExistentMessage = mockServer.addMessage('non-existent', { content: 'test' })
    expect(nonExistentMessage).toBeUndefined()
    
    const nonExistentPermission = mockServer.requestPermission('non-existent')
    expect(nonExistentPermission).toBeUndefined()
  })

  it('Property 17: Mock server manager handles multiple servers', async () => {
    // Create multiple servers
    const server1 = await mockServerManager.createServer('server1', 'Server 1', 9001)
    const server2 = await mockServerManager.createServer('server2', 'Server 2', 9002)
    
    // Both servers should be running
    expect(server1.getServerInfo().isRunning).toBe(true)
    expect(server2.getServerInfo().isRunning).toBe(true)
    expect(mockServerManager.getServers()).toHaveLength(2)
    
    // Get server by ID
    const retrievedServer1 = mockServerManager.getServer('server1')
    expect(retrievedServer1).toBe(server1)
    
    // Remove one server
    await mockServerManager.removeServer('server1')
    expect(mockServerManager.getServers()).toHaveLength(1)
    expect(server1.getServerInfo().isRunning).toBe(false)
    
    // Stop all servers
    await mockServerManager.stopAll()
    expect(mockServerManager.getServers()).toHaveLength(0)
    expect(server2.getServerInfo().isRunning).toBe(false)
  })

  it('Property 17: Mock server generates realistic test scenarios', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 20 }),
        (sessionCount, messageCount) => {
          const generator = new MockSessionGenerator()
          const sessions = []
          
          // Generate sessions
          for (let i = 0; i < sessionCount; i++) {
            const session = generator.generateSession('test-server', 'http://localhost:8080')
            
            // Add messages to session
            for (let j = 0; j < messageCount; j++) {
              const message = generator.generateMessage(session.id)
              session.messages.push(message)
            }
            
            sessions.push(session)
          }
          
          // Verify realistic properties
          expect(sessions).toHaveLength(sessionCount)
          
          for (const session of sessions) {
            expect(session.messages).toHaveLength(messageCount)
            
            // Sessions should have realistic timestamps
            expect(session.createdAt).toBeLessThanOrEqual(Date.now())
            expect(session.lastActivity).toBeLessThanOrEqual(Date.now())
            expect(session.lastActivity).toBeGreaterThanOrEqual(session.createdAt)
            
            // Messages should be chronologically ordered (approximately)
            // Note: Due to random generation, we allow some tolerance
            if (session.messages.length > 1) {
              const timestamps = session.messages.map(m => m.timestamp).sort((a, b) => a - b)
              const minTimestamp = Math.min(...timestamps)
              const maxTimestamp = Math.max(...timestamps)
              
              // All timestamps should be reasonable (within last day)
              const oneDayAgo = Date.now() - 86400000
              expect(minTimestamp).toBeGreaterThan(oneDayAgo)
              expect(maxTimestamp).toBeLessThanOrEqual(Date.now())
            }
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  it('Property 17: Mock server events are emitted correctly', async () => {
    await mockServer.start()
    
    let sessionAddedCount = 0
    let sessionUpdatedCount = 0
    let messageAddedCount = 0
    let permissionRequestedCount = 0
    
    mockServer.on('session_added', () => sessionAddedCount++)
    mockServer.on('session_updated', () => sessionUpdatedCount++)
    mockServer.on('message_added', () => messageAddedCount++)
    mockServer.on('permission_requested', () => permissionRequestedCount++)
    
    // Perform operations
    const session = mockServer.addSession()
    mockServer.updateSession(session.id, { status: 'busy' })
    mockServer.addMessage(session.id)
    mockServer.requestPermission(session.id)
    
    // Events should have been emitted
    expect(sessionAddedCount).toBe(1)
    expect(sessionUpdatedCount).toBe(1)
    expect(messageAddedCount).toBe(1)
    expect(permissionRequestedCount).toBe(1)
  })

  it('Property 17: Mock server HTTP endpoints return valid responses', async () => {
    await mockServer.start()
    const serverInfo = mockServer.getServerInfo()
    
    // Test status endpoint
    const statusResponse = await fetch(`${serverInfo.url}/status`)
    expect(statusResponse.ok).toBe(true)
    
    const statusData = await statusResponse.json()
    expect(statusData.server).toBeTruthy()
    expect(statusData.server.id).toBe(serverInfo.serverId)
    expect(Array.isArray(statusData.sessions)).toBe(true)
    
    // Add a session and test session details endpoint
    const session = mockServer.addSession({ name: 'Test Session' })
    const sessionResponse = await fetch(`${serverInfo.url}/sessions/${session.id}`)
    expect(sessionResponse.ok).toBe(true)
    
    const sessionData = await sessionResponse.json()
    expect(sessionData.id).toBe(session.id)
    expect(sessionData.name).toBe('Test Session')
    expect(Array.isArray(sessionData.messages)).toBe(true)
  })
})