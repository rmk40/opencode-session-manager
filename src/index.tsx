#!/usr/bin/env node

// Main entry point for OpenCode Session Monitor

import { format } from "node:util";
import { createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Fundamental TUI Protection:
 * Redirect all stdout/stderr before any other modules are loaded.
 * This ensures background logs from SDK or dependencies never corrupt Ink's buffer.
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

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);

  // Patch console
  console.log = logToFile;
  console.error = logToFile;
  console.warn = logToFile;
  console.debug = logToFile;

  // Patch low-level write
  process.stdout.write = ((chunk: any, encoding: any, callback: any) => {
    const data = chunk.toString();
    // Only allow Ink's ANSI sequences through
    if (data.includes("\u001b") || data.includes("\x1b")) {
      return originalStdoutWrite(chunk, encoding, callback);
    }
    logStream.write(`[${new Date().toISOString()}] [RAW-STDOUT] ${data}`);
    if (callback) callback();
    return true;
  }) as any;

  process.stderr.write = ((chunk: any, _encoding: any, callback: any) => {
    const data = chunk.toString();
    logStream.write(`[${new Date().toISOString()}] [RAW-STDERR] ${data}`);
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
