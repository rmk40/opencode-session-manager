# OpenCode Session Monitor

A beautiful Terminal User Interface (TUI) for monitoring and managing OpenCode instances and their active sessions. Built with React and Ink, providing real-time visibility into session states, live session output, and comprehensive management operations.

## Features

- **Automatic Discovery**: Finds OpenCode instances via UDP announcements
- **Real-time Monitoring**: Live session status updates and notifications
- **Session Management**: Abort sessions, send messages, handle permissions
- **Live Session Viewer**: Stream session output with tool execution details
- **Smart Organization**: Group sessions by project and branch
- **Desktop Notifications**: Get notified when sessions need attention
- **Multiple Runtime Modes**: TUI, daemon, debug, test, and mock modes
- **Responsive Design**: Adapts to different terminal sizes

## Quick Start

```bash
# 1. Install the monitor
npm install
npm run build

# 2. Install the OpenCode plugin (REQUIRED)
npm run install-plugin

# 3. Configure plugin for your network (if needed)
export OPENCODE_MONITOR_HOST=192.168.1.50  # Your desktop IP

# 4. Start monitoring
npm start
```

## Plugin Installation

**⚠️ Critical**: The monitor requires a plugin to be installed in each OpenCode instance.

### Plugin Location
The plugin is included at: `opencode/plugin/opencode-session-monitor.js`

### Quick Install
```bash
# Install the plugin (copy to ~/.config/opencode/plugin/)
npm run install-plugin

# Or use symlink for development (auto-updates when you rebuild)
npm run link-plugin

# Uninstall the plugin
npm run uninstall-plugin
```

### Configure the Plugin

The plugin needs to know where to send announcements:

```bash
# Single host (default: localhost)
export OPENCODE_MONITOR_HOST=127.0.0.1

# Multiple hosts (comma-separated)
export OPENCODE_MONITOR_HOST=192.168.1.50,10.0.0.5

# Custom UDP port (default: 41234)
export OPENCODE_MONITOR_PORT=41234

# Enable plugin debug logging
export OPENCODE_MONITOR_DEBUG=1
```

**For Docker/Container Deployments:**
If running OpenCode in containers, set `OPENCODE_MONITOR_HOST` to your desktop's IP address so the plugin can reach the monitor.

## Usage

### Basic TUI Mode

Start the interactive terminal interface:

```bash
opencode-session-monitor
# or
opencode-session-monitor tui
```

**Navigation:**
- `↑/↓` or `j/k` - Navigate between sessions
- `Enter` - View session details and live output
- `Tab` - Toggle between grouped and flat view
- `a` - Abort selected session
- `m` - Send message to session (in session view)
- `q` - Quit application

### Daemon Mode

Run in background with desktop notifications:

```bash
# Foreground daemon
opencode-session-monitor daemon

# Background daemon
opencode-session-monitor daemon --daemonize

# Check daemon status
opencode-session-monitor status
```

### Debug Mode

Enhanced logging and packet inspection:

```bash
# Debug mode with verbose logging
opencode-session-monitor debug --trace

# Custom log file
opencode-session-monitor debug --log-file ./debug.log
```

### Testing and Development

```bash
# Run automated test scenarios
opencode-session-monitor test

# Start mock OpenCode servers
opencode-session-monitor mock --mock-servers 3

# Run specific test scenarios
opencode-session-monitor test --test-scenarios server_discovery,session_management
```

## Command Line Options

```
USAGE:
  opencode-session-monitor [MODE] [OPTIONS]

MODES:
  tui         Start the terminal user interface (default)
  daemon      Run in background daemon mode with notifications
  debug       Start in debug mode with verbose logging
  test        Run automated test scenarios
  mock        Start mock OpenCode servers for testing
  status      Show current status and exit

OPTIONS:
  -m, --mode <mode>           Set runtime mode
  -p, --port <port>           UDP port for server discovery (default: 41234)
  -d, --debug                 Enable debug logging
  -t, --trace                 Enable trace logging (very verbose)
  -l, --log-file <file>       Log file path (default: logs/opencode-monitor.log)
      --pid-file <file>       PID file for daemon mode
      --daemonize             Run as background daemon
      --mock-servers <count>  Number of mock servers to create
      --test-scenarios <list> Comma-separated test scenarios
  -h, --help                  Show help message
  -v, --version               Show version information
```

