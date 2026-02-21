/**
 * Flux Extension SDK — Frontend UI type declarations
 *
 * Import from "flux-sdk/ui".
 *
 * Extensions receive a ctx object as a prop — the ONLY way to access
 * platform capabilities from the UI. No direct fetch() or localStorage.
 */

import type { AiMessage, AiOptions } from "./index"

// ─── Storage context ──────────────────────────────────────────────────────────

export interface ExtensionStorageContext {
  /** Retrieve a stored value by key. Returns null if not found. */
  get<T = unknown>(key: string): Promise<T | null>
  /** Store a value by key. */
  set(key: string, value: unknown): Promise<void>
  /** Delete a stored key. */
  delete(key: string): Promise<void>
}

// ─── AI context ───────────────────────────────────────────────────────────────

export interface ExtensionAiContext {
  /** Send messages to the AI proxy. Requires ai.access permission. */
  complete(
    messages: AiMessage[],
    options: Omit<AiOptions, "apiKey"> & { apiKey?: string },
  ): Promise<string>
}

// ─── Channel ──────────────────────────────────────────────────────────────────

export interface Channel {
  id: string
  name: string
}

// ─── Extension UI context ─────────────────────────────────────────────────────

export interface ExtensionUiContext {
  /** The active workspace ID. */
  readonly workspaceId: string
  /**
   * Base URL of the Flux API server (no trailing slash).
   * Use to construct webhook URLs: `${ctx.serverUrl}/webhooks/${slug}/${workspaceId}`
   */
  readonly serverUrl: string
  /** All channels available in the active workspace. */
  readonly channels: ReadonlyArray<Channel>
  /** Storage API scoped to this extension and workspace. */
  readonly storage: ExtensionStorageContext
  /** AI completion proxy. */
  readonly ai: ExtensionAiContext
}

// ─── Component props ──────────────────────────────────────────────────────────

export interface ExtensionPanelProps {
  ctx: ExtensionUiContext
}
