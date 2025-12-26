# OpenCode Session Monitor TUI Design & Stability Guide

This document outlines the architectural decisions, design patterns, and critical stability fixes implemented in the OpenCode Session Monitor TUI.

## Architecture Overview

The TUI is built using **React** and **Ink**, which provides a component-based model for terminal interfaces. The system is designed to handle high-frequency updates from multiple OpenCode servers while remaining responsive and visually stable.

### Key Components

1.  **State Layer (`state.tsx`)**: Uses React Context and `useReducer` with an optimized batching engine.
2.  **Layout System (`layout.tsx`)**: Derives terminal dimensions directly from Ink's native `stdout` stream via `useStdout`.
3.  **Discovery Layer (`udp-discovery.ts`)**: Listens for UDP announcements and manages server lifecycles.
4.  **UI Tree (`app.tsx`)**: Features a responsive Header, a scrollable Session List, and a high-fidelity Session Detail View.

---

## Resolving the "Intense Flickering" Issue

Flickering in Ink-based TUIs is rarely a simple "performance" problem; it is almost always caused by **Terminal Buffer Synchronization Conflicts**. We resolved this through three fundamental fixes:

### 1. The Height-Correction Logic (Critical)

Ink's internal rendering engine triggers a full-screen clear (`\x1b[2J`) whenever it detects that the rendered output height is exactly equal to or greater than the terminal's reported `rows`.

- **Problem**: If the root container matches the terminal height, minor rounding errors or emulator padding cause Ink to believe an overflow occurred. This triggers a recursive loop: Clear -> Redraw -> Overflow -> Clear.
- **Fix**: The root `Box` is explicitly set to `height={layout.size.height - 1}`. This 1-line safety margin prevents Ink's internal clear-and-redraw recovery loop entirely.

### 2. Incremental Rendering

By default, some TUI engines redraw the entire screen on every state update.

- **Fix**: We enabled `incrementalRendering: true` in Ink's render options. This ensures that only changed terminal cells are updated, significantly reducing the bandwidth sent to the terminal emulator.

### 3. Granular State Subscriptions

- **Problem**: Initially, every component subscribed to the entire global state. A background heartbeat from an idle server would trigger a re-render of the heavy Session Detail View.
- **Fix**: Refactored `state.tsx` to provide slice-based hooks (e.g., `useSelectedSession()`). Components now only re-render when their specific data changes, reducing virtual DOM diffing by ~90%.

---

## Display & Rendering Patterns

### Persistent Component Identity

In a scrollable list, using indices as React keys forces a remount of every visible item when the list moves.

- **Design**: Every message part and conversation line uses a strictly **persistent, unique ID** derived from the OpenCode SDK's message IDs. This allows Ink to surgically update terminal cells during scrolls.

### Synchronous Markdown Bridge

Ink-based TUIs cannot easily handle asynchronous rendering inside the render loop without layout jitter.

- **Design**: We implemented a synchronous parsing bridge using `marked` with the `{ async: false }` flag and `marked-terminal`. This ensures that formatted text is ready on the very first frame of a state update.

### Background Noise Isolation

TUIs require exclusive control over the `stdout` stream. Any `console.log` from a background task (like a network timeout or heartbeat) will corrupt the terminal buffer and trigger a redraw.

- **Design**: We implemented a global bootstrap in `index.tsx` that redirects all `console.*` and `stderr` output to `~/.opencode-session-monitor.log` at the very entry point of the application.

---

## Layout & Margins

To prevent text truncation and edge collisions:

1.  **Safety Padding**: The root container uses `padding: 1` to ensure borders never physically touch the terminal's boundary.
2.  **Inner Width Math**: Content containers use an `innerWidth` calculation (e.g., `W - 6`) that accounts for the parent's padding and borders.
3.  **Natural Wrapping**: We use `wrap="wrap"` for conversation bodies, synchronized with the `marked-terminal` width settings, ensuring long messages from the assistant remain fully readable.

---

## Management Operations

- **Input Box**: Uses React `refs` to prevent stale closures during rapid typing and handles `\u007f` (backspace) explicitly for cross-platform stability.
- **Permissions**: Detected via `SessionStatus` changes and rendered as high-visibility blocks with quick-key handlers (`y`/`Y`/`n`) for instant resolution.
- **Notifications**: Integrated native desktop notifications that trigger on `waiting_for_permission` events, bridging the gap between the background CLI and the user's desktop environment.
