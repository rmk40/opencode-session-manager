// Configuration management for OpenCode Session Monitor

import { homedir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Environment Variables
// ---------------------------------------------------------------------------

export const PORT = parseInt(process.env.OPENCODE_MONITOR_PORT || '', 10) || 41234
export const STALE_TIMEOUT_SEC = parseInt(process.env.OPENCODE_MONITOR_TIMEOUT || '', 10) || 120
export const STALE_TIMEOUT_MS = STALE_TIMEOUT_SEC * 1000
export const LONG_RUNNING_MIN = parseInt(process.env.OPENCODE_MONITOR_LONG_RUNNING || '', 10) || 10
export const LONG_RUNNING_MS = LONG_RUNNING_MIN * 60 * 1000
export const NOTIFY_ENABLED = process.env.OPENCODE_MONITOR_NOTIFICATIONS !== '0'
export const DEBUG = process.env.OPENCODE_MONITOR_DEBUG === '1'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const PID_FILE = join(homedir(), '.opencode-session-monitor.pid')
export const LOG_FILE = join(homedir(), '.opencode-session-monitor.log')

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

export const REFRESH_INTERVAL = 1000
export const SESSION_REFRESH_INTERVAL = 5000

// ---------------------------------------------------------------------------
// Debug Flags (parsed from CLI args)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)

export const DEBUG_FLAGS = {
  sse: args.includes('--debug-sse'),
  state: args.includes('--debug-state'),
  udp: args.includes('--debug'),
}

// ---------------------------------------------------------------------------
// Configuration Interface
// ---------------------------------------------------------------------------

export interface Config {
  port: number
  staleTimeoutMs: number
  longRunningMs: number
  notifyEnabled: boolean
  debug: boolean
  debugFlags: {
    sse: boolean
    state: boolean
    udp: boolean
  }
  refreshInterval: number
  sessionRefreshInterval: number
  pidFile: string
  logFile: string
}

export function getConfig(): Config {
  return {
    port: PORT,
    staleTimeoutMs: STALE_TIMEOUT_MS,
    longRunningMs: LONG_RUNNING_MS,
    notifyEnabled: NOTIFY_ENABLED,
    debug: DEBUG,
    debugFlags: DEBUG_FLAGS,
    refreshInterval: REFRESH_INTERVAL,
    sessionRefreshInterval: SESSION_REFRESH_INTERVAL,
    pidFile: PID_FILE,
    logFile: LOG_FILE,
  }
}