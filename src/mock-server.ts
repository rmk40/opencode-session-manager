// Mock OpenCode simulator for testing and debugging

import { EventEmitter } from "node:events";
import { createServer, Server as HTTPServer } from "node:http";
import { createSocket, Socket } from "node:dgram";
import {
  Session,
  SessionStatus,
  Message,
  MessageType,
  AnnouncePacket,
  ShutdownPacket,
} from "./types";
import { getConfig } from "./config";

// ---------------------------------------------------------------------------
// Mock Session Generator
// ---------------------------------------------------------------------------

export class MockSessionGenerator {
  private sessionCounter = 0;
  private messageCounter = 0;

  generateSession(
    serverId: string,
    serverUrl: string,
    overrides?: Partial<Session>,
  ): Session {
    const sessionId = `mock-session-${++this.sessionCounter}`;
    const now = Date.now();
    const createdAt = now - Math.random() * 3600000; // Random time in last hour
    const lastActivity = createdAt + Math.random() * (now - createdAt); // Between createdAt and now

    return {
      id: sessionId,
      serverId,
      serverUrl,
      name: `Mock Session ${this.sessionCounter}`,
      status: "idle" as SessionStatus,
      createdAt,
      lastActivity,
      isLongRunning: Math.random() > 0.7, // 30% chance of being long-running
      parentId: undefined,
      childIds: [],
      project:
        Math.random() > 0.5
          ? `project-${Math.floor(Math.random() * 5) + 1}`
          : undefined,
      branch:
        Math.random() > 0.5
          ? `feature-branch-${Math.floor(Math.random() * 10) + 1}`
          : "main",
      cost: Math.random() * 10,
      tokens: Math.floor(Math.random() * 100000),
      messages: [],
      ...overrides,
    };
  }

  generateMessage(sessionId: string, overrides?: Partial<Message>): Message {
    const messageId = `mock-message-${++this.messageCounter}`;
    const roles: Array<"user" | "assistant" | "system"> = [
      "user",
      "assistant",
      "system",
    ];
    const role = roles[Math.floor(Math.random() * roles.length)];
    const types: MessageType[] = [
      "user_input",
      "assistant_response",
      "tool_execution",
      "system_message",
    ];
    const now = Date.now();

    return {
      id: messageId,
      sessionId,
      timestamp: now - Math.random() * 60000, // Random time in last minute, but ensure it's in the past
      role,
      type: types[Math.floor(Math.random() * types.length)],
      content: `Mock message content ${this.messageCounter}`,
      metadata: {
        cost: Math.random() * 0.1,
        tokens: Math.floor(Math.random() * 1000),
      },
      ...overrides,
    };
  }

