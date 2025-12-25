# Installation Guide

This guide provides detailed instructions for installing and setting up the OpenCode Session Monitor.

## Prerequisites

### System Requirements

- **Node.js**: Version 18.0 or higher
- **npm**: Version 8.0 or higher (comes with Node.js)
- **Terminal**: Color-capable terminal emulator
- **Operating System**: macOS, Linux, or Windows with WSL

### OpenCode Requirements

- OpenCode instances with the session monitor plugin installed
- Network connectivity between monitor and OpenCode instances
- OpenCode HTTP API access (typically port 4096+ range)

## OpenCode Plugin Installation

**Critical Requirement**: The OpenCode Session Monitor requires a plugin to be installed in each OpenCode instance for automatic discovery to work.

### Plugin Location

The plugin is included with this project at:
```
opencode/plugin/opencode-session-monitor.js
```

### Installation Methods

#### Method 1: Automatic Installation (Recommended)

```bash
# After installing the monitor, install the plugin
npm run install-plugin
```

This copies the plugin to `~/.config/opencode/plugin/opencode-session-monitor.js`

#### Method 2: Development Installation (Auto-updates)

```bash
# Create a symlink that updates when you rebuild
npm run link-plugin
```

This creates a symlink so the plugin automatically updates when you modify it.

#### Method 3: Manual Installation

```bash
# Create the plugin directory
mkdir -p ~/.config/opencode/plugin

# Copy the plugin file
cp opencode/plugin/opencode-session-monitor.js ~/.config/opencode/plugin/
```

#### Method 4: Container/Remote Installation

For OpenCode running in containers or remote machines:

```bash
# Copy to remote machine
scp opencode/plugin/opencode-session-monitor.js user@remote:~/.config/opencode/plugin/

# Or mount as volume in Docker
docker run -v $(pwd)/opencode/plugin:/root/.config/opencode/plugin opencode:latest
```

### Plugin Configuration

The plugin must be configured to know where to send announcements:

```bash
# Set in OpenCode instance environment
export OPENCODE_MONITOR_HOST=192.168.1.50  # IP of machine running the monitor
export OPENCODE_MONITOR_PORT=41234          # UDP port (default: 41234)
export OPENCODE_MONITOR_DEBUG=1             # Enable debug logging
```

### Verification

To verify the plugin is working:

1. Start an OpenCode instance with the plugin installed
2. Check OpenCode logs for plugin startup messages:
   ```
   [opencode-session-monitor] Starting for project-name (PID: 12345)
   [opencode-session-monitor] Announcing to: 192.168.1.50:41234
   [opencode-session-monitor] Discovered server URL: http://127.0.0.1:4096
   ```
3. Start the monitor and check if the instance appears

### Uninstallation

```bash
# Remove the plugin
npm run uninstall-plugin

# Or manually
rm ~/.config/opencode/plugin/opencode-session-monitor.js
```

## How the Plugin Works

### Architecture Overview

```
┌─────────────────────┐         UDP          ┌─────────────────────┐
│  OpenCode Instance  │  ──────────────────► │   Monitor TUI       │
│                     │    port 41234        │                     │
│  Plugin broadcasts: │                      │  Receives & displays│
│  - Server URL       │   Every 2 seconds    │  - Server list      │
│  - Server name      │   + on startup       │  - Session status   │
│  - Instance ID      │   + on shutdown      │  - Live updates     │
└─────────────────────┘                      └─────────────────────┘
```

### Plugin Functionality

The plugin (`opencode-session-monitor.js`) performs these functions:

1. **Port Discovery**: Uses `lsof` to find the actual HTTP port OpenCode is listening on
2. **UDP Announcements**: Broadcasts server information every 2 seconds
3. **Shutdown Notifications**: Sends cleanup message when OpenCode exits
4. **Error Handling**: Gracefully handles network failures and retries

### Packet Format

The plugin sends JSON packets over UDP:

**Announce Packet:**
```json
{
  "type": "announce",
  "serverId": "hostname-12345",
  "serverUrl": "http://127.0.0.1:4096",
  "serverName": "my-project",
  "version": "1.0.0",
  "timestamp": 1640995200000
}
```

**Shutdown Packet:**
```json
{
  "type": "shutdown",
  "serverId": "hostname-12345",
  "timestamp": 1640995200000
}
```

