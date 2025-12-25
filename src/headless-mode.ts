// Headless mode for automated testing

import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConnectionManager } from './connection-manager'
import { AppState, Server, Session, ViewMode, GroupMode, SortMode } from './types'
import { debugLogger, performanceMonitor } from './debug-utils'
import { MockServerManager } from './mock-server'

// ---------------------------------------------------------------------------
// Headless Test Runner
// ---------------------------------------------------------------------------

export interface TestScenario {
  name: string
  description: string
  setup: () => Promise<void>
  execute: (runner: HeadlessTestRunner) => Promise<TestResult>
  cleanup: () => Promise<void>
  timeout?: number
}

export interface TestResult {
  success: boolean
  duration: number
  metrics: Record<string, any>
  errors: string[]
  data?: any
}

export class HeadlessTestRunner extends EventEmitter {
  private connectionManager: ConnectionManager
  private mockServerManager: MockServerManager
  private state: AppState
  private isRunning = false
  private testResults: TestResult[] = []

  constructor() {
    super()
    
    this.connectionManager = new ConnectionManager()
    this.mockServerManager = new MockServerManager()
    
    // Initialize state
    this.state = {
      servers: new Map(),
      sessions: new Map(),
      selectedSessionId: undefined,
      currentView: 'list',
      groupBy: 'project',
      sortBy: 'activity',
      showOnlyActive: true,
      expandedGroups: new Set(),
      notifications: {
        enabled: false, // Disable notifications in headless mode
        lastNotified: new Map(),
        pendingPermissions: new Set()
      },
      error: null
    }

    this.setupEventHandlers()
  }

  /**
   * Start headless mode
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Headless runner is already running')
    }

    debugLogger.info('Starting headless test runner')
    
    // Start connection manager
    await this.connectionManager.start()
    
    this.isRunning = true
    this.emit('started')
  }

  /**
   * Stop headless mode
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    debugLogger.info('Stopping headless test runner')
    
    // Stop connection manager
    await this.connectionManager.stop()
    
    // Stop all mock servers
    await this.mockServerManager.stopAll()
    
    this.isRunning = false
    this.emit('stopped')
  }

  /**
   * Run a test scenario
   */
  async runScenario(scenario: TestScenario): Promise<TestResult> {
    debugLogger.info(`Running test scenario: ${scenario.name}`)
    
    const startTime = performance.now()
    const errors: string[] = []
    let success = false
    let data: any = undefined

    try {
      // Setup
      await scenario.setup()
      
      // Execute with timeout
      const timeout = scenario.timeout || 30000 // 30 second default timeout
      const result = await Promise.race([
        scenario.execute(this),
        new Promise<TestResult>((_, reject) => 
          setTimeout(() => reject(new Error('Test scenario timeout')), timeout)
        )
      ])
      
      success = result.success
      data = result.data
      errors.push(...result.errors)
      
    } catch (error) {
      success = false
      errors.push(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      try {
        await scenario.cleanup()
      } catch (cleanupError) {
        errors.push(`Cleanup error: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error'}`)
      }
    }

    const endTime = performance.now()
    const duration = endTime - startTime

    const testResult: TestResult = {
      success,
      duration,
      metrics: performanceMonitor.getMetrics(),
      errors,
      data
    }

    this.testResults.push(testResult)
    this.emit('scenario_completed', { scenario: scenario.name, result: testResult })
    
    debugLogger.info(`Test scenario completed: ${scenario.name}`, {
      success,
      duration: `${duration.toFixed(2)}ms`,
      errorCount: errors.length
    })

    return testResult
  }

  /**
   * Run multiple test scenarios
   */
  async runScenarios(scenarios: TestScenario[]): Promise<TestResult[]> {
    const results: TestResult[] = []
    
    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario)
      results.push(result)
      
      // Stop on first failure if configured
      if (!result.success && process.env.STOP_ON_FAILURE === 'true') {
        break
      }
    }
    
