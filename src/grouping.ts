// Session grouping and organization logic

import { Session, SessionGroup, GroupMode, SortMode, Server } from './types'

// ---------------------------------------------------------------------------
// Grouping Functions
// ---------------------------------------------------------------------------

export function groupSessions(
  sessions: Session[], 
  servers: Map<string, Server>,
  groupBy: GroupMode
): SessionGroup[] {
  switch (groupBy) {
    case 'none':
      return [{
        id: 'all',
        name: 'All Sessions',
        sessions: sessions,
        totalCost: calculateTotalCost(sessions),
        totalTokens: calculateTotalTokens(sessions),
        isExpanded: true
      }]
    
    case 'project':
      return groupByProject(sessions)
    
    case 'server':
      return groupByServer(sessions, servers)
    
    default:
      return []
  }
}

function groupByProject(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, Session[]>()
  
  for (const session of sessions) {
    // Handle null/undefined project and branch consistently
    const project = session.project || 'Unknown Project'
    const branch = session.branch || 'main'
    const key = project === 'Unknown Project' ? project : `${project}:${branch}`
    
    const existing = groups.get(key) || []
    existing.push(session)
    groups.set(key, existing)
  }
  
  return Array.from(groups.entries()).map(([key, sessions]) => ({
    id: key,
    name: key,
    sessions,
    totalCost: calculateTotalCost(sessions),
    totalTokens: calculateTotalTokens(sessions),
    isExpanded: false
  }))
}

function groupByServer(sessions: Session[], servers: Map<string, Server>): SessionGroup[] {
  const groups = new Map<string, Session[]>()
  
  for (const session of sessions) {
    const server = servers.get(session.serverId)
    const key = server ? server.name : session.serverId
    const existing = groups.get(key) || []
    existing.push(session)
    groups.set(key, existing)
  }
  
  return Array.from(groups.entries()).map(([key, sessions]) => ({
    id: key,
    name: key,
    sessions,
    totalCost: calculateTotalCost(sessions),
    totalTokens: calculateTotalTokens(sessions),
    isExpanded: false
  }))
}

// ---------------------------------------------------------------------------
// Sorting Functions
// ---------------------------------------------------------------------------

export function sortSessions(sessions: Session[], sortBy: SortMode): Session[] {
  const sorted = [...sessions]
  
  switch (sortBy) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    
    case 'activity':
      return sorted.sort((a, b) => b.lastActivity - a.lastActivity)
    
    case 'created':
      return sorted.sort((a, b) => b.createdAt - a.createdAt)
    
    case 'cost':
      return sorted.sort((a, b) => {
        const costA = a.cost || 0
        const costB = b.cost || 0
        return costB - costA
      })
    
    default:
      return sorted
  }
}

export function sortGroups(groups: SessionGroup[], sortBy: SortMode): SessionGroup[] {
  const sorted = [...groups]
  
  switch (sortBy) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    
    case 'activity':
      return sorted.sort((a, b) => {
        const latestA = Math.max(...a.sessions.map(s => s.lastActivity))
        const latestB = Math.max(...b.sessions.map(s => s.lastActivity))
        return latestB - latestA
      })
    
    case 'created':
      return sorted.sort((a, b) => {
        const latestA = Math.max(...a.sessions.map(s => s.createdAt))
        const latestB = Math.max(...b.sessions.map(s => s.createdAt))
        return latestB - latestA
      })
    
    case 'cost':
      return sorted.sort((a, b) => b.totalCost - a.totalCost)
    
    default:
      return sorted
  }
}

// ---------------------------------------------------------------------------
// Statistics Calculation
// ---------------------------------------------------------------------------

export function calculateTotalCost(sessions: Session[]): number {
  return sessions.reduce((total, session) => total + (session.cost || 0), 0)
}

export function calculateTotalTokens(sessions: Session[]): number {
  return sessions.reduce((total, session) => total + (session.tokens || 0), 0)
}

export function calculateGroupStatistics(group: SessionGroup): {
  sessionCount: number
  activeCount: number
  completedCount: number
  errorCount: number
  totalCost: number
  totalTokens: number
  averageCost: number
  averageTokens: number
} {
  const { sessions } = group
  const sessionCount = sessions.length
  
  const activeCount = sessions.filter(s => 
    ['idle', 'busy', 'waiting_for_permission'].includes(s.status)
  ).length
  
  const completedCount = sessions.filter(s => s.status === 'completed').length
  const errorCount = sessions.filter(s => ['error', 'aborted'].includes(s.status)).length
  
  const totalCost = group.totalCost
  const totalTokens = group.totalTokens
  
  const averageCost = sessionCount > 0 ? totalCost / sessionCount : 0
  const averageTokens = sessionCount > 0 ? totalTokens / sessionCount : 0
  
  return {
    sessionCount,
    activeCount,
    completedCount,
    errorCount,
    totalCost,
    totalTokens,
    averageCost,
    averageTokens
  }
}

