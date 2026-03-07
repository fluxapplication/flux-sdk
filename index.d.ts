/**
 * Flux Extension SDK
 * 
 * Unified context for building Flux extensions.
 * Works in both backend and frontend.
 * 
 * Import: `import type { ExtensionContext, ExtensionDefinition } from "flux-sdk"`
 */

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

export type ExtensionPermission =
  | "messages.read"
  | "messages.write"
  | "ui.render"
  | "storage.read"
  | "storage.write"
  | "scheduler"
  | "ai.access"
  | "webhooks";

// ─── Core Types ─────────────────────────────────────────────────────────────

export interface MessageEvent {
  id: string;
  channelId: string;
  workspaceId: string;
  content: string;
  userId: string;
  mentionIds: string[];
}

export type MessageHandler = (event: MessageEvent) => Promise<void> | void;

export interface WebhookEvent {
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void> | void;

export interface WorkspaceUser {
  id: string;
  name: string;
  avatarUrl?: string;
  role: WorkspaceRole;
}

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; name: string };
}

export interface ChannelMessage {
  id: string;
  content: string;
  userId: string;
  mentionIds: string[];
  createdAt: Date;
  user: { id: string; name: string };
  reactions: Reaction[];
}

export interface Channel {
  id: string;
  name: string;
}

// ─── Core APIs ────────────────────────────────────────────────────────────

export interface StorageAPI {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
}

export interface AiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  apiKey: string;
  provider?: "openai" | "openrouter";
}

export interface AiAPI {
  complete(messages: AiMessage[], options: AiOptions): Promise<string>;
}

export interface UsersAPI {
  list(): Promise<WorkspaceUser[]>;
  get(userId: string): Promise<WorkspaceUser | null>;
  getRole(userId: string): Promise<WorkspaceRole | null>;
  getCurrentUserRole(): Promise<WorkspaceRole>;
}

export interface MessagesAPI {
  sendMessage(channelId: string, content: string): Promise<void>;
  sendDirectMessage(userId: string, content: string): Promise<void>;
  getMessages(channelId: string, limit?: number): Promise<ChannelMessage[]>;
  addReaction(messageId: string, emoji: string): Promise<{ reaction: Reaction } | { removed: boolean }>;
  getReactions(messageId: string): Promise<Reaction[]>;
}

// ─── Backend Context ────────────────────────────────────────────────────────

export interface BackendContext {
  /** Listen to messages in the workspace. */
  onMessage(handler: MessageHandler): void;
  /** Register webhook handler. */
  onWebhook(handler: WebhookHandler): void;
  /** Schedule recurring tasks. */
  schedule(jobKey: string, cron: string, handler: () => Promise<void>): void;
  /** Cancel scheduled task. */
  cancelSchedule(jobKey: string): void;
}

// ─── Frontend Context ─────────────────────────────────────────────────────

export interface FrontendContext {
  /** All channels in the workspace. */
  channels: ReadonlyArray<Channel>;
  /** API server URL. */
  serverUrl: string;
  /** Resolve user ID to display name. */
  getUserNameById(userId: string): Promise<string | null>;
}

// ─── Unified Context ─────────────────────────────────────────────────────

export interface ExtensionContext {
  /** The workspace this extension is running in. */
  workspaceId: string;
  /** The current user interacting with the extension. */
  currentUserId: string;

  // Core APIs - work in both backend and frontend
  storage: StorageAPI;
  ai: AiAPI;
  users: UsersAPI;
  messages: MessagesAPI;

  // Backend-only (undefined in frontend)
  backend?: BackendContext;

  // Frontend-only (undefined in backend)
  frontend?: FrontendContext;
}

// ─── Extension Definition ─────────────────────────────────────────────────

export interface ExtensionDefinition {
  onLoad?(ctx: ExtensionContext): void | Promise<void>;
  onUnload?(): void;
}

export interface ExtensionManifest {
  slug: string;
  name: string;
  version: string;
  description?: string;
  permissions: ExtensionPermission[];
  backend: string;
  frontend?: string;
}

// ─── Component Props ───────────────────────────────────────────────────────

export interface ExtensionPanelProps {
  ctx: ExtensionContext;
}

export interface MessageRendererProps {
  message: { id: string; content: string };
  ctx: ExtensionContext;
  currentUserId: string;
}

export interface RendererEntry {
  slug: string;
  match: (content: string) => boolean;
  component: (props: MessageRendererProps) => unknown;
}