  generatePermissionRequest(sessionId: string): Message {
    return this.generateMessage(sessionId, {
      type: "permission_request",
      content: "Permission required to execute file system operation",
      metadata: {
        toolName: "file_write",
        toolArgs: { path: "/tmp/test.txt", content: "test data" },
        permissionType: "file_system",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Mock OpenCode Server
// ---------------------------------------------------------------------------

export class MockOpenCodeServer extends EventEmitter {
  private httpServer?: HTTPServer;
  private udpSocket?: Socket;
  private sessions = new Map<string, Session>();
  private generator = new MockSessionGenerator();
  private config = getConfig();
  private serverId: string;
  private serverName: string;
  private port: number;
  private isRunning = false;
  private announceTimer?: NodeJS.Timeout;
  private sessionUpdateTimer?: NodeJS.Timeout;

  constructor(serverId?: string, serverName?: string, port?: number) {
    super();
    this.serverId = serverId || `mock-server-${Date.now()}`;
    this.serverName = serverName || `Mock OpenCode Server`;
    this.port = port || 8080 + Math.floor(Math.random() * 1000);
  }

  /**
   * Start the mock server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Server is already running");
    }

    // Create HTTP server
    this.httpServer = createServer((req, res) => {
      this.handleHTTPRequest(req, res);
    });

    // Create UDP socket for announcements
    this.udpSocket = createSocket("udp4");

    // Start HTTP server
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.port, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Generate initial sessions
    this.generateInitialSessions();

    // Start UDP announcements
    this.startAnnouncements();

    // Start session updates
    this.startSessionUpdates();

    this.isRunning = true;
    this.emit("started", { serverId: this.serverId, port: this.port });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Send shutdown announcement
    await this.sendShutdownAnnouncement();

    // Stop timers
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = undefined;
    }

    if (this.sessionUpdateTimer) {
      clearInterval(this.sessionUpdateTimer);
      this.sessionUpdateTimer = undefined;
    }

    // Close servers
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = undefined;
    }

    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = undefined;
    }

    this.isRunning = false;
    this.emit("stopped", { serverId: this.serverId });
  }

  /**
   * Add a session to the mock server
   */
  addSession(session?: Partial<Session>): Session {
    const newSession = this.generator.generateSession(
      this.serverId,
      `http://localhost:${this.port}`,
      session,
    );

    this.sessions.set(newSession.id, newSession);
    this.emit("session_added", newSession);
    return newSession;
  }

  /**
   * Update a session
   */
  updateSession(
    sessionId: string,
    updates: Partial<Session>,
  ): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const updatedSession = { ...session, ...updates, lastActivity: Date.now() };
    this.sessions.set(sessionId, updatedSession);
    this.emit("session_updated", updatedSession);
    return updatedSession;
  }

  /**
   * Add a message to a session
   */
  addMessage(
    sessionId: string,
    message?: Partial<Message>,
  ): Message | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const newMessage = this.generator.generateMessage(sessionId, message);
    session.messages.push(newMessage);
    session.lastActivity = Date.now();

    this.sessions.set(sessionId, session);
    this.emit("message_added", { sessionId, message: newMessage });
    return newMessage;
  }

  /**
   * Simulate a permission request
   */
  requestPermission(sessionId: string): Message | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const permissionMessage =
      this.generator.generatePermissionRequest(sessionId);
    session.messages.push(permissionMessage);
    session.status = "waiting_for_permission";
    session.lastActivity = Date.now();

    this.sessions.set(sessionId, session);
    this.emit("permission_requested", {
      sessionId,
      message: permissionMessage,
    });
    return permissionMessage;
  }

  /**
   * Get server info
   */
  getServerInfo() {
    return {
      serverId: this.serverId,
      serverName: this.serverName,
      port: this.port,
      url: `http://localhost:${this.port}`,
      isRunning: this.isRunning,
      sessionCount: this.sessions.size,
    };
  }

  /**
   * Handle HTTP requests
   */
  private handleHTTPRequest(req: any, res: any): void {
    const url = new URL(req.url, `http://localhost:${this.port}`);

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Normalize pathname
    const pathname = url.pathname.replace(/\/+/g, "/");

    if (this.config.debug) {
      console.log(
        `Mock server ${this.serverId} received ${req.method} ${pathname}`,
      );
    }

    try {
      if (pathname === "/session/status" && req.method === "GET") {
        this.handleStatusRequest(res);
      } else if (pathname === "/session" && req.method === "GET") {
        this.handleListSessionsRequest(res);
      } else if (pathname.startsWith("/session/") && req.method === "GET") {
        const parts = pathname.split("/");
        if (parts.length === 3) {
          this.handleSessionDetailsRequest(parts[2], res);
        } else if (parts.length === 4 && parts[3] === "message") {
          this.handleSessionMessagesRequest(parts[2], res);
        }
      } else if (
        pathname.startsWith("/session/") &&
        pathname.endsWith("/message") &&
        req.method === "POST"
      ) {
        const sessionId = pathname.split("/")[2];
        this.handleSendMessageRequest(sessionId, req, res);
      } else if (
        pathname.startsWith("/session/") &&
        pathname.endsWith("/abort") &&
        req.method === "POST"
      ) {
        const sessionId = pathname.split("/")[2];
        this.handleAbortSessionRequest(sessionId, res);
      } else if (pathname === "/api/events" && req.method === "GET") {
        this.handleSSERequest(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }

  /**
   * Handle status request - returns map of busy/retry sessions
   */
  private handleStatusRequest(res: any): void {
    const statusMap: Record<string, any> = {};

    for (const [id, session] of this.sessions.entries()) {
      if (session.status !== "idle") {
        statusMap[id] = {
          type:
            session.status === "busy"
              ? "busy"
              : session.status === "waiting_for_permission"
                ? "retry"
                : session.status,
          name: session.name,
          created_at: new Date(session.createdAt).toISOString(),
          last_activity: new Date(session.lastActivity).toISOString(),
        };
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(statusMap));
  }

  /**
   * Handle list sessions request
   */
  private handleListSessionsRequest(res: any): void {
    const sessions = Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      title: session.name,
      projectID: session.project || "unknown",
      directory: "/mock/path",
      version: "1.0.0",
      time: {
        created: session.createdAt,
        updated: session.lastActivity,
      },
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sessions));
  }

  /**
   * Handle session messages request
   */
  private handleSessionMessagesRequest(sessionId: string, res: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    const messages = session.messages.map((msg) => ({
      info: {
        id: msg.id,
        sessionID: sessionId,
        role: msg.type === "user_input" ? "user" : "assistant",
        time: { created: msg.timestamp },
      },
      parts: [{ type: "text", text: msg.content }],
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(messages));
  }

  /**
   * Handle session details request
   */
  private handleSessionDetailsRequest(sessionId: string, res: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    const response = {
      id: session.id,
      name: session.name,
      status: session.status,
      created_at: new Date(session.createdAt).toISOString(),
      last_activity: new Date(session.lastActivity).toISOString(),
      project: session.project,
      branch: session.branch,
      cost: session.cost,
      tokens: session.tokens,
      parent_id: session.parentId,
      child_ids: session.childIds,
      messages: session.messages.map((msg) => ({
        id: msg.id,
        type: msg.type,
        content: msg.content,
        timestamp: new Date(msg.timestamp).toISOString(),
        metadata: msg.metadata,
      })),
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }

  /**
   * Handle send message request
   */
  private handleSendMessageRequest(
    sessionId: string,
    req: any,
    res: any,
  ): void {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const { content, type } = JSON.parse(body);

        const message = this.addMessage(sessionId, {
          type: type || "user_input",
          content,
        });

        if (!message) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }

        // Simulate processing delay and response
        setTimeout(
          () => {
            this.addMessage(sessionId, {
              type: "assistant_response",
              content: `Mock response to: ${content}`,
            });
          },
          1000 + Math.random() * 2000,
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message_id: message.id }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  }

  /**
   * Handle abort session request
   */
  private handleAbortSessionRequest(sessionId: string, res: any): void {
    const session = this.updateSession(sessionId, { status: "aborted" });

    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  }

  /**
   * Handle Server-Sent Events request
   */
  private handleSSERequest(req: any, res: any): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connection event
    res.write(
      `data: ${JSON.stringify({ type: "connected", server_id: this.serverId })}\n\n`,
    );

    // Set up event listeners
    const onSessionUpdated = (session: Session) => {
      const event = {
        type: "session_update",
        session_id: session.id,
        status: session.status,
        last_activity: session.lastActivity,
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const onMessageAdded = ({
      sessionId,
      message,
    }: {
      sessionId: string;
      message: Message;
    }) => {
      const event = {
        type: "message",
        session_id: sessionId,
        message: {
          id: message.id,
          type: message.type,
          content: message.content,
          timestamp: message.timestamp,
          metadata: message.metadata,
        },
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const onPermissionRequested = ({
      sessionId,
      message,
    }: {
      sessionId: string;
      message: Message;
    }) => {
      const event = {
        type: "permission_request",
        session_id: sessionId,
        permission_id: message.id,
        tool_name: message.metadata?.toolName || "unknown",
        tool_args: message.metadata?.toolArgs || {},
        description: message.content,
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    this.on("session_updated", onSessionUpdated);
    this.on("message_added", onMessageAdded);
    this.on("permission_requested", onPermissionRequested);

    // Clean up on connection close
    req.on("close", () => {
      this.off("session_updated", onSessionUpdated);
      this.off("message_added", onMessageAdded);
      this.off("permission_requested", onPermissionRequested);
    });
  }

  /**
   * Generate initial sessions for testing
   */
  private generateInitialSessions(): void {
    const sessionCount = 3 + Math.floor(Math.random() * 5); // 3-7 sessions

    for (let i = 0; i < sessionCount; i++) {
      const session = this.addSession();

      // Add some messages to each session
      const messageCount = Math.floor(Math.random() * 10);
      for (let j = 0; j < messageCount; j++) {
        this.addMessage(session.id);
      }

      // Randomly add permission requests
      if (Math.random() > 0.7) {
        this.requestPermission(session.id);
      }
    }
  }

  /**
   * Start UDP announcements
   */
  private startAnnouncements(): void {
    const announce = () => {
      const packet: AnnouncePacket = {
        type: "announce",
        serverId: this.serverId,
        serverUrl: `http://localhost:${this.port}`,
        serverName: this.serverName,
        version: "1.0.0-mock",
        timestamp: Date.now(),
      };

      const message = JSON.stringify(packet);
      this.udpSocket!.send(message, this.config.port, "localhost", (err) => {
        if (err) {
          this.emit("error", err);
        }
      });
    };

    // Send initial announcement
    announce();

    // Set up periodic announcements
    this.announceTimer = setInterval(announce, 2000); // Every 2 seconds
  }

  /**
   * Send shutdown announcement
   */
  private async sendShutdownAnnouncement(): Promise<void> {
    if (!this.udpSocket) return;

    const packet: ShutdownPacket = {
      type: "shutdown",
      serverId: this.serverId,
      timestamp: Date.now(),
    };

    const message = JSON.stringify(packet);

    return new Promise<void>((resolve) => {
      this.udpSocket!.send(message, this.config.port, "localhost", () => {
        resolve();
      });
    });
  }

  /**
   * Start periodic session updates
   */
  private startSessionUpdates(): void {
    this.sessionUpdateTimer = setInterval(() => {
      // Randomly update session statuses
      const sessions = Array.from(this.sessions.values());
      if (sessions.length === 0) return;

      const session = sessions[Math.floor(Math.random() * sessions.length)];

      // Randomly change status or add messages
      if (Math.random() > 0.7) {
        const statuses: SessionStatus[] = ["idle", "busy", "completed"];
        const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
        this.updateSession(session.id, { status: newStatus });
      } else if (Math.random() > 0.8) {
        this.addMessage(session.id);
      }
    }, 10000); // Every 10 seconds
  }
}

// ---------------------------------------------------------------------------
// Mock Server Manager
// ---------------------------------------------------------------------------

export class MockServerManager {
  private servers = new Map<string, MockOpenCodeServer>();

  /**
   * Create and start a mock server
   */
  async createServer(
    serverId?: string,
    serverName?: string,
    port?: number,
  ): Promise<MockOpenCodeServer> {
    const server = new MockOpenCodeServer(serverId, serverName, port);
    await server.start();

    this.servers.set(server.getServerInfo().serverId, server);
    return server;
  }

  /**
   * Stop and remove a server
   */
  async removeServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (server) {
      await server.stop();
      this.servers.delete(serverId);
    }
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.servers.values()).map((server) =>
      server.stop(),
    );
    await Promise.all(stopPromises);
    this.servers.clear();
  }

  /**
   * Get all servers
   */
  getServers(): MockOpenCodeServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get server by ID
   */
  getServer(serverId: string): MockOpenCodeServer | undefined {
    return this.servers.get(serverId);
  }
}

// ---------------------------------------------------------------------------
// Global Mock Server Manager
// ---------------------------------------------------------------------------

export const mockServerManager = new MockServerManager();
