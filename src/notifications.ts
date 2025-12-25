// Desktop notification system for OpenCode Session Monitor

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { Session, PermissionRequestEvent, AppError } from './types'
import { getConfig } from './config'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Notification Types
// ---------------------------------------------------------------------------

export interface NotificationOptions {
  title: string
  message: string
  sound?: boolean
  urgent?: boolean
  icon?: string
  actions?: NotificationAction[]
}

export interface NotificationAction {
  id: string
  label: string
}

export interface NotificationResult {
  success: boolean
  actionId?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

export function getPlatform(): 'macos' | 'linux' | 'windows' | 'unknown' {
  switch (process.platform) {
    case 'darwin': return 'macos'
    case 'linux': return 'linux'
    case 'win32': return 'windows'
    default: return 'unknown'
  }
}

// ---------------------------------------------------------------------------
// Notification Handlers
// ---------------------------------------------------------------------------

export class NotificationManager {
  private config = getConfig()
  private platform = getPlatform()
  private lastNotifications = new Map<string, number>()
  private readonly NOTIFICATION_COOLDOWN = 30000 // 30 seconds

  constructor() {}

  /**
   * Send a desktop notification
   */
  async sendNotification(options: NotificationOptions): Promise<NotificationResult> {
    if (!this.config.notifyEnabled) {
      return { success: false, error: 'Notifications disabled' }
    }

    // Check cooldown
    const key = `${options.title}:${options.message}`
    const lastSent = this.lastNotifications.get(key) || 0
    const now = Date.now()
    
    if (now - lastSent < this.NOTIFICATION_COOLDOWN) {
      return { success: false, error: 'Notification cooldown active' }
    }

    try {
      const result = await this.sendPlatformNotification(options)
      
      if (result.success) {
        this.lastNotifications.set(key, now)
      }
      
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Send platform-specific notification
   */
  private async sendPlatformNotification(options: NotificationOptions): Promise<NotificationResult> {
    switch (this.platform) {
      case 'macos':
        return this.sendMacOSNotification(options)
      case 'linux':
        return this.sendLinuxNotification(options)
      case 'windows':
        return this.sendWindowsNotification(options)
      default:
        return { success: false, error: 'Unsupported platform' }
    }
  }

  /**
   * Send macOS notification using osascript
   */
  private async sendMacOSNotification(options: NotificationOptions): Promise<NotificationResult> {
    const { title, message, sound = false } = options
    
    const script = `
      display notification "${this.escapeAppleScript(message)}" \\
        with title "${this.escapeAppleScript(title)}" \\
        ${sound ? 'sound name "default"' : ''}
    `

    try {
      await execAsync(`osascript -e '${script}'`)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send macOS notification'
      }
    }
  }

  /**
   * Send Linux notification using notify-send
   */
  private async sendLinuxNotification(options: NotificationOptions): Promise<NotificationResult> {
    const { title, message, urgent = false, icon } = options
    
    const args = [
      'notify-send',
      urgent ? '--urgency=critical' : '--urgency=normal',
      icon ? `--icon=${icon}` : '',
      `"${this.escapeShell(title)}"`,
      `"${this.escapeShell(message)}"`
    ].filter(Boolean)

    try {
      await execAsync(args.join(' '))
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send Linux notification'
      }
    }
  }

