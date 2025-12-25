# Requirements Document

## Introduction

A Terminal User Interface (TUI) application for monitoring and managing multiple OpenCode instances and their associated sessions. The system provides real-time visibility into session states, allows connection to specific sessions for detailed monitoring, and enables management operations across multiple OpenCode instances running locally or in containers.

## Glossary

- **OpenCode_Instance**: A running OpenCode server process that can host multiple sessions
- **Session**: An individual conversation or task execution context within an OpenCode instance (only active/loaded sessions are monitored)
- **Active_Session**: A session that is currently loaded in an OpenCode instance, as returned by the status endpoint
- **Parent_Session**: A primary session that can spawn child sessions
- **Child_Session**: A session created by a parent session for specific tasks or tool executions
- **TUI**: Terminal User Interface - the text-based interface for monitoring and management
- **Session_Manager**: The main application that monitors and manages OpenCode instances
- **UDP_Announcer**: Component that broadcasts instance status via UDP packets
- **SSE_Stream**: Server-Sent Events stream for real-time session updates
- **Session_Viewer**: Component that displays live session messages and interactions

## Requirements

### Requirement 1: Instance Discovery and Monitoring

**User Story:** As a developer, I want to automatically discover OpenCode instances, so that I can monitor all running instances without manual configuration.

#### Acceptance Criteria

1. WHEN an OpenCode instance starts and broadcasts its presence, THE Session_Manager SHALL detect and register the instance
2. WHEN an instance broadcasts status updates via UDP, THE Session_Manager SHALL update the instance information in real-time
3. WHEN an instance stops broadcasting for more than 3 minutes, THE Session_Manager SHALL mark it as stale
4. WHEN an instance sends a shutdown notification, THE Session_Manager SHALL immediately remove it from monitoring
5. THE Session_Manager SHALL display instance status as idle, busy, or stale with appropriate visual indicators

### Requirement 2: Active Session State Tracking

**User Story:** As a developer, I want to see the current state of active sessions across instances, so that I can understand what work is being performed.

#### Acceptance Criteria

1. WHEN querying session status, THE Session_Manager SHALL retrieve only currently loaded/active sessions from the OpenCode status endpoint
2. WHEN an active session transitions from busy to idle, THE Session_Manager SHALL update the status and send a desktop notification
3. WHEN an active session has been busy for more than 10 minutes, THE Session_Manager SHALL highlight it as long-running with warning indicator
4. WHEN active session metadata changes, THE Session_Manager SHALL update the display with new title, cost, and token information
5. THE Session_Manager SHALL track and display parent-child relationships between active sessions

### Requirement 3: Real-time Active Session Monitoring

**User Story:** As a developer, I want to connect to a specific active session and see its live output, so that I can monitor detailed progress and interactions.

#### Acceptance Criteria

1. WHEN a user selects an active session and presses Enter, THE Session_Viewer SHALL establish an SSE connection to that session
2. WHEN new messages arrive via SSE for the active session, THE Session_Viewer SHALL display them in real-time with proper formatting
3. WHEN tool executions occur in the active session, THE Session_Viewer SHALL show tool status, input parameters, and output results
4. WHEN permission requests are pending for the active session, THE Session_Viewer SHALL highlight them and allow user response
5. THE Session_Viewer SHALL support scrolling through message history with keyboard navigation

### Requirement 4: Active Session Management Operations

**User Story:** As a developer, I want to perform all session operations from the TUI, so that I can fully control sessions without switching to the OpenCode interface.

#### Acceptance Criteria

1. WHEN a user selects a busy active session and presses 'a', THE Session_Manager SHALL send an abort/interrupt request to stop current execution
2. WHEN a permission request is displayed for an active session, THE Session_Viewer SHALL allow approval or denial with 'a' and 'd' keys
3. WHEN a user presses 'm' in session view, THE Session_Viewer SHALL provide input mode to send new messages to the active session
4. WHEN a user sends a message via the Session_Viewer, THE Session_Manager SHALL submit it to the OpenCode session and display the response
5. THE Session_Viewer SHALL support all interactive operations available in the native OpenCode TUI (message sending, interruption, permission handling)

### Requirement 5: Organizational Display Modes

**User Story:** As a developer, I want to organize active sessions by project and branch, so that I can easily find relevant work contexts.

#### Acceptance Criteria

1. THE Session_Manager SHALL group instances by project:branch combination in grouped view mode
2. WHEN a user presses Tab, THE Session_Manager SHALL toggle between grouped and flat view modes
3. WHEN a user selects a group header and presses Enter, THE Session_Manager SHALL expand or collapse that group
4. THE Session_Manager SHALL display group statistics including idle/busy counts and total costs for active sessions
5. THE Session_Manager SHALL sort groups alphabetically and active sessions within groups by creation time

