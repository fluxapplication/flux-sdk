import React from 'react'
import ReactDOM from 'react-dom/client'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as lucideReact from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { Icons } from './components/Icons'
import { ChatTab, AppUITab, SettingsTab, StorageTab, UsersTab, DMsTab, DebugTab } from './components'

window.React = React
window.ReactDOM = ReactDOM as typeof window.ReactDOM
window.ReactJsxRuntime = ReactJsxRuntime
window.lucideReact = lucideReact

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
  frontend: {
    channels: { id: string; name: string }[]
    serverUrl: string
    getUserNameById: (userId: string) => Promise<string | null>
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

export default function App() {
  const [activeTab, setActiveTab] = useState('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [extensionName, setExtensionName] = useState('Loading...')
  const [extensionSlug, setExtensionSlug] = useState('sandbox')
  const [storage, setStorage] = useState<Record<string, unknown>>({})
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([])
  const [debugLogs, setDebugLogs] = useState<{ type: string; args: string[]; source: string }[]>([])
  const [apiCalls, setApiCalls] = useState<{ method: string; url: string; timestamp: string }[]>([])
  const [debugPaused, setDebugPaused] = useState(false)
  const [debugTab, setDebugTab] = useState<'ext-logs' | 'api-calls'>('ext-logs')
  const [extensionLoaded, setExtensionLoaded] = useState(false)
  const [extensionInfo, setExtensionInfo] = useState<{hasPage: boolean, hasPanel: boolean}>({hasPage: false, hasPanel: false})
  
  const uiMountRef = useRef<HTMLDivElement>(null)
  const settingsMountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    console.log('[Sandbox] users or currentUserId changed:', { usersLength: users.length, currentUserId })
  }, [users, currentUserId])
  
  useEffect(() => {
    console.log('[Sandbox] loadBundle effect running, users:', users.length, 'currentUserId:', currentUserId)
    
    const loadBundle = async () => {
      try {
        console.log('[Sandbox] Loading bundle.js...')
        const res = await fetch('/bundle.js')
        if (!res.ok) {
          throw new Error(`Failed to fetch bundle: ${res.status}`)
        }
        const code = await res.text()
        console.log('[Sandbox] Bundle loaded, length:', code.length)
        
        try {
          const cssRes = await fetch('/bundle.css')
          if (cssRes.ok) {
            const css = await cssRes.text()
            const style = document.createElement('style')
            style.textContent = css
            document.head.appendChild(style)
          }
        } catch {}
        
        console.log('[Sandbox] Evaluating bundle...')
        const fn = new Function('require', code + '\n;return typeof __FluxExtension__ !== "undefined" ? __FluxExtension__ : undefined')
        const exported = fn((id: string) => {
          console.log('[Sandbox] require:', id)
          if (id === 'react') return window.React
          if (id === 'react-dom') return window.ReactDOM
          if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') {
            return window.ReactJsxRuntime
          }
          if (id === 'lucide-react') return window.lucideReact
          throw new Error(`require(${id}) not supported`)
        })
        console.log('[Sandbox] Bundle evaluated, exported:', exported)
        
        setExtensionInfo({
          hasPage: !!exported?.ExtensionPage,
          hasPanel: !!exported?.ExtensionPanel
        })
        
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
          frontend: {
            channels: [
              { id: 'sandbox-channel', name: 'general' },
              { id: 'sandbox-channel-2', name: 'dev' }
            ],
            serverUrl: `http://${window.location.host}`,
            getUserNameById: async (userId: string) => {
              const user = users.find(u => u.id === userId)
              return user ? user.name : null
            },
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
          }
        }
        
        if (exported?.onLoad) {
          exported.onLoad(window.__ctx__)
        }
        
        if (exported?.ExtensionPage && uiMountRef.current) {
          console.log('[Sandbox] Rendering ExtensionPage...')
          try {
            const root = window.ReactDOM.createRoot(uiMountRef.current)
            const element = window.React.createElement(exported.ExtensionPage, { 
              ctx: window.__ctx__, 
              currentUserId 
            })
            root.render(element)
            console.log('[Sandbox] Render complete')
          } catch (renderErr) {
            console.error('[Sandbox] Render error:', renderErr)
          }
        }
        
        if (exported?.ExtensionPanel && settingsMountRef.current) {
          console.log('[Sandbox] Rendering ExtensionPanel to settings mount...')
          try {
            const root = window.ReactDOM.createRoot(settingsMountRef.current)
            const element = window.React.createElement(exported.ExtensionPanel, { 
              ctx: window.__ctx__, 
              currentUserId 
            })
            root.render(element)
          } catch (renderErr) {
            console.error('[Sandbox] Settings render error:', renderErr)
          }
        }
        
        setExtensionLoaded(true)
        setDebugLogs(prev => [...prev, { type: 'log', args: ['[Sandbox] Extension loaded'], source: 'backend' }])
        
      } catch (e) {
        console.error('Failed to load extension:', e)
        setExtensionLoaded(true)
        setDebugLogs(prev => [...prev, { type: 'error', args: [`[Sandbox] Failed to load: ${e}`], source: 'backend' }])
      }
    }
    
    loadBundle()
  }, [users, currentUserId, activeTab])
  
  useEffect(() => {
    if (activeTab !== 'ui') return
    console.log('[Sandbox] UI tab activated')
  }, [activeTab, extensionLoaded, extensionInfo])

  useEffect(() => {
    if (activeTab !== 'settings') return
    console.log('[Sandbox] Settings tab activated')
  }, [activeTab, extensionLoaded, extensionInfo])

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        setUsers(data)
        if (data.length > 0) {
          setCurrentUserId(data[0].id)
        }
      })
      .catch(e => console.error('[Sandbox] Failed to fetch users:', e))
    
    fetch('/api/current-user')
      .then(r => r.json())
      .then(data => {
        if (data.currentUserId) {
          setCurrentUserId(data.currentUserId)
        }
      })
  }, [])

  useEffect(() => {
    fetch('/api/messages')
      .then(r => r.json())
      .then(data => setMessages(data))
  }, [])

  useEffect(() => {
    fetch('/api/storage/all')
      .then(r => r.json())
      .then(data => setStorage(data))
  }, [])

  useEffect(() => {
    fetch('/api/direct-messages')
      .then(r => r.json())
      .then(data => setDirectMessages(data))
  }, [])

  useEffect(() => {
    fetch('/manifest.json')
      .then(r => r.json())
      .then(data => {
        setExtensionName(data.name || 'Extension')
        setExtensionSlug(data.slug || 'extension')
      })
  }, [])

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

  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const [url, options] = args
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.startsWith('/api/')) {
        const method = options?.method || 'GET'
        setApiCalls(prev => [...prev.slice(-100), {
          method,
          url: urlStr,
          timestamp: new Date().toLocaleTimeString()
        }])
      }
      return originalFetch(...args)
    }
    return () => { window.fetch = originalFetch }
  }, [])

  useEffect(() => {
    const eventSource = new EventSource('/api/debug/logs')
    eventSource.onmessage = (e) => {
      if (!debugPaused) {
        setDebugLogs(prev => [...prev.slice(-500), JSON.parse(e.data)])
      }
    }
    return () => eventSource.close()
  }, [debugPaused])

  const handleReaction = async (messageId: string, emoji: string) => {
    await fetch(`/api/sandbox-channel/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji })
    })
  }

  const sendMessage = async (content: string) => {
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, userId: currentUserId })
    })
    
    const user = users.find(u => u.id === currentUserId)
    const msg: Message = {
      id: `msg-${Date.now()}`,
      content,
      userId: currentUserId,
      user: user || { id: currentUserId, name: 'Unknown' },
      createdAt: new Date().toISOString(),
      reactions: []
    }
    setMessages(prev => [...prev, msg])
  }

  const handleCurrentUserChange = async (userId: string) => {
    setCurrentUserId(userId)
    await fetch('/api/current-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUserId: userId })
    })
  }

  const refreshStorage = () => {
    fetch('/api/storage/all')
      .then(r => r.json())
      .then(data => setStorage(data))
  }

  const saveStorage = async () => {
    try {
      const data = JSON.parse(JSON.stringify(storage))
      await fetch('/api/storage/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      alert('Storage saved!')
    } catch (e) {
      alert('Invalid JSON')
    }
  }

  const clearLogs = () => setDebugLogs([])
  const togglePause = () => setDebugPaused(prev => !prev)

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
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
      
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {activeTab === 'chat' && (
          <ChatTab 
            messages={messages}
            currentUserId={currentUserId}
            users={users}
            onReaction={handleReaction}
            onSendMessage={sendMessage}
          />
        )}
        
        {activeTab === 'ui' && (
          <AppUITab 
            extensionLoaded={extensionLoaded}
            extensionInfo={extensionInfo}
            currentUserId={currentUserId}
            uiMountRef={uiMountRef}
          />
        )}
        
        {activeTab === 'settings' && (
          <SettingsTab 
            extensionLoaded={extensionLoaded}
            extensionInfo={extensionInfo}
            settingsMountRef={settingsMountRef}
          />
        )}
        
        {activeTab === 'storage' && (
          <StorageTab 
            storage={storage}
            onStorageChange={setStorage}
            onRefresh={refreshStorage}
            onSave={saveStorage}
          />
        )}
        
        {activeTab === 'users' && (
          <UsersTab 
            users={users}
            currentUserId={currentUserId}
            onCurrentUserChange={handleCurrentUserChange}
          />
        )}
        
        {activeTab === 'dms' && (
          <DMsTab 
            directMessages={directMessages}
          />
        )}
        
        {activeTab === 'debug' && (
          <DebugTab 
            debugLogs={debugLogs}
            apiCalls={apiCalls}
            debugPaused={debugPaused}
            debugTab={debugTab}
            onClearLogs={clearLogs}
            onTogglePause={togglePause}
            onTabChange={setDebugTab}
          />
        )}
      </div>
    </div>
  )
}