// ---------------------------------------------------------------------------
// Filtering Functions
// ---------------------------------------------------------------------------

export function filterSessions(
  sessions: Session[], 
  filters: {
    showOnlyActive?: boolean
    searchTerm?: string
    serverIds?: string[]
    statuses?: string[]
    projects?: string[]
  }
): Session[] {
  let filtered = sessions
  
  // Filter by active status
  if (filters.showOnlyActive) {
    filtered = filtered.filter(session => 
      !['completed', 'aborted', 'error'].includes(session.status)
    )
  }
  
  // Filter by search term
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase()
    filtered = filtered.filter(session =>
      session.name.toLowerCase().includes(term) ||
      session.project?.toLowerCase().includes(term) ||
      session.branch?.toLowerCase().includes(term)
    )
  }
  
  // Filter by server IDs
  if (filters.serverIds && filters.serverIds.length > 0) {
    filtered = filtered.filter(session =>
      filters.serverIds!.includes(session.serverId)
    )
  }
  
  // Filter by statuses
  if (filters.statuses && filters.statuses.length > 0) {
    filtered = filtered.filter(session =>
      filters.statuses!.includes(session.status)
    )
  }
  
  // Filter by projects
  if (filters.projects && filters.projects.length > 0) {
    filtered = filtered.filter(session =>
      session.project && filters.projects!.includes(session.project)
    )
  }
  
  return filtered
}

// ---------------------------------------------------------------------------
// Hierarchy Functions
// ---------------------------------------------------------------------------

export function buildSessionHierarchy(sessions: Session[]): Session[] {
  const sessionMap = new Map(sessions.map(s => [s.id, s]))
  const rootSessions: Session[] = []
  const processedIds = new Set<string>()
  
  // Find root sessions (no parent or parent not in current set)
  for (const session of sessions) {
    if (!session.parentId || !sessionMap.has(session.parentId)) {
      if (!processedIds.has(session.id)) {
        rootSessions.push(session)
        processedIds.add(session.id)
      }
    }
  }
  
  // Sort root sessions and their children recursively
  return rootSessions.map(session => sortSessionChildren(session, sessionMap, processedIds))
}

function sortSessionChildren(session: Session, sessionMap: Map<string, Session>, processedIds: Set<string>): Session {
  const children = session.childIds
    .map(id => sessionMap.get(id))
    .filter((child): child is Session => child !== undefined && !processedIds.has(child.id))
    .map(child => {
      processedIds.add(child.id)
      return sortSessionChildren(child, sessionMap, processedIds)
    })
  
  return {
    ...session,
    children: children.sort((a, b) => a.createdAt - b.createdAt)
  }
}

// ---------------------------------------------------------------------------
// Search and Navigation
// ---------------------------------------------------------------------------

export function searchSessions(
  sessions: Session[], 
  query: string,
  options: {
    searchInMessages?: boolean
    caseSensitive?: boolean
    exactMatch?: boolean
  } = {}
): Session[] {
  if (!query.trim()) return sessions
  
  const searchTerm = options.caseSensitive ? query : query.toLowerCase()
  
  return sessions.filter(session => {
    const fields = [
      session.name,
      session.project || '',
      session.branch || '',
      session.serverId
    ]
    
    if (options.searchInMessages) {
      fields.push(...session.messages.map(m => m.content))
    }
    
    const searchText = options.caseSensitive 
      ? fields.join(' ')
      : fields.join(' ').toLowerCase()
    
    return options.exactMatch 
      ? searchText.includes(searchTerm)
      : searchText.includes(searchTerm)
  })
}

export function findSessionById(sessions: Session[], sessionId: string): Session | undefined {
  return sessions.find(session => session.id === sessionId)
}

export function findSessionsByProject(sessions: Session[], project: string, branch?: string): Session[] {
  return sessions.filter(session => {
    if (session.project !== project) return false
    if (branch && session.branch !== branch) return false
    return true
  })
}

export function findSessionsByServer(sessions: Session[], serverId: string): Session[] {
  return sessions.filter(session => session.serverId === serverId)
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

export function getUniqueProjects(sessions: Session[]): string[] {
  const projects = new Set<string>()
  
  for (const session of sessions) {
    if (session.project) {
      projects.add(session.project)
    }
  }
  
  return Array.from(projects).sort()
}

export function getUniqueBranches(sessions: Session[], project?: string): string[] {
  const branches = new Set<string>()
  
  for (const session of sessions) {
    if (project && session.project !== project) continue
    if (session.branch) {
      branches.add(session.branch)
    }
  }
  
  return Array.from(branches).sort()
}

export function getUniqueServers(sessions: Session[]): string[] {
  const servers = new Set<string>()
  
  for (const session of sessions) {
    servers.add(session.serverId)
  }
  
  return Array.from(servers).sort()
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return '$0.00'
  if (cost < 1) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString()
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1000000).toFixed(1)}M`
}