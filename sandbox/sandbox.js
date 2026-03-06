/* ── Navigation ── */
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(item.dataset.target).classList.add('active');
    });
});

/* ── Toast ── */
function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

/* ── Chat core ── */
const chat = document.getElementById('chat');
const input = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
let manifest = {};

fetch('/manifest.json')
    .then(r => r.json())
    .then(m => {
        manifest = m;
        document.getElementById('ext-name').textContent = m.name;
        document.getElementById('ext-slug').textContent = m.slug;
        document.title = `Sandbox: ${m.name}`;
    }).catch(console.error);

function appendMessage(sender, text, isBot) {
    const div = document.createElement('div');
    div.className = `message ${isBot ? 'bot' : 'user'}`;
    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    let lastIndex = 0;
    const MENTION_PATTERN = /<@([a-zA-Z0-9_-]+)>/g;
    let m;
    while ((m = MENTION_PATTERN.exec(text)) !== null) {
        if (m.index > lastIndex) textDiv.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
        const mentionSpan = document.createElement('span');
        mentionSpan.className = 'mention';
        const user = sandboxUsers.find(u => u.id === m[1]);
        mentionSpan.textContent = user ? `@${user.name}` : `@${m[1]}`;
        textDiv.appendChild(mentionSpan);
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) textDiv.appendChild(document.createTextNode(text.slice(lastIndex)));
    div.innerHTML = `<div class="text-[11px] text-[#5a5a6e] mb-1 font-semibold">${sender}</div>`;
    div.appendChild(textDiv);
    chat.appendChild(div);
    setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 10);
}

/* ── SSE ── */
const events = new EventSource('/api/events');
events.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'reload') { window.location.reload(); return; }
    appendMessage(msg.user.name, msg.content, true);
};

/* ── Mention Picker ── */
const mentionPicker = document.getElementById('mention-picker');
let pickerVisible = false, pickerQuery = '', pickerIndex = 0, filteredMembers = [], mentionRange = null;

function updateMentionPicker() {
    if (!pickerVisible || filteredMembers.length === 0) { mentionPicker.classList.remove('visible'); return; }
    mentionPicker.innerHTML = '';
    filteredMembers.forEach((m, i) => {
        const div = document.createElement('div');
        div.className = `picker-item ${i === pickerIndex ? 'active' : ''}`;
        div.innerHTML = `<div class="picker-avatar" style="background-image:url(${m.avatarUrl})"></div><div>${m.name}</div>`;
        div.addEventListener('mousedown', (e) => { e.preventDefault(); insertMention(m); });
        mentionPicker.appendChild(div);
    });
    mentionPicker.classList.add('visible');
}

function insertMention(user) {
    if (!mentionRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(mentionRange);
    mentionRange.deleteContents();
    const chip = document.createElement('span');
    chip.className = 'mention-chip'; chip.contentEditable = 'false';
    chip.setAttribute('data-user-id', user.id); chip.textContent = `@${user.name}`;
    mentionRange.insertNode(chip);
    mentionRange.setStartAfter(chip); mentionRange.collapse(true);
    const space = document.createTextNode('\u200B ');
    mentionRange.insertNode(space); mentionRange.setStartAfter(space); mentionRange.collapse(true);
    sel.removeAllRanges(); sel.addRange(mentionRange);
    pickerVisible = false; updateMentionPicker(); input.focus();
}

function getCaretBoundary() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
        const text = range.commonAncestorContainer.textContent.substring(0, range.endOffset);
        const lastAt = text.lastIndexOf('@');
        if (lastAt === -1) return null;
        const charBefore = lastAt > 0 ? text[lastAt - 1] : ' ';
        if (charBefore !== ' ' && charBefore !== '\n') return null;
        const afterAt = text.slice(lastAt + 1);
        const spaceIdx = afterAt.search(/\s/);
        const query = spaceIdx === -1 ? afterAt : afterAt.slice(0, spaceIdx);
        const r = range.cloneRange();
        r.setStart(range.commonAncestorContainer, lastAt);
        r.setEnd(range.commonAncestorContainer, range.endOffset);
        return { query, range: r };
    }
    return null;
}

input.addEventListener('input', () => {
    const boundary = getCaretBoundary();
    if (boundary) {
        pickerQuery = boundary.query.toLowerCase();
        filteredMembers = sandboxUsers.filter(u => u && u.name && u.name.toLowerCase().includes(pickerQuery));
        pickerVisible = true; pickerIndex = 0; mentionRange = boundary.range;
    } else { pickerVisible = false; }
    updateMentionPicker();
});

input.addEventListener('keydown', e => {
    if (pickerVisible) {
        if (e.key === 'ArrowDown') { e.preventDefault(); pickerIndex = (pickerIndex + 1) % filteredMembers.length; updateMentionPicker(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); pickerIndex = (pickerIndex - 1 + filteredMembers.length) % filteredMembers.length; updateMentionPicker(); return; }
        if (e.key === 'Enter') { e.preventDefault(); if (filteredMembers[pickerIndex]) insertMention(filteredMembers[pickerIndex]); return; }
        if (e.key === 'Escape') { e.preventDefault(); pickerVisible = false; updateMentionPicker(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function serializeInput() {
    let out = "";
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) { out += node.textContent.replace(/\u200B/g, ""); return; }
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === "BR") { out += "\n"; return; }
            if (node.tagName === "DIV" && out.length > 0) out += "\n";
            if (node.getAttribute("contenteditable") === "false" && node.hasAttribute("data-user-id")) { out += `<@${node.getAttribute("data-user-id")}>`; return; }
            node.childNodes.forEach(walk);
        }
    };
    input.childNodes.forEach(walk);
    return out;
}

async function sendMessage() {
    const finalContent = serializeInput().trim();
    if (!finalContent) return;
    input.innerHTML = '';
    const sender = sandboxUsers.find(u => u.id === currentSandboxUserId) || { name: 'You' };
    appendMessage(sender.name, finalContent, false);
    await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: finalContent, userId: currentSandboxUserId })
    });
}

