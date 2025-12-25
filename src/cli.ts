// Command-line interface and runtime modes

import { parseArgs } from "node:util";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config";
import { debugLogger, enableDebugMode, enableTraceMode } from "./debug-utils";
import { headlessRunner, builtInScenarios } from "./headless-mode";
import { mockServerManager } from "./mock-server";

// Polyfill __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// CLI Configuration
// ---------------------------------------------------------------------------

export interface CLIOptions {
  mode: "tui" | "daemon" | "debug" | "test" | "mock" | "status";
  port?: number;
  debug?: boolean;
  trace?: boolean;
  logFile?: string;
  pidFile?: string;
  daemonize?: boolean;
  mockServers?: number;
  testScenarios?: string[];
  help?: boolean;
  version?: boolean;
}

// ---------------------------------------------------------------------------
// CLI Parser
// ---------------------------------------------------------------------------

export function parseCliArgs(
  args: string[] = process.argv.slice(2),
): CLIOptions {
  try {
    const { values } = parseArgs({
      args,
      options: {
        mode: {
          type: "string",
          short: "m",
          default: "tui",
        },
        port: {
          type: "string",
          short: "p",
        },
        debug: {
          type: "boolean",
          short: "d",
        },
        trace: {
          type: "boolean",
          short: "t",
        },
        "log-file": {
          type: "string",
          short: "l",
        },
        "pid-file": {
          type: "string",
        },
        daemonize: {
          type: "boolean",
        },
        "mock-servers": {
          type: "string",
        },
        "test-scenarios": {
          type: "string",
        },
        help: {
          type: "boolean",
          short: "h",
        },
        version: {
          type: "boolean",
          short: "v",
        },
      },
      strict: false,
      allowPositionals: true,
    });

    // Check for positional mode (e.g., opencode-session-monitor daemon)
    let mode = (values.mode as any) || "tui";
    if (args.length > 0 && !args[0].startsWith("-")) {
      mode = args[0];
    }

    return {
      mode: mode as any,
      port: values.port ? parseInt(values.port as string, 10) : undefined,
      debug: !!values.debug,
      trace: !!values.trace,
      logFile: values["log-file"] as string,
      pidFile: values["pid-file"] as string,
      daemonize: !!values.daemonize,
      mockServers: values["mock-servers"]
        ? parseInt(values["mock-servers"] as string, 10)
        : undefined,
      testScenarios: values["test-scenarios"]
        ? (values["test-scenarios"] as string).split(",")
        : undefined,
      help: !!values.help,
      version: !!values.version,
    };
  } catch (error) {
    console.error("Error parsing arguments:", error);
    return { mode: "tui", help: true };
  }
}

// ---------------------------------------------------------------------------
// Help and Version
// ---------------------------------------------------------------------------

export function showHelp(): void {
  const help = `
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
`;
  console.log(help.trim());
}

export function showVersion(): void {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, "../package.json"), "utf-8"),
  );
  console.log(`OpenCode Session Monitor v${packageJson.version}`);
}

// ---------------------------------------------------------------------------
// Runtime Mode Handlers
// ---------------------------------------------------------------------------

export async function runTUIMode(options: CLIOptions): Promise<void> {
  if (options.debug) enableDebugMode();
  if (options.trace) enableTraceMode();

  debugLogger.info("Starting TUI mode");

  // Import and start the main app
  const { default: main } = await import("./app");
  await main();
}

export async function runDaemonMode(options: CLIOptions): Promise<void> {
  if (options.debug) enableDebugMode();
  if (options.trace) enableTraceMode();

  debugLogger.info("Starting daemon mode");

  // Handle daemonization
  if (options.daemonize) {
    await daemonize(options);
  }

  // Write PID file
  const pidFile = options.pidFile || getConfig().pidFile;
  writeFileSync(pidFile, process.pid.toString());

  // Start connection manager for monitoring
  const { connectionManager } = await import("./connection-manager");
  await connectionManager.start();

  // Set up notification handlers
  const { notificationTrigger } = await import("./notifications");

  connectionManager.on("session_updated", (session) => {
    notificationTrigger.handleSessionUpdate(session);
  });

  connectionManager.on("error", (error) => {
    notificationTrigger.handleError(error);
  });

  debugLogger.info("Daemon mode started, monitoring for sessions...");

  // Keep process alive
  process.on("SIGTERM", async () => {
    debugLogger.info("Received SIGTERM, shutting down daemon");
    await connectionManager.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    debugLogger.info("Received SIGINT, shutting down daemon");
    await connectionManager.stop();
    process.exit(0);
  });
}

export async function runDebugMode(options: CLIOptions): Promise<void> {
  if (options.debug) enableDebugMode();
  if (options.trace) enableTraceMode();

  debugLogger.info("Starting debug mode");

  // Start with enhanced debugging
  const { connectionManager } = await import("./connection-manager");
  const { packetInspector, performanceMonitor } = await import("./debug-utils");

  // Enhanced event logging
  connectionManager.on("server_discovered", (server) => {
    packetInspector.inspectServer(server, "discovered");
  });

  connectionManager.on("session_updated", (session) => {
    packetInspector.inspectSession(session, "updated");
  });

  connectionManager.on("error", (error) => {
    packetInspector.inspectError(error, "connection_manager");
  });

  await connectionManager.start();

  // Start TUI with debug overlay
  const { default: main } = await import("./app");
  await main();

  // Log performance metrics periodically
  setInterval(() => {
    performanceMonitor.logSummary();
  }, 30000); // Every 30 seconds
}

