import { useState, useRef, useEffect } from 'react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'

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

function renderContentWithMentions(content: string, users: User[]) {
  const parts = content.split(/(<@[^>]+>)/g)
  return parts.map((part, i) => {
    const match = part.match(/<@([^>]+)>/)
    if (match) {
      const userId = match[1]
      const user = users.find(u => u.id === userId)
      return (
        <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-sm font-medium border border-violet-500/30">
          @{user?.name || userId}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function Message({ message, onReaction, users }: { message: Message; onReaction: (messageId: string, emoji: string) => void; users: User[] }) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMessageClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    if (e.button === 2) {
      e.preventDefault()
      setShowPicker(!showPicker)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowPicker(!showPicker)
  }

  return (
    <div className="flex justify-start">
      <div 
        ref={messageRef}
        onClick={handleMessageClick}
        onContextMenu={handleContextMenu}
        className="max-w-[85%] px-3.5 py-2.5 rounded-2xl bg-zinc-800 border border-zinc-700 animate-msg-in cursor-pointer hover:border-zinc-600 transition-colors"
      >
        <div className="text-[11px] text-zinc-500 mb-1 font-semibold">{message.user.name}</div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {renderContentWithMentions(message.content, users)}
        </div>
        
        <div className="flex items-center gap-1 mt-2 relative">
          {message.reactions?.map((r) => (
            <button
              key={r.id}
              onClick={(e) => {
                e.stopPropagation()
                onReaction(message.id, r.emoji)
              }}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-zinc-700/50 hover:bg-zinc-700 transition-colors"
            >
              {r.emoji}
            </button>
          ))}
          {showPicker && (
            <div ref={pickerRef} className="absolute mt-2 z-50">
              <Picker
                data={data}
                onEmojiSelect={(e: { native: string }) => {
                  onReaction(message.id, e.native)
                  setShowPicker(false)
                }}
                theme="dark"
                previewPosition="none"
                skinTonePosition="none"
              />
            </div>
          )}
        </div>
        
        <div className="text-[10px] text-zinc-500 mt-1">
          {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </div>
      </div>
    </div>
  )
}

interface ChatTabProps {
  messages: Message[]
  currentUserId: string
  users: User[]
  onReaction: (messageId: string, emoji: string) => void
  onSendMessage: (content: string) => void
}

export function ChatTab({ messages, currentUserId, users, onReaction, onSendMessage }: ChatTabProps) {
  const [inputValue, setInputValue] = useState('')
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionUserIndex, setMentionUserIndex] = useState(0)
  const [mentionFilter, setMentionFilter] = useState<User[]>([])
  const mentionInputRef = useRef<HTMLTextAreaElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const prevMessagesLength = useRef(messages.length)

  useEffect(() => {
    if (messages.length > prevMessagesLength.current && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
    prevMessagesLength.current = messages.length
  }, [messages])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputValue(value)
    
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    const lastAtPos = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtPos !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtPos + 1)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        const query = textAfterAt.toLowerCase()
        const filtered = users.filter(u => u.name.toLowerCase().includes(query))
        if (filtered.length > 0) {
          setMentionQuery(query)
          setMentionFilter(filtered)
          setMentionUserIndex(0)
          setShowMentionPicker(true)
          return
        }
      }
    }
    setShowMentionPicker(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionPicker) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionUserIndex(prev => (prev + 1) % mentionFilter.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionUserIndex(prev => (prev - 1 + mentionFilter.length) % mentionFilter.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (mentionFilter[mentionUserIndex]) {
          e.preventDefault()
          insertMention(mentionFilter[mentionUserIndex])
          return
        }
      }
      if (e.key === 'Escape') {
        setShowMentionPicker(false)
        return
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const insertMention = (user: User) => {
    const cursorPos = mentionInputRef.current?.selectionStart || inputValue.length
    const textBeforeCursor = inputValue.slice(0, cursorPos)
    const lastAtPos = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtPos !== -1) {
      const before = inputValue.slice(0, lastAtPos)
      const after = inputValue.slice(cursorPos)
      setInputValue(`${before}<@${user.id}> ${after}`)
      setShowMentionPicker(false)
    }
  }

  const sendMessage = () => {
    if (!inputValue.trim()) return
    onSendMessage(inputValue)
    setInputValue('')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div ref={chatRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-1">
        <div className="px-3.5 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
          <div className="text-[11px] text-zinc-500 mb-1 font-semibold">Sandbox System</div>
          <div className="text-sm text-zinc-300">Welcome to the local development sandbox. Type a message below to test your extension's onMessage handler.</div>
        </div>
        
        {messages.map(msg => (
          <Message 
            key={msg.id} 
            message={msg} 
            onReaction={onReaction}
            users={users}
          />
        ))}
      </div>
      
      <div className="p-4 px-5 bg-zinc-900 border-t border-zinc-800 flex gap-2.5 items-end relative">
        <textarea
          ref={mentionInputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message to the channel... (@ to mention)"
          rows={1}
          className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100 outline-none text-sm resize-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
        />
        <button
          onClick={sendMessage}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          Send
        </button>
        
        {showMentionPicker && mentionFilter.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-64 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
            {mentionFilter.map((user, idx) => (
              <button
                key={user.id}
                onClick={() => insertMention(user)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${
                  idx === mentionUserIndex ? 'bg-violet-600' : 'hover:bg-zinc-700'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-zinc-600 flex items-center justify-center text-xs">
                  {user.name.charAt(0)}
                </div>
                <span className="text-sm">{user.name}</span>
                <span className="text-xs text-zinc-500 ml-auto">{user.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
