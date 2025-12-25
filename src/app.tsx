// Main application component and layout for OpenCode Session Monitor

import React, { useEffect, useState, useMemo } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { Marked } from "marked";
// @ts-ignore
import { markedTerminal } from "marked-terminal";
import { AppStateProvider, useAppState } from "./state";
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
// Spinner Component
// ---------------------------------------------------------------------------

const LoadingSpinner = React.memo(({ isBusy }: { isBusy: boolean }) => {
  const [frame, setFrame] = useState(0);
  const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    if (!isBusy) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % 10), 100);
    return () => clearInterval(timer);
  }, [isBusy]);

  if (!isBusy) return null;
  return <Text color="yellow">{SPINNER_FRAMES[frame]} </Text>;
});

// ---------------------------------------------------------------------------
// Header Component
// ---------------------------------------------------------------------------

const Header = React.memo(() => {
  const { layout, truncateText } = useLayout();
  const { state } = useAppState();

  const serverCount = state.servers.size;
  const sessions = Array.from(state.sessions.values());
  const sessionCount = sessions.length;
  const activeSessions = sessions.filter(
    (s) => !["completed", "aborted", "error"].includes(s.status),
  );
  const activeCount = activeSessions.length;
  const isBusy = activeSessions.some((s) => s.status === "busy");

  // Available width inside root border and padding
  const availableWidth = layout.size.width - 4;

  return (
    <Box flexDirection="column" height={layout.dimensions.headerHeight}>
      <Box justifyContent="center" borderStyle="double" borderColor="blue">
        <Text bold color="blue" wrap="truncate-end">
          <LoadingSpinner isBusy={isBusy} />
          {truncateText("OpenCode Session Monitor", availableWidth)}
        </Text>
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            Servers: <Text color="green">{serverCount}</Text> | Sessions:{" "}
            <Text color="yellow">{sessionCount}</Text> | Active:{" "}
            <Text color="cyan">{activeCount}</Text>
          </Text>
        </Box>
        <Box flexShrink={0} paddingLeft={2}>
          <Text wrap="truncate-end">
            View: <Text color="magenta">{state.currentView}</Text> | Group:{" "}
            <Text color="gray">{state.groupBy}</Text> | Sort:{" "}
            <Text color="gray">{state.sortBy}</Text>
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
  const { state } = useAppState();

  const keyHelp =
    state.currentView === "list"
      ? "q:quit | ↑↓:navigate | enter:view | g:group | s:sort | f:filter | h:help"
      : state.currentView === "session"
        ? "q:quit | esc:back | i:input | a:abort | ↑↓:scroll | h:help"
        : "q:quit | esc:back";

  const availableWidth = layout.size.width - 4;

  return (
    <Box height={layout.dimensions.footerHeight} flexDirection="column">
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor wrap="truncate-end">
          {truncateText(keyHelp, availableWidth)}
        </Text>
      </Box>
      {state.error && (
        <Box backgroundColor="red" paddingX={1}>
          <Text color="white" bold>
            Error:{" "}
          </Text>
          <Text color="white" wrap="truncate-end">
            {truncateText(state.error.message, availableWidth - 8)}
          </Text>
        </Box>
      )}
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Session List Component
// ---------------------------------------------------------------------------

function SessionList() {
  const {
    state,
    selectSession,
    setView,
    setGroupBy,
    setSortBy,
    toggleShowOnlyActive,
    toggleGroupExpanded,
  } = useAppState();
  const { layout, truncateText } = useLayout();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Memoize grouped and sorted sessions
  const groups = useMemo(() => {
    const sessions = Array.from(state.sessions.values());
    const filtered = state.showOnlyActive
      ? sessions.filter(
          (s) => !["completed", "aborted", "error"].includes(s.status),
        )
      : sessions;

    const grouped = groupSessions(filtered, state.servers, state.groupBy);
    const sortedGroups = sortGroups(grouped, state.sortBy);

    return sortedGroups.map((g) => ({
      ...g,
      sessions: sortSessions(g.sessions, state.sortBy),
      isExpanded: !state.expandedGroups.has(g.id),
    }));
  }, [
    state.sessions,
    state.servers,
    state.groupBy,
    state.sortBy,
    state.showOnlyActive,
    state.expandedGroups,
  ]);

  // Flatten groups for navigation
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

  // Ensure selectedIndex is within bounds
  useEffect(() => {
    if (selectedIndex >= flatItems.length && flatItems.length > 0) {
      setSelectedIndex(flatItems.length - 1);
    }
  }, [flatItems.length, selectedIndex]);

  // Handle keyboard input
  useInput((input, key) => {
    if (state.currentView !== "list") return;

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
      const currentIndex = modes.indexOf(state.groupBy);
      setGroupBy(modes[(currentIndex + 1) % modes.length]);
    } else if (input === "s") {
      const modes: ("name" | "activity" | "created" | "cost")[] = [
        "name",
        "activity",
        "created",
        "cost",
      ];
      const currentIndex = modes.indexOf(state.sortBy);
      setSortBy(modes[(currentIndex + 1) % modes.length]);
    } else if (input === "f") {
      toggleShowOnlyActive();
    }
  });

  const contentHeight = layout.dimensions.contentHeight - 2;
  const visibleItems = flatItems.slice(0, contentHeight);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold>
          Sessions ({flatItems.filter((i) => i.type === "session").length})
        </Text>
      </Box>

      {flatItems.length === 0 ? (
        <Box justifyContent="center" alignItems="center" flexGrow={1}>
          <Text dimColor>No sessions found</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleItems.map((item, index) => {
            const isSelected = index === selectedIndex;

            if (item.type === "group") {
              const groupLabel = `${item.data.isExpanded ? "▼" : "▶"} ${item.data.name} (${item.data.sessions.length})`;
              const labelWidth = layout.size.width - 4; // root border + padding

              return (
                <Box
                  key={`group-${item.data.id}`}
                  backgroundColor={isSelected ? "#264f78" : "#222222"}
                  paddingX={1}
                >
                  <Text
                    bold
                    color={isSelected ? "white" : "#d4af37"}
                    wrap="truncate-end"
                  >
                    {truncateText(groupLabel, labelWidth)}
                  </Text>
                </Box>
              );
            }

            const session = item.data;
            const statusColor = getStatusColor(session.status);
            const server = state.servers.get(session.serverId);

            // Calculate available width for name
            const nameWidth = Math.max(10, layout.size.width - 23);

            return (
              <Box
                key={`session-${session.id}`}
                backgroundColor={isSelected ? "#264f78" : undefined}
                paddingLeft={2}
              >
                <Box width={3}>
                  <Text color={statusColor}>●</Text>
                </Box>
                <Box width={nameWidth}>
                  <Text
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
      )}

      {flatItems.length > contentHeight && (
        <Box justifyContent="center" paddingTop={1}>
          <Text dimColor>
            ... and {flatItems.length - contentHeight} more items
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Session View Component
// ---------------------------------------------------------------------------

function SessionView() {
  const { state, setView, sendMessage, abortSession } = useAppState();
  const { layout, truncateText } = useLayout();
  const [messageInput, setMessageInput] = useState("");
  const [inputMode, setInputMode] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const session = state.selectedSessionId
    ? state.sessions.get(state.selectedSessionId)
    : undefined;

  // Initialize marked once per width change
  const marked = useMemo(
    () => createMarkedRenderer(layout.size.width - 12),
    [layout.size.width],
  );

  // Rendered lines for scrolling
  const renderedLines = useMemo(() => {
    if (!session) return [];

    const lines: any[] = [];

    // Header line
    lines.push({
      type: "session-header",
      content: `Monitoring: ${session.name}`,
      id: "header",
    });
    lines.push({ type: "spacer", id: "s1" });

    for (const msg of session.messages) {
      const parts = msg.parts || [];

      if (
        msg.role === "assistant" &&
        parts.length === 0 &&
        (!msg.content || msg.content.trim() === "")
      ) {
        continue;
      }

      const role = msg.role === "user" ? "User" : "Assistant";
      const cost = msg.metadata?.cost
        ? ` $${msg.metadata.cost.toFixed(4)}`
        : "";

      lines.push({
        type: "msg-header",
        content: `┌─ ${role}${cost}`,
        role: msg.role,
        id: msg.id,
      });

      let needsSpacer = false;

      if (parts.length === 0 && msg.content) {
        const rendered = String(marked.parse(String(msg.content)));
        const split = rendered.trim().split("\n");
        for (let j = 0; j < split.length; j++) {
          lines.push({
            type: "msg-body",
            content: split[j],
            id: `${msg.id}-c-${j}`,
          });
        }
        needsSpacer = true;
      }

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const partKey = `${msg.id}-p${i}`;

        if (needsSpacer) {
          lines.push({
            type: "msg-body",
            content: "",
            id: `${partKey}-spacer`,
          });
        }
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
          const split = rendered.trim().split("\n");
          for (let j = 0; j < split.length; j++) {
            lines.push({
              type: "msg-body",
              content: split[j],
              id: `${partKey}-${j}`,
            });
          }
        } else if (part.type === "tool" || part.type === "call") {
          const name = part.tool || part.toolName || "unknown";
          const state = part.state || { status: "pending" };
          const status = state.status || "pending";
          const icon =
            status === "completed" ? "✓" : status === "error" ? "✗" : "○";

          lines.push({
            type: "msg-tool-start",
            content: `┌─ ${icon} ${state.title || name}`,
            id: `${partKey}-start`,
          });

          const args = formatToolArgs(state.input || part.toolArgs);
          if (args) {
            for (const w of wrapText(args, layout.size.width - 14)) {
              lines.push({
                type: "msg-tool-body",
                content: w,
                id: `${partKey}-arg`,
              });
            }
          }

          if (status === "completed" && state.output) {
            const outLines = String(state.output).split("\n");
            for (let j = 0; j < Math.min(10, outLines.length); j++) {
              for (const w of wrapText(outLines[j], layout.size.width - 14)) {
                lines.push({
                  type: "msg-tool-body",
                  content: w,
                  id: `${partKey}-out-${j}`,
                });
              }
            }
            if (outLines.length > 10) {
              lines.push({
                type: "msg-tool-body",
                content: "...",
                id: `${partKey}-more`,
              });
            }
          }
          lines.push({
            type: "msg-tool-end",
            content: `└${"─".repeat(Math.min(30, layout.size.width - 14))}`,
            id: `${partKey}-end`,
          });
        } else if (part.type === "reasoning") {
          lines.push({
            type: "msg-reasoning-start",
            content: `┌─ Thinking...`,
            id: `${partKey}-start`,
          });
          const text = part.reasoning || part.text || "";
          const rendered = String(marked.parse(text));
          const split = rendered.trim().split("\n");
          for (let j = 0; j < split.length; j++) {
            lines.push({
              type: "msg-reasoning-body",
              content: split[j],
              id: `${partKey}-${j}`,
            });
          }
          lines.push({
            type: "msg-reasoning-end",
            content: `└${"─".repeat(Math.min(30, layout.size.width - 14))}`,
            id: `${partKey}-end`,
          });
        } else if (part.type === "step-start") {
          lines.push({
            type: "msg-tool-start",
            content: `┌─ STEP STARTED`,
            id: `${partKey}-start`,
          });
          lines.push({
            type: "msg-tool-end",
            content: `└${"─".repeat(30)}`,
            id: `${partKey}-end`,
          });
        } else if (part.type === "step-finish") {
          lines.push({
            type: "msg-tool-start",
            content: `┌─ STEP FINISHED`,
            id: `${partKey}-start`,
          });
          if ((part as any).reason) {
            lines.push({
              type: "msg-tool-body",
              content: `Reason: ${(part as any).reason}`,
              id: `${partKey}-reason`,
            });
          }
          const costVal = (part as any).cost || (part as any).tokens?.cost;
          if (costVal) {
            lines.push({
              type: "msg-tool-body",
              content: `Cost: $${Number(costVal).toFixed(4)}`,
              id: `${partKey}-cost`,
            });
          }
          lines.push({
            type: "msg-tool-end",
            content: `└${"─".repeat(30)}`,
            id: `${partKey}-end`,
          });
        } else if (part.type === "patch") {
          const hash = (part as any).hash || "unknown";
          const files = (part as any).files || [];
          lines.push({
            type: "msg-tool-start",
            content: `┌─ PATCH [${hash.slice(0, 8)}]`,
            id: `${partKey}-start`,
          });
          lines.push({
            type: "msg-tool-body",
            content: `${files.length} file(s) modified:`,
            id: `${partKey}-files`,
          });
          for (let j = 0; j < Math.min(5, files.length); j++) {
            lines.push({
              type: "msg-tool-body",
              content: `  • ${files[j]}`,
              id: `${partKey}-f-${j}`,
            });
          }
          if (files.length > 5) {
            lines.push({
              type: "msg-tool-body",
              content: `  ... and ${files.length - 5} more`,
              id: `${partKey}-more`,
            });
          }
          lines.push({
            type: "msg-tool-end",
            content: `└${"─".repeat(30)}`,
            id: `${partKey}-end`,
          });
        } else if (part.type === "agent" || part.type === "subtask") {
          const name = (part as any).name || (part as any).agent || "unknown";
          const desc = (part as any).description || (part as any).prompt || "";
          lines.push({
            type: "msg-tool-start",
            content: `┌─ AGENT: ${name.toUpperCase()}`,
            id: `${partKey}-start`,
          });
          if (desc) {
            const rendered = String(marked.parse(desc));
            const split = rendered.trim().split("\n");
            for (let j = 0; j < split.length; j++) {
              lines.push({
                type: "msg-tool-body",
                content: split[j],
                id: `${partKey}-${j}`,
              });
            }
          }
          lines.push({
            type: "msg-tool-end",
            content: `└${"─".repeat(30)}`,
            id: `${partKey}-end`,
          });
        } else {
          const typeLabel = part.type.toUpperCase();
          lines.push({
            type: "msg-tool-start",
            content: `┌─ ${typeLabel}`,
            id: `${partKey}-start`,
          });

          const content =
            part.content ||
            part.text ||
            (part as any).prompt ||
            (part as any).description ||
            JSON.stringify(part, null, 2);

          const split = String(content).split("\n");
          for (let j = 0; j < split.length; j++) {
            for (const w of wrapText(split[j], layout.size.width - 14)) {
              lines.push({
                type: "msg-tool-body",
                content: w,
                id: `${partKey}-${j}`,
              });
            }
          }
          lines.push({
            type: "msg-tool-end",
            content: `└${"─".repeat(Math.min(30, layout.size.width - 14))}`,
            id: `${partKey}-end`,
          });
        }
      }

      lines.push({
        type: "msg-footer",
        content: `└${"─".repeat(Math.min(40, layout.size.width - 10))}`,
        id: `${msg.id}-footer`,
      });
      lines.push({ type: "spacer", id: `${msg.id}-spacer` });
    }

    return lines;
  }, [session, layout.size.width, marked]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && renderedLines.length > 0) {
      const maxLines = layout.dimensions.contentHeight - 8;
      setScrollOffset(Math.max(0, renderedLines.length - maxLines));
    }
  }, [renderedLines.length, autoScroll, layout.dimensions.contentHeight]);

  // Handle keyboard input
  useInput((input, key) => {
    if (state.currentView !== "session") return;

    if (key.escape) {
      if (inputMode) {
        setInputMode(false);
        setMessageInput("");
      } else {
        setView("list");
      }
    } else if (input === "i" && !inputMode && session) {
      if (["idle", "busy", "waiting_for_permission"].includes(session.status)) {
        setInputMode(true);
      }
    } else if (input === "a" && !inputMode && session) {
      abortSession(session.id);
    } else if (key.return && inputMode) {
      if (messageInput.trim() && session) {
        sendMessage(session.id, messageInput.trim());
      }
      setMessageInput("");
      setInputMode(false);
    } else if (inputMode) {
      if (key.backspace) {
        setMessageInput(messageInput.slice(0, -1));
      } else if (key.ctrl && input === "c") {
        setInputMode(false);
        setMessageInput("");
      } else if (input && input.length === 1) {
        setMessageInput(messageInput + input);
      }
    } else if (!inputMode) {
      const maxLines = layout.dimensions.contentHeight - 8;
      const maxScroll = Math.max(0, renderedLines.length - maxLines);

      if (key.upArrow || input === "k") {
        setScrollOffset(Math.max(0, scrollOffset - 1));
        setAutoScroll(false);
      } else if (key.downArrow || input === "j") {
        const newOffset = Math.min(maxScroll, scrollOffset + 1);
        setScrollOffset(newOffset);
        setAutoScroll(newOffset === maxScroll);
      } else if (key.pageUp) {
        setScrollOffset(Math.max(0, scrollOffset - 10));
        setAutoScroll(false);
      } else if (key.pageDown) {
        const newOffset = Math.min(maxScroll, scrollOffset + 10);
        setScrollOffset(newOffset);
        setAutoScroll(newOffset === maxScroll);
      } else if (input === "g") {
        setScrollOffset(0);
        setAutoScroll(false);
      } else if (input === "G") {
        setScrollOffset(maxScroll);
        setAutoScroll(true);
      }
    }
  });

  if (!session) {
    return (
      <Box justifyContent="center" alignItems="center" flexGrow={1}>
        <Text color="red">Session not found</Text>
      </Box>
    );
  }

  const server = state.servers.get(session.serverId);
  const maxLines = layout.dimensions.contentHeight - 8;
  const visibleLines = renderedLines.slice(
    scrollOffset,
    scrollOffset + maxLines,
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold>
          {truncateText(session.name, layout.dimensions.contentWidth - 30)}
        </Text>
        <Text dimColor> - {server?.name || session.serverId}</Text>
      </Box>

      <Box paddingX={1} flexDirection="row" justifyContent="space-between">
        <Box flexDirection="column">
          <Text>
            Status:{" "}
            <Text color={getStatusColor(session.status)}>{session.status}</Text>
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
        backgroundColor="#121212"
      >
        {renderedLines.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <Text dimColor>No activity recorded</Text>
          </Box>
        ) : (
          <Box flexDirection="column" flexGrow={1}>
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
        <Box borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text color="yellow">Message: </Text>
          <Text>{messageInput}</Text>
          <Text color="yellow">█</Text>
        </Box>
      ) : (
        <Box paddingX={1} justifyContent="space-between">
          <Text dimColor>
            {["idle", "busy", "waiting_for_permission"].includes(session.status)
              ? 'Press "i" to chat, "a" to abort'
              : "Session is inactive"}
          </Text>
          <Text dimColor>
            {renderedLines.length > maxLines &&
              `${scrollOffset + 1}-${scrollOffset + visibleLines.length} of ${renderedLines.length}`}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Rendered Line Component
// ---------------------------------------------------------------------------

const RenderedLine = React.memo(({ line }: { line: any }) => {
  const { layout } = useLayout();
  const availableWidth = layout.size.width - 6;

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
        <Box width={availableWidth} backgroundColor="#161616">
          <Text color="#e0e0e0">{line.content === "" ? "│" : "│ "}</Text>
          <Box flexGrow={1}>
            <Text>{line.content}</Text>
          </Box>
        </Box>
      );
    case "msg-tool-start":
      return (
        <Box width={availableWidth} backgroundColor="#161616">
          <Text color="#d4af37">│ {line.content}</Text>
        </Box>
      );
    case "msg-tool-body":
      return (
        <Box width={availableWidth} backgroundColor="#1a1a1a">
          <Text color="#aaaaaa">│ │ {line.content}</Text>
        </Box>
      );
    case "msg-tool-end":
      return (
        <Box width={availableWidth} backgroundColor="#161616">
          <Text color="#d4af37">│ {line.content}</Text>
        </Box>
      );
    case "msg-reasoning-start":
      return (
        <Box width={availableWidth} backgroundColor="#161616">
          <Text color="#8b008b">│ {line.content}</Text>
        </Box>
      );
    case "msg-reasoning-body":
      return (
        <Box width={availableWidth} backgroundColor="#121212">
          <Text italic color="#777777">
            │ │ {line.content}
          </Text>
        </Box>
      );
    case "msg-reasoning-end":
      return (
        <Box width={availableWidth} backgroundColor="#161616">
          <Text color="#8b008b">│ {line.content}</Text>
        </Box>
      );
    case "msg-footer":
      return (
        <Box width={availableWidth} backgroundColor="#161616">
          <Text color="#444444">{line.content}</Text>
        </Box>
      );
    case "spacer":
      return (
        <Box height={1}>
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
// Help View Component
// ---------------------------------------------------------------------------

const HelpView = React.memo(() => {
  const helpText = [
    "OpenCode Session Monitor - Help",
    "",
    "Navigation:",
    "  ↑/↓, jk   - Navigate list items",
    "  Enter     - Select/Expand item",
    "  Esc       - Go back",
    "  q         - Quit application",
    "",
    "List View:",
    "  g - Toggle grouping (None / Project / Server)",
    "  s - Toggle sorting (Name / Activity / Created / Cost)",
    "  f - Toggle showing only active sessions",
    "",
    "Session View:",
    "  i - Enter input mode (chat with session)",
    "  a - Abort active session",
    "  ↑/↓, jk   - Scroll message history",
    "  g / G     - Scroll to top / bottom",
    "",
    "Status Indicators:",
    "  ● Green  - Idle",
    "  ● Blue   - Busy",
    "  ● Yellow - Waiting for permission",
    "  ● Gray   - Completed",
    "  ● Red    - Error/Aborted",
  ];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold>Help</Text>
      </Box>
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        {helpText.map((line, index) => (
          <Text key={index} dimColor={line === ""}>
            {line || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Main Content Component
// ---------------------------------------------------------------------------

function MainContent() {
  const { state, setView } = useAppState();

  useInput((input) => {
    if (input === "q") {
      process.exit(0);
    } else if (input === "h") {
      setView("help");
    }
  });

  return (
    <Box flexGrow={1} flexDirection="column">
      {state.currentView === "session" ? (
        <SessionView />
      ) : state.currentView === "help" ? (
        <HelpView />
      ) : (
        <SessionList />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Root App Component
// ---------------------------------------------------------------------------

function AppInner() {
  const { exit } = useApp();
  const { layout } = useLayout();

  // Handle process signals
  useEffect(() => {
    const handleSignal = () => exit();
    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);
    return () => {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    };
  }, [exit]);

  return (
    <Box
      flexDirection="column"
      width={layout.size.width}
      height={layout.size.height}
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

function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return [""];
  if (maxWidth <= 0) return [text];

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > maxWidth) {
    let breakPoint = remaining.lastIndexOf(" ", maxWidth);
    if (breakPoint <= 0) breakPoint = maxWidth;
    lines.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  if (remaining) lines.push(remaining);
  return lines.length > 0 ? lines : [""];
}

function formatToolArgs(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    let valueStr = typeof value === "object" ? "[object]" : String(value);
    if (valueStr.length > 50) valueStr = valueStr.slice(0, 47) + "...";
    parts.push(`${key}: ${valueStr}`);
  }
  return parts.join(", ");
}

export default async function main() {
  if (!process.stdin.isTTY) {
    console.error("Error: stdin is not a TTY. Run in an interactive terminal.");
    process.exit(1);
  }

  // Enter alternate screen buffer
  process.stdout.write("\u001b[?1049h");

  const { waitUntilExit } = render(<App />);

  try {
    await waitUntilExit();
  } finally {
    // Exit alternate screen buffer
    process.stdout.write("\u001b[?1049l");
  }
}
