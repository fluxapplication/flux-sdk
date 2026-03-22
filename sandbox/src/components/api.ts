export interface User {
  id: string
  name: string
  role: string
}

export interface Message {
  id: string
  content: string
  userId: string
  user: { id: string; name: string; isBot?: boolean }
  createdAt: string
  reactions?: Reaction[]
  channelId?: string
}

export interface Reaction {
  id: string
  messageId: string
  emoji: string
  userId: string
  user: { id: string; name: string }
}

export interface DirectMessage {
  id: string
  senderId: string
  recipientId: string
  content: string
  createdAt: string
  sender: { id: string; name: string }
  recipient: { id: string; name: string }
}

export const api = {
  users: {
    list: async (): Promise<User[]> => {
      const res = await fetch('/api/users')
      return res.json()
    },
    getCurrent: async (): Promise<{ currentUserId: string }> => {
      const res = await fetch('/api/current-user')
      return res.json()
    },
    setCurrent: async (currentUserId: string): Promise<void> => {
      await fetch('/api/current-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId })
      })
    },
    create: async (user: User): Promise<void> => {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      })
    },
    update: async (user: User): Promise<void> => {
      await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      })
    },
    delete: async (userId: string): Promise<void> => {
      await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      })
    }
  },

  messages: {
    list: async (): Promise<Message[]> => {
      const res = await fetch('/api/messages')
      return res.json()
    },
    send: async (content: string, userId: string, channelId?: string): Promise<void> => {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, userId, channelId })
      })
    },
    edit: async (messageId: string, content: string): Promise<void> => {
      await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
    },
    addReaction: async (channelId: string, messageId: string, emoji: string): Promise<void> => {
      await fetch(`/api/${channelId}/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
      })
    }
  },

  storage: {
    getAll: async (): Promise<Record<string, unknown>> => {
      const res = await fetch('/api/storage/all')
      return res.json()
    },
    set: async (key: string, value: unknown): Promise<void> => {
      await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      })
    },
    setAll: async (data: Record<string, unknown>): Promise<void> => {
      await fetch('/api/storage/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
    }
  },

  directMessages: {
    list: async (): Promise<DirectMessage[]> => {
      const res = await fetch('/api/direct-messages')
      return res.json()
    }
  },

  manifest: {
    get: async (): Promise<{ name: string; slug: string; commands?: { name: string; description: string; usage: string }[] }> => {
      const res = await fetch('/manifest.json')
      return res.json()
    }
  },

  channels: {
    list: async (): Promise<{ id: string; name: string }[]> => {
      const res = await fetch('/api/channels')
      return res.json()
    },
    create: async (name: string): Promise<{ id: string; name: string }> => {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      return res.json()
    },
    delete: async (id: string): Promise<void> => {
      await fetch(`/api/channels?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
    },
    rename: async (id: string, name: string): Promise<{ id: string; name: string }> => {
      const res = await fetch('/api/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name })
      })
      return res.json()
    }
  },

  scheduler: {
    listJobs: async (): Promise<{ jobKey: string; cron: string; extensionSlug: string; lastRun: string | null }[]> => {
      const res = await fetch('/api/scheduler/jobs')
      return res.json()
    },
    triggerJob: async (jobKey: string): Promise<{ success: boolean; lastRun: string }> => {
      const res = await fetch(`/api/scheduler/trigger/${encodeURIComponent(jobKey)}`, {
        method: 'POST'
      })
      return res.json()
    }
  },

  events: {
    subscribe: (handler: (data: unknown) => void): (() => void) => {
      const eventSource = new EventSource('/api/events')
      eventSource.onmessage = (e) => {
        handler(JSON.parse(e.data))
      }
      return () => eventSource.close()
    }
  }
}
