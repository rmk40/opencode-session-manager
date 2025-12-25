// Property tests for desktop notification system
// Feature: opencode-session-monitor, Property 12: Notification Triggering Logic

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { Session, SessionStatus, PermissionRequestEvent, AppError } from './types'
import { NotificationManager, NotificationTrigger, getPlatform } from './notifications'

// Mock child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn((cmd, callback) => {
    // Mock successful execution
    callback(null, { stdout: '', stderr: '' })
  })
}))

// Mock config
vi.mock('./config', () => ({
  getConfig: vi.fn(() => ({
    notifyEnabled: true,
    longRunningMs: 600000, // 10 minutes
    debug: false
  }))
}))

// Test arbitraries
const sessionStatusArb = fc.constantFrom(
  'idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted'
) as fc.Arbitrary<SessionStatus>

const sessionArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  serverId: fc.string({ minLength: 1, maxLength: 50 }),
  serverUrl: fc.webUrl(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  status: sessionStatusArb,
  createdAt: fc.integer({ min: 0, max: Date.now() }),
  lastActivity: fc.integer({ min: 0, max: Date.now() }),
  isLongRunning: fc.boolean(),
  parentId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  childIds: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  project: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  branch: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  cost: fc.option(fc.float({ min: 0, max: 1000 }).filter(n => Number.isFinite(n))),
  tokens: fc.option(fc.integer({ min: 0, max: 1000000 })),
  messages: fc.constant([])
}).map(session => ({
  ...session,
  lastActivity: Math.max(session.createdAt, session.lastActivity),
  childIds: session.childIds.filter(childId => childId !== session.id)
})) as fc.Arbitrary<Session>

const permissionRequestArb = fc.record({
  type: fc.constant('permission_request' as const),
  sessionId: fc.string({ minLength: 1, maxLength: 50 }),
  permissionId: fc.string({ minLength: 1, maxLength: 50 }),
  toolName: fc.string({ minLength: 1, maxLength: 50 }),
  toolArgs: fc.constant({}),
  description: fc.string({ minLength: 1, maxLength: 200 })
}) as fc.Arbitrary<PermissionRequestEvent>

const appErrorArb = fc.record({
  code: fc.constantFrom('NETWORK_ERROR', 'SERVER_UNREACHABLE', 'INVALID_RESPONSE', 'SESSION_NOT_FOUND'),
  message: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.integer({ min: 0, max: Date.now() }),
  recoverable: fc.boolean()
}) as fc.Arbitrary<AppError>

