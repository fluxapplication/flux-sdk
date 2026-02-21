/**
 * Flux Extension SDK — Frontend UI type declarations
 *
 * Import from "flux-sdk/ui".
 */

import type { AiMessage, AiOptions } from "./index"

// ─── useWorkspaceId ───────────────────────────────────────────────────────────

/**
 * Returns the active workspace ID from the Flux session.
 * Re-renders when the workspace changes.
 */
export declare const useWorkspaceId: () => string | null

// ─── useExtensionStorage ──────────────────────────────────────────────────────

export interface ExtensionStorageResult<T> {
  data: T | null
  isLoading: boolean
  error: string | null
  /** Persist a new value. Throws on failure. */
  set: (value: unknown) => Promise<void>
  /** Delete the key. Throws on failure. */
  remove: () => Promise<void>
}

/**
 * Read/write a single key in extension storage (scoped to workspace).
 * Requires storage.read + storage.write permissions in manifest.
 *
 * @param extensionSlug  The slug from your manifest.json
 * @param key            Storage key
 */
export declare const useExtensionStorage: <T = unknown>(
  extensionSlug: string,
  key: string,
) => ExtensionStorageResult<T>

// ─── useAiComplete ────────────────────────────────────────────────────────────

export interface AiCompleteResult {
  complete: (
    messages: AiMessage[],
    options: Omit<AiOptions, "apiKey"> & { apiKey?: string },
  ) => Promise<string>
  isPending: boolean
  error: string | null
}

/**
 * Returns a `complete` function to call the AI proxy.
 * Requires ai.access permission in manifest.
 */
export declare const useAiComplete: () => AiCompleteResult