  /**
   * Send Windows notification using PowerShell
   */
  private async sendWindowsNotification(options: NotificationOptions): Promise<NotificationResult> {
    const { title, message } = options
    
    const script = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
      
      $template = @"
      <toast>
        <visual>
          <binding template="ToastText02">
            <text id="1">${this.escapePowerShell(title)}</text>
            <text id="2">${this.escapePowerShell(message)}</text>
          </binding>
        </visual>
      </toast>
"@
      
      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $xml.LoadXml($template)
      $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("OpenCode Session Monitor").Show($toast)
    `

    try {
      await execAsync(`powershell -Command "${script}"`)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send Windows notification'
      }
    }
  }

  /**
   * Notify about session completion
   */
  async notifySessionCompleted(session: Session): Promise<NotificationResult> {
    const duration = this.formatDuration(Date.now() - session.createdAt)
    const cost = session.cost ? ` ($${session.cost.toFixed(3)})` : ''
    
    return this.sendNotification({
      title: 'Session Completed',
      message: `${session.name} finished in ${duration}${cost}`,
      sound: true
    })
  }

  /**
   * Notify about session error
   */
  async notifySessionError(session: Session, error?: string): Promise<NotificationResult> {
    const errorMsg = error ? `: ${error}` : ''
    
    return this.sendNotification({
      title: 'Session Error',
      message: `${session.name} encountered an error${errorMsg}`,
      sound: true,
      urgent: true
    })
  }

  /**
   * Notify about permission request
   */
  async notifyPermissionRequest(event: PermissionRequestEvent): Promise<NotificationResult> {
    return this.sendNotification({
      title: 'Permission Required',
      message: `${event.toolName} requires permission: ${event.description}`,
      sound: true,
      urgent: true
    })
  }

  /**
   * Notify about long-running session
   */
  async notifyLongRunningSession(session: Session): Promise<NotificationResult> {
    const duration = this.formatDuration(Date.now() - session.createdAt)
    
    return this.sendNotification({
      title: 'Long-Running Session',
      message: `${session.name} has been running for ${duration}`,
      sound: false
    })
  }

  /**
   * Notify about server connection issues
   */
  async notifyServerIssue(serverName: string, issue: string): Promise<NotificationResult> {
    return this.sendNotification({
      title: 'Server Issue',
      message: `${serverName}: ${issue}`,
      sound: false,
      urgent: true
    })
  }

  /**
   * Clear notification cooldown for a specific key
   */
  clearCooldown(title: string, message: string): void {
    const key = `${title}:${message}`
    this.lastNotifications.delete(key)
  }

  /**
   * Clear all notification cooldowns
   */
  clearAllCooldowns(): void {
    this.lastNotifications.clear()
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  private escapeAppleScript(text: string): string {
    return text.replace(/"/g, '\\"').replace(/\\/g, '\\\\')
  }

  private escapeShell(text: string): string {
    return text.replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\$/g, '\\$')
  }

  private escapePowerShell(text: string): string {
    return text.replace(/"/g, '""').replace(/'/g, "''")
  }

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }
}

// ---------------------------------------------------------------------------
// Notification Triggers
// ---------------------------------------------------------------------------

export class NotificationTrigger {
  private notificationManager: NotificationManager
  private config = getConfig()
  private sessionStates = new Map<string, { status: string; lastNotified: number }>()

  constructor(notificationManager: NotificationManager) {
    this.notificationManager = notificationManager
  }

  /**
   * Handle session state change
   */
  async handleSessionUpdate(session: Session): Promise<void> {
    if (!this.config.notifyEnabled) return

    const previousState = this.sessionStates.get(session.id)
    const currentTime = Date.now()

    // Update session state
    this.sessionStates.set(session.id, {
      status: session.status,
      lastNotified: previousState?.lastNotified || 0
    })

    // Check for notification triggers
    if (previousState && previousState.status !== session.status) {
      await this.checkStatusChangeNotification(session, previousState.status)
    }

    // Check for long-running session notification
    await this.checkLongRunningNotification(session)
  }

  /**
   * Handle permission request
   */
  async handlePermissionRequest(event: PermissionRequestEvent): Promise<void> {
    if (!this.config.notifyEnabled) return

    await this.notificationManager.notifyPermissionRequest(event)
  }

  /**
   * Handle server error
   */
  async handleServerError(serverName: string, error: AppError): Promise<void> {
    if (!this.config.notifyEnabled) return

    await this.notificationManager.notifyServerIssue(serverName, error.message)
  }

  /**
   * Check if status change should trigger notification
   */
  private async checkStatusChangeNotification(session: Session, previousStatus: string): Promise<void> {
    // Notify on completion
    if (session.status === 'completed' && previousStatus !== 'completed') {
      await this.notificationManager.notifySessionCompleted(session)
    }

    // Notify on error
    if (session.status === 'error' && previousStatus !== 'error') {
      await this.notificationManager.notifySessionError(session)
    }

    // Notify on permission request
    if (session.status === 'waiting_for_permission' && previousStatus !== 'waiting_for_permission') {
      // Permission request notifications are handled separately
    }
  }

  /**
   * Check if session should trigger long-running notification
   */
  private async checkLongRunningNotification(session: Session): Promise<void> {
    const sessionState = this.sessionStates.get(session.id)
    if (!sessionState) return

    const now = Date.now()
    const sessionDuration = now - session.createdAt
    const timeSinceLastNotification = now - sessionState.lastNotified

    // Notify if session is long-running and we haven't notified recently
    if (
      sessionDuration > this.config.longRunningMs &&
      timeSinceLastNotification > 3600000 && // 1 hour
      ['idle', 'busy'].includes(session.status)
    ) {
      const result = await this.notificationManager.notifyLongRunningSession(session)
      
      if (result.success) {
        sessionState.lastNotified = now
        this.sessionStates.set(session.id, sessionState)
      }
    }
  }

  /**
   * Clean up old session states
   */
  cleanup(): void {
    // Remove states for sessions that haven't been updated in 24 hours
    const cutoff = Date.now() - 86400000 // 24 hours
    
    for (const [sessionId, state] of this.sessionStates) {
      if (state.lastNotified < cutoff) {
        this.sessionStates.delete(sessionId)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Global Instances
// ---------------------------------------------------------------------------

export const notificationManager = new NotificationManager()
export const notificationTrigger = new NotificationTrigger(notificationManager)