export async function runTestMode(options: CLIOptions): Promise<void> {
  if (options.debug) enableDebugMode();
  if (options.trace) enableTraceMode();

  debugLogger.info("Starting test mode");

  await headlessRunner.start();

  // Determine which scenarios to run
  let scenariosToRun = builtInScenarios;
  if (options.testScenarios) {
    scenariosToRun = builtInScenarios.filter((scenario) =>
      options.testScenarios!.some((pattern) => scenario.name.includes(pattern)),
    );

    if (scenariosToRun.length === 0) {
      console.error("No matching test scenarios found");
      console.log(
        "Available scenarios:",
        builtInScenarios.map((s) => s.name).join(", "),
      );
      process.exit(1);
    }
  }

  console.log(`Running ${scenariosToRun.length} test scenarios...`);
  await headlessRunner.runScenarios(scenariosToRun);
  const report = JSON.parse(headlessRunner.generateReport());

  // Write report to file
  writeFileSync("test-report.json", JSON.stringify(report, null, 2));

  console.log("\n=== Test Results ===");
  console.log(`Total: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Success Rate: ${report.summary.successRate}`);
  console.log(`Total Duration: ${report.summary.totalDuration}`);

  if (report.summary.failed > 0) {
    console.log("\n=== Failed Tests ===");
    (report.results as any[])
      .filter((r: any) => !r.success)
      .forEach((result: any, index: number) => {
        console.log(`Test ${index + 1}: ${result.errors.join(", ")}`);
      });
  }

  console.log("\nDetailed report saved to test-report.json");

  await headlessRunner.stop();
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

export async function runMockMode(options: CLIOptions): Promise<void> {
  if (options.debug) enableDebugMode();
  if (options.trace) enableTraceMode();

  const serverCount = options.mockServers || 3;
  console.log(`Starting ${serverCount} mock OpenCode servers...`);

  const promises = [];
  for (let i = 0; i < serverCount; i++) {
    const serverId = `mock-server-${i + 1}`;
    const serverName = `Mock Server ${i + 1}`;
    const port = 9000 + i;
    promises.push(mockServerManager.createServer(serverId, serverName, port));
  }
  await Promise.all(promises);

  // Print server info
  const servers = mockServerManager.getServers();
  for (const server of servers) {
    const info = server.getServerInfo();
    console.log(`Started ${info.serverName} on port ${info.port}`);
  }

  console.log("\nMock servers are running. Press Ctrl+C to stop.");

  process.on("SIGINT", async () => {
    console.log("\nShutting down mock servers...");
    await mockServerManager.stopAll();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\nShutting down mock servers...");
    await mockServerManager.stopAll();
    process.exit(0);
  });
}

export async function runStatusMode(_options: CLIOptions): Promise<void> {
  const config = getConfig();

  console.log("OpenCode Session Monitor Status");
  console.log("================================");
  console.log(`UDP Port: ${config.port}`);
  console.log(`Debug Mode: ${config.debug}`);
  console.log(`Log File: ${config.logFile}`);
  console.log(`PID File: ${config.pidFile}`);

  // Check if daemon is running
  if (existsSync(config.pidFile)) {
    const pid = parseInt(readFileSync(config.pidFile, "utf-8"), 10);
    try {
      process.kill(pid, 0);
      console.log(`Daemon Status: Running (PID: ${pid})`);
    } catch {
      console.log("Daemon Status: Not running (stale PID file)");
    }
  } else {
    console.log("Daemon Status: Not running");
  }

  console.log("\nDiscovering OpenCode servers...");

  const { connectionManager } = await import("./connection-manager");
  await connectionManager.start();

  // Wait a few seconds for discovery
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const servers = connectionManager.getServers();
  console.log(`\nServers Found: ${servers.size}`);
  for (const [_, server] of servers) {
    console.log(
      `  ${server.name} (${server.url}) - ${server.isHealthy ? "Healthy" : "Unhealthy"}`,
    );
  }

  const sessions = connectionManager.getSessions();
  console.log(`\nSessions Found: ${sessions.size}`);
  const activeSessions = connectionManager.getActiveSessions();
  console.log(`Active Sessions: ${activeSessions.length}`);

  await connectionManager.stop();
  process.exit(0);
}

async function daemonize(_options: CLIOptions): Promise<void> {
  // Fork into background
  const { spawn } = await import("node:child_process");

  const args = process.argv.slice(2).filter((arg) => arg !== "--daemonize");
  const child = spawn(process.argv[0], [process.argv[1], ...args], {
    detached: true,
    stdio: "ignore",
  });

  child.unref();

  console.log(`Daemon started with PID: ${child.pid}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main CLI Entry Point
// ---------------------------------------------------------------------------

export async function runCLI(args?: string[]): Promise<void> {
  const options = parseCliArgs(args);

  if (options.help) {
    showHelp();
    return;
  }

  if (options.version) {
    showVersion();
    return;
  }

  // Override config with CLI options
  if (options.port) {
    process.env.OPENCODE_MONITOR_PORT = options.port.toString();
  }
  if (options.logFile) {
    process.env.OPENCODE_MONITOR_LOG_FILE = options.logFile;
  }
  if (options.pidFile) {
    process.env.OPENCODE_MONITOR_PID_FILE = options.pidFile;
  }
  if (options.debug) {
    process.env.OPENCODE_MONITOR_DEBUG = "true";
  }

  try {
    switch (options.mode) {
      case "tui":
        await runTUIMode(options);
        break;
      case "daemon":
        await runDaemonMode(options);
        break;
      case "debug":
        await runDebugMode(options);
        break;
      case "test":
        await runTestMode(options);
        break;
      case "mock":
        await runMockMode(options);
        break;
      case "status":
        await runStatusMode(options);
        break;
      default:
        console.error(`Unknown mode: ${options.mode}`);
        console.log("Use --help for usage information");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
