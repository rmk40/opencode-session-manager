// Main application component and layout for OpenCode Session Monitor

import React, { useEffect, useState, useMemo, useRef } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { Marked } from "marked";
// @ts-ignore
import { markedTerminal } from "marked-terminal";
import {
  AppStateProvider,
  useAppState,
  useServers,
  useSessions,
  useSelectedSession,
  useCurrentView,
  useGroupingAndSorting,
  useAppError,
  useServerCount,
  useSessionCount,
  useActiveSessionCount,
} from "./state";
import { LayoutProvider, useLayout } from "./layout";
import { groupSessions, sortGroups, sortSessions } from "./grouping";
import { Session, SessionGroup } from "./types";

// ---------------------------------------------------------------------------
// Markdown Rendering
// ---------------------------------------------------------------------------

function createMarkedRenderer(width: number) {
  return new Marked().use(
    markedTerminal({
      width: Math.max(20, width),
      reflowText: true,
      showSectionPrefix: false,
    }) as any,
  );
}

// ---------------------------------------------------------------------------
// Spinner Component (Self-contained to minimize redraws)
// ---------------------------------------------------------------------------

const LoadingSpinner = React.memo(({ isBusy }: { isBusy: boolean }) => {
  const [frame, setFrame] = useState(0);
  const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    if (!isBusy) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % 10), 100);
    return () => clearInterval(timer);
  }, [isBusy]);

  return (
    <Box width={2}>
      <Text color="yellow">{isBusy ? SPINNER_FRAMES[frame] : ""}</Text>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Header Component (Optimized counts)
// ---------------------------------------------------------------------------

const Header = React.memo(() => {
  const { layout, truncateText } = useLayout();
  const serverCount = useServerCount();
  const sessionCount = useSessionCount();
  const activeCount = useActiveSessionCount();
  const currentView = useCurrentView();
  const { groupBy, sortBy } = useGroupingAndSorting();

  const servers = useServers();
  const isBusy = useMemo(
    () =>
      servers.some((s) => s.sessions.some((sess) => sess.status === "busy")),
    [servers],
  );

  const availableWidth = layout.size.width - 4;

  return (
    <Box flexDirection="column" width="100%">
      <Box
        justifyContent="center"
        borderStyle="double"
        borderColor="blue"
        width="100%"
      >
        <Box flexDirection="row">
          <LoadingSpinner isBusy={isBusy} />
          <Text bold color="blue" wrap="truncate-end">
            {truncateText("OpenCode Session Monitor", availableWidth - 2)}
          </Text>
        </Box>
      </Box>
      <Box justifyContent="space-between" paddingX={1} width="100%">
        <Box flexShrink={1}>
          <Text wrap="truncate-end" color="#aaaaaa">
            Servers: <Text color="green">{serverCount}</Text> | Sessions:{" "}
            <Text color="yellow">{sessionCount}</Text> | Active:{" "}
            <Text color="cyan">{activeCount}</Text>
          </Text>
        </Box>
        <Box flexShrink={0} paddingLeft={2}>
          <Text wrap="truncate-end" color="#aaaaaa">
            View: <Text color="magenta">{currentView}</Text> | Group:{" "}
            <Text color="#888888">{groupBy}</Text> | Sort:{" "}
            <Text color="#888888">{sortBy}</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Footer Component
// ---------------------------------------------------------------------------

const Footer = React.memo(() => {
  const { layout, truncateText } = useLayout();
  const currentView = useCurrentView();
  const error = useAppError();

  const keyHelp =
    currentView === "list"
      ? "q:quit | ↑↓:navigate | enter:view | g:group | s:sort | f:filter | h:help"
      : currentView === "session"
        ? "q:quit | esc:back | i:input | a:abort | ↑↓:scroll | h:help"
        : "q:quit | esc:back";

  const availableWidth = layout.size.width - 4;

  return (
    <Box
      height={layout.dimensions.footerHeight}
      flexDirection="column"
      width="100%"
    >
      <Box borderStyle="single" borderColor="#333333" paddingX={1} width="100%">
        <Text dimColor wrap="truncate-end">
          {truncateText(keyHelp, availableWidth)}
        </Text>
      </Box>
      {error && (
        <Box backgroundColor="red" paddingX={1} width="100%">
          <Text color="white" bold>
            Error:{" "}
          </Text>
          <Text color="white" wrap="truncate-end">
            {truncateText(error.message, availableWidth - 8)}
          </Text>
        </Box>
      )}
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Session List Component
// ---------------------------------------------------------------------------

const SessionList = React.memo(() => {
  const {
    selectSession,
    setView,
    setGroupBy,
    setSortBy,
    toggleShowOnlyActive,
    toggleGroupExpanded,
  } = useAppState();
  const servers = useServers();
  const sessions = useSessions();
  const { groupBy, sortBy, showOnlyActive, expandedGroups } =
    useGroupingAndSorting();
  const { layout, truncateText } = useLayout();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const serverMap = useMemo(() => {
    const map = new Map();
    servers.forEach((s) => map.set(s.id, s));
    return map;
  }, [servers]);

  const groups = useMemo(() => {
    const filtered = showOnlyActive
      ? sessions.filter(
          (s) => !["completed", "aborted", "error"].includes(s.status),
        )
      : sessions;

    const grouped = groupSessions(filtered, serverMap, groupBy);
    const sortedGroups = sortGroups(grouped, sortBy);

    return sortedGroups.map((g) => ({
      ...g,
      sessions: sortSessions(g.sessions, sortBy),
      isExpanded: !expandedGroups.has(g.id),
    }));
  }, [sessions, serverMap, groupBy, sortBy, showOnlyActive, expandedGroups]);

  const flatItems = useMemo(() => {
    const items: (
      | { type: "group"; data: SessionGroup }
      | { type: "session"; data: Session }
    )[] = [];
    for (const group of groups) {
      items.push({ type: "group", data: group });
      if (group.isExpanded) {
        for (const session of group.sessions) {
          items.push({ type: "session", data: session });
        }
      }
    }
    return items;
  }, [groups]);

  useEffect(() => {
    if (selectedIndex >= flatItems.length && flatItems.length > 0) {
      setSelectedIndex(flatItems.length - 1);
    }
  }, [flatItems.length, selectedIndex]);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex(Math.min(flatItems.length - 1, selectedIndex + 1));
    } else if (key.return) {
      const selectedItem = flatItems[selectedIndex];
      if (selectedItem?.type === "group") {
        toggleGroupExpanded(selectedItem.data.id);
      } else if (selectedItem?.type === "session") {
        selectSession(selectedItem.data.id);
        setView("session");
      }
    } else if (input === "g") {
      const modes: ("none" | "project" | "server")[] = [
        "none",
        "project",
        "server",
      ];
      const currentIndex = modes.indexOf(groupBy);
      setGroupBy(modes[(currentIndex + 1) % modes.length]);
    } else if (input === "s") {
      const modes: ("name" | "activity" | "created" | "cost")[] = [
        "name",
        "activity",
        "created",
        "cost",
      ];
      const currentIndex = modes.indexOf(sortBy);
      setSortBy(modes[(currentIndex + 1) % modes.length]);
    } else if (input === "f") {
      toggleShowOnlyActive();
    }
  });

  const contentHeight = layout.dimensions.contentHeight - 2;
  const visibleItems = flatItems.slice(0, contentHeight);

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Box borderStyle="single" borderColor="#444444" paddingX={1} width="100%">
        <Text bold>
          Sessions ({flatItems.filter((i) => i.type === "session").length})
        </Text>
      </Box>

      <Box flexDirection="column" width="100%">
        {visibleItems.map((item, index) => {
          const isSelected = index === selectedIndex;
          if (item.type === "group") {
            const groupLabel = `${item.data.isExpanded ? "▼" : "▶"} ${item.data.name} (${item.data.sessions.length})`;
            return (
              <Box
                key={`group-${item.data.id}`}
                backgroundColor={isSelected ? "#264f78" : "#222222"}
                paddingX={1}
                width="100%"
              >
                <Text
                  bold
                  color={isSelected ? "white" : "#d4af37"}
                  wrap="truncate-end"
                >
                  {truncateText(groupLabel, layout.size.width - 4)}
                </Text>
              </Box>
            );
          }
          const session = item.data;
          const statusColor = getStatusColor(session.status);
          const server = serverMap.get(session.serverId);
          const nameWidth = Math.max(10, layout.size.width - 23);
          return (
            <Box
              key={`session-${session.id}`}
              backgroundColor={isSelected ? "#264f78" : undefined}
              paddingLeft={2}
              width="100%"
            >
              <Box width={3}>
                <Text color={isSelected ? "white" : statusColor}>
                  {isSelected ? ">" : "●"}
                </Text>
              </Box>
              <Box width={nameWidth}>
                <Text
                  bold={isSelected}
                  color={isSelected ? "white" : "#cccccc"}
                  wrap="truncate-end"
                >
                  {truncateText(session.name, nameWidth)}
                </Text>
              </Box>
              <Box width={15} justifyContent="flex-end">
                <Text color={isSelected ? "white" : "#666666"}>
                  {truncateText(
                    server?.name || session.serverId.slice(0, 8),
                    15,
                  )}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Rendered Line Component
// ---------------------------------------------------------------------------

const RenderedLine = React.memo(({ line }: { line: any }) => {
  const { layout } = useLayout();
  const availableWidth = layout.size.width - 4;

  switch (line.type) {
    case "session-header":
      return (
        <Box width={availableWidth} paddingX={1} backgroundColor="#1a1a1a">
          <Text bold color="cyan">
            {line.content}
          </Text>
        </Box>
      );
    case "msg-header":
      return (
        <Box
          width={availableWidth}
          backgroundColor={line.role === "user" ? "#1e3a1e" : "#1e1e3a"}
          paddingX={1}
        >
          <Text bold color="white">
            {line.content}
          </Text>
        </Box>
      );
    case "msg-body":
      return (
        <Box width={availableWidth} paddingLeft={1} backgroundColor="#161616">
          <Text color="#e0e0e0">{line.content === "" ? "│" : "│ "}</Text>
          <Box flexGrow={1}>
            <Text>{line.content}</Text>
          </Box>
        </Box>
      );
    case "msg-tool-start":
      return (
        <Box width={availableWidth} paddingLeft={1} backgroundColor="#161616">
          <Text color="#d4af37">│ {line.content}</Text>
        </Box>
      );
    case "msg-tool-body":
      return (
        <Box width={availableWidth} paddingLeft={1} backgroundColor="#1a1a1a">
          <Text color="#aaaaaa">│ │ {line.content}</Text>
        </Box>
      );
    case "msg-tool-end":
      return (
        <Box width={availableWidth} paddingLeft={1} backgroundColor="#161616">
          <Text color="#d4af37">│ {line.content}</Text>
        </Box>
      );
    case "msg-reasoning-start":
      return (
        <Box width={availableWidth} paddingLeft={1} backgroundColor="#161616">
          <Text color="#8b008b">│ {line.content}</Text>
        </Box>
      );
    case "msg-reasoning-body":
      return (
        <Box width={availableWidth} paddingLeft={1} backgroundColor="#121212">
          <Text italic color="#777777">
            │ │ {line.content}
          </Text>
        </Box>
      );
    case "msg-reasoning-end":
      return (
        <Box width={availableWidth} paddingLeft={1} backgroundColor="#161616">
          <Text color="#8b008b">│ {line.content}</Text>
        </Box>
      );
    case "msg-footer":
      return (
        <Box width={availableWidth} paddingLeft={1} backgroundColor="#161616">
          <Text color="#444444">{line.content}</Text>
        </Box>
      );
    case "spacer":
      return (
        <Box height={1} width={availableWidth}>
          <Text> </Text>
        </Box>
      );
    default:
      return (
        <Box width={availableWidth} paddingX={1}>
          <Text>{line.content}</Text>
        </Box>
      );
  }
});

// ---------------------------------------------------------------------------
// Session View Component
// ---------------------------------------------------------------------------

const SessionView = React.memo(() => {
  const { sendMessage, abortSession, setView } = useAppState();
  const session = useSelectedSession();
  const servers = useServers();
  const { layout, truncateText } = useLayout();
  const [messageInput, setMessageInput] = useState("");
  const [inputMode, setInputMode] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const lineCache = useRef<Map<string, any[]>>(new Map());
  const lastSessionId = useRef<string | undefined>(undefined);

  if (lastSessionId.current !== session?.id) {
    lineCache.current.clear();
    lastSessionId.current = session?.id;
  }

  const serverMap = useMemo(() => {
    const map = new Map();
    servers.forEach((s) => map.set(s.id, s));
    return map;
  }, [servers]);

  const marked = useMemo(
    () => createMarkedRenderer(layout.size.width - 12),
    [layout.size.width],
  );

  const renderedLines = useMemo(() => {
    if (!session) return [];
    const lines: any[] = [];
    const termWidth = layout.size.width;

    lines.push({
      type: "session-header",
      content: `Monitoring: ${session.name}`,
      id: "header",
    });
    lines.push({ type: "spacer", id: "s1" });

    for (const msg of session.messages) {
      const cacheKey = `${msg.id}-${msg.timestamp}-${msg.content.length}-${(msg.parts || []).length}`;
      let msgLines = lineCache.current.get(msg.id);
      if (msgLines && (msgLines[0] as any).cacheKey === cacheKey) {
        lines.push(...msgLines);
        continue;
      }

      msgLines = [];
      const parts = msg.parts || [];
      if (
        msg.role === "assistant" &&
        parts.length === 0 &&
        (!msg.content || msg.content.trim() === "")
      )
        continue;
      const role = msg.role === "user" ? "User" : "Assistant";
      const cost = msg.metadata?.cost
        ? ` $${msg.metadata.cost.toFixed(4)}`
        : "";
      msgLines.push({
        type: "msg-header",
        content: `┌─ ${role}${cost}`,
        role: msg.role,
        id: msg.id,
        cacheKey,
      });

      let needsSpacer = false;
      if (parts.length === 0 && msg.content) {
        const rendered = String(marked.parse(String(msg.content)));
        rendered
          .trim()
          .split("\n")
          .forEach((line, j) => {
            msgLines.push({
              type: "msg-body",
              content: line,
              id: `${msg.id}-c-${j}`,
              cacheKey,
            });
          });
        needsSpacer = true;
      }
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const partKey = `${msg.id}-p${i}`;
        if (needsSpacer)
          msgLines.push({
            type: "msg-body",
            content: "",
            id: `${partKey}-spacer`,
            cacheKey,
          });
        needsSpacer = true;

        if (part.type === "text") {
          const text = part.text || part.content || "";
          let displayContent = text;
          if (text.trim().startsWith("{") && text.trim().endsWith("}")) {
            try {
              const obj = JSON.parse(text);
              displayContent =
                "```json\n" + JSON.stringify(obj, null, 2) + "\n```";
            } catch (e) {}
          }
          const rendered = String(marked.parse(displayContent));
          rendered
            .trim()
            .split("\n")
            .forEach((line, j) => {
              msgLines.push({
                type: "msg-body",
                content: line,
                id: `${partKey}-${j}`,
                cacheKey,
              });
            });
        } else if (part.type === "tool" || part.type === "call") {
          const icon =
            part.state?.status === "completed"
              ? "✓"
              : part.state?.status === "error"
                ? "✗"
                : "○";
          msgLines.push({
            type: "msg-tool-start",
            content: `┌─ ${icon} ${part.state?.title || part.toolName || "tool"}`,
            id: `${partKey}-start`,
            cacheKey,
          });
          if (part.state?.status === "completed" && part.state.output) {
            String(part.state.output)
              .split("\n")
              .slice(0, 10)
              .forEach((l) =>
                msgLines.push({
                  type: "msg-tool-body",
                  content: l,
                  id: `${partKey}-out`,
                  cacheKey,
                }),
              );
          }
          msgLines.push({
            type: "msg-tool-end",
            content: `└${"─".repeat(Math.min(30, termWidth - 14))}`,
            id: `${partKey}-end`,
            cacheKey,
          });
        } else if (part.type === "reasoning") {
          msgLines.push({
            type: "msg-reasoning-start",
            content: `┌─ Thinking...`,
            id: `${partKey}-start`,
            cacheKey,
          });
          const rendered = String(
            marked.parse(part.reasoning || part.text || ""),
          );
          rendered
            .trim()
            .split("\n")
            .forEach((line, j) => {
              msgLines.push({
                type: "msg-reasoning-body",
                content: line,
                id: `${partKey}-${j}`,
                cacheKey,
              });
            });
          msgLines.push({
            type: "msg-reasoning-end",
            content: `└${"─".repeat(30)}`,
            id: `${partKey}-end`,
            cacheKey,
          });
        }
      }
      msgLines.push({
        type: "msg-footer",
        content: `└${"─".repeat(40)}`,
        id: `${msg.id}-footer`,
        cacheKey,
      });
      msgLines.push({ type: "spacer", id: `${msg.id}-spacer`, cacheKey });

      lineCache.current.set(msg.id, msgLines);
      lines.push(...msgLines);
    }
    return lines;
  }, [session, layout.size.width, marked]);

  useEffect(() => {
    if (autoScroll && renderedLines.length > 0) {
      const maxLines = layout.dimensions.contentHeight - 8;
      setScrollOffset(Math.max(0, renderedLines.length - maxLines));
    }
  }, [renderedLines.length, autoScroll, layout.dimensions.contentHeight]);

  useInput((input, key) => {
    if (key.escape) {
      if (inputMode) {
        setInputMode(false);
        setMessageInput("");
      } else {
        setView("list");
      }
    } else if (input === "i" && !inputMode && session) {
      if (["idle", "busy", "waiting_for_permission"].includes(session.status))
        setInputMode(true);
    } else if (input === "a" && !inputMode && session) {
      abortSession(session.id);
    } else if (key.return && inputMode) {
      if (messageInput.trim() && session)
        sendMessage(session.id, messageInput.trim());
      setMessageInput("");
      setInputMode(false);
    } else if (inputMode) {
      if (key.backspace) setMessageInput(messageInput.slice(0, -1));
      else if (key.ctrl && input === "c") {
        setInputMode(false);
        setMessageInput("");
      } else if (input && input.length === 1)
        setMessageInput(messageInput + input);
    } else if (!inputMode) {
      const maxLines = layout.dimensions.contentHeight - 8;
      const maxScroll = Math.max(0, renderedLines.length - maxLines);
      if (key.upArrow || input === "k") {
        setScrollOffset(Math.max(0, scrollOffset - 1));
        setAutoScroll(false);
      } else if (key.downArrow || input === "j") {
        setScrollOffset(Math.min(maxScroll, scrollOffset + 1));
        setAutoScroll(scrollOffset + 1 === maxScroll);
      } else if (input === "g") setScrollOffset(0);
      else if (input === "G") setScrollOffset(maxScroll);
    }
  });

  if (!session)
    return (
      <Box
        justifyContent="center"
        alignItems="center"
        flexGrow={1}
        width="100%"
      >
        <Text color="red">Session not found</Text>
      </Box>
    );

  const visibleLines = renderedLines.slice(
    scrollOffset,
    scrollOffset + layout.dimensions.contentHeight - 8,
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} width="100%">
      <Box borderStyle="single" borderColor="gray" paddingX={1} width="100%">
        <Text bold>
          {truncateText(session.name, layout.dimensions.contentWidth - 30)}
        </Text>
        <Text dimColor>
          {" "}
          - {serverMap.get(session.serverId)?.name || session.serverId}
        </Text>
      </Box>

      <Box
        paddingX={1}
        flexDirection="row"
        justifyContent="space-between"
        width="100%"
      >
        <Box flexDirection="column">
          <Text>
            Status:{" "}
            <Text color={getStatusColor(session.status)}>{session.status}</Text>{" "}
            {session.isLongRunning && (
              <Text color="orange"> (long-running)</Text>
            )}
          </Text>
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          <Text dimColor>Created: {formatTimestamp(session.createdAt)}</Text>
        </Box>
      </Box>

      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={0}
        backgroundColor="#121212"
        width="100%"
      >
        {renderedLines.length === 0 ? (
          <Box
            justifyContent="center"
            alignItems="center"
            flexGrow={1}
            width="100%"
          >
            <Text dimColor>No activity recorded</Text>
          </Box>
        ) : (
          <Box flexDirection="column" flexGrow={1} width="100%">
            {visibleLines.map((line, idx) => (
              <RenderedLine
                key={`${line.id}-${scrollOffset + idx}`}
                line={line}
              />
            ))}
          </Box>
        )}
      </Box>

      {inputMode ? (
        <Box
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
          width="100%"
        >
          <Text color="yellow">Message: </Text>
          <Text>{messageInput}</Text>
          <Text color="yellow">█</Text>
        </Box>
      ) : (
        <Box paddingX={1} justifyContent="space-between" width="100%">
          <Text dimColor>
            {["idle", "busy", "waiting_for_permission"].includes(session.status)
              ? 'Press "i" to chat, "a" to abort'
              : "Session is inactive"}
          </Text>
          <Text dimColor>
            {renderedLines.length > layout.dimensions.contentHeight - 8 &&
              `${scrollOffset + 1}-${scrollOffset + visibleLines.length} of ${renderedLines.length}`}
          </Text>
        </Box>
      )}
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Help View Component
// ---------------------------------------------------------------------------

const HelpView = React.memo(() => {
  return (
    <Box flexGrow={1} borderStyle="single" paddingX={2}>
      <Text>Help Content...</Text>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Main Content Component
// ---------------------------------------------------------------------------

function MainContent() {
  const currentView = useCurrentView();
  switch (currentView) {
    case "session":
      return <SessionView />;
    case "help":
      return <HelpView />;
    default:
      return <SessionList />;
  }
}

// ---------------------------------------------------------------------------
// Root App Component
// ---------------------------------------------------------------------------

function AppInner() {
  const { exit } = useApp();
  const { layout } = useLayout();

  useEffect(() => {
    const h = () => exit();
    process.on("SIGINT", h);
    process.on("SIGTERM", h);
    return () => {
      process.off("SIGINT", h);
      process.off("SIGTERM", h);
    };
  }, [exit]);

  // CRITICAL FIX: Ensure height is ALWAYS < terminal height to prevent Ink's full-screen clear trigger
  return (
    <Box
      flexDirection="column"
      width={layout.size.width}
      height={layout.size.height - 1}
      backgroundColor="#0d0d0d"
      padding={1}
    >
      <Header />
      <MainContent />
      <Footer />
    </Box>
  );
}

export function App() {
  return (
    <AppStateProvider>
      <LayoutProvider>
        <AppInner />
      </LayoutProvider>
    </AppStateProvider>
  );
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function getStatusColor(status: string): string {
  switch (status) {
    case "idle":
      return "green";
    case "busy":
      return "blue";
    case "waiting_for_permission":
      return "yellow";
    case "completed":
      return "gray";
    case "error":
    case "aborted":
      return "red";
    default:
      return "white";
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function main() {
  if (!process.stdin.isTTY) {
    console.error("Error: stdin is not a TTY.");
    process.exit(1);
  }
  process.stdout.write("\u001b[?1049h");
  const { waitUntilExit } = render(<App />, { incrementalRendering: true });
  try {
    await waitUntilExit();
  } finally {
    process.stdout.write("\u001b[?1049l");
  }
}