    return results
  }

  /**
   * Get current application state
   */
  getState(): AppState {
    return { ...this.state }
  }

  /**
   * Get servers
   */
  getServers(): Server[] {
    return Array.from(this.state.servers.values())
  }

  /**
   * Get sessions
   */
  getSessions(): Session[] {
    return Array.from(this.state.sessions.values())
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): Session[] {
    return Array.from(this.state.sessions.values()).filter(session => 
      !['completed', 'aborted', 'error'].includes(session.status)
    )
  }

  /**
   * Wait for condition to be met
   */
  async waitForCondition(
    condition: () => boolean,
    timeout: number = 10000,
    checkInterval: number = 100
  ): Promise<boolean> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      if (condition()) {
        return true
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }
    
    return false
  }

  /**
   * Wait for servers to be discovered
   */
  async waitForServers(count: number, timeout: number = 10000): Promise<boolean> {
    return this.waitForCondition(() => this.state.servers.size >= count, timeout)
  }

  /**
   * Wait for sessions to be loaded
   */
  async waitForSessions(count: number, timeout: number = 10000): Promise<boolean> {
    return this.waitForCondition(() => this.state.sessions.size >= count, timeout)
  }

  /**
   * Create mock servers for testing
   */
  async createMockServers(count: number): Promise<void> {
    const promises = []
    
    for (let i = 0; i < count; i++) {
      const serverId = `mock-server-${i + 1}`
      const serverName = `Mock Server ${i + 1}`
      const port = 9000 + i
      
      promises.push(this.mockServerManager.createServer(serverId, serverName, port))
    }
    
    await Promise.all(promises)
  }

  /**
   * Simulate user interactions
   */
  async simulateUserInteraction(action: string, params?: any): Promise<void> {
    switch (action) {
      case 'select_session':
        if (params?.sessionId) {
          this.state.selectedSessionId = params.sessionId
        }
        break
        
      case 'change_view':
        if (params?.view) {
          this.state.currentView = params.view as ViewMode
        }
        break
        
      case 'change_grouping':
        if (params?.groupBy) {
          this.state.groupBy = params.groupBy as GroupMode
        }
        break
        
      case 'change_sorting':
        if (params?.sortBy) {
          this.state.sortBy = params.sortBy as SortMode
        }
        break
        
      case 'toggle_filter':
        this.state.showOnlyActive = !this.state.showOnlyActive
        break
        
      case 'send_message':
        if (params?.sessionId && params?.message) {
          await this.connectionManager.sendMessage(params.sessionId, params.message)
        }
        break
        
      case 'abort_session':
        if (params?.sessionId) {
          await this.connectionManager.abortSession(params.sessionId)
        }
        break
        
      default:
        throw new Error(`Unknown user interaction: ${action}`)
    }
  }

  /**
   * Generate test report
   */
  generateReport(): string {
    const totalTests = this.testResults.length
    const passedTests = this.testResults.filter(r => r.success).length
    const failedTests = totalTests - passedTests
    const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0)
    
    const report = {
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: totalTests > 0 ? (passedTests / totalTests * 100).toFixed(2) + '%' : '0%',
        totalDuration: `${totalDuration.toFixed(2)}ms`,
        averageDuration: totalTests > 0 ? `${(totalDuration / totalTests).toFixed(2)}ms` : '0ms'
      },
      results: this.testResults.map((result, index) => ({
        test: index + 1,
        success: result.success,
        duration: `${result.duration.toFixed(2)}ms`,
        errorCount: result.errors.length,
        errors: result.errors
      })),
      metrics: performanceMonitor.getMetrics()
    }
    
    return JSON.stringify(report, null, 2)
  }

  /**
   * Save test report to file
   */
  saveReport(filename?: string): void {
    const reportFile = filename || join(process.cwd(), 'test-report.json')
    const report = this.generateReport()
    
    writeFileSync(reportFile, report)
    debugLogger.info(`Test report saved to: ${reportFile}`)
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Connection manager events
    this.connectionManager.on('server_discovered', (server: Server) => {
      this.state.servers.set(server.id, server)
      this.emit('server_discovered', server)
    })

    this.connectionManager.on('server_updated', (server: Server) => {
      this.state.servers.set(server.id, server)
      this.emit('server_updated', server)
    })

    this.connectionManager.on('server_removed', (serverId: string) => {
      this.state.servers.delete(serverId)
      this.emit('server_removed', serverId)
    })

    this.connectionManager.on('session_added', (session: Session) => {
      this.state.sessions.set(session.id, session)
      this.emit('session_added', session)
    })

    this.connectionManager.on('session_updated', (session: Session) => {
      this.state.sessions.set(session.id, session)
      this.emit('session_updated', session)
    })

    this.connectionManager.on('session_removed', (sessionId: string) => {
      this.state.sessions.delete(sessionId)
      if (this.state.selectedSessionId === sessionId) {
        this.state.selectedSessionId = undefined
      }
      this.emit('session_removed', sessionId)
    })

    this.connectionManager.on('error', (error) => {
      this.state.error = error
      this.emit('error', error)
    })
  }
}

// ---------------------------------------------------------------------------
// Built-in Test Scenarios
// ---------------------------------------------------------------------------

