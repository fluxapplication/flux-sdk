import { useState } from 'react'
import { Hash, Plus, Trash2, Pencil, X, Check } from 'lucide-react'
import { api } from './api'
import { addToast } from './Toast'

interface Channel {
  id: string
  name: string
}

interface ChannelsTabProps {
  channels: Channel[]
  currentChannelId: string
  onChannelsChange: (channels: Channel[]) => void
}

export function ChannelsTab({ channels, currentChannelId, onChannelsChange }: ChannelsTabProps) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const channel = await api.channels.create(newName.trim())
      const updated = [...channels, channel]
      onChannelsChange(updated)
      setNewName('')
      addToast('Channel Created', `#${channel.name}`, 'success')
    } catch (e) {
      addToast('Error', (e as Error).message || 'Failed to create channel', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (channels.length <= 1) {
      addToast('Error', 'Cannot delete the last channel', 'error')
      return
    }
    try {
      await api.channels.delete(id)
      const updated = channels.filter(c => c.id !== id)
      onChannelsChange(updated)
      addToast('Channel Deleted', '', 'success')
    } catch (e) {
      addToast('Error', (e as Error).message || 'Failed to delete channel', 'error')
    }
  }

  const handleStartEdit = (channel: Channel) => {
    setEditingId(channel.id)
    setEditingName(channel.name)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) return
    try {
      const updated = await api.channels.rename(editingId, editingName.trim())
      const newChannels = channels.map(c => c.id === editingId ? updated : c)
      onChannelsChange(newChannels)
      setEditingId(null)
      setEditingName('')
      addToast('Channel Renamed', `#${updated.name}`, 'success')
    } catch (e) {
      addToast('Error', (e as Error).message || 'Failed to rename channel', 'error')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 mb-1">Channels</h2>
          <p className="text-xs text-zinc-500">Manage workspace channels for testing multi-channel extensions.</p>
        </div>

        {/* Create new channel */}
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !creating) void handleCreate()
            }}
            placeholder="new-channel-name"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm h-9 px-3 outline-none focus:border-violet-500 transition-colors"
          />
          <button
            onClick={() => { if (!creating) void handleCreate() }}
            disabled={creating || !newName.trim()}
            className="h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Plus size={14} />
            Create
          </button>
        </div>

        {/* Channel list */}
        <div className="space-y-1">
          {channels.map(channel => (
            <div
              key={channel.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                channel.id === currentChannelId
                  ? 'border-violet-500/40 bg-violet-600/10'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <Hash size={16} className="text-zinc-500 flex-shrink-0" />
              
              {editingId === channel.id ? (
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveEdit()
                    if (e.key === 'Escape') handleCancelEdit()
                  }}
                  autoFocus
                  className="flex-1 bg-zinc-800 border border-zinc-600 rounded text-zinc-100 text-sm h-7 px-2 outline-none focus:border-violet-500 transition-colors"
                />
              ) : (
                <span className="flex-1 text-sm text-zinc-200 font-medium">#{channel.name}</span>
              )}

              {channel.id === currentChannelId && (
                <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">active</span>
              )}

              <div className="flex items-center gap-0.5 flex-shrink-0">
                {editingId === channel.id ? (
                  <>
                    <button
                      onClick={() => { void handleSaveEdit() }}
                      className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      title="Save"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                      title="Cancel"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleStartEdit(channel)}
                      className="p-1.5 rounded text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                      title="Rename"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(channel.id)}
                      disabled={channels.length <= 1}
                      className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-zinc-600">
          {channels.length} channel{channels.length !== 1 ? 's' : ''} total
        </div>
      </div>
    </div>
  )
}
