/* ── Navigation ── */
const navItems = document.querySelectorAll(".nav-item");
const tabContents = document.querySelectorAll(".tab-content");
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((n) => n.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));
    item.classList.add("active");
    document.getElementById(item.dataset.target).classList.add("active");
  });
});

/* ── Toast ── */
function showToast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ── Chat core ── */
const chat = document.getElementById("chat");
const input = document.getElementById("msg-input");
const sendBtn = document.getElementById("send-btn");
let manifest = {};

fetch("/manifest.json")
  .then((r) => r.json())
  .then((m) => {
    manifest = m;
    document.getElementById("ext-name").textContent = m.name;
    document.getElementById("ext-slug").textContent = m.slug;
    document.title = `Sandbox: ${m.name}`;
    manifestCommands = (m.commands || []).map((cmd) => ({
      name: cmd.name,
      description: cmd.description || "",
      usage: cmd.usage || "",
      extensionName: m.name,
    }));
  })
  .catch(console.error);

function appendMessage(sender, text, isBot, messageId = null, reactions = []) {
  const div = document.createElement("div");
  div.className = `message ${isBot ? "bot" : "user"}`;
  div.dataset.messageId = messageId || "";

  const textDiv = document.createElement("div");
  textDiv.className = "text";
  let lastIndex = 0;
  const MENTION_PATTERN = /<@([a-zA-Z0-9_-]+)>/g;
  let m;
  while ((m = MENTION_PATTERN.exec(text)) !== null) {
    if (m.index > lastIndex)
      textDiv.appendChild(
        document.createTextNode(text.slice(lastIndex, m.index)),
      );
    const mentionChip = document.createElement("span");
    mentionChip.className = "mention-chip";
    const user = sandboxUsers.find((u) => u.id === m[1]);
    mentionChip.textContent = user ? `@${user.name}` : `@${m[1]}`;
    mentionChip.title = user ? `User ID: ${m[1]}` : "Unknown user";
    textDiv.appendChild(mentionChip);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length)
    textDiv.appendChild(document.createTextNode(text.slice(lastIndex)));

  div.innerHTML = `<div class="text-[11px] text-[#5a5a6e] mb-1 font-semibold">${sender}</div>`;
  div.appendChild(textDiv);

  // Add reactions section if message has an ID
  if (messageId) {
    const reactionsDiv = document.createElement("div");
    reactionsDiv.className = "message-reactions";
    reactionsDiv.dataset.messageId = messageId;
    renderReactions(reactionsDiv, reactions, messageId);
    div.appendChild(reactionsDiv);
  }

  chat.appendChild(div);
  setTimeout(() => {
    chat.scrollTop = chat.scrollHeight;
  }, 10);
}

/* ── Reactions ── */
const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👀", "🍬"];

function renderReactions(container, reactions, messageId) {
  container.innerHTML = "";

  // Group reactions by emoji
  const grouped = {};
  reactions.forEach((r) => {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    grouped[r.emoji].push(r);
  });

  // Render grouped reactions
  Object.entries(grouped).forEach(([emoji, reactionList]) => {
    const btn = document.createElement("button");
    btn.className = "reaction-btn";
    const hasReacted = reactionList.some(
      (r) => r.userId === currentSandboxUserId,
    );
    if (hasReacted) btn.classList.add("reacted");

    const count = reactionList.length;
    btn.innerHTML = `<span class="reaction-emoji">${emoji}</span><span class="reaction-count">${count}</span>`;
    btn.title = reactionList.map((r) => r.user?.name || r.userId).join(", ");

    btn.addEventListener("click", async () => {
      await toggleReaction(messageId, emoji);
    });

    container.appendChild(btn);
  });

  // Add reaction button
  const addBtn = document.createElement("button");
  addBtn.className = "reaction-add-btn";
  addBtn.innerHTML = "😊";
  addBtn.title = "Add reaction";

  const emojiPicker = document.createElement("div");
  emojiPicker.className = "emoji-picker";
  emojiPicker.style.display = "none";

  COMMON_EMOJIS.forEach((emoji) => {
    const emojiBtn = document.createElement("button");
    emojiBtn.className = "emoji-option";
    emojiBtn.textContent = emoji;
    emojiBtn.addEventListener("click", async () => {
      await toggleReaction(messageId, emoji);
      emojiPicker.style.display = "none";
    });
    emojiPicker.appendChild(emojiBtn);
  });

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    emojiPicker.style.display =
      emojiPicker.style.display === "none" ? "grid" : "none";
  });

  document.addEventListener("click", () => {
    emojiPicker.style.display = "none";
  });

  container.appendChild(addBtn);
  container.appendChild(emojiPicker);
}