export const builtInScenarios: TestScenario[] = [
  {
    name: 'server_discovery',
    description: 'Test server discovery and connection',
    setup: async () => {
      // Setup will be done in execute
    },
    execute: async (runner: HeadlessTestRunner) => {
      const errors: string[] = []
      
      try {
        // Create mock servers
        await runner.createMockServers(2)
        
        // Wait for servers to be discovered
        const serversDiscovered = await runner.waitForServers(2, 15000)
        if (!serversDiscovered) {
          errors.push('Failed to discover expected number of servers')
        }
        
        // Verify servers are healthy
        const servers = runner.getServers()
        for (const server of servers) {
          if (!server.isHealthy) {
            errors.push(`Server ${server.id} is not healthy`)
          }
        }
        
        return {
          success: errors.length === 0,
          duration: 0, // Will be set by runner
          metrics: {},
          errors,
          data: { serverCount: servers.length }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unknown error')
        return {
          success: false,
          duration: 0,
          metrics: {},
          errors
        }
      }
    },
    cleanup: async () => {
      // Cleanup will be done by runner
    },
    timeout: 20000
  },

  {
    name: 'session_management',
    description: 'Test session loading and management',
    setup: async () => {
      // Setup will be done in execute
    },
    execute: async (runner: HeadlessTestRunner) => {
      const errors: string[] = []
      
      try {
        // Create mock server
        await runner.createMockServers(1)
        
        // Wait for server discovery
        const serversDiscovered = await runner.waitForServers(1, 10000)
        if (!serversDiscovered) {
          errors.push('Failed to discover server')
          return { success: false, duration: 0, metrics: {}, errors }
        }
        
        // Wait for sessions to be loaded
        const sessionsLoaded = await runner.waitForSessions(1, 10000)
        if (!sessionsLoaded) {
          errors.push('Failed to load sessions')
        }
        
        // Test session interactions
        const sessions = runner.getSessions()
        if (sessions.length > 0) {
          const session = sessions[0]
          
          // Select session
          await runner.simulateUserInteraction('select_session', { sessionId: session.id })
          
          // Change view to session view
          await runner.simulateUserInteraction('change_view', { view: 'session' })
          
          // Send a message
          await runner.simulateUserInteraction('send_message', { 
            sessionId: session.id, 
            message: 'Test message from headless mode' 
          })
        }
        
        return {
          success: errors.length === 0,
          duration: 0,
          metrics: {},
          errors,
          data: { sessionCount: sessions.length }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unknown error')
        return {
          success: false,
          duration: 0,
          metrics: {},
          errors
        }
      }
    },
    cleanup: async () => {
      // Cleanup will be done by runner
    },
    timeout: 25000
  },

  {
    name: 'ui_state_management',
    description: 'Test UI state changes and navigation',
    setup: async () => {
      // No setup needed
    },
    execute: async (runner: HeadlessTestRunner) => {
      const errors: string[] = []
      
      try {
        // Test view changes
        await runner.simulateUserInteraction('change_view', { view: 'help' })
        let state = runner.getState()
        if (state.currentView !== 'help') {
          errors.push('Failed to change view to help')
        }
        
        await runner.simulateUserInteraction('change_view', { view: 'list' })
        state = runner.getState()
        if (state.currentView !== 'list') {
          errors.push('Failed to change view to list')
        }
        
        // Test grouping changes
        await runner.simulateUserInteraction('change_grouping', { groupBy: 'server' })
        state = runner.getState()
        if (state.groupBy !== 'server') {
          errors.push('Failed to change grouping to server')
        }
        
        // Test sorting changes
        await runner.simulateUserInteraction('change_sorting', { sortBy: 'name' })
        state = runner.getState()
        if (state.sortBy !== 'name') {
          errors.push('Failed to change sorting to name')
        }
        
        // Test filter toggle
        const initialFilter = state.showOnlyActive
        await runner.simulateUserInteraction('toggle_filter')
        state = runner.getState()
        if (state.showOnlyActive === initialFilter) {
          errors.push('Failed to toggle active filter')
        }
        
        return {
          success: errors.length === 0,
          duration: 0,
          metrics: {},
          errors,
          data: { finalState: state }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unknown error')
        return {
          success: false,
          duration: 0,
          metrics: {},
          errors
        }
      }
    },
    cleanup: async () => {
      // No cleanup needed
    },
    timeout: 5000
  }
]

// ---------------------------------------------------------------------------
// Global Headless Runner
// ---------------------------------------------------------------------------

export const headlessRunner = new HeadlessTestRunner()