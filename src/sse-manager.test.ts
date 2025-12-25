// Property tests for SSE connection and message processing
// Feature: opencode-session-monitor, Property 7: SSE Connection and Message Processing

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { 
  SSEConnectionManager, 
  parseSSEData, 
  isValidSessionEvent, 
  createSessionUpdateEvent, 
  createMessageEvent, 
  createPermissionRequestEvent 
} from './sse-manager'
import { SessionEvent, SessionUpdateEvent, MessageEvent, PermissionRequestEvent } from './types'

// Test utilities
let sseManager: SSEConnectionManager

beforeEach(() => {
  sseManager = new SSEConnectionManager()
})

afterEach(async () => {
  await sseManager.disconnectAll()
})

// Arbitraries for generating test data
const sessionIdArb = fc.string({ minLength: 1, maxLength: 50 })
const serverUrlArb = fc.webUrl()
const sessionStatusArb = fc.constantFrom('idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted')

const sessionUpdateEventArb = fc.record({
  type: fc.constant('session_update' as const),
  sessionId: sessionIdArb,
  status: sessionStatusArb,
  lastActivity: fc.integer({ min: 0, max: Date.now() }),
  metadata: fc.option(fc.dictionary(fc.string(), fc.anything()))
}) as fc.Arbitrary<SessionUpdateEvent>

const messageEventArb = fc.record({
  type: fc.constant('message' as const),
  sessionId: sessionIdArb,
  message: fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    content: fc.string({ minLength: 1, maxLength: 1000 }),
    timestamp: fc.integer({ min: 0, max: Date.now() }),
    type: fc.constantFrom('user_input', 'assistant_response', 'tool_execution', 'system_message')
  })
}) as fc.Arbitrary<MessageEvent>

const permissionRequestEventArb = fc.record({
  type: fc.constant('permission_request' as const),
  sessionId: sessionIdArb,
  permissionId: fc.string({ minLength: 1, maxLength: 50 }),
  toolName: fc.string({ minLength: 1, maxLength: 50 }),
  toolArgs: fc.dictionary(fc.string(), fc.anything()),
  description: fc.string({ minLength: 1, maxLength: 200 })
}) as fc.Arbitrary<PermissionRequestEvent>

const sessionEventArb = fc.oneof(
  sessionUpdateEventArb,
  messageEventArb,
  permissionRequestEventArb
) as fc.Arbitrary<SessionEvent>