async function toggleReaction(messageId, emoji) {
  await fetch(`/api/sandbox-channel/${messageId}/reactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoji }),
  });
}

function handleReactionEvent(event) {
  const messageId = event.messageId;
  const messageEl = document.querySelector(
    `.message[data-message-id="${messageId}"]`,
  );
  if (!messageEl) return;

  const reactionsDiv = messageEl.querySelector(".message-reactions");
  if (!reactionsDiv) return;

  // Fetch updated reactions
  fetch(`/api/messages?limit=100`)
    .then((r) => r.json())
    .then((msgs) => {
      const msg = msgs.find((m) => m.id === messageId);
      if (msg) {
        renderReactions(reactionsDiv, msg.reactions || [], messageId);
      }
    });
}

/* ── SSE ── */
const events = new EventSource("/api/events");
events.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "reload") {
    window.location.reload();
    return;
  }
  if (msg.type === "dm:created") {
    loadDirectMessages();
    return;
  }
  if (msg.type === "reaction:added" || msg.type === "reaction:removed") {
    handleReactionEvent(msg);
    return;
  }
  appendMessage(msg.user.name, msg.content, true, msg.id, msg.reactions || []);
};

async function loadMessageHistory() {
  const res = await fetch("/api/messages?limit=100");
  const msgs = await res.json();
  msgs.forEach((msg) => {
    appendMessage(
      msg.user.name,
      msg.content,
      true,
      msg.id,
      msg.reactions || [],
    );
  });
}

/* ── Mention Picker ── */
const mentionPicker = document.getElementById("mention-picker");
let mentionPickerVisible = false,
  mentionQuery = "",
  mentionIndex = 0,
  filteredMembers = [],
  mentionRange = null;

/* ── Command Picker ── */
const commandPicker = document.getElementById("command-picker");
let commandPickerVisible = false,
  commandQuery = "",
  commandIndex = 0,
  filteredCommands = [],
  manifestCommands = [];

function updateMentionPicker() {
  if (!mentionPickerVisible || filteredMembers.length === 0) {
    mentionPicker.classList.remove("visible");
    return;
  }
  mentionPicker.innerHTML = "";
  filteredMembers.forEach((m, i) => {
    const div = document.createElement("div");
    div.className = `picker-item ${i === mentionIndex ? "active" : ""}`;
    div.innerHTML = `<div>${m.name}</div>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      insertMention(m);
    });
    mentionPicker.appendChild(div);
  });
  mentionPicker.classList.add("visible");
}

function insertMention(user) {
  if (!mentionRange) return;
  const pos = input.selectionStart;
  const text = input.value;
  const before = text.substring(0, mentionRange.start);
  const after = text.substring(pos);
  input.value = before + `<@${user.id}> ` + after;
  input.selectionStart = input.selectionEnd =
    before.length + user.id.length + 4;
  mentionPickerVisible = false;
  updateMentionPicker();
  input.focus();
}

function getCaretBoundary() {
  const pos = input.selectionStart;
  const text = input.value.substring(0, pos);
  const lastAt = text.lastIndexOf("@");
  if (lastAt === -1) return null;
  const charBefore = lastAt > 0 ? text[lastAt - 1] : " ";
  if (charBefore !== " " && charBefore !== "\n") return null;
  const afterAt = text.slice(lastAt + 1);
  const spaceIdx = afterAt.search(/\s/);
  const query = spaceIdx === -1 ? afterAt : afterAt.slice(0, spaceIdx);
  return { query, start: lastAt, end: pos };
}

