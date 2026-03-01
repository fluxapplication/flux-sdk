/**
 * Flux Extension SDK
 *
 * This is the ONLY public API surface available to extensions.
 * Extensions MUST NOT import anything from backend/src or frontend/src.
 * All platform capabilities are accessed through the ctx object passed to onLoad().
 */

// ─── Permissions ─────────────────────────────────────────────────────────────

export type ExtensionPermission =
  | "messages.read"
  | "messages.write"
  | "ui.render"
  | "storage.read"
  | "storage.write"
  | "scheduler"
  | "ai.access"
  | "webhooks";

// ─── Events ──────────────────────────────────────────────────────────────────

export interface MessageEvent {
  id: string;
  channelId: string;
  workspaceId: string;
  content: string;
  userId: string;
  /** User IDs mentioned in the message via @mention (<@userId>) */
  mentionIds: string[];
}

export type MessageHandler = (event: MessageEvent) => Promise<void>;

// ─── Webhook ──────────────────────────────────────────────────────────────────

export interface WebhookEvent {
  /**
   * Incoming request headers, all keys lowercased.
   * Example: event.headers["x-github-event"], event.headers["x-hub-signature-256"]
   */
  headers: Record<string, string>;
  /** Parsed JSON payload. Cast to the expected shape per event type. */
  body: unknown;
  /**
   * Raw UTF-8 request body string.
   * Use for HMAC-SHA256 signature verification before trusting `body`.
   */
  rawBody: string;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void> | void;

// ─── API surfaces ─────────────────────────────────────────────────────────────

export interface StorageAPI {
  /** Retrieve a value by key. Returns null if not found. Requires storage.read. */
  get<T = unknown>(key: string): Promise<T | null>;
  /** Store a value by key. Requires storage.write. */
  set(key: string, value: unknown): Promise<void>;
  /** Delete a value by key. Requires storage.write. */
  delete(key: string): Promise<void>;
  /** List all stored keys for this extension in this workspace. Requires storage.read. */
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
  /** User-provided API key retrieved from ctx.api.storage. Required — the platform has no default key. */
  apiKey: string;
  /** AI provider. Defaults to "openai". */
  provider?: "openai" | "openrouter";
}

export interface AiAPI {
  /** Send messages to the AI model. Requires ai.access. */
  complete(messages: AiMessage[], options: AiOptions): Promise<string>;
}

export type ContextMenuHandler = (message: MessageEvent) => void | Promise<void>;

export interface UiAPI {
  /**
   * Add an item to the message right-click context menu.
   * The handler receives the message that was right-clicked.
   * Requires ui.render.
   */
  addContextMenuItem(label: string, handler: ContextMenuHandler): void;
}

export interface ChannelMessage {
  id: string;
  content: string;
  userId: string;
  mentionIds: string[];
  createdAt: Date;
  user: { id: string; name: string };
}

// ─── Extension Context ────────────────────────────────────────────────────────

export interface ExtensionAPI {
  /** Per-extension key-value storage (scoped to this workspace). */
  readonly storage: StorageAPI;
  /** AI completion proxy (API key never exposed to extension). */
  readonly ai: AiAPI;
  /** UI integration surface (context menus, etc.). Requires ui.render. */
  readonly ui: UiAPI;

  /** Post a message to a channel as this extension's bot user. Requires messages.write. */
  sendMessage(channelId: string, content: string): Promise<void>;

  /** Fetch the last N messages from a channel. Requires messages.read. */
  getMessages(channelId: string, limit?: number): Promise<ChannelMessage[]>;

  /** Get a user's display name by their ID. */
  getUserNameById(userId: string): Promise<string | null>;

  /** Listen to new messages in this workspace. Requires messages.read. */
  onMessage(handler: MessageHandler): void;

  /**
   * Register a handler for incoming webhook POST requests to this extension's endpoint.
   * Endpoint: POST /webhooks/{extensionSlug}/{workspaceId}
   *
   * The platform delivers the raw request to the handler. The extension is responsible
   * for verifying the signature using `event.rawBody` and a secret from its own storage.
   * Requires webhooks permission.
   */
  onWebhook(handler: WebhookHandler): void;

  /**
   * Register a recurring job using a cron expression.
   * The job persists as long as the extension is loaded.
   * Requires scheduler.
   *
   * @param jobKey   Unique key within this extension (used to cancel/replace)
   * @param cron     Standard cron expression, e.g. "0 9 * * 1-5"
   * @param handler  Async function called on each tick
   */
  schedule(jobKey: string, cron: string, handler: () => Promise<void>): void;

  /** Cancel a previously registered scheduled job. */
  cancelSchedule(jobKey: string): void;
}

export interface ExtensionContext {
  /** The workspace this extension instance is loaded for. */
  readonly workspaceId: string;
  /** The full API surface. Only methods permitted by the manifest are callable. */
  readonly api: ExtensionAPI;
}

// ─── Extension Definition ─────────────────────────────────────────────────────

export interface ExtensionDefinition {
  /**
   * Called once when the extension is loaded for a workspace.
   * Register message handlers, webhook handlers, and schedules here.
   */
  onLoad?(ctx: ExtensionContext): void | Promise<void>;

  /**
   * Called when the extension is unloaded (disabled or workspace removed).
   * Clean up any resources that weren't created through ctx.api.
   */
  onUnload?(): void;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

export interface ExtensionManifest {
  /** Unique identifier. Use kebab-case, e.g. "my-extension". */
  slug: string;
  name: string;
  version: string;
  description?: string;
  /** List of permissions required. The runtime enforces these. */
  permissions: ExtensionPermission[];
  /** Path to the backend entry file relative to the extension directory. */
  backend: string;
  /** Path to the frontend UI component file (optional). */
  frontend?: string;
}
