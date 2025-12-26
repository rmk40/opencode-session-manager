#!/usr/bin/env node

import { format } from "node:util";
import { createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Fundamental TUI Protection:
 * Redirect console methods and stderr to a log file.
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

  // Redirect stderr to the log file (almost always background noise)
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

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

runCLI().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