/* ── Command Picker Functions ── */
function updateCommandPicker() {
  if (!commandPickerVisible || filteredCommands.length === 0) {
    commandPicker.classList.remove("visible");
    return;
  }
  commandPicker.innerHTML = `
        <div class="command-picker-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
            </svg>
            Commands
            <span class="command-picker-hint">↑↓ navigate · Enter select · Esc close</span>
        </div>
    `;
  const list = document.createElement("div");
  list.className = "command-picker-list";
  filteredCommands.forEach((cmd, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `command-item ${i === commandIndex ? "active" : ""}`;
    btn.innerHTML = `
            <div class="command-item-content">
                <div>
                    <span class="command-name">/${cmd.name}</span>
                    ${cmd.usage ? `<span class="command-usage">${cmd.usage.replace(`/${cmd.name}`, "").trim()}</span>` : ""}
                </div>
                <div class="command-description">${cmd.description}</div>
            </div>
            ${cmd.extensionName ? `<span class="command-badge">${cmd.extensionName}</span>` : ""}
        `;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      insertCommand(cmd);
    });
    btn.addEventListener("mouseenter", () => {
      commandIndex = i;
      updateCommandPicker();
    });
    list.appendChild(btn);
  });
  commandPicker.appendChild(list);
  commandPicker.classList.add("visible");
}

function insertCommand(cmd) {
  const pos = input.selectionStart;
  const text = input.value;
  const before = text.substring(0, pos);
  const lastSlash = before.lastIndexOf("/");
  if (lastSlash === -1) return;
  const charBefore = lastSlash > 0 ? before[lastSlash - 1] : " ";
  if (charBefore !== " " && charBefore !== "\n" && lastSlash !== 0) return;
  const after = text.substring(pos);
  const newText = before.substring(0, lastSlash) + `/${cmd.name} ` + after;
  input.value = newText;
  input.selectionStart = input.selectionEnd = lastSlash + cmd.name.length + 2;
  commandPickerVisible = false;
  updateCommandPicker();
  input.focus();
}

input.addEventListener("input", () => {
  // Command picker trigger: "/" at start of line or after whitespace
  const pos = input.selectionStart;
  const text = input.value;
  const textBeforeCursor = text.substring(0, pos);
  const lastSlash = textBeforeCursor.lastIndexOf("/");
  let commandTrigger = null;
  if (lastSlash !== -1) {
    const charBefore = lastSlash > 0 ? textBeforeCursor[lastSlash - 1] : " ";
    if (charBefore === " " || charBefore === "\n" || lastSlash === 0) {
      const afterSlash = textBeforeCursor.slice(lastSlash + 1);
      const spaceIdx = afterSlash.search(/\s/);
      const query =
        spaceIdx === -1 ? afterSlash : afterSlash.slice(0, spaceIdx);
      commandTrigger = { query, start: lastSlash, end: pos };
    }
  }

  // Update command picker
  if (commandTrigger && !commandTrigger.query.includes(" ")) {
    commandQuery = commandTrigger.query.toLowerCase();
    filteredCommands =
      commandQuery === ""
        ? manifestCommands
        : manifestCommands.filter((c) =>
            c.name.toLowerCase().startsWith(commandQuery),
          );
    commandPickerVisible = filteredCommands.length > 0;
    commandIndex = 0;
  } else {
    commandPickerVisible = false;
  }
  updateCommandPicker();

  // Mention picker trigger
  const boundary = getCaretBoundary();
  if (boundary) {
    mentionQuery = boundary.query.toLowerCase();
    filteredMembers = sandboxUsers.filter(
      (u) => u && u.name && u.name.toLowerCase().includes(mentionQuery),
    );
    mentionPickerVisible = true;
    mentionIndex = 0;
    mentionRange = { start: boundary.start, end: boundary.end };
  } else {
    mentionPickerVisible = false;
  }
  updateMentionPicker();
});

input.addEventListener("keydown", (e) => {
  // Command picker keyboard handling
  if (commandPickerVisible) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      commandIndex = (commandIndex + 1) % filteredCommands.length;
      updateCommandPicker();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      commandIndex =
        (commandIndex - 1 + filteredCommands.length) % filteredCommands.length;
      updateCommandPicker();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[commandIndex])
        insertCommand(filteredCommands[commandIndex]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      commandPickerVisible = false;
      updateCommandPicker();
      return;
    }
  }
  // Mention picker keyboard handling
  if (mentionPickerVisible) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      mentionIndex = (mentionIndex + 1) % filteredMembers.length;
      updateMentionPicker();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      mentionIndex =
        (mentionIndex - 1 + filteredMembers.length) % filteredMembers.length;
      updateMentionPicker();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredMembers[mentionIndex])
        insertMention(filteredMembers[mentionIndex]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      mentionPickerVisible = false;
      updateMentionPicker();
      return;
    }
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function serializeInput() {
  return input.value;
}