### Requirement 6: Desktop Integration

**User Story:** As a developer, I want to receive notifications when user intervention is needed, so that I can respond promptly to sessions requiring attention.

#### Acceptance Criteria

1. WHEN an active session transitions from busy to idle, THE Session_Manager SHALL send a desktop notification indicating work completion and user attention needed
2. WHEN an active session has a pending permission request, THE Session_Manager SHALL send a notification indicating user approval is required
3. THE Session_Manager SHALL NOT send notifications for sessions starting work or other status changes that don't require user intervention
4. THE Session_Manager SHALL support disabling notifications via environment variable
5. THE Session_Manager SHALL use platform-appropriate notification systems (macOS, Linux) with clear action-required messaging

### Requirement 7: Terminal Interface Navigation

**User Story:** As a developer, I want an intuitive and beautiful full-screen interface, so that I can efficiently operate the system with excellent user experience.

#### Acceptance Criteria

1. THE Session_Manager SHALL utilize the full terminal window size and adjust dynamically to terminal resize events
2. THE Session_Manager SHALL provide a polished, intuitive interface with efficient use of screen real estate
3. WHEN a user presses arrow keys or j/k, THE Session_Manager SHALL navigate between selectable items with visual feedback
4. WHEN a user presses Enter on a session, THE Session_Manager SHALL open the session viewer in full-screen mode
5. THE Session_Manager SHALL display context-sensitive help, status information, and keyboard shortcuts in an organized layout

### Requirement 8: Responsive Layout and Visual Design

**User Story:** As a developer, I want a beautiful and responsive interface, so that the tool is pleasant to use and adapts to different terminal sizes.

#### Acceptance Criteria

1. THE Session_Manager SHALL automatically adjust layout based on terminal width (split-pane for wide terminals, single-pane for narrow)
2. THE Session_Manager SHALL use consistent color schemes, borders, and visual hierarchy throughout the interface
3. THE Session_Manager SHALL provide smooth animations for busy sessions and state transitions
4. THE Session_Manager SHALL optimize rendering performance to maintain responsiveness during updates
5. THE Session_Manager SHALL gracefully handle very small terminal sizes with appropriate layout adjustments

### Requirement 9: Network Communication

**User Story:** As a system administrator, I want the TUI to communicate with OpenCode instances over standard protocols, so that it works across different deployment scenarios.

#### Acceptance Criteria

1. THE UDP_Announcer SHALL listen on configurable port (default 19876) for instance announcements
2. WHEN receiving announce packets, THE Session_Manager SHALL extract server URL, project, branch, and instance ID
3. THE Session_Manager SHALL establish HTTP connections to OpenCode servers for API access
4. THE Session_Manager SHALL use Server-Sent Events for real-time session updates
5. THE Session_Manager SHALL handle network failures gracefully with automatic reconnection

### Requirement 10: Performance and Resource Management

**User Story:** As a developer, I want the TUI to be responsive and efficient, so that it doesn't impact system performance while monitoring.

#### Acceptance Criteria

1. THE Session_Manager SHALL update display at most once per second to maintain responsiveness
2. THE Session_Manager SHALL limit message history to prevent excessive memory usage
3. THE Session_Manager SHALL use efficient data structures for session lookup and updates
4. THE Session_Manager SHALL clean up stale connections and data automatically
5. THE Session_Manager SHALL render only visible content to optimize terminal output

### Requirement 11: Configuration and Deployment

**User Story:** As a developer, I want to configure the TUI for different environments, so that it works with various OpenCode deployment patterns.

#### Acceptance Criteria

1. THE Session_Manager SHALL read configuration from environment variables for ports and timeouts
2. THE Session_Manager SHALL support running as a background daemon for notification-only mode
3. THE Session_Manager SHALL provide command-line options for debug modes and status checking
4. THE Session_Manager SHALL work with OpenCode instances running in Docker containers
5. THE Session_Manager SHALL handle multiple network interfaces and IP addresses correctly

### Requirement 12: Testing and Debugging Infrastructure

**User Story:** As a developer, I want comprehensive testing and debugging capabilities, so that I can validate the system end-to-end without manual intervention.

#### Acceptance Criteria

1. THE Session_Manager SHALL provide a mock/simulation mode that generates fake OpenCode instances and sessions for testing
2. WHEN running in debug mode, THE Session_Manager SHALL log all UDP packets, SSE events, and API calls with timestamps
3. THE Session_Manager SHALL include a headless mode for automated testing without TUI rendering
4. THE Session_Manager SHALL provide tools to simulate session state changes, permission requests, and message flows
5. THE Session_Manager SHALL support automated test scenarios that validate notification delivery, session interaction, and error handling