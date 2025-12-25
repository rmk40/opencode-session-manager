// Main application component and layout for OpenCode Session Monitor

import React, { useEffect, useState } from 'react'
import { render, Box, Text, useInput, useApp } from 'ink'
import { AppStateProvider, useAppState } from './state'
import { LayoutProvider, useLayout } from './layout'
import { notificationTrigger } from './notifications'

// ---------------------------------------------------------------------------
// Header Component
// ---------------------------------------------------------------------------

function Header() {
  const { layout } = useLayout()
  const { state } = useAppState()
  
  const serverCount = state.servers.size
  const sessionCount = state.sessions.size
  const activeCount = Array.from(state.sessions.values()).filter(s => 
    !['completed', 'aborted', 'error'].includes(s.status)
  ).length

  return (
    <Box flexDirection="column" height={layout.dimensions.headerHeight}>
      <Box justifyContent="center" borderStyle="double" borderColor="blue">
        <Text bold color="blue">OpenCode Session Monitor</Text>
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Text>
          Servers: <Text color="green">{serverCount}</Text> | 
          Sessions: <Text color="yellow">{sessionCount}</Text> | 
          Active: <Text color="cyan">{activeCount}</Text>
        </Text>
        <Text>
          View: <Text color="magenta">{state.currentView}</Text> | 
          Group: <Text color="gray">{state.groupBy}</Text>
        </Text>
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Footer Component
// ---------------------------------------------------------------------------

function Footer() {
  const { layout } = useLayout()
  const { state } = useAppState()
  
  const keyHelp = state.currentView === 'list' 
    ? 'q:quit | ↑↓:navigate | enter:view | g:group | s:sort | f:filter | h:help'
    : state.currentView === 'session'
    ? 'q:quit | esc:back | i:input | a:abort | r:refresh | h:help'
    : 'q:quit | esc:back'

  return (
    <Box height={layout.dimensions.footerHeight} flexDirection="column">
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>{keyHelp}</Text>
      </Box>
      {state.error && (
        <Box backgroundColor="red" paddingX={1}>
          <Text color="white">Error: {state.error.message}</Text>
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Session List Component
// ---------------------------------------------------------------------------

function SessionList() {
  const { state, selectSession, setView } = useAppState()
  const { layout } = useLayout()
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  const sessions = Array.from(state.sessions.values())
  const filteredSessions = state.showOnlyActive 
    ? sessions.filter(s => !['completed', 'aborted', 'error'].includes(s.status))
    : sessions

  // Handle keyboard input
  useInput((input, key) => {
    if (state.currentView !== 'list') return

    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1))
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(filteredSessions.length - 1, selectedIndex + 1))
    } else if (key.return) {
      const selectedSession = filteredSessions[selectedIndex]
      if (selectedSession) {
        selectSession(selectedSession.id)
        setView('session')
      }
    }
  })

  const maxItems = Math.min(layout.maxListItems, layout.dimensions.contentHeight - 2)
  const visibleSessions = filteredSessions.slice(0, maxItems)

  return (
    <Box flexDirection="column" height={layout.dimensions.contentHeight}>
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold>Sessions ({filteredSessions.length})</Text>
      </Box>
      
      {visibleSessions.length === 0 ? (
        <Box justifyContent="center" alignItems="center" height="100%">
          <Text dimColor>No sessions found</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleSessions.map((session, index) => {
            const isSelected = index === selectedIndex
            const statusColor = getStatusColor(session.status)
            const server = state.servers.get(session.serverId)
            
            return (
              <Box key={session.id} backgroundColor={isSelected ? 'blue' : undefined}>
                <Box width={3}>
                  <Text color={statusColor}>●</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text color={isSelected ? 'white' : undefined}>
                    {layout.truncateText(session.name, layout.dimensions.contentWidth - 20)}
                  </Text>
                </Box>
                <Box width={15}>
                  <Text dimColor>
                    {server?.name || session.serverId}
                  </Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
      
      {filteredSessions.length > maxItems && (
        <Box justifyContent="center" paddingTop={1}>
          <Text dimColor>... and {filteredSessions.length - maxItems} more</Text>
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Session View Component
// ---------------------------------------------------------------------------

function SessionView() {
  const { state, setView, sendMessage, abortSession } = useAppState()
  const { layout } = useLayout()
  const [messageInput, setMessageInput] = useState('')
  const [inputMode, setInputMode] = useState(false)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [autoScroll, setAutoScroll] = useState(true)
  
  const session = state.selectedSessionId 
    ? state.sessions.get(state.selectedSessionId)
    : undefined

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && session) {
      setScrollOffset(Math.max(0, session.messages.length - layout.maxMessageLines))
    }
  }, [session?.messages.length, autoScroll, layout.maxMessageLines])

  // Handle keyboard input
  useInput((input, key) => {
    if (state.currentView !== 'session') return

    if (key.escape) {
      if (inputMode) {
        setInputMode(false)
        setMessageInput('')
      } else {
        setView('list')
      }
    } else if (input === 'i' && !inputMode && session) {
      // Only allow input if session is active
      if (['idle', 'busy', 'waiting_for_permission'].includes(session.status)) {
        setInputMode(true)
      }
    } else if (input === 'a' && !inputMode && session) {
      // Abort session
      abortSession(session.id)
    } else if (key.return && inputMode && messageInput.trim()) {
      // Send message
      if (session) {
        sendMessage(session.id, messageInput.trim())
        setMessageInput('')
        setInputMode(false)
      }
    } else if (inputMode) {
      // Handle text input
      if (key.backspace) {
        setMessageInput(messageInput.slice(0, -1))
      } else if (key.ctrl && input === 'c') {
        // Cancel input with Ctrl+C
        setInputMode(false)
        setMessageInput('')
      } else if (input && input.length === 1) {
        setMessageInput(messageInput + input)
      }
    } else if (!inputMode) {
      // Handle scrolling when not in input mode
      if (key.upArrow || input === 'k') {
        setScrollOffset(Math.max(0, scrollOffset - 1))
        setAutoScroll(false)
      } else if (key.downArrow || input === 'j') {
        const maxScroll = Math.max(0, (session?.messages.length || 0) - layout.maxMessageLines)
        const newOffset = Math.min(maxScroll, scrollOffset + 1)
        setScrollOffset(newOffset)
        setAutoScroll(newOffset === maxScroll)
      } else if (key.pageUp) {
        setScrollOffset(Math.max(0, scrollOffset - layout.maxMessageLines))
        setAutoScroll(false)
      } else if (key.pageDown) {
        const maxScroll = Math.max(0, (session?.messages.length || 0) - layout.maxMessageLines)
        const newOffset = Math.min(maxScroll, scrollOffset + layout.maxMessageLines)
        setScrollOffset(newOffset)
        setAutoScroll(newOffset === maxScroll)
      } else if (input === 'g') {
        // Go to top
        setScrollOffset(0)
        setAutoScroll(false)
      } else if (input === 'G') {
        // Go to bottom
        const maxScroll = Math.max(0, (session?.messages.length || 0) - layout.maxMessageLines)
        setScrollOffset(maxScroll)
        setAutoScroll(true)
      }
    }
  })

  if (!session) {
    return (
      <Box justifyContent="center" alignItems="center" height={layout.dimensions.contentHeight}>
        <Text color="red">Session not found</Text>
      </Box>
    )
  }

  const server = state.servers.get(session.serverId)
  const maxMessageLines = Math.min(layout.maxMessageLines, layout.dimensions.contentHeight - 8)
  
  // Calculate visible messages based on scroll offset
  const startIndex = Math.max(0, scrollOffset)
  const endIndex = Math.min(session.messages.length, startIndex + maxMessageLines)
  const visibleMessages = session.messages.slice(startIndex, endIndex)
  
  // Check if there are pending permission requests
  const pendingPermissions = session.messages.filter(m => 
    m.type === 'permission_request' && 
    !session.messages.some(response => 
      response.type === 'system_message' && 
      response.content.includes(m.id)
    )
  )

  return (
    <Box flexDirection="column" height={layout.dimensions.contentHeight}>
      {/* Session Header */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold>{layout.truncateText(session.name, layout.dimensions.contentWidth - 30)}</Text>
        <Text dimColor> - {server?.name || session.serverId}</Text>
      </Box>
      
      {/* Session Info */}
      <Box paddingX={1} flexDirection="row" justifyContent="space-between">
        <Box flexDirection="column">
          <Text>
            Status: <Text color={getStatusColor(session.status)}>{session.status}</Text>
            {session.isLongRunning && <Text color="orange"> (long-running)</Text>}
          </Text>
          <Text dimColor>
            Created: {formatTimestamp(session.createdAt)}
          </Text>
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          {session.cost !== undefined && (
            <Text>
              Cost: <Text color="green">${session.cost.toFixed(3)}</Text>
            </Text>
          )}
          {session.tokens !== undefined && (
            <Text>
              Tokens: <Text color="yellow">{session.tokens.toLocaleString()}</Text>
            </Text>
          )}
        </Box>
      </Box>
      
      {/* Pending Permissions Alert */}
      {pendingPermissions.length > 0 && (
        <Box backgroundColor="yellow" paddingX={1}>
          <Text color="black" bold>
            ⚠ {pendingPermissions.length} permission request(s) pending
          </Text>
        </Box>
      )}
      
      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray">
        <Box paddingX={1} justifyContent="space-between">
          <Text bold>Messages ({session.messages.length})</Text>
          <Text dimColor>
            {session.messages.length > maxMessageLines && (
              `${startIndex + 1}-${endIndex} of ${session.messages.length}`
            )}
            {!autoScroll && ' [manual scroll]'}
          </Text>
        </Box>
        
        {session.messages.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <Text dimColor>No messages yet</Text>
          </Box>
        ) : (
          <Box flexDirection="column" paddingX={1} flexGrow={1}>
            {visibleMessages.map((message, index) => (
              <MessageItem 
                key={message.id} 
                message={message} 
                layout={layout}
                isLatest={startIndex + index === session.messages.length - 1}
              />
            ))}
            
            {/* Scroll indicators */}
            {startIndex > 0 && (
              <Box justifyContent="center">
                <Text dimColor>↑ {startIndex} more messages above ↑</Text>
              </Box>
            )}
            {endIndex < session.messages.length && (
              <Box justifyContent="center">
                <Text dimColor>↓ {session.messages.length - endIndex} more messages below ↓</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
      
      {/* Input Area */}
      {inputMode ? (
        <Box borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text color="yellow">Message: </Text>
          <Text>{messageInput}</Text>
          <Text color="yellow">█</Text>
        </Box>
      ) : (
        <Box paddingX={1} justifyContent="space-between">
          <Text dimColor>
            {['idle', 'busy', 'waiting_for_permission'].includes(session.status)
              ? 'Press "i" to send message, "a" to abort'
              : 'Session is not active'
            }
          </Text>
          <Text dimColor>
            ↑↓/jk: scroll | PgUp/PgDn: page | g/G: top/bottom
          </Text>
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Message Item Component
// ---------------------------------------------------------------------------

interface MessageItemProps {
  message: any
  layout: any
  isLatest: boolean
}

function MessageItem({ message, layout, isLatest }: MessageItemProps) {
  const timestamp = formatTimestamp(message.timestamp)
  const maxContentWidth = layout.dimensions.contentWidth - 20
  
  // Handle different message types
  const renderMessageContent = () => {
    switch (message.type) {
      case 'permission_request':
        return (
          <Box flexDirection="column">
            <Text color="red" bold>Permission Required:</Text>
            <Text>{layout.fitText(message.content, maxContentWidth)}</Text>
            {message.metadata?.toolName && (
              <Text dimColor>Tool: {message.metadata.toolName}</Text>
            )}
          </Box>
        )
      
      case 'tool_execution':
        return (
          <Box flexDirection="column">
            <Text color="yellow">
              Tool: {message.metadata?.toolName || 'unknown'}
            </Text>
            <Text>{layout.fitText(message.content, maxContentWidth)}</Text>
          </Box>
        )
      
      case 'error_message':
        return (
          <Box flexDirection="column">
            <Text color="red" bold>Error:</Text>
            <Text color="red">{layout.fitText(message.content, maxContentWidth)}</Text>
          </Box>
        )
      
      default:
        return (
          <Text>{layout.fitText(message.content, maxContentWidth)}</Text>
        )
    }
  }

  return (
    <Box marginBottom={1} flexDirection="column">
      <Box>
        <Box width={15}>
          <Text color={getMessageTypeColor(message.type)} bold>
            {message.type.replace('_', ' ')}:
          </Text>
        </Box>
        <Box width={12}>
          <Text dimColor>{timestamp}</Text>
        </Box>
        {isLatest && (
          <Text color="green">●</Text>
        )}
      </Box>
      <Box paddingLeft={2}>
        {renderMessageContent()}
      </Box>
      
      {/* Show cost/token info if available */}
      {(message.metadata?.cost || message.metadata?.tokens) && (
        <Box paddingLeft={2}>
          <Text dimColor>
            {message.metadata.cost && `Cost: $${message.metadata.cost.toFixed(3)} `}
            {message.metadata.tokens && `Tokens: ${message.metadata.tokens}`}
          </Text>
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Help View Component
// ---------------------------------------------------------------------------

function HelpView() {
  const { layout } = useLayout()
  
  const helpText = [
    'OpenCode Session Monitor - Help',
    '',
    'Navigation:',
    '  ↑/↓ - Navigate list items',
    '  Enter - Select/view item',
    '  Esc - Go back',
    '  q - Quit application',
    '',
    'List View:',
    '  g - Change grouping mode',
    '  s - Change sorting mode', 
    '  f - Toggle active filter',
    '  r - Refresh data',
    '',
    'Session View:',
    '  i - Enter input mode',
    '  a - Abort session',
    '  r - Refresh session',
    '',
    'Input Mode:',
    '  Type message and press Enter to send',
    '  Esc to cancel input',
    '',
    'Status Indicators:',
    '  ● Green - Idle',
    '  ● Blue - Busy', 
    '  ● Yellow - Waiting for permission',
    '  ● Gray - Completed',
    '  ● Red - Error/Aborted'
  ]

  return (
    <Box flexDirection="column" height={layout.dimensions.contentHeight}>
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold>Help</Text>
      </Box>
      
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        {helpText.map((line, index) => (
          <Text key={index} dimColor={line === ''}>{line || ' '}</Text>
        ))}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Main Content Component
// ---------------------------------------------------------------------------

function MainContent() {
  const { state, setView, toggleShowOnlyActive, clearError } = useAppState()
  
  // Global keyboard handlers
  useInput((input, key) => {
    if (input === 'q') {
      process.exit(0)
    } else if (input === 'h') {
      setView('help')
    } else if (input === 'f' && state.currentView === 'list') {
      toggleShowOnlyActive()
    } else if (input === 'r') {
      // Refresh logic would go here
    } else if (key.escape && state.error) {
      clearError()
    }
  })

  // Set up notification handlers
  useEffect(() => {
    const handleSessionUpdate = (session: any) => {
      notificationTrigger.handleSessionUpdate(session)
    }

    // This would be connected to the connection manager events
    // For now, it's just a placeholder
    
    return () => {
      // Cleanup
    }
  }, [])

  switch (state.currentView) {
    case 'session':
      return <SessionView />
    case 'help':
      return <HelpView />
    case 'list':
    default:
      return <SessionList />
  }
}

// ---------------------------------------------------------------------------
// App Component
// ---------------------------------------------------------------------------

function App() {
  const { exit } = useApp()
  
  // Handle process signals
  useEffect(() => {
    const handleSignal = () => {
      exit()
    }
    
    process.on('SIGINT', handleSignal)
    process.on('SIGTERM', handleSignal)
    
    return () => {
      process.off('SIGINT', handleSignal)
      process.off('SIGTERM', handleSignal)
    }
  }, [exit])

  return (
    <AppStateProvider>
      <LayoutProvider>
        <Box flexDirection="column" height="100%">
          <Header />
          <MainContent />
          <Footer />
        </Box>
      </LayoutProvider>
    </AppStateProvider>
  )
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function getStatusColor(status: string): string {
  switch (status) {
    case 'idle': return 'green'
    case 'busy': return 'blue'
    case 'waiting_for_permission': return 'yellow'
    case 'completed': return 'gray'
    case 'error':
    case 'aborted': return 'red'
    default: return 'white'
  }
}

function getMessageTypeColor(type: string): string {
  switch (type) {
    case 'user_input': return 'cyan'
    case 'assistant_response': return 'green'
    case 'tool_execution': return 'yellow'
    case 'permission_request': return 'red'
    case 'system_message': return 'blue'
    case 'error_message': return 'red'
    default: return 'white'
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - timestamp
  
  // If less than 1 minute ago, show seconds
  if (diffMs < 60000) {
    const seconds = Math.floor(diffMs / 1000)
    return `${seconds}s ago`
  }
  
  // If less than 1 hour ago, show minutes
  if (diffMs < 3600000) {
    const minutes = Math.floor(diffMs / 60000)
    return `${minutes}m ago`
  }
  
  // If today, show time
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  
  // Otherwise show date and time
  return date.toLocaleString([], { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export default function main() {
  // Check if stdin is a TTY for TUI mode
  if (!process.stdin.isTTY) {
    console.error('Error: stdin is not a TTY. Run in an interactive terminal.')
    process.exit(1)
  }

  render(<App />)
}

// Export components for use in index.tsx and testing
export { App, Header, Footer, SessionList, SessionView, HelpView }