async function sendMessage() {
  const finalContent = serializeInput().trim();
  if (!finalContent) return;
  input.value = "";
  const sender = sandboxUsers.find((u) => u.id === currentSandboxUserId) || {
    name: "You",
  };
  const tempId = `msg-${Date.now()}`;
  appendMessage(sender.name, finalContent, false, tempId, []);

  await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: finalContent,
      userId: currentSandboxUserId,
    }),
  });
}

sendBtn.addEventListener("click", sendMessage);

let sandboxUsers = [
  {
    id: "sandbox-user-1",
    name: "Mock User 1",
    role: "OWNER",
  },
  {
    id: "sandbox-user-2",
    name: "Mock User 2",
    role: "MEMBER",
  },
  {
    id: "sandbox-user-3",
    name: "Mock User 3",
    role: "MEMBER",
  },
];

const ctx = {
  workspaceId: "sandbox-workspace",
  currentUserId: "sandbox-user-1",
  storage: {
    get: async (key) => {
      const res = await fetch("/api/storage?key=" + encodeURIComponent(key));
      const data = await res.json();
      return data.value;
    },
    set: async (key, value) => {
      await fetch("/api/storage", {
        method: "POST",
        body: JSON.stringify({ key, value }),
      });
    },
    delete: async (key) => {
      await fetch("/api/storage", {
        method: "POST",
        body: JSON.stringify({ key, value: null }),
      });
    },
    listKeys: async () => [],
  },
  ai: {
    complete: async (messages, options) => {
      const res = await fetch("/api/ai/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, ...options }),
      });
      const data = await res.json();
      return data.result;
    },
  },
  users: {
    list: async () => sandboxUsers,
    get: async (userId) => sandboxUsers.find((u) => u.id === userId) || null,
    getRole: async (userId) => {
      const user = sandboxUsers.find((u) => u.id === userId);
      return user?.role || null;
    },
    getCurrentUserRole: async () => {
      const user = sandboxUsers.find((u) => u.id === ctx.currentUserId);
      return user?.role || "MEMBER";
    },
  },
  messages: {
    sendMessage: async (channelId, content) => {
      const messageId = `msg-${Date.now()}`;
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, channelId, userId: ctx.currentUserId }),
      });
      return { messageId };
    },
    sendDirectMessage: async (userId, content) => {
      await fetch("/api/direct-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, content, userId: ctx.currentUserId }),
      });
    },
    getMessages: async (channelId, limit = 50) => {
      const res = await fetch(
        "/api/messages?limit=" +
          limit +
          "&channelId=" +
          encodeURIComponent(channelId),
      );
      return res.json();
    },
    addReaction: async (messageId, emoji) => {
      const channelId = "sandbox-channel";
      const res = await fetch(`/api/${channelId}/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      return res.json();
    },
    getReactions: async (messageId) => {
      const msgs = await ctx.messages.getMessages("sandbox-channel", 100);
      const msg = msgs.find((m) => m.id === messageId);
      return msg?.reactions || [];
    },
  },
  frontend: {
    channels: [
      { id: "C_SANDBOX_1", name: "general" },
      { id: "C_SANDBOX_2", name: "dev-team" },
    ],
    serverUrl: `http://${window.location.host}`,
    getUserNameById: async (userId) => {
      const u = sandboxUsers.find((u) => u.id === userId);
      return u ? u.name : null;
    },
  },
  backend: {
    onMessage: () =>
      console.warn(
        "[Extension] backend.onMessage is not supported in frontend.",
      ),
    onWebhook: () =>
      console.warn(
        "[Extension] backend.onWebhook is not supported in frontend.",
      ),
    schedule: () =>
      console.warn(
        "[Extension] backend.schedule is not supported in frontend.",
      ),
    cancelSchedule: () =>
      console.warn(
        "[Extension] backend.cancelSchedule is not supported in frontend.",
      ),
  },
};

let appMounted = false,
  settingsMounted = false,
  currentSandboxUserId = "sandbox-user-1";

const tryMount = () => {
  if (window.__FluxExtension__) {
    const ext = window.__FluxExtension__.default || window.__FluxExtension__;
    if (ext.ExtensionPage && !appMounted) {
      const root = ReactDOM.createRoot(document.getElementById("ui-mount"));
      root.render(
        React.createElement(ext.ExtensionPage, {
          ctx: ctx,
          currentUserId: currentSandboxUserId,
        }),
      );
      appMounted = true;
    }
    if (ext.ExtensionPanel && !settingsMounted) {
      const el = document.getElementById("settings-mount");
      if (el) {
        const root = ReactDOM.createRoot(el);
        root.render(
          React.createElement(ext.ExtensionPanel, {
            ctx: ctx,
            currentUserId: currentSandboxUserId,
          }),
        );
        settingsMounted = true;
      }
    }
  }
  if (!appMounted && !settingsMounted) setTimeout(tryMount, 50);
};