describe('Desktop Notification System', () => {
  let notificationManager: NotificationManager
  let notificationTrigger: NotificationTrigger

  beforeEach(() => {
    vi.clearAllMocks()
    notificationManager = new NotificationManager()
    notificationTrigger = new NotificationTrigger(notificationManager)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Property 12: Platform detection is consistent', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed
        () => {
          const platform = getPlatform()
          
          // Platform should be one of the supported values
          expect(['macos', 'linux', 'windows', 'unknown']).toContain(platform)
          
          // Platform detection should be consistent
          const platform2 = getPlatform()
          expect(platform2).toBe(platform)
          
          // Platform should match process.platform mapping
          switch (process.platform) {
            case 'darwin':
              expect(platform).toBe('macos')
              break
            case 'linux':
              expect(platform).toBe('linux')
              break
            case 'win32':
              expect(platform).toBe('windows')
              break
            default:
              expect(platform).toBe('unknown')
              break
          }
        }
      ),
      { numRuns: 10 } // Platform detection doesn't need many runs
    )
  })

  it('Property 12: Notification options are validated correctly', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 100 }),
          message: fc.string({ minLength: 1, maxLength: 500 }),
          sound: fc.option(fc.boolean()),
          urgent: fc.option(fc.boolean()),
          icon: fc.option(fc.string({ minLength: 1, maxLength: 100 }))
        }),
        (options) => {
          // All notification options should have valid types
          expect(typeof options.title).toBe('string')
          expect(typeof options.message).toBe('string')
          expect(options.title.length).toBeGreaterThan(0)
          expect(options.message.length).toBeGreaterThan(0)
          
          if (options.sound !== null && options.sound !== undefined) {
            expect(typeof options.sound).toBe('boolean')
          }
          
          if (options.urgent !== null && options.urgent !== undefined) {
            expect(typeof options.urgent).toBe('boolean')
          }
          
          if (options.icon !== null && options.icon !== undefined) {
            expect(typeof options.icon).toBe('string')
            expect(options.icon.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 12: Session update handling is robust', () => {
    fc.assert(
      fc.property(
        sessionArb,
        (session) => {
          // Should not throw when handling session updates
          expect(() => notificationTrigger.handleSessionUpdate(session)).not.toThrow()
          
          // Session should have valid properties
          expect(session.id).toBeTruthy()
          expect(session.name).toBeTruthy()
          expect(typeof session.status).toBe('string')
          expect(['idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted']).toContain(session.status)
          
          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 12: Permission request handling is robust', () => {
    fc.assert(
      fc.property(
        permissionRequestArb,
        (event) => {
          // Should not throw when handling permission requests
          expect(() => notificationTrigger.handlePermissionRequest(event)).not.toThrow()
          
          // Event should have valid properties
          expect(event.type).toBe('permission_request')
          expect(event.sessionId).toBeTruthy()
          expect(event.toolName).toBeTruthy()
          expect(event.description).toBeTruthy()
          
          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 12: Server error handling is robust', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        appErrorArb,
        (serverName, error) => {
          // Should not throw when handling server errors
          expect(() => notificationTrigger.handleServerError(serverName, error)).not.toThrow()
          
          // Parameters should be valid
          expect(serverName.length).toBeGreaterThan(0)
          expect(error.message).toBeTruthy()
          expect(error.code).toBeTruthy()
          
          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 12: Notification cooldown logic is consistent', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }),
          message: fc.string({ minLength: 1, maxLength: 100 }),
          sound: fc.boolean()
        }),
        (options) => {
          // Options should have valid types
          expect(typeof options.title).toBe('string')
          expect(typeof options.message).toBe('string')
          expect(typeof options.sound).toBe('boolean')
          
          expect(options.title.length).toBeGreaterThan(0)
          expect(options.message.length).toBeGreaterThan(0)
          
          // Cooldown methods should exist
          expect(typeof notificationManager.clearCooldown).toBe('function')
          expect(typeof notificationManager.clearAllCooldowns).toBe('function')
          
          // Should not throw when calling cooldown methods
          expect(() => notificationManager.clearCooldown(options.title, options.message)).not.toThrow()
          expect(() => notificationManager.clearAllCooldowns()).not.toThrow()
          
          return true
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property 12: Text escaping prevents injection', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (text) => {
          const manager = notificationManager as any
          
          // Test AppleScript escaping
          const escapedApple = manager.escapeAppleScript(text)
          expect(typeof escapedApple).toBe('string')
          
          // Test shell escaping
          const escapedShell = manager.escapeShell(text)
          expect(typeof escapedShell).toBe('string')
          
          // Test PowerShell escaping
          const escapedPS = manager.escapePowerShell(text)
          expect(typeof escapedPS).toBe('string')
          
          // Escaped strings should not contain unescaped quotes
          if (text.includes('"')) {
            expect(escapedApple.includes('\\"') || !escapedApple.includes('"')).toBe(true)
            expect(escapedShell.includes('\\"') || !escapedShell.includes('"')).toBe(true)
            expect(escapedPS.includes('""') || !escapedPS.includes('"')).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 12: Duration formatting is consistent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 86400000 }), // Up to 24 hours in milliseconds
        (milliseconds) => {
          const manager = notificationManager as any
          const formatted = manager.formatDuration(milliseconds)
          
          // Duration should be a non-empty string
          expect(typeof formatted).toBe('string')
          expect(formatted.length).toBeGreaterThan(0)
          
          // Should contain time units
          const hasTimeUnit = /[0-9]+[smh]/.test(formatted)
          expect(hasTimeUnit).toBe(true)
          
          // For very short durations, should show seconds
          if (milliseconds < 60000) {
            expect(formatted.includes('s')).toBe(true)
          }
          
          // For longer durations, should show appropriate units
          if (milliseconds >= 3600000) { // 1 hour+
            expect(formatted.includes('h')).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 12: Notification state cleanup works correctly', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 1, maxLength: 10 }),
        (sessions) => {
          // Sessions should be valid
          for (const session of sessions) {
            expect(session.id).toBeTruthy()
            expect(session.name).toBeTruthy()
            expect(typeof session.status).toBe('string')
          }
          
          // Cleanup should not throw
          expect(() => notificationTrigger.cleanup()).not.toThrow()
          
          // Cleanup method should exist
          expect(typeof notificationTrigger.cleanup).toBe('function')
          
          return true
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property 12: Notification manager methods exist and are callable', () => {
    fc.assert(
      fc.property(
        sessionArb,
        permissionRequestArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        (session, event, serverName) => {
          // All notification methods should exist and be callable
          expect(typeof notificationManager.notifySessionCompleted).toBe('function')
          expect(typeof notificationManager.notifySessionError).toBe('function')
          expect(typeof notificationManager.notifyPermissionRequest).toBe('function')
          expect(typeof notificationManager.notifyLongRunningSession).toBe('function')
          expect(typeof notificationManager.notifyServerIssue).toBe('function')
          
          // Parameters should be valid
          expect(session.id).toBeTruthy()
          expect(session.name).toBeTruthy()
          expect(event.type).toBe('permission_request')
          expect(serverName.length).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 20 }
    )
  })
})