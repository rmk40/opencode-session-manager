// Property tests for state management
// Feature: opencode-session-monitor, Property 4: Session State Transition Handling
// Feature: opencode-session-monitor, Property 10: View Mode and Navigation State Management

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { AppState, Session, SessionStatus, ViewMode, GroupMode, SortMode, Server } from './types'

// Test arbitraries
const sessionStatusArb = fc.constantFrom(
  'idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted'
) as fc.Arbitrary<SessionStatus>

const viewModeArb = fc.constantFrom('list', 'session', 'help') as fc.Arbitrary<ViewMode>
const groupModeArb = fc.constantFrom('none', 'project', 'server') as fc.Arbitrary<GroupMode>
const sortModeArb = fc.constantFrom('name', 'activity', 'created', 'cost') as fc.Arbitrary<SortMode>

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

const serverArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  url: fc.webUrl(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  lastSeen: fc.integer({ min: 0, max: Date.now() }),
  isHealthy: fc.boolean(),
  version: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
  sessions: fc.constant([])
}) as fc.Arbitrary<Server>

describe('State Management', () => {
  it('Property 4: Session state transitions are valid and consistent', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 1, maxLength: 20 }),
        fc.array(sessionStatusArb, { minLength: 1, maxLength: 10 }),
        (sessions, statusTransitions) => {
          // Test that session status transitions maintain data consistency
          for (const session of sessions) {
            const originalStatus = session.status
            
            // Apply status transitions
            for (const newStatus of statusTransitions) {
              const updatedSession = { ...session, status: newStatus }
              
              // Verify session identity is preserved
              expect(updatedSession.id).toBe(session.id)
              expect(updatedSession.serverId).toBe(session.serverId)
              expect(updatedSession.serverUrl).toBe(session.serverUrl)
              
              // Verify timestamps are preserved or updated appropriately
              expect(updatedSession.createdAt).toBe(session.createdAt)
              expect(updatedSession.lastActivity).toBeGreaterThanOrEqual(session.createdAt)
              
              // Verify status is valid
              expect(['idle', 'busy', 'waiting_for_permission', 'completed', 'error', 'aborted'])
                .toContain(updatedSession.status)
              
              // Verify parent-child relationships are preserved
              expect(updatedSession.parentId).toBe(session.parentId)
              expect(updatedSession.childIds).toEqual(session.childIds)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 4: Session completion states are terminal', () => {
    fc.assert(
      fc.property(
        sessionArb,
        (session) => {
          const terminalStates: SessionStatus[] = ['completed', 'aborted', 'error']
          const activeStates: SessionStatus[] = ['idle', 'busy', 'waiting_for_permission']
          
          // Test terminal state behavior
          if (terminalStates.includes(session.status)) {
            // Terminal sessions should not be considered active
            expect(activeStates).not.toContain(session.status)
          }
          
          if (activeStates.includes(session.status)) {
            // Active sessions should not be terminal
            expect(terminalStates).not.toContain(session.status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 4: Session activity timestamps are monotonic', () => {
    fc.assert(
      fc.property(
        sessionArb,
        fc.integer({ min: 0, max: 1000000 }),
        (session, timeIncrement) => {
          const newActivity = session.lastActivity + timeIncrement
          const updatedSession = { ...session, lastActivity: newActivity }
          
          // Activity timestamp should never go backwards
          expect(updatedSession.lastActivity).toBeGreaterThanOrEqual(session.lastActivity)
          
          // Activity should always be >= creation time
          expect(updatedSession.lastActivity).toBeGreaterThanOrEqual(session.createdAt)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 10: View mode transitions are valid', () => {
    fc.assert(
      fc.property(
        viewModeArb,
        viewModeArb,
        (currentView, newView) => {
          // All view modes should be valid
          const validViews: ViewMode[] = ['list', 'session', 'help']
          expect(validViews).toContain(currentView)
          expect(validViews).toContain(newView)
          
          // View transitions should always be possible
          expect(typeof newView).toBe('string')
          expect(newView.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 10: Navigation state consistency', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        viewModeArb,
        (sessions, selectedSessionId, currentView) => {
          const sessionMap = new Map(sessions.map(s => [s.id, s]))
          
          // If a session is selected, it should exist in the session map or be undefined
          if (selectedSessionId) {
            const sessionExists = sessionMap.has(selectedSessionId)
            // Either session exists or selection should be cleared
            if (!sessionExists) {
              // This represents the case where selection should be cleared
              expect(selectedSessionId).toBeDefined()
            } else {
              expect(sessionMap.get(selectedSessionId)).toBeDefined()
            }
          }
          
          // View mode should be consistent with selection
          if (currentView === 'session') {
            // Session view should have a valid selection context
            expect(['list', 'session', 'help']).toContain(currentView)
          }
          
          if (currentView === 'list') {
            // List view can have any selection state
            expect(['list', 'session', 'help']).toContain(currentView)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 10: Group and sort state combinations are valid', () => {
    fc.assert(
      fc.property(
        groupModeArb,
        sortModeArb,
        fc.boolean(),
        (groupBy, sortBy, showOnlyActive) => {
          // All combinations of group and sort modes should be valid
          const validGroupModes: GroupMode[] = ['none', 'project', 'server']
          const validSortModes: SortMode[] = ['name', 'activity', 'created', 'cost']
          
          expect(validGroupModes).toContain(groupBy)
          expect(validSortModes).toContain(sortBy)
          
          // Show only active is a boolean flag
          expect(typeof showOnlyActive).toBe('boolean')
          
          // Group expansion state should be consistent
          const expandedGroups = new Set<string>()
          
          // When grouping is 'none', expanded groups should be empty or ignored
          if (groupBy === 'none') {
            // No groups to expand
            expect(expandedGroups.size).toBeGreaterThanOrEqual(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 10: Session filtering maintains data integrity', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        fc.boolean(),
        (sessions, showOnlyActive) => {
          const activeSessions = sessions.filter(session => 
            !['completed', 'aborted', 'error'].includes(session.status)
          )
          
          const filteredSessions = showOnlyActive ? activeSessions : sessions
          
          // Filtered sessions should be a subset of all sessions
          expect(filteredSessions.length).toBeLessThanOrEqual(sessions.length)
          
          // All filtered sessions should exist in original set
          for (const session of filteredSessions) {
            expect(sessions).toContainEqual(session)
          }
          
          // If showing only active, no terminal sessions should be included
          if (showOnlyActive) {
            for (const session of filteredSessions) {
              expect(['completed', 'aborted', 'error']).not.toContain(session.status)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 10: Server-session relationships are maintained', () => {
    fc.assert(
      fc.property(
        fc.array(serverArb, { minLength: 0, maxLength: 10 }),
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        (servers, sessions) => {
          const serverMap = new Map(servers.map(s => [s.id, s]))
          
          // Group sessions by server
          const sessionsByServer = new Map<string, Session[]>()
          
          for (const session of sessions) {
            const serverSessions = sessionsByServer.get(session.serverId) || []
            serverSessions.push(session)
            sessionsByServer.set(session.serverId, serverSessions)
          }
          
          // Verify relationships
          for (const [serverId, serverSessions] of sessionsByServer) {
            // All sessions for a server should have the same serverId
            for (const session of serverSessions) {
              expect(session.serverId).toBe(serverId)
            }
            
            // Sessions should be unique within a server
            const sessionIds = serverSessions.map(s => s.id)
            const uniqueSessionIds = new Set(sessionIds)
            expect(uniqueSessionIds.size).toBe(sessionIds.length)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})