const reRenderApp = () => {
  if (!window.__FluxExtension__) return;
  const ext = window.__FluxExtension__.default || window.__FluxExtension__;
  if (ext.ExtensionPage && appMounted) {
    ReactDOM.createRoot(document.getElementById("ui-mount")).render(
      React.createElement(ext.ExtensionPage, {
        ctx: ctx,
        currentUserId: currentSandboxUserId,
      }),
    );
  }
  if (ext.ExtensionPanel && settingsMounted) {
    ReactDOM.createRoot(document.getElementById("settings-mount")).render(
      React.createElement(ext.ExtensionPanel, {
        ctx: ctx,
        currentUserId: currentSandboxUserId,
      }),
    );
  }
};

/* ── Dev: JSON Editor ── */
let jsonEditor = null;
function initJsonEditor() {
  const container = document.getElementById("jsoneditor-container");
  jsonEditor = new FluxJsonEditor(container);
}
initJsonEditor();

async function refreshStorage() {
  const res = await fetch("/api/storage/all");
  const data = await res.json();
  jsonEditor.set(data);
}

async function saveStorage() {
  try {
    const data = jsonEditor.get();
    await fetch("/api/storage/all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    showToast("Storage saved successfully!");
  } catch (e) {
    showToast("Invalid JSON — fix errors before saving", "error");
  }
}

/* ── Dev: Users ── */

async function fetchUsers() {
  const res = await fetch("/api/users");
  sandboxUsers = await res.json();
  ctx.users = {
    list: async () => sandboxUsers,
    get: async (userId) => sandboxUsers.find((u) => u.id === userId) || null,
    getRole: async (userId) =>
      sandboxUsers.find((u) => u.id === userId)?.role || null,
    getCurrentUserRole: async () =>
      sandboxUsers.find((u) => u.id === ctx.currentUserId)?.role || "MEMBER",
  };
  ctx.frontend = {
    ...ctx.frontend,
    getUserNameById: async (userId) =>
      sandboxUsers.find((u) => u.id === userId)?.name || null,
  };
  renderUsers();
  renderUserSelect();
}

async function deleteUser(id) {
  await fetch("/api/users?id=" + encodeURIComponent(id), { method: "DELETE" });
  await fetchUsers();
}

async function addUser() {
  const id = document.getElementById("new-user-id").value.trim();
  const name = document.getElementById("new-user-name").value.trim();
  const role = document.getElementById("new-user-role").value;
  if (!name) return;
  await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id || undefined, name, role }),
  });
  document.getElementById("new-user-id").value = "";
  document.getElementById("new-user-name").value = "";
  await fetchUsers();
}

