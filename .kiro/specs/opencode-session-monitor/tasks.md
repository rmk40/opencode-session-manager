# Implementation Plan: OpenCode Session Monitor

## Overview

This implementation plan creates a TypeScript-based TUI application using React and Ink for monitoring OpenCode instances and their active sessions. The tasks are organized to build incrementally from core infrastructure through UI components to testing and debugging tools.

## Tasks

- [x] 1. Set up project structure and core dependencies
  - Initialize TypeScript Node.js project with proper configuration
  - Install React, Ink, and essential TUI dependencies
  - Set up build system with tsup for ESM output
  - Configure development environment with hot reload
  - _Requirements: 11.1, 11.3_

- [x] 1.1 Write property test for project configuration
  - **Property 16: Configuration and Runtime Mode Management**
  - **Validates: Requirements 11.1, 11.3**

- [x] 2. Implement core data models and types
  - Create TypeScript interfaces for Server, Session, Instance, and Message types
  - Define network protocol types (AnnouncePacket, ShutdownPacket, SSEEvent)
  - Implement UI state types and view models
  - Add utility types for error handling and configuration
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2.1 Write property test for data model validation
  - **Property 6: Parent-Child Session Relationship Tracking**
  - **Validates: Requirements 2.5**

- [x] 3. Create UDP discovery and network communication layer
  - Implement UDP listener for OpenCode instance announcements
  - Create packet parsing and validation logic
  - Add server URL normalization and validation
  - Implement connection testing and health checks
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 3.1 Write property test for UDP packet processing
  - **Property 1: Instance Discovery and Lifecycle Management**
  - **Validates: Requirements 1.1, 1.2, 1.4**

- [x] 3.2 Write property test for network protocol compliance
  - **Property 14: Network Communication Protocol Compliance**
  - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 4. Implement HTTP client and OpenCode API integration
  - Create HTTP client pool for OpenCode server connections
  - Implement session status endpoint integration
  - Add session details and statistics fetching
  - Create session management operations (abort, send message)
  - _Requirements: 2.1, 4.1, 4.4_

- [x] 4.1 Write property test for session management operations
  - **Property 8: Session Management Operations**
  - **Validates: Requirements 4.1, 4.2, 4.4**

- [x] 5. Build SSE connection manager for real-time updates
  - Implement Server-Sent Events connection handling
  - Create event parsing and routing logic
  - Add automatic reconnection with exponential backoff
  - Handle session state changes and permission requests
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 9.4, 9.5_

- [x] 5.1 Write property test for SSE connection and message processing
  - **Property 7: SSE Connection and Message Processing**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 6. Create connection manager with server lifecycle management
  - Implement server discovery, registration, and removal
  - Add stale server detection and cleanup
  - Create session fetching and synchronization
  - Handle connection failures and recovery
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.4_

- [x] 6.1 Write property test for stale instance detection
  - **Property 2: Stale Instance Detection**
  - **Validates: Requirements 1.3**

- [x] 6.2 Write property test for performance and resource management
  - **Property 15: Performance and Resource Management**
  - **Validates: Requirements 10.1, 10.2, 10.4, 10.5**

- [x] 7. Implement state management with React Context
  - Create app state context with servers and sessions
  - Add UI state management for navigation and views
  - Implement state update actions and reducers
  - Create custom hooks for state access and helpers
  - _Requirements: 2.2, 2.4, 5.2, 5.3_

- [x] 7.1 Write property test for session state transition handling
  - **Property 4: Session State Transition Handling**
  - **Validates: Requirements 2.2, 2.4**

- [x] 7.2 Write property test for view mode and navigation state management
  - **Property 10: View Mode and Navigation State Management**
  - **Validates: Requirements 5.2, 5.3, 7.3, 7.4**

