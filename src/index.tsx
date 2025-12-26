#!/usr/bin/env node

// Main entry point for OpenCode Session Monitor

import { format } from "node:util";
import { createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Fundamental TUI Protection:
 * Redirect console methods to a log file.
 * Low-level stdout is NOT patched to avoid interfering with Ink's native stream.
 */
function bootstrapTUI() {
  const isTUI =
    !process.argv.includes("daemon") &&
    !process.argv.includes("status") &&
    !process.argv.includes("mock") &&
    !process.argv.includes("test");

  if (!isTUI || !process.stdin.isTTY) return;

  const logPath = join(homedir(), ".opencode-session-monitor.log");
  const logStream = createWriteStream(logPath, { flags: "a" });

  const logToFile = (msg: any, ...args: any[]) => {
    const formatted = format(msg, ...args) + "\n";
    logStream.write(`[${new Date().toISOString()}] ${formatted}`);
  };

  // Patch console globally
  console.log = logToFile;
  console.error = logToFile;
  console.warn = logToFile;
  console.debug = logToFile;

  // Redirect stderr to the log file as it's almost always background noise in TUI mode
  process.stderr.write = ((chunk: any, _encoding: any, callback: any) => {
    logStream.write(
      `[${new Date().toISOString()}] [RAW-STDERR] ${chunk.toString()}`,
    );
    if (callback) callback();
    return true;
  }) as any;
}

bootstrapTUI();

// Now load the rest of the app
import { runCLI } from "./cli";

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Run CLI
runCLI().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