function renderUserSelect() {
  const select = document.getElementById("current-user-select");
  select.innerHTML = "";
  sandboxUsers.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    const roleLabel =
      u.role === "OWNER" ? "Owner" : u.role === "ADMIN" ? "Admin" : "Member";
    opt.textContent = `${u.name} (${roleLabel})`;
    if (u.id === currentSandboxUserId) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderUsers() {
  const list = document.getElementById("users-list");
  list.innerHTML = "";
  sandboxUsers.forEach((u) => {
    const card = document.createElement("div");
    card.className = "user-card";
    const roleLabel =
      u.role === "OWNER" ? "Owner" : u.role === "ADMIN" ? "Admin" : "Member";
    const roleClass =
      u.role === "OWNER"
        ? "text-violet-400"
        : u.role === "ADMIN"
          ? "text-blue-400"
          : "text-zinc-400";
    card.innerHTML = `
                <div class="flex-1 min-w-0">
                    <div class="font-semibold text-[13px]">${u.name}</div>
                    <div class="text-[11px] text-[#5a5a6e] font-mono">${u.id}</div>
                </div>
                <span class="text-xs font-medium ${roleClass} px-2 py-1 rounded bg-violet-500/10">${roleLabel}</span>
                <button class="btn-red text-xs delete-user-btn" data-id="${u.id}">Delete</button>
            `;
    list.appendChild(card);
  });
  document.querySelectorAll(".delete-user-btn").forEach((btn) => {
    btn.addEventListener("click", (e) =>
      deleteUser(e.target.getAttribute("data-id")),
    );
  });
}

/* ── Dev: DMs ── */
async function loadDirectMessages() {
  const res = await fetch("/api/direct-messages?limit=100");
  const dms = await res.json();
  renderDirectMessages(dms);
}

function renderDirectMessages(dms) {
  const list = document.getElementById("dms-list");
  if (!list) return;

  if (dms.length === 0) {
    list.innerHTML =
      '<div class="p-8 text-center text-sb-text-muted text-sm">No direct messages yet</div>';
    return;
  }

  function formatMentions(text) {
    const MENTION_PATTERN = /<@([a-zA-Z0-9_-]+)>/g;
    let lastIndex = 0;
    const result = [];
    let m;
    while ((m = MENTION_PATTERN.exec(text)) !== null) {
      if (m.index > lastIndex) result.push(text.slice(lastIndex, m.index));
      const user = sandboxUsers.find((u) => u.id === m[1]);
      const chip = document.createElement("span");
      chip.className = "mention-chip";
      chip.textContent = user ? `@${user.name}` : `@${m[1]}`;
      chip.title = user ? `User ID: ${m[1]}` : "Unknown user";
      result.push(chip.outerHTML);
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) result.push(text.slice(lastIndex));
    return result.join("");
  }

  list.innerHTML = "";
  dms.forEach((dm) => {
    const div = document.createElement("div");
    div.className = "p-4 hover:bg-sb-tertiary transition-colors";
    const time = new Date(dm.createdAt).toLocaleString();
    div.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-full bg-sb-accent flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    ${dm.sender.name.charAt(0).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-semibold text-sm">${dm.sender.name}</span>
                        <span class="text-xs text-sb-text-muted">→</span>
                        <span class="font-semibold text-sm">${dm.recipient.name}</span>
                        <span class="text-xs text-sb-text-muted ml-auto">${time}</span>
                    </div>
                    <div class="text-sm text-sb-text-secondary whitespace-pre-wrap break-words">${formatMentions(dm.content)}</div>
                    <div class="text-[10px] text-sb-text-muted font-mono mt-1">Recipient ID: ${dm.recipientId}</div>
                </div>
            </div>
        `;
    list.appendChild(div);
  });
}

/* ── Wire up buttons ── */
document
  .getElementById("refresh-storage-btn")
  .addEventListener("click", refreshStorage);
document
  .getElementById("save-storage-btn")
  .addEventListener("click", saveStorage);
document.getElementById("add-user-btn").addEventListener("click", addUser);
document
  .getElementById("refresh-dms-btn")
  ?.addEventListener("click", loadDirectMessages);
document
  .getElementById("current-user-select")
  .addEventListener("change", async (e) => {
    currentSandboxUserId = e.target.value;
    ctx.currentUserId = currentSandboxUserId;
    await fetch("/api/current-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentUserId: currentSandboxUserId }),
    });
    reRenderApp();
  });

/* ── Load extension bundle and CSS ── */
const script = document.createElement("script");
script.src = "/bundle.js";
script.onload = async () => {
  // Load extension CSS if exists (isolated styles)
  fetch("/bundle.css")
    .then((res) => {
      if (res.ok) return res.text();
      // Fallback to extension.css if bundle.css not found
      return fetch("/extension.css").then((r) => (r.ok ? r.text() : null));
    })
    .then((css) => {
      if (css) {
        const style = document.createElement("style");
        style.id = "extension-styles";
        style.textContent = css;
        document.head.appendChild(style);
      }
    })
    .catch(() => {});

  await fetchUsers();
  await loadMessageHistory();
  await loadDirectMessages();
  const res = await fetch("/api/current-user");
  const { currentUserId: savedUserId } = await res.json();
  currentSandboxUserId = savedUserId;
  ctx.currentUserId = savedUserId;
  refreshStorage();
  tryMount();
  renderUserSelect();
};
document.body.appendChild(script);

/* ── Debug Console ── */
const extLogsContainer = document.getElementById("ext-logs-panel");
const extLogsFrontendContainer = document.getElementById("ext-logs-frontend");
const extLogsBackendContainer = document.getElementById("ext-logs-backend");
const extLogsDivider = document.getElementById("ext-logs-divider");
const apiCallsContainer = document.getElementById("api-calls-panel");
const tabExtLogs = document.getElementById("tab-ext-logs");
const tabApiCalls = document.getElementById("tab-api-calls");
const clearDebugBtn = document.getElementById("clear-debug-btn");
const toggleDebugBtn = document.getElementById("toggle-debug-btn");

let debugPaused = false;
let extLogs = [];
let apiCalls = [];

tabExtLogs.addEventListener("click", () => {
  tabExtLogs.classList.add("active");
  tabApiCalls.classList.remove("active");
  extLogsContainer.style.display = "flex";
  apiCallsContainer.style.display = "none";
});

tabApiCalls.addEventListener("click", () => {
  tabApiCalls.classList.add("active");
  tabExtLogs.classList.remove("active");
  extLogsContainer.style.display = "none";
  apiCallsContainer.style.display = "flex";
});

function formatValue(value) {
  if (value === null) return '<span class="null">null</span>';
  if (value === undefined) return '<span class="null">undefined</span>';
  if (typeof value === "string")
    return `<span class="string">"${escapeHtml(value)}"</span>`;
  if (typeof value === "number") return `<span class="number">${value}</span>`;
  if (typeof value === "boolean")
    return `<span class="boolean">${value}</span>`;
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(
        ([k, v]) =>
          `<span class="key">"${escapeHtml(k)}"</span>: ${formatValue(v)}`,
      )
      .join(", ");
    return `{${entries}}`;
  }
  return escapeHtml(String(value));
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function addExtLog(type, args, source = "frontend") {
  if (debugPaused) return;
  const time = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const log = { type, time, args, source };
  extLogs.push(log);
  if (extLogs.length > 200) extLogs.shift();
  renderExtLogs();
}

function renderExtLogs() {
  const frontendLogs = extLogs.filter((log) => log.source === "frontend");
  const backendLogs = extLogs.filter((log) => log.source === "backend");

  tabExtLogs.textContent = `Extension Logs (${extLogs.length})`;

  extLogsFrontendContainer.innerHTML = frontendLogs
    .map((log) => {
      const message = log.args.map((arg) => formatValue(arg)).join(" ");
      return `
            <div class="debug-log ${log.type}">
                <span class="debug-log-time">${log.time}</span>
                <span class="debug-log-message">${message}</span>
            </div>
        `;
    })
    .join("");
  extLogsFrontendContainer.scrollTop = extLogsFrontendContainer.scrollHeight;

  extLogsBackendContainer.innerHTML = backendLogs
    .map((log) => {
      const message = log.args.map((arg) => formatValue(arg)).join(" ");
      return `
            <div class="debug-log ${log.type}">
                <span class="debug-log-time">${log.time}</span>
                <span class="debug-log-message">${message}</span>
            </div>
        `;
    })
    .join("");
  extLogsBackendContainer.scrollTop = extLogsBackendContainer.scrollHeight;
}

function addApiCall(method, path, params) {
  if (debugPaused) return;
  const time = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const call = { method, path, params, time };
  apiCalls.push(call);
  if (apiCalls.length > 200) apiCalls.shift();
  renderApiCalls();
}

function renderApiCalls() {
  tabApiCalls.textContent = `API Calls (${apiCalls.length})`;
  apiCallsContainer.innerHTML = apiCalls
    .map((call, idx) => {
      let paramsHtml = "";
      if (call.params && Object.keys(call.params).length > 0) {
        const paramsStr = JSON.stringify(call.params, null, 2);
        paramsHtml = `
                <div class="debug-toggle collapsed" data-target="params-${idx}">
                    <span class="debug-toggle-arrow collapsed">▶</span>
                    <span>Request (${Object.keys(call.params).length} keys)</span>
                </div>
                <div class="debug-toggle-content collapsed" id="params-${idx}">
                    <div class="debug-api-params"><pre>${escapeHtml(paramsStr)}</pre></div>
                </div>
            `;
      }

      let responseHtml = "";
      if (call.response !== undefined) {
        const responseStr = JSON.stringify(call.response, null, 2);
        responseHtml = `
                <div class="debug-toggle collapsed" data-target="response-${idx}">
                    <span class="debug-toggle-arrow collapsed">▶</span>
                    <span>Response</span>
                </div>
                <div class="debug-toggle-content collapsed" id="response-${idx}">
                    <div class="debug-api-response"><div class="debug-api-response-label">RESPONSE</div><pre>${escapeHtml(responseStr)}</pre></div>
                </div>
            `;
      }

      return `
            <div class="debug-log info">
                <span class="debug-log-time">${call.time}</span>
                <span class="debug-api-method ${call.method}">${call.method}</span>
                <span class="debug-api-path">${escapeHtml(call.path)}</span>
                ${paramsHtml}
                ${responseHtml}
            </div>
        `;
    })
    .join("");

  document.querySelectorAll(".debug-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const targetId = toggle.dataset.target;
      const content = document.getElementById(targetId);
      if (content) {
        content.classList.toggle("collapsed");
        toggle.classList.toggle("collapsed");
        toggle
          .querySelector(".debug-toggle-arrow")
          .classList.toggle("collapsed");
      }
    });
  });

  apiCallsContainer.scrollTop = apiCallsContainer.scrollHeight;
}

clearDebugBtn.addEventListener("click", () => {
  extLogs = [];
  apiCalls = [];
  renderExtLogs();
  renderApiCalls();
});

toggleDebugBtn.addEventListener("click", () => {
  debugPaused = !debugPaused;
  toggleDebugBtn.textContent = debugPaused ? "Resume" : "Pause";
});

const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const [url, options = {}] = args;
  const urlStr = url instanceof Request ? url.url : url;
  const method = (options.method || "GET").toUpperCase();

  if (urlStr.startsWith("/api/") || urlStr.includes("/api/")) {
    let params = null;
    if (options.body) {
      try {
        params = JSON.parse(options.body);
      } catch (e) {
        params = options.body;
      }
    }
    if (urlStr.includes("?")) {
      const urlObj = new URL(urlStr, window.location.origin);
      params = params || {};
      urlObj.searchParams.forEach((v, k) => {
        params[k] = v;
      });
    }
    const path = urlStr.split(window.location.origin)[1] || urlStr;

    const callIndex = apiCalls.length;
    addApiCall(method, path, params);

    try {
      const response = await originalFetch.apply(this, args);
      const responseClone = response.clone();
      try {
        const responseData = await responseClone.json();
        if (apiCalls[callIndex]) {
          apiCalls[callIndex].response = responseData;
          renderApiCalls();
        }
      } catch (e) {
        try {
          const text = await responseClone.text();
          if (apiCalls[callIndex]) {
            apiCalls[callIndex].response = text;
            renderApiCalls();
          }
        } catch (e2) {}
      }
      return response;
    } catch (err) {
      if (apiCalls[callIndex]) {
        apiCalls[callIndex].response = { error: err.message };
        renderApiCalls();
      }
      throw err;
    }
  }

  return originalFetch.apply(this, args);
};

window.addExtLog = addExtLog;

/* ── Capture extension frontend console logs ── */
(function () {
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };

  console.log = (...args) => {
    originalConsole.log(...args);
    addExtLog("log", args, "frontend");
  };
  console.warn = (...args) => {
    originalConsole.warn(...args);
    addExtLog("warn", args, "frontend");
  };
  console.error = (...args) => {
    originalConsole.error(...args);
    addExtLog("error", args, "frontend");
  };
  console.info = (...args) => {
    originalConsole.info(...args);
    addExtLog("info", args, "frontend");
  };
})();

/* ── Listen for backend debug logs ── */
const debugEvents = new EventSource("/api/debug/logs");
debugEvents.onmessage = (e) => {
  const log = JSON.parse(e.data);
  addExtLog(log.type, log.args, log.source || "backend");
};

/* ── Resizable divider for split logs ── */
(function () {
  let isResizing = false;
  let startX = 0;
  let startLeftWidth = 0;

  extLogsDivider.addEventListener("mousedown", (e) => {
    isResizing = true;
    startX = e.clientX;
    startLeftWidth = extLogsFrontendContainer.offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const containerWidth =
      extLogsFrontendContainer.parentElement.offsetWidth -
      extLogsDivider.offsetWidth;
    const newWidth = Math.max(
      100,
      Math.min(containerWidth - 100, startLeftWidth + dx),
    );
    const percentage = (newWidth / containerWidth) * 100;
    extLogsFrontendContainer.style.flex = `0 0 ${percentage}%`;
    extLogsBackendContainer.style.flex = `0 0 ${100 - percentage}%`;
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  });
})();