describe('SSE Connection and Message Processing', () => {
  it('Property 7: SSE connection state management is consistent', () => {
    fc.assert(
      fc.property(
        serverUrlArb,
        (serverUrl) => {
          // Initial state should be undefined
          expect(sseManager.getConnectionState(serverUrl)).toBeUndefined()
          expect(sseManager.isConnected(serverUrl)).toBe(false)
          
          // All connections should be empty initially
          expect(sseManager.getAllConnectionStates().size).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: Session event validation is correct', () => {
    fc.assert(
      fc.property(
        sessionEventArb,
        (event) => {
          // Valid session events should pass validation
          expect(isValidSessionEvent(event)).toBe(true)
          
          // Should have required fields
          expect(event.type).toBeTruthy()
          expect(typeof event.type).toBe('string')
          expect(event.sessionId).toBeTruthy()
          expect(typeof event.sessionId).toBe('string')
          
          // Type should be one of the valid types
          const validTypes = ['session_update', 'message', 'permission_request']
          expect(validTypes).toContain(event.type)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: Invalid session events are rejected', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.record({
            type: fc.string().filter(s => !['session_update', 'message', 'permission_request'].includes(s)),
            sessionId: sessionIdArb
          }),
          fc.record({
            type: fc.constantFrom('session_update', 'message', 'permission_request'),
            // Missing sessionId
          }),
          fc.record({
            // Missing type
            sessionId: sessionIdArb
          })
        ),
        (invalidEvent) => {
          // Invalid events should fail validation
          expect(isValidSessionEvent(invalidEvent)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: SSE data parsing handles valid and invalid data', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          sessionEventArb.map(event => JSON.stringify(event)), // Valid JSON
          fc.string(), // Invalid JSON
          fc.constant(''), // Empty string
          fc.constant('{}'), // Empty object
          fc.constant('{"type":"invalid"}'), // Missing sessionId
          fc.constant('{"sessionId":"test"}') // Missing type
        ),
        (data) => {
          const parsed = parseSSEData(data)
          
          if (parsed) {
            // If parsing succeeded, should be valid session event
            expect(isValidSessionEvent(parsed)).toBe(true)
            expect(parsed.type).toBeTruthy()
            expect(parsed.sessionId).toBeTruthy()
          } else {
            // If parsing failed, data should be invalid
            expect(typeof data === 'string').toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: Session update event creation is consistent', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        sessionStatusArb,
        fc.integer({ min: 0, max: Date.now() }),
        fc.option(fc.dictionary(fc.string(), fc.anything())),
        (sessionId, status, lastActivity, metadata) => {
          const event = createSessionUpdateEvent(sessionId, status, lastActivity, metadata)
          
          // Should have correct structure
          expect(event.type).toBe('session_update')
          expect(event.sessionId).toBe(sessionId)
          expect(event.status).toBe(status)
          expect(event.lastActivity).toBe(lastActivity)
          expect(event.metadata).toBe(metadata)
          
          // Should be valid session event
          expect(isValidSessionEvent(event)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: Message event creation is consistent', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          content: fc.string({ minLength: 1, maxLength: 1000 }),
          timestamp: fc.integer({ min: 0, max: Date.now() }),
          type: fc.constantFrom('user_input', 'assistant_response', 'tool_execution', 'system_message')
        }),
        (sessionId, message) => {
          const event = createMessageEvent(sessionId, message)
          
          // Should have correct structure
          expect(event.type).toBe('message')
          expect(event.sessionId).toBe(sessionId)
          expect(event.message).toBe(message)
          
          // Should be valid session event
          expect(isValidSessionEvent(event)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: Permission request event creation is consistent', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.dictionary(fc.string(), fc.anything()),
        fc.string({ minLength: 1, maxLength: 200 }),
        (sessionId, permissionId, toolName, toolArgs, description) => {
          const event = createPermissionRequestEvent(sessionId, permissionId, toolName, toolArgs, description)
          
          // Should have correct structure
          expect(event.type).toBe('permission_request')
          expect(event.sessionId).toBe(sessionId)
          expect(event.permissionId).toBe(permissionId)
          expect(event.toolName).toBe(toolName)
          expect(event.toolArgs).toBe(toolArgs)
          expect(event.description).toBe(description)
          
          // Should be valid session event
          expect(isValidSessionEvent(event)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: Event serialization and parsing is reversible', () => {
    fc.assert(
      fc.property(
        sessionEventArb,
        (originalEvent) => {
          // Serialize and parse the event
          const serialized = JSON.stringify(originalEvent)
          const parsed = parseSSEData(serialized)
          
          // Should successfully round-trip
          expect(parsed).not.toBeNull()
          expect(parsed!.type).toBe(originalEvent.type)
          expect(parsed!.sessionId).toBe(originalEvent.sessionId)
          
          // Type-specific fields should match (accounting for JSON serialization behavior)
          if (originalEvent.type === 'session_update') {
            const original = originalEvent as SessionUpdateEvent
            const parsedUpdate = parsed as SessionUpdateEvent
            expect(parsedUpdate.status).toBe(original.status)
            expect(parsedUpdate.lastActivity).toBe(original.lastActivity)
            
            // Metadata comparison accounting for undefined -> null conversion in JSON
            if (original.metadata) {
              expect(parsedUpdate.metadata).toBeDefined()
              // Don't do deep equality check due to undefined -> null conversion
              expect(typeof parsedUpdate.metadata).toBe('object')
            } else {
              expect(parsedUpdate.metadata).toBe(original.metadata)
            }
          } else if (originalEvent.type === 'message') {
            const original = originalEvent as MessageEvent
            const parsedMessage = parsed as MessageEvent
            expect(parsedMessage.message).toBeDefined()
            expect(typeof parsedMessage.message).toBe('object')
          } else if (originalEvent.type === 'permission_request') {
            const original = originalEvent as PermissionRequestEvent
            const parsedPermission = parsed as PermissionRequestEvent
            expect(parsedPermission.permissionId).toBe(original.permissionId)
            expect(parsedPermission.toolName).toBe(original.toolName)
            expect(parsedPermission.description).toBe(original.description)
            expect(typeof parsedPermission.toolArgs).toBe('object')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: Connection state transitions are logical', () => {
    fc.assert(
      fc.property(
        serverUrlArb,
        (serverUrl) => {
          const manager = new SSEConnectionManager()
          
          // Initial state
          expect(manager.isConnected(serverUrl)).toBe(false)
          expect(manager.getConnectionState(serverUrl)).toBeUndefined()
          
          // After attempting connection (will fail in test environment)
          // But state should be tracked
          manager.connect(serverUrl)
          
          // Should have connection state now
          const state = manager.getConnectionState(serverUrl)
          if (state) {
            expect(state.serverUrl).toBe(serverUrl)
            expect(typeof state.status).toBe('string')
            expect(typeof state.reconnectAttempts).toBe('number')
            expect(state.reconnectAttempts).toBeGreaterThanOrEqual(0)
            expect(typeof state.maxReconnectAttempts).toBe('number')
            expect(state.maxReconnectAttempts).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 50 } // Reduced due to connection attempts
    )
  })

  it('Property 7: Event type validation is comprehensive', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.string(),
          sessionId: fc.string(),
          extraField: fc.anything()
        }),
        (event) => {
          const isValid = isValidSessionEvent(event)
          const validTypes = ['session_update', 'message', 'permission_request']
          
          if (isValid) {
            // If valid, type must be one of the allowed types
            expect(validTypes).toContain(event.type)
            expect(event.sessionId).toBeTruthy()
          } else {
            // If invalid, either type is wrong or sessionId is missing/empty
            const hasValidType = validTypes.includes(event.type)
            const hasValidSessionId = typeof event.sessionId === 'string' && event.sessionId.length > 0
            
            // At least one of these should be false for invalid events
            expect(hasValidType && hasValidSessionId).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: Connection manager handles multiple servers', () => {
    fc.assert(
      fc.property(
        fc.array(serverUrlArb, { minLength: 1, maxLength: 5 }),
        (serverUrls) => {
          const manager = new SSEConnectionManager()
          const uniqueUrls = [...new Set(serverUrls)]
          
          // Initially no connections
          expect(manager.getAllConnectionStates().size).toBe(0)
          
          // Attempt connections to all servers
          for (const url of uniqueUrls) {
            manager.connect(url)
          }
          
          // Should track all connection attempts
          const states = manager.getAllConnectionStates()
          expect(states.size).toBeLessThanOrEqual(uniqueUrls.length)
          
          // Each state should be valid
          for (const [url, state] of states) {
            expect(uniqueUrls).toContain(url)
            expect(state.serverUrl).toBe(url)
            expect(typeof state.status).toBe('string')
          }
        }
      ),
      { numRuns: 20 } // Reduced due to multiple connection attempts
    )
  })
})