sendBtn.addEventListener('click', sendMessage);

/* ── Frontend Context ── */
const frontendCtx = {
    workspaceId: 'sandbox-workspace',
    channels: [{ id: 'C_SANDBOX_1', name: 'general' }, { id: 'C_SANDBOX_2', name: 'dev-team' }],
    serverUrl: `http://${window.location.host}`,
    users: [],
    storage: {
        get: async (key) => { const res = await fetch('/api/storage?key=' + encodeURIComponent(key)); const data = await res.json(); return data.value; },
        set: async (key, value) => { await fetch('/api/storage', { method: 'POST', body: JSON.stringify({ key, value }) }); },
        delete: async (key) => { await fetch('/api/storage', { method: 'POST', body: JSON.stringify({ key, value: null }) }); },
        listKeys: async () => []
    },
    getUserNameById: async (userId) => { const u = frontendCtx.users.find(u => u.id === userId); return u ? u.name : null; }
};

let appMounted = false, settingsMounted = false, currentSandboxUserId = 'user-1';

const tryMount = () => {
    if (window.__FluxExtension__) {
        const ext = window.__FluxExtension__.default || window.__FluxExtension__;
        if (ext.ExtensionPage && !appMounted) {
            const root = ReactDOM.createRoot(document.getElementById('ui-mount'));
            root.render(React.createElement(ext.ExtensionPage, { ctx: frontendCtx, currentUserId: currentSandboxUserId }));
            appMounted = true;
        }
        if (ext.ExtensionPanel && !settingsMounted) {
            const el = document.getElementById('settings-mount');
            if (el) { const root = ReactDOM.createRoot(el); root.render(React.createElement(ext.ExtensionPanel, { ctx: frontendCtx, currentUserId: currentSandboxUserId })); settingsMounted = true; }
        }
    }
    if (!appMounted && !settingsMounted) setTimeout(tryMount, 50);
};

const reRenderApp = () => {
    if (!window.__FluxExtension__) return;
    const ext = window.__FluxExtension__.default || window.__FluxExtension__;
    if (ext.ExtensionPage && appMounted) { ReactDOM.createRoot(document.getElementById('ui-mount')).render(React.createElement(ext.ExtensionPage, { ctx: frontendCtx, currentUserId: currentSandboxUserId })); }
    if (ext.ExtensionPanel && settingsMounted) { ReactDOM.createRoot(document.getElementById('settings-mount')).render(React.createElement(ext.ExtensionPanel, { ctx: frontendCtx, currentUserId: currentSandboxUserId })); }
};

/* ── Dev: JSON Editor ── */
let jsonEditor = null;
function initJsonEditor() {
    const container = document.getElementById('jsoneditor-container');
    jsonEditor = new FluxJsonEditor(container);
}
initJsonEditor();

async function refreshStorage() {
    const res = await fetch('/api/storage/all');
    const data = await res.json();
    jsonEditor.set(data);
}

async function saveStorage() {
    try {
        const data = jsonEditor.get();
        await fetch('/api/storage/all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        showToast('Storage saved successfully!');
    } catch (e) {
        showToast('Invalid JSON — fix errors before saving', 'error');
    }
}

/* ── Dev: Users ── */
let sandboxUsers = [];

async function fetchUsers() {
    const res = await fetch('/api/users');
    sandboxUsers = await res.json();
    frontendCtx.users = sandboxUsers;
    renderUsers();
    renderUserSelect();
}

async function deleteUser(id) {
    await fetch('/api/users?id=' + encodeURIComponent(id), { method: 'DELETE' });
    await fetchUsers();
}

async function addUser() {
    const name = document.getElementById('new-user-name').value.trim();
    const avatarUrl = document.getElementById('new-user-avatar').value.trim();
    if (!name) return;
    await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatarUrl })
    });
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-avatar').value = '';
    await fetchUsers();
}

function renderUserSelect() {
    const select = document.getElementById('current-user-select');
    select.innerHTML = '';
    sandboxUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name} (${u.id})`;
        if (u.id === currentSandboxUserId) opt.selected = true;
        select.appendChild(opt);
    });
}

function renderUsers() {
    const list = document.getElementById('users-list');
    list.innerHTML = '';
    sandboxUsers.forEach(u => {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
                <div class="user-avatar" style="background-image:url(${u.avatarUrl})"></div>
                <div class="flex-1 min-w-0">
                    <div class="font-semibold text-[13px]">${u.name}</div>
                    <div class="text-[11px] text-[#5a5a6e] font-mono">${u.id}</div>
                </div>
                <button class="btn-red text-xs delete-user-btn" data-id="${u.id}">Delete</button>
            `;
        list.appendChild(card);
    });
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteUser(e.target.getAttribute('data-id')));
    });
}

/* ── Wire up buttons ── */
document.getElementById('refresh-storage-btn').addEventListener('click', refreshStorage);
document.getElementById('save-storage-btn').addEventListener('click', saveStorage);
document.getElementById('add-user-btn').addEventListener('click', addUser);
document.getElementById('current-user-select').addEventListener('change', (e) => {
    currentSandboxUserId = e.target.value;
    reRenderApp();
});

/* ── Load extension bundle ── */
const script = document.createElement('script');
script.src = '/bundle.js';
script.onload = () => {
    fetchUsers().then(() => tryMount());
    refreshStorage();
};
document.body.appendChild(script);
