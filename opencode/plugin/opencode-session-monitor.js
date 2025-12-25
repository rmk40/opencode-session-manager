// opencode-session-monitor.js - OpenCode plugin for session monitoring
//
// This plugin broadcasts UDP announcements so the OpenCode Session Monitor TUI
// can discover OpenCode servers automatically.
//
// Install: Copy or symlink to ~/.config/opencode/plugin/
// Configure: Set OPENCODE_MONITOR_HOST to your desktop's IP address
//
// Environment variables:
//   OPENCODE_MONITOR_HOST  - IP address(es) of machine(s) running the monitor TUI
//                           Supports multiple hosts: "192.168.1.50" or "192.168.1.50,10.0.0.5"
//   OPENCODE_MONITOR_PORT  - UDP port (default: 41234)
//   OPENCODE_MONITOR_DEBUG - Set to "1" to enable debug logging

import { createSocket } from "node:dgram";
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { hostname } from "node:os";
import { appendFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HOSTS = (process.env.OPENCODE_MONITOR_HOST || "127.0.0.1")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const PORT = parseInt(process.env.OPENCODE_MONITOR_PORT, 10) || 41234;
const DEBUG = process.env.OPENCODE_MONITOR_DEBUG === "1";
const HEARTBEAT_INTERVAL = 2_000; // 2 seconds

const socket = createSocket("udp4");

function debug(...args) {
  if (DEBUG) console.error("[opencode-session-monitor]", ...args);
}

function getGitBranch(cwd) {
  try {
    return (
      execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .trim()
        .split("\n")
        .pop() || null
    );
  } catch {
    return null;
  }
}

/**
 * Discover the port this process is listening on using lsof.
 * This is needed because OpenCode may use dynamic ports.
 */
function discoverListeningPort() {
  try {
    const result = execSync(
      `lsof -i -P -n -a -p ${process.pid} 2>/dev/null | grep LISTEN | head -1`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    // Output format: opencode 12345 user 12u IPv4 ... TCP 127.0.0.1:4096 (LISTEN)
    const match = result.match(/:(\d+)\s+\(LISTEN\)/);
    if (match) {
      return parseInt(match[1], 10);
    }
  } catch {
    // lsof failed or no listening ports found
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const OpencodeSessionMonitor = async ({
  project,
  directory,
  client,
}) => {
  const serverId = `${hostname()}-${process.pid}`;
  const dirName = basename(directory);
  const branch = getGitBranch(directory);
  const serverName = project?.name || dirName;

  // Log plugin startup
  const logFile = "/tmp/opencode-plugin.log";
  const logMessage = `[${new Date().toISOString()}] Plugin started for ${serverName} (PID: ${process.pid})\n`;
  try {
    appendFileSync(logFile, logMessage);
  } catch (e) {
    // Ignore file write errors
  }

  console.error(
    `[opencode-session-monitor] Starting for ${serverName} (PID: ${process.pid})`,
  );
  console.error(
    `[opencode-session-monitor] Announcing to: ${HOSTS.join(", ")}:${PORT}`,
  );

  // Discover server URL using lsof to find our actual listening port
  let serverUrl = null;

  function discoverServerUrl() {
    if (serverUrl) return serverUrl;

    // Primary method: Use lsof to find the port this process is listening on
    const port = discoverListeningPort();
    if (port) {
      serverUrl = `http://127.0.0.1:${port}`;
      console.error(
        `[opencode-session-monitor] Discovered server URL: ${serverUrl}`,
      );
      return serverUrl;
    }

    // Fallback: Try to get from SDK client config
    const config = client._client?.getConfig?.();
    if (config?.baseUrl) {
      serverUrl = config.baseUrl;
      console.error(
        `[opencode-session-monitor] Server URL (from SDK config): ${serverUrl}`,
      );
      return serverUrl;
    }

    debug("Could not discover server URL");
    return null;
  }

  // Send announcement packet
  async function sendAnnounce() {
    // Try to discover serverUrl on each announce until we get it
    const url = discoverServerUrl();
    if (!url) {
      debug("Skipping announce - no server URL available");
      return;
    }

    const payload = {
      type: "announce",
      serverId,
      serverUrl: url,
      serverName,
      project: project?.name || dirName,
      branch: branch,
      version: "1.0.0",
      timestamp: Date.now(),
    };

    const buffer = Buffer.from(JSON.stringify(payload));
    for (const host of HOSTS) {
      socket.send(buffer, 0, buffer.length, PORT, host, (err) => {
        if (err) debug(`Send failed to ${host}:`, err.message);
      });
    }
    debug("Sent announce:", payload);

    // Also log to file
    try {
      const logMessage = `[${new Date().toISOString()}] Sent announce: ${JSON.stringify(payload)}\n`;
      appendFileSync("/tmp/opencode-plugin.log", logMessage);
    } catch (e) {
      // Ignore file write errors
    }
  }

  // Send shutdown notification
  function sendShutdown() {
    const payload = {
      type: "shutdown",
      serverId,
      timestamp: Date.now(),
    };
    const buffer = Buffer.from(JSON.stringify(payload));
    for (const host of HOSTS) {
      socket.send(buffer, 0, buffer.length, PORT, host);
    }
    debug("Sent shutdown");
  }

  // Initial announce after short delay (let SDK initialize)
  setTimeout(sendAnnounce, 500);

  // Periodic heartbeat
  const heartbeatTimer = setInterval(sendAnnounce, HEARTBEAT_INTERVAL);

  // Shutdown handling
  let shuttingDown = false;
  const handleShutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(heartbeatTimer);
    sendShutdown();
    setTimeout(() => {
      try {
        socket.close();
      } catch (e) {}
    }, 100);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
  process.on("exit", handleShutdown);

  return {
    // No event handling needed - TUI queries SDK directly
    event: () => {},
    dispose: handleShutdown,
  };
};