## Configuration

Configure via environment variables:

```bash
# Monitor Configuration
export OPENCODE_MONITOR_PORT=41234
export OPENCODE_MONITOR_LOG_FILE=./logs/monitor.log
export OPENCODE_MONITOR_PID_FILE=./opencode-monitor.pid
export OPENCODE_MONITOR_DEBUG=true
export OPENCODE_MONITOR_NOTIFICATIONS=false

# Plugin Configuration (set in OpenCode instances)
export OPENCODE_MONITOR_HOST=192.168.1.50
export OPENCODE_MONITOR_DEBUG=1
```

## How It Works

1. **Plugin Installation**: Install the OpenCode plugin to enable UDP announcements
2. **Discovery**: Monitor listens for UDP announcements from OpenCode instances
3. **Connection**: Establishes HTTP connections to discovered servers
4. **Monitoring**: Polls session status and subscribes to real-time events
5. **Display**: Shows organized view of active sessions with live updates
6. **Interaction**: Provides full session management capabilities

### Plugin Configuration

The OpenCode plugin supports these environment variables:

```bash
# IP address(es) of machine(s) running the monitor (comma-separated)
export OPENCODE_MONITOR_HOST=192.168.1.50,10.0.0.5

# UDP port for announcements (default: 41234)
export OPENCODE_MONITOR_PORT=41234

# Enable plugin debug logging
export OPENCODE_MONITOR_DEBUG=1
```

### Session States

- **Idle**: Session is loaded but not actively processing
- **Busy**: Session is executing tasks or waiting for user input
- **Pending**: Session has permission requests awaiting approval
- **Stale**: Instance hasn't been seen for more than 3 minutes

### Notifications

Desktop notifications are sent for:
- Session completion (busy → idle transition)
- Permission requests requiring user approval
- Long-running sessions (>10 minutes)

## Development

### Project Structure

```
opencode-session-monitor/
├── src/                     # TUI application source code
├── opencode/               
│   └── plugin/
│       └── opencode-session-monitor.js  # OpenCode plugin (INSTALL THIS)
├── package.json            # Includes plugin installation scripts
├── README.md              # This file
├── INSTALL.md             # Detailed installation guide
└── dist/                  # Built application (after npm run build)
```

**Key Files:**
- `opencode/plugin/opencode-session-monitor.js` - Plugin for OpenCode instances
- `src/` - Monitor TUI source code  
- `dist/opencode-session-monitor.mjs` - Built executable

### Testing

The project includes comprehensive testing with both unit tests and property-based tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

**Test Coverage:**
- 105 total tests across 11 test files
- 17 property-based tests validating system invariants
- Mock server infrastructure for integration testing
- Automated test scenarios for end-to-end validation

### Building

```bash
# Development build with watch
npm run dev

# Production build
npm run build

# Start built application
npm start
```

## Requirements

- Node.js 18+ 
- Terminal with color support
- OpenCode instances with UDP announcement plugin

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Troubleshooting

### Common Issues

**No servers discovered:**
- Ensure OpenCode instances have the session monitor plugin installed
- Check that `OPENCODE_MONITOR_HOST` is set correctly in OpenCode instances
- Verify firewall settings for UDP port 41234
- Verify network connectivity between instances and monitor

**Connection failures:**
- Check that OpenCode HTTP APIs are accessible
- Verify announced server URLs include correct ports
- Review debug logs with `--debug` flag

**Performance issues:**
- Reduce update frequency in configuration
- Limit number of monitored sessions
- Check terminal size and rendering performance

### Debug Mode

Enable comprehensive logging:

```bash
opencode-session-monitor debug --trace --log-file debug.log
```

This provides detailed information about:
- UDP packet inspection
- HTTP API calls and responses
- SSE event processing
- State transitions and updates
- Performance metrics

For more help, see [INSTALL.md](INSTALL.md) for detailed installation instructions.