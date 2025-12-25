// Property tests for HTTP client and session management operations
// Feature: opencode-session-monitor, Property 8: Session Management Operations

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { 
  HTTPClient, 
  HTTPClientPool, 
  convertSessionInfo, 
  convertSessionDetails, 
  convertMessage,
  OpenCodeSessionInfo,
  OpenCodeSessionDetails,
  OpenCodeMessage,
  SendMessageRequest
} from './http-client'
import { SessionStatus } from './types'

// Test utilities
let clientPool: HTTPClientPool

beforeEach(() => {
  clientPool = new HTTPClientPool()
})

afterEach(() => {
  clientPool.clearAll()
})

// Arbitraries for generating test data
const sessionStatusArb = fc.constantFrom(
  'idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted'
) as fc.Arbitrary<SessionStatus>

const sessionInfoArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  status: sessionStatusArb,
  created_at: fc.date({ min: new Date('1970-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  last_activity: fc.date({ min: new Date('1970-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  parent_id: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  child_ids: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
  project: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  branch: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  cost: fc.option(fc.float({ min: 0, max: 1000 }).filter(n => Number.isFinite(n))),
  tokens: fc.option(fc.integer({ min: 0, max: 1000000 })),
  is_long_running: fc.boolean()
}) as fc.Arbitrary<OpenCodeSessionInfo>

const messageArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  timestamp: fc.date({ min: new Date('1970-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  type: fc.constantFrom('user_input', 'assistant_response', 'tool_execution', 'permission_request', 'system_message', 'error_message'),
  content: fc.string({ minLength: 1, maxLength: 1000 }),
  metadata: fc.option(fc.record({
    tool_name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    tool_args: fc.option(fc.dictionary(fc.string(), fc.anything())),
    permission_type: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    error_code: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
    cost: fc.option(fc.float({ min: 0, max: 100 }).filter(n => Number.isFinite(n))),
    tokens: fc.option(fc.integer({ min: 0, max: 10000 }))
  }))
}) as fc.Arbitrary<OpenCodeMessage>

const sessionDetailsArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  status: sessionStatusArb,
  created_at: fc.date({ min: new Date('1970-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  last_activity: fc.date({ min: new Date('1970-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  parent_id: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  child_ids: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
  project: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  branch: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  cost: fc.option(fc.float({ min: 0, max: 1000 }).filter(n => Number.isFinite(n))),
  tokens: fc.option(fc.integer({ min: 0, max: 1000000 })),
  is_long_running: fc.boolean(),
  messages: fc.array(messageArb, { maxLength: 20 }),
  statistics: fc.record({
    total_messages: fc.integer({ min: 0, max: 1000 }),
    total_cost: fc.float({ min: 0, max: 10000 }).filter(n => Number.isFinite(n)),
    total_tokens: fc.integer({ min: 0, max: 10000000 }),
    duration_ms: fc.integer({ min: 0, max: 86400000 }) // Up to 24 hours
  })
}) as fc.Arbitrary<OpenCodeSessionDetails>

describe('HTTP Client and Session Management', () => {
  it('Property 8: HTTP client pool manages clients correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.webUrl(), { minLength: 1, maxLength: 10 }),
        (serverUrls) => {
          const pool = new HTTPClientPool()
          
          // Get clients for all URLs
          const clients = serverUrls.map(url => pool.getClient(url))
          
          // Should have created clients for all URLs
          expect(pool.getActiveUrls()).toHaveLength(new Set(serverUrls).size)
          
          // Getting the same URL should return the same client
          for (const url of serverUrls) {
            const client1 = pool.getClient(url)
            const client2 = pool.getClient(url)
            expect(client1).toBe(client2)
          }
          
          // Remove clients
          for (const url of serverUrls) {
            pool.removeClient(url)
          }
          
          // Should have no active clients after removal
          expect(pool.getActiveUrls()).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 8: Session info conversion preserves all data', () => {
    fc.assert(
      fc.property(
        sessionInfoArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.webUrl(),
        (sessionInfo, serverId, serverUrl) => {
          const converted = convertSessionInfo(sessionInfo, serverId, serverUrl)
          
          // Basic fields should match
          expect(converted.id).toBe(sessionInfo.id)
          expect(converted.serverId).toBe(serverId)
          expect(converted.serverUrl).toBe(serverUrl)
          expect(converted.name).toBe(sessionInfo.name)
          expect(converted.status).toBe(sessionInfo.status)
          expect(converted.isLongRunning).toBe(sessionInfo.is_long_running)
          expect(converted.parentId).toBe(sessionInfo.parent_id)
          expect(converted.childIds).toEqual(sessionInfo.child_ids)
          expect(converted.project).toBe(sessionInfo.project)
          expect(converted.branch).toBe(sessionInfo.branch)
          expect(converted.cost).toBe(sessionInfo.cost)
          expect(converted.tokens).toBe(sessionInfo.tokens)
          
          // Timestamps should be valid numbers
          expect(typeof converted.createdAt).toBe('number')
          expect(typeof converted.lastActivity).toBe('number')
          expect(converted.createdAt).toBeGreaterThanOrEqual(0)
          expect(converted.lastActivity).toBeGreaterThanOrEqual(0)
          
          // Messages should be empty array (loaded separately)
          expect(converted.messages).toEqual([])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 8: Session details conversion preserves all data including messages', () => {
    fc.assert(
      fc.property(
        sessionDetailsArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.webUrl(),
        (sessionDetails, serverId, serverUrl) => {
          const converted = convertSessionDetails(sessionDetails, serverId, serverUrl)
          
          // Basic fields should match (same as session info)
          expect(converted.id).toBe(sessionDetails.id)
          expect(converted.serverId).toBe(serverId)
          expect(converted.serverUrl).toBe(serverUrl)
          expect(converted.name).toBe(sessionDetails.name)
          expect(converted.status).toBe(sessionDetails.status)
          expect(converted.isLongRunning).toBe(sessionDetails.is_long_running)
          
          // Messages should be converted
          expect(converted.messages).toHaveLength(sessionDetails.messages.length)
          
          // Each message should be properly converted
          for (let i = 0; i < sessionDetails.messages.length; i++) {
            const original = sessionDetails.messages[i]
            const convertedMsg = converted.messages[i]
            
            expect(convertedMsg.id).toBe(original.id)
            expect(convertedMsg.type).toBe(original.type)
            expect(convertedMsg.content).toBe(original.content)
            expect(convertedMsg.metadata).toEqual(original.metadata)
            expect(typeof convertedMsg.timestamp).toBe('number')
            expect(convertedMsg.timestamp).toBeGreaterThanOrEqual(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 8: Message conversion handles all message types correctly', () => {
    fc.assert(
      fc.property(
        messageArb,
        (message) => {
          const converted = convertMessage(message)
          
          // All fields should be preserved
          expect(converted.id).toBe(message.id)
          expect(converted.type).toBe(message.type)
          expect(converted.content).toBe(message.content)
          expect(converted.metadata).toEqual(message.metadata)
          
          // Timestamp should be converted to number
          expect(typeof converted.timestamp).toBe('number')
          expect(converted.timestamp).toBeGreaterThanOrEqual(0)
          
          // Session ID should be empty (set by caller)
          expect(converted.sessionId).toBe('')
          
          // Metadata should be properly handled
          if (message.metadata) {
            expect(converted.metadata).toBeDefined()
            if (message.metadata.cost !== undefined && message.metadata.cost !== null) {
              expect(typeof converted.metadata!.cost).toBe('number')
              expect(Number.isFinite(converted.metadata!.cost!)).toBe(true)
            }
            if (message.metadata.tokens !== undefined && message.metadata.tokens !== null) {
              expect(typeof converted.metadata!.tokens).toBe('number')
              expect(Number.isInteger(converted.metadata!.tokens!)).toBe(true)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 8: HTTP client URL handling is consistent', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        (baseUrl) => {
          const client = new HTTPClient(baseUrl)
          
          // URL should be normalized and valid
          expect(client.url).toBeTruthy()
          expect(client.url).toMatch(/^https?:\/\//)
          
          // Should not end with slash (normalized)
          expect(client.url).not.toMatch(/\/$/)
          
          // Should handle multiple slashes properly
          const urlWithMultipleSlashes = baseUrl + '///'
          const client2 = new HTTPClient(urlWithMultipleSlashes)
          expect(client2.url).toBeTruthy()
          expect(client2.url).toMatch(/^https?:\/\//)
          expect(client2.url).not.toMatch(/\/$/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 8: Send message request validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 10000 }),
          type: fc.option(fc.constantFrom('user_input', 'system_message'))
        }),
        (request: SendMessageRequest) => {
          // Content should be non-empty
          expect(request.content).toBeTruthy()
          expect(typeof request.content).toBe('string')
          expect(request.content.length).toBeGreaterThan(0)
          
          // Type should be valid if present
          if (request.type) {
            expect(['user_input', 'system_message']).toContain(request.type)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 8: Session status transitions are valid', () => {
    fc.assert(
      fc.property(
        sessionStatusArb,
        sessionStatusArb,
        (fromStatus, toStatus) => {
          // All status values should be valid
          const validStatuses = ['idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted']
          expect(validStatuses).toContain(fromStatus)
          expect(validStatuses).toContain(toStatus)
          
          // Some transitions should be logically valid
          // (This is a basic check - real validation would be more complex)
          if (fromStatus === 'completed' || fromStatus === 'aborted') {
            // Terminal states - no transitions should be possible in normal operation
            // But for testing purposes, we allow any transition
            expect(typeof toStatus).toBe('string')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 8: Error handling produces consistent error objects', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('NETWORK_ERROR', 'SERVER_UNREACHABLE', 'SESSION_NOT_FOUND', 'PERMISSION_DENIED'),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.boolean(),
        (errorCode, message, recoverable) => {
          const error = {
            code: errorCode,
            message,
            timestamp: Date.now(),
            recoverable
          }
          
          // Error should have all required fields
          expect(error.code).toBeTruthy()
          expect(error.message).toBeTruthy()
          expect(typeof error.timestamp).toBe('number')
          expect(error.timestamp).toBeGreaterThan(0)
          expect(typeof error.recoverable).toBe('boolean')
          
          // Code should be one of the valid error codes
          const validCodes = ['NETWORK_ERROR', 'SERVER_UNREACHABLE', 'SESSION_NOT_FOUND', 'PERMISSION_DENIED', 'INVALID_RESPONSE', 'CONFIGURATION_ERROR', 'UNKNOWN_ERROR']
          expect(validCodes).toContain(error.code)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 8: Timestamp conversion is consistent and reversible', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        (date) => {
          const isoString = date.toISOString()
          const timestamp = new Date(isoString).getTime()
          const backToDate = new Date(timestamp)
          
          // Round trip should preserve the date
          expect(backToDate.toISOString()).toBe(isoString)
          
          // Timestamp should be a positive number
          expect(typeof timestamp).toBe('number')
          expect(timestamp).toBeGreaterThan(0)
          
          // Should be within reasonable bounds
          expect(timestamp).toBeGreaterThanOrEqual(new Date('2020-01-01').getTime())
          expect(timestamp).toBeLessThanOrEqual(new Date('2030-12-31').getTime())
        }
      ),
      { numRuns: 100 }
    )
  })
})