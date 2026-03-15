import React from 'react'
import ReactDOM from 'react-dom/client'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as lucideReact from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'

// Expose React and lucide globally for extension bundles
window.React = React
window.ReactDOM = ReactDOM as typeof window.ReactDOM
window.ReactJsxRuntime = ReactJsxRuntime
window.lucideReact = lucideReact

// Types
interface User {
  id: string
  name: string
  role: string
}

interface Message {
  id: string
  content: string
  userId: string
  user: { id: string; name: string }
  createdAt: string
  reactions?: Reaction[]
}

interface Reaction {
  id: string
  messageId: string
  emoji: string
  userId: string
  user: { id: string; name: string }
}

interface DirectMessage {
  id: string
  senderId: string
  recipientId: string
  content: string
  createdAt: string
  sender: { id: string; name: string }
  recipient: { id: string; name: string }
}

// Icons
const Icons = {
  Chat: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  App: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  Database: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Mail: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="7" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="17" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
  Terminal: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
}

// Extension context types (same as in flux-fe)
interface ExtensionContext {
  workspaceId: string
  currentUserId: string
  storage: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
    listKeys: () => Promise<string[]>
  }
  ai: {
    complete: (messages: { role: string; content: string }[], options?: object) => Promise<string>
  }
  users: {
    list: () => Promise<User[]>
    get: (userId: string) => Promise<User | null>
    getRole: (userId: string) => Promise<string | null>
    getCurrentUserRole: () => Promise<string>
  }
  messages: {
    sendMessage: (channelId: string, content: string) => Promise<void>
    sendDirectMessage: (userId: string, content: string) => Promise<void>
    getMessages: (channelId: string, limit?: number) => Promise<Message[]>
    addReaction: (messageId: string, emoji: string) => Promise<{ reaction?: Reaction; removed?: boolean }>
    getReactions: (messageId: string) => Promise<Reaction[]>
  }
  frontend?: {
    render: (element: React.ReactElement) => void
    renderSettings: (element: React.ReactElement) => void
  }
  backend?: {
    onMessage: (handler: (event: { id: string; content: string; userId: string; channelId: string; workspaceId: string }) => void) => void
    onReaction: (handler: (event: { type: string; messageId: string; reaction: Reaction }) => void) => void
  }
}

declare global {
  interface Window {
    __FluxExtension__: {
      ExtensionPanel?: React.ComponentType<{ ctx: ExtensionContext; currentUserId: string }>
      ExtensionPage?: React.ComponentType<{ ctx: ExtensionContext; currentUserId: string }>
      sidebarItem?: { icon: string; label: string }
    }
    __ctx__: ExtensionContext
    ReactJsxRuntime: typeof import('react/jsx-runtime')
  }
}

