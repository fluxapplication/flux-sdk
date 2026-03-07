# Flux Extension Guide

This guide explains how to build extensions for Flux.

## Quick Start

```bash
# Install Flux SDK
npm install flux-sdk

# Create extension structure
my-extension/
├── backend.ts      # Backend logic (message handlers, webhooks, schedulers)
├── ui.tsx         # Frontend UI (React components)
├── manifest.json   # Extension config
└── types.ts       # Optional: your types
```

## The Context

Every extension receives a `ctx` object with everything needed to interact with Flux.

```typescript
import type { ExtensionContext, ExtensionDefinition } from "flux-sdk";

export const extension: ExtensionDefinition = {
  onLoad(ctx) {
    // ctx is your gateway to Flux
  }
};
```

## Context Structure

```typescript
ctx = {
  // Identity
  workspaceId: "ws-123",        // Current workspace
  currentUserId: "user-456",    // User interacting with extension

  // Core APIs - work in both backend and frontend
  storage: { get, set, delete, listKeys },
  ai: { complete },
  users: { list, get, getRole, getCurrentUserRole },
  messages: { sendMessage, sendDirectMessage, getMessages },

  // Backend only
  backend: {
    onMessage(handler),    // Listen to messages
    onWebhook(handler),    // Handle webhooks  
    schedule(key, cron, handler),  // Schedule tasks
    cancelSchedule(key)
  },

  // Frontend only
  frontend: {
    channels: [{ id, name }],
    serverUrl: "https://api.flux.io",
    getUserNameById(userId)
  }
}
```

## Backend Extension

Use backend for event-driven logic:

```typescript
// backend.ts
import type { ExtensionDefinition, ExtensionContext } from "flux-sdk";

export const extension: ExtensionDefinition = {
  onLoad(ctx) {
    // Listen to messages
    ctx.backend?.onMessage(async (event) => {
      if (event.content.includes("hello")) {
        await ctx.messages.sendMessage(event.channelId, "Hello! 👋");
      }
    });

    // Handle webhooks
    ctx.backend?.onWebhook(async (event) => {
      console.log("Webhook received:", event.body);
    });

    // Schedule tasks
    ctx.backend?.schedule("daily-reminder", "0 9 * * *", async () => {
      // Send daily reminder
    });
  }
};
```

## Frontend Extension

Use frontend for UI:

```typescript
// ui.tsx
import type { ExtensionPanelProps } from "flux-sdk";

export const ExtensionPage: FC<ExtensionPanelProps> = ({ ctx }) => {
  const handleClick = async () => {
    // Storage
    await ctx.storage.set("setting", "value");
    const value = await ctx.storage.get("setting");
    
    // Users
    const users = await ctx.users.list();
    const myRole = await ctx.users.getCurrentUserRole();
    
    // Messages
    await ctx.messages.sendMessage("channel-123", "Hello!");
    
    // Frontend-only
    const channels = ctx.frontend?.channels;
    const name = await ctx.frontend?.getUserNameById("user-123");
  };

  return <button onClick={handleClick}>Do Something</button>;
};
```

## Manifest

```json
{
  "slug": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "permissions": [
    "messages.read",
    "messages.write",
    "storage.read", 
    "storage.write"
  ],
  "backend": "backend.ts",
  "frontend": "ui.tsx"
}
```

## Permissions

| Permission | Description |
|------------|-------------|
| `messages.read` | Read messages, listen to message events |
| `messages.write` | Send messages |
| `storage.read` | Read extension storage |
| `storage.write` | Write extension storage |
| `ai.access` | Use AI completion |
| `scheduler` | Schedule recurring tasks |
| `webhooks` | Receive webhooks |
| `ui.render` | Add UI elements |

## Testing

Use the sandbox:

```bash
cd flux-sdk/sandbox
npm install
npm run dev
```
