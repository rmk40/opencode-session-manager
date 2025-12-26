# OpenCode Session Monitor Development Guide

This document covers the nuances, caveats, and technical "gotchas" discovered during the development of this codebase. It is intended for developers extending the monitor or the OpenCode plugin.

## 1. OpenCode SDK Integration Nuances

### Parallel Session Loading

The `@opencode-ai/sdk` separates session metadata from session status.

- `session.list()`: Returns all known sessions but with minimal metadata and often outdated "idle" statuses.
- `session.status()`: Returns a map of _active_ sessions (busy or waiting for permission).
- **Caveat**: To get a complete and accurate view, the `ConnectionManager` must call both in parallel and merge the results. Relying only on `status()` will cause idle sessions to disappear from the TUI.

### Multi-Part Message Parsing

Messages in OpenCode are not simple strings; they consist of `info` and `parts`.

- **Parts**: A single message can contain `text`, `reasoning`, `tool`, and `call` parts.
- **The Content Gap**: Sometimes the root `content` field of a message is empty while the data resides in the `parts`. Our `convertMessage` utility in `http-client.ts` is designed to concatenate these and identify the primary "type" of the message.

## 2. ESM and Node.js Compatibility

The project is strictly **ESM**. This introduced specific challenges with several dependencies:

- **OpenCode SDK**: Depending on how it's bundled, `createOpencodeClient` might be on the default export or a named export. The `initSDK` function in `http-client.ts` handles this detection.
- **Marked Terminal**: The `@ts-ignore` in `app.tsx` for `marked-terminal` imports is necessary because the type definitions for `marked-terminal` do not always align with the ESM export structure of the actual package.

## 3. Terminal User Interface (Ink) Stability

### The Exclusive Stdout Rule

Ink maintains a virtual model of the terminal buffer. If **any other code** writes to `process.stdout` or `process.stderr` (e.g., a simple `console.log` in a background network loop), Ink's internal cursor tracking breaks.

- **Behavior**: When Ink detects this desync, it clears the entire screen to recover.
- **Protection**: Our `src/index.tsx` redirects `console.*` and `stderr` to a log file. **Never remove this redirection** or the TUI will begin flickering immediately.

### Reactive State Batching

The TUI receives events from multiple servers via UDP and SSE.

- **Nuance**: If every network packet triggered a React re-render, the UI would freeze.
- **Batching**: We use a `ref`-based queue and a 50ms timer in `state.tsx` to batch updates. This ensures that even during high-velocity logging from the assistant, the TUI only redraws at most 20 times per second.

## 4. Input Handling and Refs

React state updates in Ink are asynchronous.

- **The Bug**: If you use `messageInput` (state) directly inside a `useInput` callback, rapid typing will cause "stale closures" where the callback uses an old version of the string, resulting in lost characters or failing backspaces.
- **The Fix**: We use `useRef` to maintain the "current" input value and sync it to the state. This allows the UI to render the latest characters while the input handler always has access to the most recent value.

## 5. Plugin Development (`opencode/plugin/`)

The plugin runs **inside** the OpenCode server instances.

- **Discovery**: It uses `lsof` to find the port the server is listening on. This is necessary because OpenCode often binds to dynamic ports.
- **Context**: The plugin has access to the `project` and `directory` objects provided by the OpenCode plugin host. We use these to populate the `AnnouncePacket` so the monitor can group sessions by project and branch name.

## 6. Testing with Mock Servers

Testing the TUI against live instances can be non-deterministic.

- **Mock Mode**: Run `npm start mock --mock-servers 3` to spin up local HTTP servers that mimic the OpenCode API.
- **Heartbeats**: The mock servers emit UDP announcements every 2 seconds. This is the best way to verify that the "Discovery" and "Stale Server" logic is working correctly without needing a full OpenCode environment.

## 7. Logging and Debugging

Since `stdout` is reserved for the TUI, you cannot use `console.log` for debugging.

- **Monitoring Logs**: Run `tail -f ~/.opencode-session-monitor.log` in a separate terminal window to see background logs, network errors, and instrumentation output.
- **Debug Mode**: Use the `--debug` flag to enable more verbose logging from the connection and SSE managers.