// Nav Item component
function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-[10px] px-3 py-[10px] rounded-lg text-[13px] font-medium transition-all duration-200 border border-transparent ${
        active
          ? 'bg-violet-500/15 text-violet-400 border-violet-500/20'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// Message component
function Message({ message, currentUserId, onReaction }: { message: Message; currentUserId: string; onReaction: (messageId: string, emoji: string) => void }) {
  const isUser = message.userId === currentUserId || message.userId === 'ext-bot'
  
  const [showReactions, setShowReactions] = useState(false)
  const [reactions, setReactions] = useState<Reaction[]>(message.reactions || [])
  
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🎉']

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl animate-msg-in ${
        isUser 
          ? 'bg-blue-500 text-white rounded-br-sm' 
          : 'bg-zinc-800 border border-zinc-700 rounded-bl-sm'
      }`}>
        {!isUser && (
          <div className="text-[11px] text-zinc-500 mb-1 font-semibold">{message.user.name}</div>
        )}
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</div>
        
        {/* Reactions */}
        <div className="flex items-center gap-1 mt-2">
          {reactions.map((r) => (
            <button
              key={r.id}
              onClick={() => onReaction(message.id, r.emoji)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-zinc-700/50 hover:bg-zinc-700 transition-colors"
            >
              <span>{r.emoji}</span>
              <span className="text-zinc-400">{r.userId === currentUserId ? '1' : ''}</span>
            </button>
          ))}
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
          >
            +
          </button>
          {showReactions && (
            <div className="absolute mt-8 flex gap-1 p-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReaction(message.id, emoji)
                    setShowReactions(false)
                  }}
                  className="p-1 hover:bg-zinc-700 rounded transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="text-[10px] text-zinc-500 mt-1">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// Main App component
export default function App() {
  const [activeTab, setActiveTab] = useState('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [extensionName, setExtensionName] = useState('Loading...')
  const [extensionSlug, setExtensionSlug] = useState('sandbox')
  const [storage, setStorage] = useState<Record<string, unknown>>({})
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([])
  const [debugLogs, setDebugLogs] = useState<{ type: string; args: string[]; source: string }[]>([])
  const [debugPaused, setDebugPaused] = useState(false)
  const [debugTab, setDebugTab] = useState<'ext-logs' | 'api-calls'>('ext-logs')
  
  const chatRef = useRef<HTMLDivElement>(null)
  const uiMountRef = useRef<HTMLDivElement>(null)
  const settingsMountRef = useRef<HTMLDivElement>(null)

  // Load extension bundle
  useEffect(() => {
    const loadBundle = async () => {
      try {
        const res = await fetch('/bundle.js')
        const code = await res.text()
        
        // Inject CSS
        try {
          const cssRes = await fetch('/bundle.css')
          if (cssRes.ok) {
            const css = await cssRes.text()
            const style = document.createElement('style')
            style.textContent = css
            document.head.appendChild(style)
          }
        } catch {}
        
        // Evaluate bundle
        const fn = new Function('require', code + '\n;return typeof __FluxExtension__ !== "undefined" ? __FluxExtension__ : undefined')
        const exported = fn((id: string) => {
          if (id === 'react') return window.React
          if (id === 'react-dom') return window.ReactDOM
          // React 19 automatic JSX runtime
          if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') {
            return window.ReactJsxRuntime
          }
          if (id === 'lucide-react') return window.lucideReact
          throw new Error(`require(${id}) not supported`)
        })
        
        // Set up extension context
        window.__ctx__ = {
          workspaceId: 'sandbox-workspace',
          currentUserId: currentUserId,
          storage: {
            get: async (key: string) => storage[key],
            set: async (key: string, value: unknown) => {
              const newStorage = { ...storage, [key]: value }
              setStorage(newStorage)
              await fetch('/api/storage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
              })
            },
            delete: async (key: string) => {
              const newStorage = { ...storage }
              delete newStorage[key]
              setStorage(newStorage)
            },
            listKeys: async () => Object.keys(storage)
          },
          ai: {
            complete: async () => '[Mock AI response]'
          },
          users: {
            list: async () => users,
            get: async (id: string) => users.find(u => u.id === id) || null,
            getRole: async (id: string) => users.find(u => u.id === id)?.role || null,
            getCurrentUserRole: async () => users.find(u => u.id === currentUserId)?.role || 'MEMBER'
          },
          messages: {
            sendMessage: async (channelId: string, content: string) => {
              const msg: Message = {
                id: `msg-${Date.now()}`,
                content,
                userId: 'ext-bot',
                user: { id: 'ext-bot', name: extensionName },
                createdAt: new Date().toISOString(),
                reactions: []
              }
              setMessages(prev => [...prev, msg])
            },
            sendDirectMessage: async (userId: string, content: string) => {
              const dm: DirectMessage = {
                id: `dm-${Date.now()}`,
                senderId: 'ext-bot',
                recipientId: userId,
                content,
                createdAt: new Date().toISOString(),
                sender: { id: 'ext-bot', name: extensionName },
                recipient: users.find(u => u.id === userId) || { id: userId, name: 'Unknown' }
              }
              setDirectMessages(prev => [...prev, dm])
            },
            getMessages: async () => messages,
            addReaction: async (messageId: string, emoji: string) => {
              const reaction: Reaction = {
                id: `reaction-${Date.now()}`,
                messageId,
                emoji,
                userId: currentUserId,
                user: users.find(u => u.id === currentUserId) || { id: currentUserId, name: 'Unknown' }
              }
              setMessages(prev => prev.map(m => {
                if (m.id === messageId) {
                  return { ...m, reactions: [...(m.reactions || []), reaction] }
                }
                return m
              }))
              return { reaction }
            },
            getReactions: async (messageId: string) => messages.find(m => m.id === messageId)?.reactions || []
          },
          frontend: exported?.ExtensionPanel ? {
            render: (element: React.ReactElement) => {
              if (uiMountRef.current) {
                window.ReactDOM.createRoot(uiMountRef.current).render(element)
              }
            },
            renderSettings: (element: React.ReactElement) => {
              if (settingsMountRef.current) {
                window.ReactDOM.createRoot(settingsMountRef.current).render(element)
              }
            }
          } : undefined
        }
        
        // Call onLoad if exists
        if (exported?.onLoad) {
          exported.onLoad(window.__ctx__)
        }
        
        // Render UI if ExtensionPanel
        if (exported?.ExtensionPanel && uiMountRef.current) {
          window.ReactDOM.createRoot(uiMountRef.current).render(
            window.React.createElement(exported.ExtensionPanel, { 
              ctx: window.__ctx__, 
              currentUserId 
            })
          )
        }
        
        setDebugLogs(prev => [...prev, { type: 'log', args: ['[Sandbox] Extension loaded'], source: 'backend' }])
        
      } catch (e) {
        console.error('Failed to load extension:', e)
        setDebugLogs(prev => [...prev, { type: 'error', args: [`[Sandbox] Failed to load: ${e}`], source: 'backend' }])
      }
    }
    
    loadBundle()
  }, [])

  // Fetch users
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        setUsers(data)
        if (data.length > 0) {
          setCurrentUserId(data[0].id)
        }
      })
    
    fetch('/api/current-user')
      .then(r => r.json())
      .then(data => {
        if (data.currentUserId) {
          setCurrentUserId(data.currentUserId)
        }
      })
  }, [])

  // Fetch messages
  useEffect(() => {
    fetch('/api/messages')
      .then(r => r.json())
      .then(data => setMessages(data))
  }, [])

  // Fetch storage
  useEffect(() => {
    fetch('/api/storage/all')
      .then(r => r.json())
      .then(data => setStorage(data))
  }, [])

  // Fetch DMs
  useEffect(() => {
    fetch('/api/direct-messages')
      .then(r => r.json())
      .then(data => setDirectMessages(data))
  }, [])

  // Fetch manifest
  useEffect(() => {
    fetch('/manifest.json')
      .then(r => r.json())
      .then(data => {
        setExtensionName(data.name || 'Extension')
        setExtensionSlug(data.slug || 'extension')
      })
  }, [])

  // SSE for messages
  useEffect(() => {
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'reaction:added' || data.type === 'reaction:removed') {
        setMessages(prev => prev.map(m => {
          if (m.id === data.messageId) {
            if (data.type === 'reaction:added') {
              return { ...m, reactions: [...(m.reactions || []), data.reaction] }
            } else {
              return { ...m, reactions: (m.reactions || []).filter((r: Reaction) => r.id !== data.reactionId) }
            }
          }
          return m
        }))
      } else if (!data.type) {
        setMessages(prev => [...prev, data])
      }
    }
    return () => eventSource.close()
  }, [])

  // SSE for debug logs
  useEffect(() => {
    const eventSource = new EventSource('/api/debug/logs')
    eventSource.onmessage = (e) => {
      if (!debugPaused) {
        setDebugLogs(prev => [...prev.slice(-500), JSON.parse(e.data)])
      }
    }
    return () => eventSource.close()
  }, [debugPaused])

  const sendMessage = async () => {
    if (!inputValue.trim()) return
    
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: inputValue, userId: currentUserId })
    })
    
    setInputValue('')
    
    // Add to local messages
    const user = users.find(u => u.id === currentUserId)
    const msg: Message = {
      id: `msg-${Date.now()}`,
      content: inputValue,
      userId: currentUserId,
      user: user || { id: currentUserId, name: 'Unknown' },
      createdAt: new Date().toISOString(),
      reactions: []
    }
    setMessages(prev => [...prev, msg])
  }

  const handleReaction = async (messageId: string, emoji: string) => {
    await fetch(`/api/sandbox-channel/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji })
    })
  }

  const addUser = async (name: string, role: string) => {
    const id = `user-${Date.now()}`
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, role })
    })
    setUsers(prev => [...prev, { id, name, role }])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const scrollToBottom = () => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-[220px] bg-zinc-900 border-r border-zinc-800 flex flex-col flex-shrink-0">
        <div className="p-4 px-4 border-b border-zinc-800 flex items-center gap-2.5">
          <img 
            src="/icon.png" 
            alt="Icon" 
            className="w-8 h-8 rounded-lg bg-zinc-800"
            onError={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
          />
          <div className="overflow-hidden">
            <div className="font-bold text-sm truncate">{extensionName}</div>
            <div className="text-[11px] text-zinc-500">{extensionSlug}</div>
          </div>
        </div>
        
        <div className="flex-1 p-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          <NavItem 
            icon={<Icons.Chat />} 
            label="Chat" 
            active={activeTab === 'chat'} 
            onClick={() => setActiveTab('chat')} 
          />
          <NavItem 
            icon={<Icons.App />} 
            label="App UI" 
            active={activeTab === 'ui'} 
            onClick={() => setActiveTab('ui')} 
          />
          <NavItem 
            icon={<Icons.Settings />} 
            label="App Settings" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
          
          <div className="h-px bg-zinc-800 mx-3 my-2" />
          
          <div className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Developer</div>
          
          <NavItem 
            icon={<Icons.Database />} 
            label="Storage" 
            active={activeTab === 'storage'} 
            onClick={() => setActiveTab('storage')} 
          />
          <NavItem 
            icon={<Icons.Users />} 
            label="Users" 
            active={activeTab === 'users'} 
            onClick={() => setActiveTab('users')} 
          />
          <NavItem 
            icon={<Icons.Mail />} 
            label="DMs" 
            active={activeTab === 'dms'} 
            onClick={() => setActiveTab('dms')} 
          />
          <NavItem 
            icon={<Icons.Terminal />} 
            label="Debug" 
            active={activeTab === 'debug'} 
            onClick={() => setActiveTab('debug')} 
          />
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div ref={chatRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-2">
              <div className="px-3.5 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
                <div className="text-[11px] text-zinc-500 mb-1 font-semibold">Sandbox System</div>
                <div className="text-sm text-zinc-300">Welcome to the local development sandbox. Type a message below to test your extension's onMessage handler.</div>
              </div>
              
              {messages.map(msg => (
                <Message 
                  key={msg.id} 
                  message={msg} 
                  currentUserId={currentUserId}
                  onReaction={handleReaction}
                />
              ))}
            </div>
            
            <div className="p-4 px-5 bg-zinc-900 border-t border-zinc-800 flex gap-2.5 items-end">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message to the channel..."
                rows={1}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100 outline-none text-sm resize-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
              <button
                onClick={sendMessage}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        )}
        
        {/* App UI Tab */}
        {activeTab === 'ui' && (
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Icons.App />
              Extension UI
            </h2>
            <div ref={uiMountRef} className="h-full" />
            {!uiMountRef.current?.hasChildNodes() && (
              <div className="text-zinc-500 text-sm">No UI component provided by this extension.</div>
            )}
          </div>
        )}
        
        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Icons.Settings />
              Extension Settings
            </h2>
            <div ref={settingsMountRef} className="h-full" />
          </div>
        )}
        
        {/* Storage Tab */}
        {activeTab === 'storage' && (
          <div className="flex-1 p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Icons.Database />
                Storage Editor
              </h2>
              <button
                onClick={() => {
                  fetch('/api/storage/all')
                    .then(r => r.json())
                    .then(setStorage)
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
            
            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <pre className="p-4 text-sm text-zinc-300 overflow-auto h-full font-mono">
                {JSON.stringify(storage, null, 2)}
              </pre>
            </div>
          </div>
        )}
        
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Icons.Users />
              Users Manager
            </h2>
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <div className="text-sm font-semibold text-zinc-300">Active User</div>
              </div>
              <div className="px-5 py-4 flex items-center gap-3">
                <select
                  value={currentUserId}
                  onChange={(e) => {
                    setCurrentUserId(e.target.value)
                    fetch('/api/current-user', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ currentUserId: e.target.value })
                    })
                  }}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-100 px-3 py-2 rounded-lg text-sm outline-none cursor-pointer min-w-[220px] focus:border-violet-500"
                >
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
                <span className="text-xs text-zinc-500">Sends messages & passed as currentUserId</span>
              </div>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <div className="text-sm font-semibold text-zinc-300">All Users</div>
              </div>
              <div className="px-5 py-4 flex flex-col gap-2">
                {users.map(user => (
                  <div key={user.id} className="flex items-center justify-between px-4 py-3 bg-zinc-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center text-violet-400 font-medium">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-zinc-500">{user.id}</div>
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium rounded bg-zinc-700 text-zinc-400">{user.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* DMs Tab */}
        {activeTab === 'dms' && (
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-5">
              <Icons.Mail />
              Direct Messages
            </h2>
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <div className="text-sm font-semibold text-zinc-300">Messages sent by extension</div>
              </div>
              {directMessages.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">No direct messages yet</div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {directMessages.map(dm => (
                    <div key={dm.id} className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-zinc-200">{dm.sender.name}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="font-medium text-zinc-200">{dm.recipient.name}</span>
                        <span className="text-xs text-zinc-500 ml-auto">{new Date(dm.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="text-sm text-zinc-400">{dm.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Debug Tab */}
        {activeTab === 'debug' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0 p-4 border-b border-zinc-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Icons.Terminal />
                Debug Console
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setDebugLogs([])}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  Clear
                </button>
                <button 
                  onClick={() => setDebugPaused(!debugPaused)}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
                >
                  {debugPaused ? 'Resume' : 'Pause'}
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
              <button
                onClick={() => setDebugTab('ext-logs')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  debugTab === 'ext-logs' 
                    ? 'bg-violet-500/15 text-violet-400' 
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Extension Logs
              </button>
              <button
                onClick={() => setDebugTab('api-calls')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  debugTab === 'api-calls' 
                    ? 'bg-violet-500/15 text-violet-400' 
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                API Calls
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
              {debugLogs.map((log, i) => (
                <div 
                  key={i} 
                  className={`p-2 mb-1 rounded bg-zinc-900 border-l-2 animate-debug-log-in ${
                    log.type === 'error' ? 'border-red-500 bg-red-950/30' :
                    log.type === 'warn' ? 'border-amber-500 bg-amber-950/30' :
                    log.type === 'info' ? 'border-blue-500' :
                    'border-green-500'
                  }`}
                >
                  <span className="text-zinc-500 mr-2">[{log.source}]</span>
                  <span className="text-zinc-400">{log.args.join(' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
