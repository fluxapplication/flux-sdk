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
  let sandboxSettings = { users: [], messages: [], currentUserId: 'user-1', directMessages: [] };
  if (fs.existsSync(settingsFile)) {
    try {
      sandboxSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    } catch(e) { console.error('[Sandbox] Failed to load settings file:', e); }
  }

  const persistSettings = () => {
    fs.writeFileSync(settingsFile, JSON.stringify(sandboxSettings, null, 2));
  };

  const clients = new Set(); // For SSE to the UI
  const messages = sandboxSettings.messages; // Use persisted messages
  const directMessages = sandboxSettings.directMessages || []; // Use persisted DMs

  // Mock Users - use persisted users or defaults
  let users = sandboxSettings.users.length > 0 ? sandboxSettings.users : Array.from({ length: 3 }).map((_, i) => ({
    id: `user-${i + 1}`,
    name: `Mock User ${i + 1}`,
    avatarUrl: `https://i.pravatar.cc/150?u=user-${i + 1}`
  }));
  if (sandboxSettings.users.length === 0) {
    sandboxSettings.users = users;
    persistSettings();
  }

  // Ensure current user is selected in UI
  let currentUserId = sandboxSettings.currentUserId || 'user-1';

  // Mocked Context
  let messageHandler = null;
  const ctx = {
    workspaceId: 'sandbox-workspace',
    api: {
      storage: {
        get: async (key) => storage.get(key) ?? null,
        set: async (key, value) => { storage.set(key, value); persistStorage(); },
        delete: async (key) => { storage.delete(key); persistStorage(); },
        listKeys: async () => Array.from(storage.keys())
      },
      ai: {
        complete: async (messages, options) => {
          return `[Mocked AI response to: ${messages[messages.length - 1]?.content}]`;
        }
      },
      ui: {
        addContextMenuItem: (label, handler) => {
          console.log(`[Sandbox] Context menu item registered: ${label}`);
        }
      },
      sendMessage: async (channelId, content) => {
        console.log(`[Sandbox] Extension sent message to ${channelId}: ${content}`);
        
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
          user: { id: 'ext-bot', name: manifest.name || 'Extension' }
        };
        messages.push(msg); // Add to history
        sandboxSettings.messages = messages.slice(-500); // Keep last 500 messages
        persistSettings();
        // Broadcast to specific clients
        for (const client of clients) {
          client.res.write(`data: ${JSON.stringify(msg)}\n\n`);
        }
      },
      sendDirectMessage: async (userId, content) => {
        console.log(`[Sandbox] Extension sent DM to ${userId}: ${content}`);
        
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
        sandboxSettings.directMessages = directMessages.slice(-500); // Keep last 500 DMs
        persistSettings();
        
        // Broadcast to specific clients
        for (const client of clients) {
          client.res.write(`data: ${JSON.stringify({ type: 'dm:created', ...dm })}\n\n`);
        }
      },
      getMessages: async (channelId, limit = 50) => {
         return messages.slice(-limit);
      },
      getUsers: async () => users,
      onMessage: (handler) => {
        messageHandler = handler;
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
          client.res.write(`data: ${JSON.stringify({ type: 'reload' })}\n\n`);
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
            channelId: 'sandbox-channel',
            workspaceId: 'sandbox-workspace',
            content: data.content,
            userId: data.userId,
            mentionIds: [...new Set([...(data.mentionIds || []), ...mentionIds])]
          };
          messages.push({ ...event, user: sender }); // add to history too
          sandboxSettings.messages = messages.slice(-500); // Keep last 500 messages
          persistSettings();
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(messages.slice(-limit)));
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
            newUser.id = `user-${Date.now()}`;
            if (!newUser.avatarUrl) newUser.avatarUrl = `https://i.pravatar.cc/150?u=${newUser.id}`;
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

    // Serve sandbox static assets (styles.css, require-shim.js, sandbox.js)
    const sandboxAssets = {
      '/styles.css': { file: 'styles.css', type: 'text/css' },
      '/require-shim.js': { file: 'require-shim.js', type: 'application/javascript' },
      '/json-editor.js': { file: 'json-editor.js', type: 'application/javascript' },
      '/sandbox.js': { file: 'sandbox.js', type: 'application/javascript' },
    };
    if (sandboxAssets[url.pathname]) {
      const asset = sandboxAssets[url.pathname];
      const p = path.join(__dirname, asset.file);
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': asset.type });
        fs.createReadStream(p).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve UI index.html
    if (url.pathname === '/') {
      const htmlPath = path.join(__dirname, 'index.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(htmlPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('UI not found');
      }
      return;
    }

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
