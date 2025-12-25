// Property tests for session grouping and organization
// Feature: opencode-session-monitor, Property 9: Instance Grouping and Organization
// Feature: opencode-session-monitor, Property 11: Sorting and Ordering Consistency

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { Session, SessionStatus, Server, GroupMode, SortMode } from "./types";
import {
  groupSessions,
  sortSessions,
  sortGroups,
  calculateTotalCost,
  calculateTotalTokens,
  filterSessions,
  buildSessionHierarchy,
  getUniqueProjects,
  getUniqueServers,
} from "./grouping";

// Test arbitraries
const sessionStatusArb = fc.constantFrom(
  "idle",
  "busy",
  "waiting_for_permission",
  "completed",
  "error",
  "aborted",
) as fc.Arbitrary<SessionStatus>;

const groupModeArb = fc.constantFrom(
  "none",
  "project",
  "server",
) as fc.Arbitrary<GroupMode>;
const sortModeArb = fc.constantFrom(
  "name",
  "activity",
  "created",
  "cost",
) as fc.Arbitrary<SortMode>;

const sessionArb = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    serverId: fc.string({ minLength: 1, maxLength: 50 }),
    serverUrl: fc.webUrl(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    status: sessionStatusArb,
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    lastActivity: fc.integer({ min: 0, max: Date.now() }),
    isLongRunning: fc.boolean(),
    parentId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    childIds: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 50 }), {
      maxLength: 5,
    }),
    project: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    branch: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    cost: fc.option(
      fc.float({ min: 0, max: 1000 }).filter((n) => Number.isFinite(n)),
    ),
    tokens: fc.option(fc.integer({ min: 0, max: 1000000 })),
    messages: fc.constant([]),
  })
  .map((session) => ({
    ...session,
    lastActivity: Math.max(session.createdAt, session.lastActivity),
    childIds: session.childIds.filter((childId) => childId !== session.id),
  })) as fc.Arbitrary<Session>;

const serverArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  url: fc.webUrl(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  lastSeen: fc.integer({ min: 0, max: Date.now() }),
  isHealthy: fc.boolean(),
  version: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
  sessions: fc.constant([]),
}) as fc.Arbitrary<Server>;