### Network Requirements

- **UDP Port 41234**: Must be open for announcements
- **HTTP Access**: Monitor needs HTTP access to OpenCode API
- **Network Connectivity**: Plugin and monitor must be on same network or routable

## Monitor Installation

### Method 1: NPM Package (Recommended)

```bash
# Install globally
npm install -g opencode-session-monitor

# Run from anywhere
opencode-session-monitor
```

### Method 2: From Source

```bash
# Clone the repository
git clone https://github.com/opencode/session-monitor.git
cd session-monitor

# Install dependencies
npm install

# Build the application
npm run build

# Run the application
npm start

# Or install globally from source
npm install -g .
```

### Method 3: Development Setup

```bash
# Clone and setup for development
git clone https://github.com/opencode/session-monitor.git
cd session-monitor

# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Monitor Configuration
OPENCODE_MONITOR_PORT=41234
OPENCODE_MONITOR_LOG_FILE=./logs/opencode-monitor.log
OPENCODE_MONITOR_DEBUG=false
OPENCODE_MONITOR_PID_FILE=./opencode-monitor.pid
OPENCODE_MONITOR_NOTIFICATIONS=true
OPENCODE_MONITOR_UPDATE_INTERVAL=1000
OPENCODE_MONITOR_MAX_MESSAGE_HISTORY=1000

# Plugin Configuration (for OpenCode instances)
OPENCODE_MONITOR_HOST=127.0.0.1
OPENCODE_MONITOR_DEBUG=0
```

### Directory Structure

The application will create the following directories:

```
./
├── logs/                    # Log files
│   └── opencode-monitor.log
├── opencode-monitor.pid     # PID file (daemon mode)
└── test-report.json         # Test results (test mode)
```

## Network Configuration

### Firewall Settings

Ensure the following ports are accessible:

```bash
# UDP port for server discovery (configurable)
sudo ufw allow 41234/udp

# Or for specific interface
sudo ufw allow in on eth0 to any port 41234 proto udp
```

### Docker/Container Environments

If running OpenCode in containers, ensure:

1. **Network Bridge**: Container and host can communicate
2. **Port Mapping**: OpenCode HTTP ports are accessible
3. **UDP Broadcast**: Container can send UDP announcements

Example Docker Compose configuration:

```yaml
version: '3.8'
services:
  opencode:
    image: opencode:latest
    network_mode: "host"  # For UDP broadcast
    # OR
    ports:
      - "9000-9010:9000-9010"  # HTTP API ports
      - "41234:41234/udp"      # UDP announcement port
```

## Verification

### Test Installation

```bash
# Check version
opencode-session-monitor --version

# Test basic functionality
opencode-session-monitor status

# Run built-in tests
opencode-session-monitor test
```

### Test with Mock Servers

```bash
# Start mock OpenCode servers
opencode-session-monitor mock --mock-servers 2

# In another terminal, start the monitor
opencode-session-monitor

# You should see the mock servers appear
```

## Platform-Specific Setup

### macOS

```bash
# Install Node.js via Homebrew
brew install node

# Install the monitor
npm install -g opencode-session-monitor

# Enable notifications (if needed)
# System Preferences > Security & Privacy > Privacy > Notifications
```

### Linux (Ubuntu/Debian)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install the monitor
npm install -g opencode-session-monitor

# Install notification dependencies (optional)
sudo apt-get install libnotify-bin
```

### Linux (CentOS/RHEL)

```bash
# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install the monitor
npm install -g opencode-session-monitor
```

### Windows (WSL)

```bash
# In WSL terminal, install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install the monitor
npm install -g opencode-session-monitor

# Note: Desktop notifications may not work in WSL
export OPENCODE_MONITOR_NOTIFICATIONS=false
```

## Service Setup (Optional)

### Systemd Service (Linux)

Create `/etc/systemd/system/opencode-monitor.service`:

```ini
[Unit]
Description=OpenCode Session Monitor
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username
ExecStart=/usr/local/bin/opencode-session-monitor daemon
Restart=always
RestartSec=10
Environment=OPENCODE_MONITOR_LOG_FILE=/var/log/opencode-monitor.log
Environment=OPENCODE_MONITOR_PID_FILE=/var/run/opencode-monitor.pid

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable opencode-monitor
sudo systemctl start opencode-monitor
sudo systemctl status opencode-monitor
```

### LaunchAgent (macOS)

Create `~/Library/LaunchAgents/com.opencode.session-monitor.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.opencode.session-monitor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/opencode-session-monitor</string>
        <string>daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/opencode-monitor.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/opencode-monitor.error.log</string>
