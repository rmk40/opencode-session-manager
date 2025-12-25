# Changelog

All notable changes to the OpenCode Session Monitor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-25

### Added

#### Core Features
- **Terminal User Interface (TUI)**: Full-screen React/Ink-based interface for monitoring OpenCode sessions
- **OpenCode Plugin**: Custom plugin for UDP announcements and server discovery
- **Automatic Instance Discovery**: UDP-based discovery of OpenCode instances with real-time announcements
- **Session Management**: Complete session lifecycle management including abort, message sending, and permission handling
- **Live Session Viewer**: Real-time streaming of session output with tool execution details
- **Smart Organization**: Group sessions by project and branch with collapsible groups
- **Desktop Notifications**: Native desktop notifications for session completion and permission requests

#### Runtime Modes
- **TUI Mode**: Interactive terminal interface (default)
- **Daemon Mode**: Background monitoring with notifications
- **Debug Mode**: Enhanced logging and packet inspection
- **Test Mode**: Automated test scenarios and validation
- **Mock Mode**: Fake OpenCode servers for testing and development
- **Status Mode**: Quick status check and system information

#### User Interface
- **Responsive Layout**: Adapts to different terminal sizes with split-pane and single-pane modes
- **Keyboard Navigation**: Intuitive navigation with arrow keys, vim-style keys (j/k), and shortcuts
- **Visual Indicators**: Color-coded status indicators, progress animations, and long-running session warnings
- **Context-Sensitive Help**: Built-in help system with keyboard shortcuts and usage information

#### Network Communication
- **UDP Discovery Protocol**: Robust server discovery with announce and shutdown packet handling
- **HTTP API Integration**: Full OpenCode API support for session management and data retrieval
- **Server-Sent Events (SSE)**: Real-time event streaming for live session updates
- **Connection Resilience**: Automatic reconnection with exponential backoff and circuit breaker patterns

#### Configuration and Deployment
- **Environment Variables**: Comprehensive configuration via environment variables
- **Command-Line Interface**: Rich CLI with multiple options and runtime modes
- **Logging System**: Structured logging with configurable levels and file output
- **PID File Management**: Daemon mode with proper process management

#### Testing Infrastructure
- **Comprehensive Test Suite**: 105 tests across 11 test files with 100% pass rate
- **Property-Based Testing**: 17 property-based tests validating universal system behaviors
- **Mock Server System**: Realistic OpenCode server simulation for testing
- **Automated Test Scenarios**: End-to-end validation of discovery, session management, and UI behavior
- **Debug and Monitoring Tools**: Packet inspection, performance profiling, and state visualization

#### Performance and Reliability
- **Efficient State Management**: Optimized React state management with minimal re-renders
- **Resource Management**: Bounded message history, connection pooling, and memory cleanup
- **Update Throttling**: Configurable update intervals to balance responsiveness and performance
- **Error Handling**: Comprehensive error handling with graceful degradation

### Technical Implementation

#### Architecture
- **Component-Based Design**: Modular React components with clear separation of concerns
- **Event-Driven Architecture**: Pub/sub pattern for loose coupling between components
- **Layered Architecture**: Presentation, application, infrastructure, and domain layers
- **Type-Safe Implementation**: Full TypeScript coverage with comprehensive type definitions

#### Dependencies
- **React 19.2.3**: Modern React with hooks and concurrent features
- **Ink 6.6.0**: Terminal UI framework for React components
- **TypeScript 5.0**: Type-safe development with modern language features
- **Vitest 4.0.16**: Fast unit testing with coverage reporting
- **Fast-Check 3.15.0**: Property-based testing framework

#### Build System
- **tsup**: Fast TypeScript bundler for ESM output
- **tsx**: TypeScript execution for development
- **ESM Modules**: Modern module system with tree-shaking support

### Documentation
- **README.md**: Comprehensive project overview with plugin installation guide
- **INSTALL.md**: Detailed installation guide with plugin setup instructions
- **CHANGELOG.md**: Version history and release notes
- **OpenCode Plugin**: Custom plugin with automatic installation scripts
- **Requirements Document**: Formal specification with acceptance criteria
- **Design Document**: Technical architecture and implementation details

### Known Issues
- Desktop notifications may not work in WSL environments
- Very small terminal sizes (< 80x24) may have layout issues
- Some terminal emulators may not support all color features

### Breaking Changes
- None (initial release)

### Migration Guide
- None (initial release)

---

## [Unreleased]

### Planned Features
- **Session History**: Persistent session history and search
- **Custom Themes**: User-configurable color schemes and layouts
- **Plugin System**: Extensible architecture for custom functionality
- **Remote Monitoring**: Monitor OpenCode instances across network
- **Performance Metrics**: Detailed performance analytics and reporting
- **Configuration UI**: Interactive configuration management
- **Session Templates**: Predefined session configurations and workflows

### Planned Improvements
- **Enhanced Notifications**: Rich notifications with action buttons
- **Better Error Recovery**: More robust error handling and recovery mechanisms
- **Improved Performance**: Further optimization of rendering and state management
- **Extended Platform Support**: Better Windows support and additional terminal compatibility
- **Advanced Filtering**: Session filtering and search capabilities
- **Export Functionality**: Export session data and reports

---

## Version History

### Version Numbering
This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR**: Incompatible API changes
- **MINOR**: New functionality in a backwards compatible manner
- **PATCH**: Backwards compatible bug fixes

### Release Schedule
- **Major releases**: Quarterly (when significant new features are added)
- **Minor releases**: Monthly (for new features and improvements)
- **Patch releases**: As needed (for bug fixes and small improvements)

### Support Policy
- **Current version**: Full support with new features and bug fixes
- **Previous minor version**: Bug fixes and security updates only
- **Older versions**: Security updates only (for 6 months after release)

---

## Contributing

### Changelog Guidelines
When contributing, please:
1. Add entries to the `[Unreleased]` section
2. Use the established format and categories
3. Include issue/PR references where applicable
4. Follow the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format

### Categories
- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements

### Example Entry Format
```markdown
### Added
- New session filtering feature with regex support (#123)
- Export session data to JSON and CSV formats (#124)

### Fixed
- Fixed memory leak in SSE connection handling (#125)
- Resolved terminal resize issues on Windows (#126)
```