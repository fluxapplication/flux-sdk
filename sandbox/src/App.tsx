import React from 'react'
import ReactDOM from 'react-dom/client'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as lucideReact from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { ToastContainer, addToast } from './components/Toast'
import { Icons } from './components/Icons'
import { ChatTab, AppUITab, SettingsTab, StorageTab, UsersTab, DMsTab, DebugTab, ChannelsTab, JobsTab } from './components'
import { api, User, Message, Reaction, DirectMessage } from './components/api'

function resolveMentions(content: string, users: User[]) {
  return content.replace(/<@([^>]+)>/g, (_, userId) => {
    const user = users.find(u => u.id === userId)
    return user ? `@${user.name}` : `@${userId}`
  })
}

window.React = React
window.ReactDOM = ReactDOM as typeof window.ReactDOM
window.ReactJsxRuntime = ReactJsxRuntime
window.lucideReact = lucideReact
;(globalThis as unknown as { addToast: typeof import('./components/Toast').addToast }).addToast = addToast
Object.defineProperty(window, 'addToast', { value: addToast, writable: true })

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
    sendMessage: (channelId: string, content: string) => Promise<{ messageId: string }>
    editMessage: (channelId: string, messageId: string, content: string) => Promise<void>
    sendDirectMessage: (userId: string, content: string) => Promise<void>
    getMessages: (channelId: string, limit?: number) => Promise<Message[]>
    addReaction: (channelId: string, messageId: string, emoji: string) => Promise<{ reaction?: Reaction; removed?: boolean }>
    getReactions: (channelId: string, messageId: string) => Promise<Reaction[]>
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
      messageRenderers?: {
        match: (content: string) => boolean
        component: React.ComponentType<{ message: Message; ctx: ExtensionContext; currentUserId: string }>
      }[]
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
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([
    { id: 'sandbox-channel', name: 'general' },
    { id: 'sandbox-channel-2', name: 'dev' }
  ])
  const [currentChannelId, setCurrentChannelId] = useState('sandbox-channel')
  const [currentUserId, setCurrentUserId] = useState('')
  const [extensionName, setExtensionName] = useState('Loading...')
  const [extensionSlug, setExtensionSlug] = useState('sandbox')
  const [extensionCommands, setExtensionCommands] = useState<{ name: string; description: string; usage: string }[]>([])
  const [storage, setStorage] = useState<Record<string, unknown>>({})
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([])
  const [debugLogs, setDebugLogs] = useState<{ type: string; args: string[]; source: string }[]>([])
  const [apiCalls, setApiCalls] = useState<{ method: string; url: string; timestamp: string }[]>([])
  const [debugPaused, setDebugPaused] = useState(false)
  const [debugTab, setDebugTab] = useState<'ext-logs' | 'api-calls'>('ext-logs')
  const [extensionLoaded, setExtensionLoaded] = useState(false)
  const [extensionInfo, setExtensionInfo] = useState<{hasPage: boolean, hasPanel: boolean}>({hasPage: false, hasPanel: false})
  const [messageRenderers, setMessageRenderers] = useState<{
    match: (content: string) => boolean
    component: React.ComponentType<{ message: Message; ctx: ExtensionContext; currentUserId: string }>
  }[]>([])
  
  const uiMountRef = useRef<HTMLDivElement>(null)
  const settingsMountRef = useRef<HTMLDivElement>(null)
  
  const messageHandlersRef = useRef<Array<(msg: { id: string; content: string; userId: string; channelId: string; workspaceId: string }) => Promise<void> | void>>([])
  const reactionHandlersRef = useRef<Array<(event: { type: 'reaction:added' | 'reaction:removed'; channelId: string; messageId: string; reaction: Reaction; recipientUserId: string; actorId: string }) => Promise<void> | void>>([])
  const storageRef = useRef<Record<string, unknown>>({})

  useEffect(() => {
    
    const loadBundle = async () => {
      try {
        const res = await fetch('/bundle.js')
        if (!res.ok) {
          throw new Error(`Failed to fetch bundle: ${res.status}`)
        }
        const code = await res.text()
        
        try {
          const cssRes = await fetch('/bundle.css')
          if (cssRes.ok) {
            const css = await cssRes.text()
            const style = document.createElement('style')
            style.textContent = css
            document.head.appendChild(style)
          }
        } catch {}
        
        const fn = new Function('require', code + '\n;return typeof __FluxExtension__ !== "undefined" ? __FluxExtension__ : undefined')
        const exported = fn((id: string) => {
          if (id === 'react') return window.React
          if (id === 'react-dom') return window.ReactDOM
          if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') {
            return window.ReactJsxRuntime
          }
          if (id === 'lucide-react') return window.lucideReact
          throw new Error(`require(${id}) not supported`)
        })
        
        setExtensionInfo({
          hasPage: !!exported?.ExtensionPage,
          hasPanel: !!exported?.ExtensionPanel
        })
        
        if (exported?.messageRenderers && Array.isArray(exported.messageRenderers)) {
          setMessageRenderers(exported.messageRenderers)
        }
        
        window.__ctx__ = {
          workspaceId: 'sandbox-workspace',
          currentUserId: currentUserId,
          storage: {
            get: async (key: string) => {
              const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`)
              const data = await res.json()
              return data.value
            },
            set: async (key: string, value: unknown) => {
              storageRef.current[key] = value
              setStorage(prev => ({ ...prev, [key]: value }))
              await api.storage.set(key, value)
            },
            delete: async (key: string) => {
              delete storageRef.current[key]
              setStorage(prev => {
                const newStorage = { ...prev }
                delete newStorage[key]
                return newStorage
              })
            },
            listKeys: async () => Object.keys(storageRef.current)
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
            sendMessage: async (channelId: string, content: string): Promise<{ messageId: string }> => {
              const msg: Message = {
                id: `msg-${Date.now()}`,
                content,
                channelId,
                userId: 'ext-bot',
                user: { id: 'ext-bot', name: extensionName, isBot: true },
                createdAt: new Date().toISOString(),
                reactions: []
              }
              setMessages(prev => [...prev, msg])
              return { messageId: msg.id }
            },
            editMessage: async (channelId: string, msgId: string, newContent: string): Promise<void> => {
              setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: newContent } : m))
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
              addToast('DM Sent', `To: ${dm.recipient.name}`, 'success')
            },
            getMessages: async () => messages,
            addReaction: async (channelId: string, messageId: string, emoji: string) => {
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
            getReactions: async (channelId: string, messageId: string) => messages.find(m => m.id === messageId)?.reactions || []
          },
          frontend: {
            channels: channels,
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
          },
          backend: {
            onMessage: (handler: (msg: { id: string; content: string; userId: string; channelId: string; workspaceId: string }) => Promise<void> | void) => {
              messageHandlersRef.current.push(handler)
            },
            onReaction: (handler: (event: { type: 'reaction:added' | 'reaction:removed'; channelId: string; messageId: string; reaction: Reaction; recipientUserId: string; actorId: string }) => Promise<void> | void) => {
              reactionHandlersRef.current.push(handler)
            }
          }
        }
        
        if (exported?.onLoad) {
          exported.onLoad(window.__ctx__)
        }
        
        if (exported?.ExtensionPage && uiMountRef.current) {
          try {
            const root = window.ReactDOM.createRoot(uiMountRef.current)
            const element = window.React.createElement(exported.ExtensionPage, { 
              ctx: window.__ctx__, 
              currentUserId 
            })
            root.render(element)
          } catch (renderErr) {
            console.error('[Sandbox] Render error:', renderErr)
          }
        }
        
        if (exported?.ExtensionPanel && settingsMountRef.current) {
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
    api.users.list()
      .then(data => {
        setUsers(data)
        if (data.length > 0) {
          setCurrentUserId(data[0].id)
        }
      })
      .catch(e => console.error('[Sandbox] Failed to fetch users:', e))
    
    api.users.getCurrent()
      .then(data => {
        if (data.currentUserId) {
          setCurrentUserId(data.currentUserId)
        }
      })
  }, [])

  useEffect(() => {
    api.messages.list()
      .then(data => setMessages(data))
  }, [])

  useEffect(() => {
    api.storage.getAll()
      .then(data => {
        setStorage(data)
        storageRef.current = data
      })
  }, [])

  useEffect(() => {
    api.directMessages.list()
      .then(data => {
        setDirectMessages(data)
      })
  }, [])

  useEffect(() => {
    api.manifest.get()
      .then(data => {
        setExtensionName(data.name || 'Extension')
        setExtensionSlug(data.slug || 'extension')
        setExtensionCommands(data.commands || [])
      })
  }, [])

  useEffect(() => {
    api.channels.list()
      .then(data => {
        if (data.length > 0) {
          setChannels(data)
          setCurrentChannelId(data[0].id)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (window.__ctx__?.frontend) {
      window.__ctx__.frontend.channels = channels
    }
  }, [channels])

  useEffect(() => {
    const unsubscribe = api.events.subscribe((data) => {
      const eventData = data as { type?: string; id?: string; messageId?: string; reaction?: Reaction; reactionId?: string; senderId?: string; recipientId?: string; channels?: { id: string; name: string }[]; message?: { id: string; content: string } }
      
      if (eventData.type === 'dm:created') {
        api.directMessages.list()
          .then(dms => {
            setDirectMessages(dms)
            const newDm = dms.find(d => d.id === eventData.id)
            if (newDm) {
              const resolved = resolveMentions(newDm.content, users)
              const text = resolved.slice(0, 45) + (resolved.length > 45 ? '...' : '')
              addToast(`NEW DM`, `${newDm.sender.name} → ${newDm.recipient.name}: ${text}`, 'info')
            }
          })
        return
      }

      if (eventData.type === 'channels:updated') {
        if (eventData.channels) {
          setChannels(eventData.channels)
        }
        return
      }

      if (eventData.type === 'message:edited') {
        if (eventData.message) {
          setMessages(prev => prev.map(m => m.id === eventData.message!.id ? { ...m, content: eventData.message!.content } : m))
        }
        return
      }
      
      if (eventData.type === 'reaction:added' || eventData.type === 'reaction:removed') {
        setMessages(prev => prev.map(m => {
          if (m.id === eventData.messageId) {
            if (eventData.type === 'reaction:added') {
              return { ...m, reactions: [...(m.reactions || []), eventData.reaction!] }
            } else {
              return { ...m, reactions: (m.reactions || []).filter((r) => r.id !== eventData.reactionId) }
            }
          }
          return m
        }))
        for (const handler of reactionHandlersRef.current) {
          const msg = messages.find(m => m.id === eventData.messageId)
          if (msg && eventData.reaction) {
            handler({
              type: eventData.type as 'reaction:added' | 'reaction:removed',
              channelId: eventData.channelId || msg.channelId || 'sandbox-channel',
              messageId: eventData.messageId,
              reaction: eventData.reaction,
              recipientUserId: msg.userId,
              actorId: eventData.reaction.userId
            })
          }
        }
      } else if (!eventData.type) {
        const newMsg = eventData as Message
        setMessages(prev => [...prev, newMsg])
        for (const handler of messageHandlersRef.current) {
          handler({
            id: newMsg.id,
            content: newMsg.content,
            userId: newMsg.userId,
            channelId: newMsg.channelId || 'sandbox-channel',
            workspaceId: 'sandbox-workspace'
          })
        }
      }
    })
    return unsubscribe
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
    await api.messages.addReaction('sandbox-channel', messageId, emoji)
  }

  const sendMessage = async (content: string) => {
    await api.messages.send(content, currentUserId, currentChannelId)
  }

  const handleEditMessage = async (messageId: string, content: string) => {
    await api.messages.edit(messageId, content)
  }

  const handleChannelChange = async (channelId: string) => {
    setCurrentChannelId(channelId)
  }

  const handleCurrentUserChange = async (userId: string) => {
    setCurrentUserId(userId)
    await api.users.setCurrent(userId)
  }

  const refreshStorage = () => {
    api.storage.getAll()
      .then(data => setStorage(data))
  }

  const saveStorage = async () => {
    try {
      const data = JSON.parse(JSON.stringify(storage))
      await api.storage.setAll(data)
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
            icon={<Icons.Hash />} 
            label="Channels" 
            active={activeTab === 'channels'} 
            onClick={() => setActiveTab('channels')} 
          />
          <NavItem 
            icon={<Icons.Mail />} 
            label="DMs" 
            active={activeTab === 'dms'} 
            onClick={() => setActiveTab('dms')} 
          />
          <NavItem 
            icon={<Icons.Calendar />} 
            label="Jobs" 
            active={activeTab === 'jobs'} 
            onClick={() => setActiveTab('jobs')} 
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
            commands={extensionCommands}
            messageRenderers={messageRenderers}
            onReaction={handleReaction}
            onSendMessage={sendMessage}
            onEditMessage={handleEditMessage}
            channels={channels}
            currentChannelId={currentChannelId}
            onChannelChange={handleChannelChange}
          />
        )}
        
        {activeTab === 'ui' && (
          <AppUITab 
            uiMountRef={uiMountRef}
          />
        )}
        
        {activeTab === 'settings' && (
          <SettingsTab 
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
            onUsersChange={setUsers}
          />
        )}

        {activeTab === 'channels' && (
          <ChannelsTab
            channels={channels}
            currentChannelId={currentChannelId}
            onChannelsChange={setChannels}
          />
        )}
        
        {activeTab === 'dms' && (
          <DMsTab 
            directMessages={directMessages}
            users={users}
          />
        )}

        {activeTab === 'jobs' && (
          <JobsTab />
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
      
      <ToastContainer />
    </div>
  )
}