</dict>
</plist>
```

Load the service:

```bash
launchctl load ~/Library/LaunchAgents/com.opencode.session-monitor.plist
launchctl start com.opencode.session-monitor
```

## Troubleshooting

### Installation Issues

**Plugin not found:**
```bash
# Check if plugin exists
ls -la ~/.config/opencode/plugin/opencode-session-monitor.js

# Reinstall if missing
npm run install-plugin
```

**Permission errors:**
```bash
# Fix plugin directory permissions
chmod 755 ~/.config/opencode/plugin/
chmod 644 ~/.config/opencode/plugin/opencode-session-monitor.js
```

**Plugin not loading in OpenCode:**
```bash
# Check OpenCode plugin directory
ls -la ~/.config/opencode/plugin/

# Verify plugin syntax
node -c ~/.config/opencode/plugin/opencode-session-monitor.js
```

**Permission errors:**
```bash
# Use npm prefix to install in user directory
npm config set prefix ~/.local
export PATH=~/.local/bin:$PATH
npm install -g opencode-session-monitor
```

**Node.js version issues:**
```bash
# Check Node.js version
node --version

# Update Node.js if needed
npm install -g n
sudo n latest
```

**Build failures:**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Runtime Issues

**No servers discovered:**
```bash
# Check if plugin is installed in OpenCode instances
ls ~/.config/opencode/plugin/opencode-session-monitor.js

# Verify plugin configuration
echo $OPENCODE_MONITOR_HOST
echo $OPENCODE_MONITOR_PORT

# Test UDP connectivity
nc -u -l 41234  # In one terminal
echo "test" | nc -u localhost 41234  # In another

# Check OpenCode logs for plugin messages
# Look for: [opencode-session-monitor] Starting for...
```

**Plugin not announcing:**
```bash
# Enable plugin debug logging
export OPENCODE_MONITOR_DEBUG=1

# Check if OpenCode can determine its listening port
lsof -i -P -n -a -p $(pgrep opencode) | grep LISTEN

# Verify network connectivity
ping $OPENCODE_MONITOR_HOST
```

**Connection failures:**
```bash
# Test HTTP connectivity to discovered OpenCode servers
curl http://localhost:4096/health

# Check if announced server URL is correct
# Enable monitor debug mode
opencode-session-monitor debug --trace
```

**Performance issues:**
```bash
# Reduce update frequency
export OPENCODE_MONITOR_UPDATE_INTERVAL=2000

# Limit message history
export OPENCODE_MONITOR_MAX_MESSAGE_HISTORY=500

# Check terminal capabilities
echo $TERM
tput colors
```

### Log Analysis

Enable debug logging and check logs:

```bash
# Start with debug logging
opencode-session-monitor debug --log-file debug.log

# Monitor logs in real-time
tail -f debug.log

# Search for specific issues
grep -i error debug.log
grep -i "connection" debug.log
```

## Uninstallation

### Remove Global Installation

```bash
# Uninstall global package
npm uninstall -g opencode-session-monitor

# Remove configuration files
rm -rf ~/.opencode-monitor
rm -f opencode-monitor.pid
rm -rf logs/
```

### Remove Service (if installed)

```bash
# Systemd (Linux)
sudo systemctl stop opencode-monitor
sudo systemctl disable opencode-monitor
sudo rm /etc/systemd/system/opencode-monitor.service

# LaunchAgent (macOS)
launchctl unload ~/Library/LaunchAgents/com.opencode.session-monitor.plist
rm ~/Library/LaunchAgents/com.opencode.session-monitor.plist
```

## Getting Help

If you encounter issues:

1. Check this installation guide
2. Review the [README.md](README.md) for usage information
3. Enable debug mode: `opencode-session-monitor debug --trace`
4. Check the logs for error messages
5. Open an issue on GitHub with debug logs and system information

For system information, run:

```bash
# System info
uname -a
node --version
npm --version

# Network info
ip addr show  # Linux
ifconfig      # macOS

# Test connectivity
opencode-session-monitor status
```