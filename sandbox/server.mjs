import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startServer(port, extensionDir) {
  // Check manifest
  const manifestPath = path.join(extensionDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${extensionDir}. Run this from an extension directory.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Load storage from disk if it exists
  const storageFile = path.join(extensionDir, '.sandbox-storage.json');
  const storage = new Map();
  if (fs.existsSync(storageFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(storageFile, 'utf-8'));
      for (const [k, v] of Object.entries(data)) {
        storage.set(k, v);
      }
    } catch(e) { console.error('[Sandbox] Failed to load storage file:', e); }
  }

  const persistStorage = () => {
    const data = {};
    for (const [k, v] of storage.entries()) {
      data[k] = v;
    }
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
  };

  // Load sandbox settings (users + chat history) from disk if it exists
  const settingsFile = path.join(extensionDir, '.sandbox-settings.json');
  let sandboxSettings = null;
  if (fs.existsSync(settingsFile)) {
    try {
      sandboxSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    } catch(e) { console.error('[Sandbox] Failed to load settings file:', e); }
  }

  // If file doesn't exist or has no users, create default settings with users
  if (!sandboxSettings || !sandboxSettings.users || sandboxSettings.users.length === 0) {
    const defaultUsers = Array.from({ length: 3 }).map((_, i) => ({
      id: `sandbox-user-${i + 1}`,
      name: `Mock User ${i + 1}`,
      role: i === 0 ? 'OWNER' : 'MEMBER'
    }));
    sandboxSettings = {
      users: defaultUsers,
      messages: [],
      currentUserId: 'sandbox-user-1',
      directMessages: [],
      channels: [
        { id: 'sandbox-channel', name: 'general' },
        { id: 'sandbox-channel-2', name: 'dev' }
      ]
    };
    fs.writeFileSync(settingsFile, JSON.stringify(sandboxSettings, null, 2));
    console.log('[Sandbox] Created default settings with users and channels');
  }

  const persistSettings = () => {
    fs.writeFileSync(settingsFile, JSON.stringify(sandboxSettings, null, 2));
  };

  const clients = new Set(); // For SSE to the UI
  const debugClients = new Set(); // For debug log SSE
  const messages = sandboxSettings.messages; // Use persisted messages
  const directMessages = sandboxSettings.directMessages || []; // Use persisted DMs
  const reactions = []; // In-memory reactions storage
  let channels = sandboxSettings.channels || [
    { id: 'sandbox-channel', name: 'general' },
    { id: 'sandbox-channel-2', name: 'dev' }
  ]; // Channel storage

  function safeSseWrite(client, data) {
    try {
      if (!client.res.writableEnded) {
        client.res.write(data);
      }
    } catch (e) {
      clients.delete(client);
      debugClients.delete(client);
    }
  }

  function broadcastMessage(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const client of clients) {
      safeSseWrite(client, data);
    }
  }

  function broadcastDebugLog(log) {
    const data = `data: ${JSON.stringify(log)}\n\n`;
    for (const client of debugClients) {
      safeSseWrite(client, data);
    }
  }

  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  console.log = (...args) => {
    originalConsoleLog.apply(console, args);
    broadcastDebugLog({ type: 'log', args: args.map(a => String(a)), source: 'backend' });
  };
  console.warn = (...args) => {
    originalConsoleWarn.apply(console, args);
    broadcastDebugLog({ type: 'warn', args: args.map(a => String(a)), source: 'backend' });
  };
  console.error = (...args) => {
    originalConsoleError.apply(console, args);
    broadcastDebugLog({ type: 'error', args: args.map(a => String(a)), source: 'backend' });
  };

  // Use users from settings (already validated above)
  let users = sandboxSettings.users;

  // If channels not initialized, add defaults
  if (!sandboxSettings.channels || sandboxSettings.channels.length === 0) {
    sandboxSettings.channels = [
      { id: 'sandbox-channel', name: 'general' },
      { id: 'sandbox-channel-2', name: 'dev' }
    ];
    persistSettings();
    console.log('[Sandbox] Initialized default channels');
  }

  // Ensure current user is set
  let currentUserId = sandboxSettings.currentUserId || 'sandbox-user-1';

  // Mocked Context
  let messageHandler = null;
  let reactionHandler = null;
  console.log('[Sandbox] Setting up ctx with backend handlers');
  const ctx = {
    workspaceId: 'sandbox-workspace',
    currentUserId,
    _users: users,
    storage: {
      get: async (key) => {
        const logMsg = `[API] ctx.storage.get("${key}")`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        return storage.get(key) ?? null;
      },
      set: async (key, value) => { 
        const logMsg = `[API] ctx.storage.set("${key}", ${JSON.stringify(value)})`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        storage.set(key, value); 
        persistStorage(); 
      },
      delete: async (key) => { 
        const logMsg = `[API] ctx.storage.delete("${key}")`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        storage.delete(key); 
        persistStorage(); 
      },
      listKeys: async () => Array.from(storage.keys())
    },
    ai: {
      complete: async (messages, options) => {
        const logMsg = `[API] ctx.ai.complete(${messages.length} messages, ${JSON.stringify(options)})`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        return `[Mocked AI response to: ${messages[messages.length - 1]?.content}]`;
      }
    },
    users: {
      list: async () => {
        const logMsg = `[API] ctx.users.list()`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        return users;
      },
      get: async (userId) => {
        const logMsg = `[API] ctx.users.get("${userId}")`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        return users.find(u => u.id === userId) || null;
      },
      getRole: async (userId) => {
        const logMsg = `[API] ctx.users.getRole("${userId}")`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        const user = users.find(u => u.id === userId);
        return user?.role || null;
      },
      getCurrentUserRole: async () => {
        const logMsg = `[API] ctx.users.getCurrentUserRole()`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        const user = users.find(u => u.id === currentUserId);
        return user?.role || 'MEMBER';
      },
      getName: async (userId) => {
        const user = users.find(u => u.id === userId);
        return user?.name || null;
      }
    },
      messages: {
      _messages: messages,
      sendMessage: async (channelId, content) => {
        const logMsg = `[API] ctx.messages.sendMessage("${channelId}", ${JSON.stringify(content)})`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        
        const MENTION_PATTERN = /<@([a-zA-Z0-9_-]+)>/g;
        const mentionIds = [];
        let m;
        while ((m = MENTION_PATTERN.exec(content)) !== null) {
          if (!mentionIds.includes(m[1])) mentionIds.push(m[1]);
        }

        const msg = {
          id: `msg-${Date.now()}`,
          channelId,
          content,
          userId: 'ext-bot',
          mentionIds,
          createdAt: new Date(),
          user: { id: 'ext-bot', name: manifest.name || 'Extension' },
          reactions: []
        };
        messages.push(msg);
        sandboxSettings.messages = messages.slice(-500);
        persistSettings();
        for (const client of clients) {
          safeSseWrite(client, `data: ${JSON.stringify(msg)}\n\n`);
        }
        return { messageId: msg.id };
      },
      editMessage: async (msgId, newContent) => {
        const logMsg = `[API] ctx.messages.editMessage("${msgId}", ${JSON.stringify(newContent)})`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        
        const idx = messages.findIndex(m => m.id === msgId);
        if (idx === -1) return false;
        
        messages[idx] = { ...messages[idx], content: newContent };
        sandboxSettings.messages = messages.slice(-500);
        persistSettings();
        
        const updated = { ...messages[idx], _edited: true };
        for (const client of clients) {
          safeSseWrite(client, `data: ${JSON.stringify({ type: 'message:edited', message: updated })}\n\n`);
        }
        return true;
      },
      sendDirectMessage: async (userId, content) => {
        const logMsg = `[API] ctx.messages.sendDirectMessage("${userId}", ${JSON.stringify(content)})`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        
        const dm = {
          id: `dm-${Date.now()}`,
          senderId: 'ext-bot',
          recipientId: userId,
          content,
          createdAt: new Date(),
          sender: { id: 'ext-bot', name: manifest.name || 'Extension' },
          recipient: users.find(u => u.id === userId) || { id: userId, name: 'Unknown User' }
        };
        directMessages.push(dm);
        sandboxSettings.directMessages = directMessages.slice(-500);
        persistSettings();
        
        for (const client of clients) {
          safeSseWrite(client, `data: ${JSON.stringify({ type: 'dm:created', ...dm })}\n\n`);
        }
      },
      getMessages: async (channelId, limit = 50) => {
        const channelMessages = messages.slice(-limit).map(msg => ({
          ...msg,
          reactions: reactions.filter(r => r.messageId === msg.id)
        }));
        return channelMessages;
      },
      addReaction: async (messageId, emoji) => {
        const logMsg = `[API] ctx.messages.addReaction("${messageId}", "${emoji}")`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });

        const existing = reactions.find(
          r => r.messageId === messageId && r.userId === currentUserId && r.emoji === emoji
        );

        if (existing) {
          const idx = reactions.indexOf(existing);
          reactions.splice(idx, 1);
          for (const client of clients) {
            safeSseWrite(client, `data: ${JSON.stringify({ type: 'reaction:removed', messageId, reactionId: existing.id })}\n\n`);
          }
          const msg = messages.find(m => m.id === messageId);
          if (reactionHandler && msg) {
            await reactionHandler({
              type: "reaction:removed",
              channelId: 'sandbox-channel',
              messageId,
              workspaceId: 'sandbox-workspace',
              reaction: existing,
              recipientUserId: msg.userId,
              actorId: currentUserId,
            });
          }
          return { removed: true };
        }

        const reaction = {
          id: `reaction-${Date.now()}`,
          messageId,
          emoji,
          userId: currentUserId,
          user: users.find(u => u.id === currentUserId) || { id: currentUserId, name: 'Unknown' }
        };
        reactions.push(reaction);
        for (const client of clients) {
          safeSseWrite(client, `data: ${JSON.stringify({ type: 'reaction:added', messageId, reaction })}\n\n`);
        }
        const msg = messages.find(m => m.id === messageId);
        console.log(`[Sandbox] Reaction added. msg:`, msg, 'handler:', !!reactionHandler);
        if (reactionHandler && msg && msg.userId !== currentUserId) {
          console.log(`[Sandbox] Calling reaction handler for emoji: ${emoji}`);
          await reactionHandler({
            type: "reaction:added",
            channelId: 'sandbox-channel',
            messageId,
            workspaceId: 'sandbox-workspace',
            reaction,
            recipientUserId: msg.userId,
            actorId: currentUserId,
          });
        }
        return { reaction };
      },
      getReactions: async (messageId) => {
        const logMsg = `[API] ctx.messages.getReactions("${messageId}")`;
        console.log(`[Sandbox] ${logMsg}`);
        broadcastDebugLog({ type: 'log', args: [logMsg], source: 'backend' });
        return reactions.filter(r => r.messageId === messageId);
      },
    },
    frontend: undefined,
    backend: {
      onMessage: (handler) => {
        messageHandler = handler;
      },
      onReaction: (handler) => {
        reactionHandler = handler;
      },
      onWebhook: () => {},
      schedule: () => {},
      cancelSchedule: () => {},
    }
  };

  const loadBackend = async () => {
    const backendPath = path.join(extensionDir, 'dist', 'backend.js');
    if (fs.existsSync(backendPath)) {
      console.log(`[Sandbox] Loading backend code from ${backendPath}...`);
      try {
        messageHandler = null; // Clear old handler
        reactionHandler = null; // Clear old handler
        // Adding a query string to bust import cache if reloading
        const extModule = await import(new URL(`file://${backendPath}?t=${Date.now()}`));
        const ext = extModule.extension || extModule.default?.extension || extModule.default;
        if (ext && ext.onLoad) {
          await ext.onLoad(ctx);
          console.log(`[Sandbox] Extension backend onLoad complete.`);
        } else {
          console.log(`[Sandbox] Warning: Extension format not recognized. Make sure to export an 'extension' object.`);
        }
      } catch (e) {
        console.error(`[Sandbox] Failed to load backend.js:`, e);
      }
    } else {
      console.log(`[Sandbox] No backend.js found. Frontend-only extension?`);
    }
  };

  await loadBackend();

  // Watch for changes in dist folder
  const distDir = path.join(extensionDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  let watchTimeout = null;
  fs.watch(distDir, (eventType, filename) => {
    if (!filename) return;

    // Debounce events
    if (watchTimeout) clearTimeout(watchTimeout);
    watchTimeout = setTimeout(async () => {
      if (filename === 'backend.js') {
        console.log(`[Sandbox] Detected backend change, reloading...`);
        await loadBackend();
      } else if (filename === 'bundle.js' || filename === 'manifest.json') {
        console.log(`[Sandbox] Detected frontend change, triggering browser reload...`);
        for (const client of clients) {
          safeSseWrite(client, `data: ${JSON.stringify({ type: 'reload' })}\n\n`);
        }
      }
    }, 200);
  });

    // Create HTTP server
  const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // We can just use the incoming URL path, don't need the port for routing parsing here
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // SSE endpoint for messages
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(': connected\n\n');
      const client = { res };
      clients.add(client);
      req.on('close', () => clients.delete(client));
      return;
    }

    // SSE endpoint for debug logs
    if (url.pathname === '/api/debug/logs') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(': connected\n\n');
      const client = { res };
      debugClients.add(client);
      req.on('close', () => debugClients.delete(client));
      return;
    }

    // API to send message AS A USER
    if (url.pathname === '/api/messages' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        const data = JSON.parse(body);
        if (messageHandler) {
          const sender = users.find(u => u.id === data.userId) || { id: data.userId, name: 'You' };
          
          const MENTION_PATTERN = /<@([a-zA-Z0-9_-]+)>/g;
          const mentionIds = [];
          let m;
          while ((m = MENTION_PATTERN.exec(data.content)) !== null) {
            if (!mentionIds.includes(m[1])) mentionIds.push(m[1]);
          }

          const event = {
            id: `msg-${Date.now()}`,
            channelId: data.channelId || 'sandbox-channel',
            workspaceId: 'sandbox-workspace',
            content: data.content,
            userId: data.userId,
            mentionIds: [...new Set([...(data.mentionIds || []), ...mentionIds])]
          };
          messages.push({ ...event, user: sender, reactions: [] }); // add to history too
          sandboxSettings.messages = messages.slice(-500); // Keep last 500 messages
          persistSettings();
          
          // Broadcast user's message to all connected clients via SSE (before extension handler runs)
          const userMsgForSSE = { ...event, user: sender, reactions: [] };
          for (const client of clients) {
            safeSseWrite(client, `data: ${JSON.stringify(userMsgForSSE)}\n\n`);
          }
          
          // Set current user for extensions to query
          currentUserId = data.userId;
          ctx.currentUserId = data.userId;
          
          try {
            await messageHandler(event);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            console.error(`[Sandbox] Message handler error:`, e);
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
          }
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, note: 'No message handler registered' }));
        }
      });
      return;
    }

    // API to get/set storage from Frontend UI
    if (url.pathname === '/api/storage' && req.method === 'GET') {
      const key = url.searchParams.get('key');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ value: storage.get(key) ?? null }));
      return;
    }

    if (url.pathname === '/api/storage' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const { key, value } = JSON.parse(body);
        storage.set(key, value);
        persistStorage();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
      return;
    }

    if (url.pathname === '/api/storage/all' && req.method === 'GET') {
      const data = {};
      for (const [k, v] of storage.entries()) data[k] = v;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (url.pathname === '/api/storage/all' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          storage.clear();
          for (const [k, v] of Object.entries(data)) {
            storage.set(k, v);
          }
          persistStorage();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch(e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    // Users API
    if (url.pathname === '/api/users' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(users));
      return;
    }

    // Current user API
    if (url.pathname === '/api/current-user' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ currentUserId }));
      return;
    }

    if (url.pathname === '/api/current-user' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const data = JSON.parse(body);
        currentUserId = data.currentUserId;
        sandboxSettings.currentUserId = currentUserId;
        persistSettings();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
      return;
    }

    // Messages history API
    if (url.pathname === '/api/messages' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const msgs = messages.slice(-limit).map(msg => ({
        ...msg,
        reactions: reactions.filter(r => r.messageId === msg.id)
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(msgs));
      return;
    }

    // Edit message API (PATCH /api/messages/:messageId)
    const messagesEditMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (messagesEditMatch && req.method === 'PATCH') {
      const messageId = messagesEditMatch[1];
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { content } = JSON.parse(body);
          const idx = messages.findIndex(m => m.id === messageId);
          if (idx === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Message not found' }));
            return;
          }
          messages[idx] = { ...messages[idx], content };
          sandboxSettings.messages = messages.slice(-500);
          persistSettings();
          
          const updated = { ...messages[idx], _edited: true };
          for (const client of clients) {
            safeSseWrite(client, `data: ${JSON.stringify({ type: 'message:edited', message: updated })}\n\n`);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Reactions API (POST /api/:channelId/:messageId/reactions)
    const reactionsMatch = url.pathname.match(/^\/api\/[^/]+\/([^/]+)\/reactions$/);
    if (reactionsMatch && req.method === 'POST') {
      const messageId = reactionsMatch[1];
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { emoji } = JSON.parse(body);
          if (!emoji || typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 10) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid emoji' }));
            return;
          }

          const existing = reactions.find(
            r => r.messageId === messageId && r.userId === currentUserId && r.emoji === emoji
          );

          if (existing) {
            const idx = reactions.indexOf(existing);
            reactions.splice(idx, 1);
            for (const client of clients) {
              safeSseWrite(client, `data: ${JSON.stringify({ type: 'reaction:removed', messageId, reactionId: existing.id })}\n\n`);
            }
            const msg = messages.find(m => m.id === messageId);
            if (reactionHandler && msg) {
              await reactionHandler({
                type: "reaction:removed",
                channelId: 'sandbox-channel',
                messageId,
                workspaceId: 'sandbox-workspace',
                reaction: existing,
                recipientUserId: msg.userId,
                actorId: currentUserId,
              });
            }
            res.writeHead(200);
            res.end(JSON.stringify({ removed: true }));
          } else {
            const reaction = {
              id: `reaction-${Date.now()}`,
              messageId,
              emoji,
              userId: currentUserId,
              user: users.find(u => u.id === currentUserId) || { id: currentUserId, name: 'Unknown' }
            };
            reactions.push(reaction);
            for (const client of clients) {
              safeSseWrite(client, `data: ${JSON.stringify({ type: 'reaction:added', messageId, reaction })}\n\n`);
            }
            const msg = messages.find(m => m.id === messageId);
            console.log(`[Sandbox] Reaction added. msg:`, msg, 'handler:', !!reactionHandler);
            if (reactionHandler && msg && msg.userId !== currentUserId) {
              console.log(`[Sandbox] Calling reaction handler for emoji: ${emoji}`);
              await reactionHandler({
                type: "reaction:added",
                channelId: 'sandbox-channel',
                messageId,
                workspaceId: 'sandbox-workspace',
                reaction,
                recipientUserId: msg.userId,
                actorId: currentUserId,
              });
            }
            res.writeHead(201);
            res.end(JSON.stringify({ reaction }));
          }
        } catch(e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
      });
      return;
    }

    // Direct Messages API (DMs sent by extension)
    if (url.pathname === '/api/direct-messages' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '100');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(directMessages.slice(-limit).reverse()));
      return;
    }

    if (url.pathname === '/api/users' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const newUser = JSON.parse(body);
          if (newUser.id) {
            // Update existing
            const idx = users.findIndex(u => u.id === newUser.id);
            if (idx >= 0) {
              users[idx] = { ...users[idx], ...newUser };
            } else {
              users.push(newUser);
            }
          } else {
            // Create new
            newUser.id = newUser.id || `user-${crypto.randomUUID()}`;
            if (!newUser.role) newUser.role = 'MEMBER';
            users.push(newUser);
          }
          sandboxSettings.users = users;
          persistSettings();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(newUser));
        } catch(e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    if (url.pathname === '/api/users' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      users = users.filter(u => u.id !== id);
      sandboxSettings.users = users;
      persistSettings();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Channels API - GET list
    if (url.pathname === '/api/channels' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(channels));
      return;
    }

    // Channels API - POST create
    if (url.pathname === '/api/channels' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { name } = JSON.parse(body);
          if (!name || !name.trim()) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Channel name is required' }));
            return;
          }
          const newChannel = {
            id: `channel-${Date.now()}`,
            name: name.trim().toLowerCase().replace(/\s+/g, '-')
          };
          channels.push(newChannel);
          sandboxSettings.channels = channels;
          persistSettings();
          for (const client of clients) {
            safeSseWrite(client, `data: ${JSON.stringify({ type: 'channels:updated', channels })}\n\n`);
          }
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(newChannel));
        } catch(e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
      });
      return;
    }

    // Channels API - DELETE
    if (url.pathname === '/api/channels' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Channel id is required' }));
        return;
      }
      if (channels.length <= 1) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Cannot delete the last channel' }));
        return;
      }
      channels = channels.filter(c => c.id !== id);
      sandboxSettings.channels = channels;
      persistSettings();
      for (const client of clients) {
        safeSseWrite(client, `data: ${JSON.stringify({ type: 'channels:updated', channels })}\n\n`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Channels API - PATCH (rename)
    if (url.pathname === '/api/channels' && req.method === 'PATCH') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { id, name } = JSON.parse(body);
          if (!id || !name || !name.trim()) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Channel id and name are required' }));
            return;
          }
          const idx = channels.findIndex(c => c.id === id);
          if (idx === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Channel not found' }));
            return;
          }
          channels[idx] = { ...channels[idx], name: name.trim().toLowerCase().replace(/\s+/g, '-') };
          sandboxSettings.channels = channels;
          persistSettings();
          for (const client of clients) {
            safeSseWrite(client, `data: ${JSON.stringify({ type: 'channels:updated', channels })}\n\n`);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(channels[idx]));
        } catch(e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
      });
      return;
    }

    // Serve bundle.js
    if (url.pathname === '/bundle.js') {
      const p = path.join(extensionDir, 'dist', 'bundle.js');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve bundle.css (compiled extension styles)
    if (url.pathname === '/bundle.css') {
      const p = path.join(extensionDir, 'dist', 'bundle.css');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve extension.css (source styles - fallback)
    if (url.pathname === '/extension.css') {
      const p = path.join(extensionDir, 'extension.css');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }
    
    // Serve manifest.json
    if (url.pathname === '/manifest.json') {
      const p = path.join(extensionDir, 'manifest.json');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve icon.png
    if (url.pathname === '/icon.png') {
      const p = path.join(extensionDir, 'dist', 'icon.png');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve Vite build assets (React app)
    const distDir = path.join(__dirname, 'dist');
    if (url.pathname.startsWith('/assets/')) {
      const assetPath = path.join(distDir, url.pathname);
      if (fs.existsSync(assetPath)) {
        const ext = path.extname(assetPath);
        const contentTypes = {
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.html': 'text/html',
          '.map': 'application/json',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
        };
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(assetPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve extension bundle.js (from extension dist)
    if (url.pathname === '/bundle.js') {
      const p = path.join(extensionDir, 'dist', 'bundle.js');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve extension CSS
    if (url.pathname === '/bundle.css') {
      const p = path.join(extensionDir, 'dist', 'bundle.css');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve extension.css (source styles - fallback)
    if (url.pathname === '/extension.css') {
      const p = path.join(extensionDir, 'extension.css');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve manifest.json
    if (url.pathname === '/manifest.json') {
      const p = path.join(extensionDir, 'manifest.json');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve icon.png
    if (url.pathname === '/icon.png') {
      const p = path.join(extensionDir, 'dist', 'icon.png');
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve Vite index.html for all other routes (SPA)
    if (url.pathname === '/') {
      const htmlPath = path.join(distDir, 'index.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(htmlPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Vite build not found. Run npm run build first.');
      }
      return;
    }

    // 404 for unknown routes
    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`[Sandbox] Port ${port} in use, trying random port...`);
      server.listen(0);
    } else {
      console.error(`[Sandbox] Server error:`, e);
    }
  });

  server.listen(port, () => {
    const activePort = server.address().port;
    console.log(`[Sandbox] Server running at http://localhost:${activePort}/`);
    console.log(`[Sandbox] Serving extension: ${manifest.name} (${manifest.slug}) v${manifest.version}`);
  });
}