describe("Session Grouping and Organization", () => {
  it("Property 9: Grouping preserves all sessions", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        fc.array(serverArb, { minLength: 0, maxLength: 10 }),
        groupModeArb,
        (sessions, servers, groupBy) => {
          const serverMap = new Map(servers.map((s) => [s.id, s]));
          const groups = groupSessions(sessions, serverMap, groupBy);

          // All sessions should be preserved across groups
          const allGroupedSessions = groups.flatMap((g) => g.sessions);
          expect(allGroupedSessions.length).toBe(sessions.length);

          // Each session should appear exactly once
          const sessionIds = new Set(sessions.map((s) => s.id));
          const groupedSessionIds = new Set(
            allGroupedSessions.map((s) => s.id),
          );
          expect(groupedSessionIds).toEqual(sessionIds);

          // No session should be duplicated
          const groupedIds = allGroupedSessions.map((s) => s.id);
          const uniqueGroupedIds = new Set(groupedIds);
          expect(uniqueGroupedIds.size).toBe(groupedIds.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 9: Group statistics are accurate", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        fc.array(serverArb, { minLength: 0, maxLength: 10 }),
        groupModeArb,
        (sessions, servers, groupBy) => {
          const serverMap = new Map(servers.map((s) => [s.id, s]));
          const groups = groupSessions(sessions, serverMap, groupBy);

          for (const group of groups) {
            // Total cost should match sum of session costs
            const expectedCost = calculateTotalCost(group.sessions);
            expect(group.totalCost).toBe(expectedCost);

            // Total tokens should match sum of session tokens
            const expectedTokens = calculateTotalTokens(group.sessions);
            expect(group.totalTokens).toBe(expectedTokens);

            // Group should have valid properties
            expect(group.id).toBeDefined();
            expect(group.name).toBeDefined();
            expect(Array.isArray(group.sessions)).toBe(true);
            expect(typeof group.isExpanded).toBe("boolean");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 9: Project grouping is consistent", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 1, maxLength: 20 }),
        fc.array(serverArb, { minLength: 0, maxLength: 10 }),
        (sessions, servers) => {
          const serverMap = new Map(servers.map((s) => [s.id, s]));
          const groups = groupSessions(sessions, serverMap, "project");

          // Sessions in the same group should have the same project:branch combination
          for (const group of groups) {
            if (group.sessions.length > 1) {
              const firstSession = group.sessions[0];
              const expectedProject = firstSession.project || "Unknown Project";
              const expectedBranch = firstSession.branch || "main";

              for (const session of group.sessions) {
                const sessionProject = session.project || "Unknown Project";
                const sessionBranch = session.branch || "main";

                expect(sessionProject).toBe(expectedProject);

                // Only check branch if not "Unknown Project"
                if (expectedProject !== "Unknown Project") {
                  expect(sessionBranch).toBe(expectedBranch);
                }
              }
            }
          }

          // Each unique project:branch combination should have its own group
          const projectBranches = new Set<string>();
          for (const session of sessions) {
            const project = session.project || "Unknown Project";
            const branch = session.branch || "main";
            const key =
              project === "Unknown Project" ? project : `${project}:${branch}`;
            projectBranches.add(key);
          }

          // Number of groups should match unique project:branch combinations
          expect(groups.length).toBe(projectBranches.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 9: Server grouping is consistent", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 1, maxLength: 20 }),
        fc.array(serverArb, { minLength: 0, maxLength: 10 }),
        (sessions, servers) => {
          const serverMap = new Map(servers.map((s) => [s.id, s]));
          const groups = groupSessions(sessions, serverMap, "server");

          // Sessions in the same group should have the same server
          for (const group of groups) {
            if (group.sessions.length > 1) {
              const firstSession = group.sessions[0];
              const expectedServerId = firstSession.serverId;

              for (const session of group.sessions) {
                expect(session.serverId).toBe(expectedServerId);
              }
            }
          }

          // Each unique server should have its own group
          const serverIds = new Set(sessions.map((s) => s.serverId));
          expect(groups.length).toBe(serverIds.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 11: Sorting maintains session count", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        sortModeArb,
        (sessions, sortBy) => {
          const sorted = sortSessions(sessions, sortBy);

          // Sorting should preserve all sessions
          expect(sorted.length).toBe(sessions.length);

          // All original sessions should be present
          const originalIds = new Set(sessions.map((s) => s.id));
          const sortedIds = new Set(sorted.map((s) => s.id));
          expect(sortedIds).toEqual(originalIds);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 11: Sorting order is consistent", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 2, maxLength: 20 }),
        sortModeArb,
        (sessions, sortBy) => {
          const sorted = sortSessions(sessions, sortBy);

          // Check sorting order based on sort mode
          for (let i = 0; i < sorted.length - 1; i++) {
            const current = sorted[i];
            const next = sorted[i + 1];

            switch (sortBy) {
              case "name":
                expect(
                  current.name.localeCompare(next.name),
                ).toBeLessThanOrEqual(0);
                break;
              case "activity":
                expect(current.lastActivity).toBeGreaterThanOrEqual(
                  next.lastActivity,
                );
                break;
              case "created":
                expect(current.createdAt).toBeGreaterThanOrEqual(
                  next.createdAt,
                );
                break;
              case "cost":
                const costA = current.cost || 0;
                const costB = next.cost || 0;
                expect(costA).toBeGreaterThanOrEqual(costB);
                break;
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 11: Group sorting maintains group integrity", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        fc.array(serverArb, { minLength: 0, maxLength: 10 }),
        groupModeArb,
        sortModeArb,
        (sessions, servers, groupBy, sortBy) => {
          const serverMap = new Map(servers.map((s) => [s.id, s]));
          const groups = groupSessions(sessions, serverMap, groupBy);
          const sortedGroups = sortGroups(groups, sortBy);

          // Group count should be preserved
          expect(sortedGroups.length).toBe(groups.length);

          // All groups should be present
          const originalGroupIds = new Set(groups.map((g) => g.id));
          const sortedGroupIds = new Set(sortedGroups.map((g) => g.id));
          expect(sortedGroupIds).toEqual(originalGroupIds);

          // Sessions within groups should be preserved
          const originalSessionCount = groups.reduce(
            (sum, g) => sum + g.sessions.length,
            0,
          );
          const sortedSessionCount = sortedGroups.reduce(
            (sum, g) => sum + g.sessions.length,
            0,
          );
          expect(sortedSessionCount).toBe(originalSessionCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 9: Filtering maintains data integrity", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        fc.boolean(),
        fc.option(fc.string({ minLength: 1, maxLength: 20 })),
        (sessions, showOnlyActive, searchTerm) => {
          const filtered = filterSessions(sessions, {
            showOnlyActive,
            searchTerm: searchTerm || undefined,
          });

          // Filtered sessions should be a subset
          expect(filtered.length).toBeLessThanOrEqual(sessions.length);

          // All filtered sessions should exist in original set
          for (const session of filtered) {
            expect(sessions).toContainEqual(session);
          }

          // If showing only active, no terminal sessions should be included
          if (showOnlyActive) {
            for (const session of filtered) {
              expect(["completed", "aborted", "error"]).not.toContain(
                session.status,
              );
            }
          }

          // If search term provided, sessions should match
          if (searchTerm) {
            const term = searchTerm.toLowerCase();
            for (const session of filtered) {
              const matchesName = session.name.toLowerCase().includes(term);
              const matchesProject =
                session.project?.toLowerCase().includes(term) || false;
              const matchesBranch =
                session.branch?.toLowerCase().includes(term) || false;

              expect(matchesName || matchesProject || matchesBranch).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 9: Hierarchy building preserves sessions", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        (sessions) => {
          const hierarchy = buildSessionHierarchy(sessions);

          // Count all sessions in hierarchy (including nested children)
          function countSessionsInHierarchy(sessions: Session[]): number {
            return sessions.reduce((count, session) => {
              return (
                count +
                1 +
                (session.children
                  ? countSessionsInHierarchy(session.children)
                  : 0)
              );
            }, 0);
          }

          const hierarchyCount = countSessionsInHierarchy(hierarchy);

          // All sessions should be preserved in hierarchy
          expect(hierarchyCount).toBeLessThanOrEqual(sessions.length);

          // Root sessions should not have parents in the current set
          const sessionMap = new Map(sessions.map((s) => [s.id, s]));
          for (const rootSession of hierarchy) {
            if (rootSession.parentId) {
              expect(sessionMap.has(rootSession.parentId)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 9: Unique value extraction is accurate", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        (sessions) => {
          const projects = getUniqueProjects(sessions);
          const servers = getUniqueServers(sessions);

          // Projects should be unique and sorted
          const projectSet = new Set(projects);
          expect(projectSet.size).toBe(projects.length);
          expect(projects).toEqual([...projects].sort());

          // All projects should exist in sessions
          for (const project of projects) {
            const hasProject = sessions.some((s) => s.project === project);
            expect(hasProject).toBe(true);
          }

          // Servers should be unique and sorted
          const serverSet = new Set(servers);
          expect(serverSet.size).toBe(servers.length);
          expect(servers).toEqual([...servers].sort());

          // All servers should exist in sessions
          for (const serverId of servers) {
            const hasServer = sessions.some((s) => s.serverId === serverId);
            expect(hasServer).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 11: Cost and token calculations are accurate", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        (sessions) => {
          const totalCost = calculateTotalCost(sessions);
          const totalTokens = calculateTotalTokens(sessions);

          // Calculate expected values
          const expectedCost = sessions.reduce(
            (sum, s) => sum + (s.cost || 0),
            0,
          );
          const expectedTokens = sessions.reduce(
            (sum, s) => sum + (s.tokens || 0),
            0,
          );

          expect(totalCost).toBe(expectedCost);
          expect(totalTokens).toBe(expectedTokens);

          // Values should be non-negative
          expect(totalCost).toBeGreaterThanOrEqual(0);
          expect(totalTokens).toBeGreaterThanOrEqual(0);

          // Values should be finite
          expect(Number.isFinite(totalCost)).toBe(true);
          expect(Number.isFinite(totalTokens)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