- [x] 8. Build responsive layout system
  - Create layout manager for terminal size adaptation
  - Implement responsive breakpoints and layout calculations
  - Add dynamic component sizing and positioning
  - Handle terminal resize events gracefully
  - _Requirements: 7.1, 8.1, 8.5_

- [x] 8.1 Write property test for responsive layout adaptation
  - **Property 13: Responsive Layout Adaptation**
  - **Validates: Requirements 7.1, 8.1, 8.5**

- [x] 9. Create session grouping and organization logic
  - Implement project:branch grouping algorithm
  - Add group statistics calculation (counts, costs, tokens)
  - Create sorting logic for groups and sessions
  - Handle group expansion/collapse state
  - _Requirements: 5.1, 5.4, 5.5_

- [x] 9.1 Write property test for instance grouping and organization
  - **Property 9: Instance Grouping and Organization**
  - **Validates: Requirements 5.1, 5.4**

- [x] 9.2 Write property test for sorting and ordering consistency
  - **Property 11: Sorting and Ordering Consistency**
  - **Validates: Requirements 5.5**

- [x] 10. Implement desktop notification system
  - Create platform-specific notification handlers (macOS, Linux)
  - Add notification triggering logic for session completion and permissions
  - Implement notification filtering and configuration
  - Handle notification preferences and environment variables
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10.1 Write property test for notification triggering logic
  - **Property 12: Notification Triggering Logic**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 11. Build main application component and layout
  - Create full-screen app component with Ink
  - Implement header, footer, and main content areas
  - Add keyboard input handling and navigation
  - Create view switching and state management
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.2_

- [x] 12. Create session list views (grouped and flat)
  - Implement grouped view with collapsible groups
  - Create flat view with simple session listing
  - Add visual indicators for session states (idle, busy, long-running)
  - Implement selection highlighting and navigation
  - _Requirements: 5.1, 5.2, 2.3, 7.3_

- [x] 12.1 Write property test for long-running session detection
  - **Property 5: Long-Running Session Detection**
  - **Validates: Requirements 2.3**

- [x] 13. Implement session viewer component
  - Create full-screen session viewing interface
  - Add message streaming and real-time updates
  - Implement scrolling and message history navigation
  - Handle tool execution display and permission requests
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 14. Add session interaction capabilities
  - Implement message input mode and sending
  - Create session abort/interrupt functionality
  - Add permission approval/denial handling
  - Handle session switching and navigation
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 15. Create testing and debugging infrastructure
  - Implement mock OpenCode simulator for testing
  - Add debug logging and packet inspection tools
  - Create headless mode for automated testing
  - Build test scenario automation framework
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 15.1 Write property test for testing infrastructure correctness
  - **Property 17: Testing Infrastructure Correctness**
  - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**

- [x] 16. Implement command-line interface and runtime modes
  - Create CLI argument parsing and validation
  - Add daemon mode for background notifications
  - Implement debug modes and status checking
  - Handle different runtime configurations
  - _Requirements: 11.2, 11.3, 12.2_

- [x] 17. Add error handling and recovery systems
  - Implement comprehensive error handling throughout the application
  - Add user-friendly error messages and recovery options
  - Create error logging and debugging support
  - Handle edge cases and graceful degradation
  - _Requirements: 9.5, 10.4_

- [x] 18. Create comprehensive test suite
  - Write unit tests for core business logic
  - Add integration tests for network communication
  - Create end-to-end test scenarios
  - Implement performance and stress testing
  - _Requirements: All requirements validation_

- [x] 18.1 Write property test for active session retrieval
  - **Property 3: Active Session Retrieval**
  - **Validates: Requirements 2.1**

- [x] 19. Final integration and polish
  - Integrate all components into cohesive application
  - Add final UI polish and animations
  - Optimize performance and memory usage
  - Create comprehensive documentation
  - _Requirements: 8.2, 8.3, 10.3_

- [x] 20. Checkpoint - Ensure all tests pass and system works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation builds incrementally with early validation at each step