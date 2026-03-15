import { useState, useEffect } from 'react'

interface ToastMessage {
  id: string
  title: string
  message: string
  type: 'success' | 'error' | 'info'
}

let globalToasts: ToastMessage[] = []
let listeners: ((toasts: ToastMessage[]) => void)[] = []

function addToast(title: string, message: string, type: 'success' | 'error' | 'info' = 'info') {
  const id = `toast-${Date.now()}`
  globalToasts = [...globalToasts, { id, title, message, type }]
  listeners.forEach(fn => fn(globalToasts))
  setTimeout(() => {
    globalToasts = globalToasts.filter(t => t.id !== id)
    listeners.forEach(fn => fn(globalToasts))
  }, 4000)
}

function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>(globalToasts)
  
  useEffect(() => {
    listeners.push(setToasts)
    return () => {
      listeners = listeners.filter(fn => fn !== setToasts)
    }
  }, [])
  
  return toasts
}

function renderMentions(content: string) {
  const parts = content.split(/(<@[^>]+>)/g)
  return parts.map((part, i) => {
    const match = part.match(/<@([^>]+)>/)
    if (match) {
      return (
        <span key={i} style={{
          display: 'inline-flex',
          padding: '1px 6px',
          borderRadius: '4px',
          backgroundColor: 'rgba(167, 139, 250, 0.3)',
          color: '#c4b5fd',
          fontSize: '12px',
          fontWeight: 600,
          marginLeft: '2px',
          marginRight: '2px'
        }}>
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function ToastContainer() {
  const toasts = useToast()
  
  if (toasts.length === 0) return null
  
  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 999999,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            minWidth: '320px',
            padding: '16px 20px',
            borderRadius: '12px',
            color: 'white',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            backgroundColor: t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#6366f1',
            pointerEvents: 'auto',
            animation: 'toastIn 0.3s ease',
            fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
            {t.title}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.9, wordBreak: 'break-word' }}>
            {renderMentions(t.message)}
          </div>
        </div>
      ))}
    </div>
  )
}

export { ToastContainer, addToast }
