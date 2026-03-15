import { useState } from 'react'
import { Icons } from './Icons'

interface User {
  id: string
  name: string
  role: string
}

interface UsersTabProps {
  users: User[]
  currentUserId: string
  onCurrentUserChange: (userId: string) => void
  onUsersChange: (users: User[]) => void
}

const ROLES = ['OWNER', 'ADMIN', 'MEMBER']

export function UsersTab({ users, currentUserId, onCurrentUserChange, onUsersChange }: UsersTabProps) {
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({ name: '', role: 'MEMBER' })

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user)
      setFormData({ name: user.name, role: user.role })
    } else {
      setEditingUser(null)
      setFormData({ name: '', role: 'MEMBER' })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingUser(null)
    setFormData({ name: '', role: 'MEMBER' })
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return

    if (editingUser) {
      const updatedUser = { ...editingUser, name: formData.name, role: formData.role }
      await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      })
      onUsersChange(users.map(u => u.id === editingUser.id ? updatedUser : u))
    } else {
      const newUser: User = {
        id: `user-${Date.now()}`,
        name: formData.name,
        role: formData.role
      }
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      })
      onUsersChange([...users, newUser])
    }
    handleCloseModal()
  }

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    await fetch(`/api/users/${userId}`, { method: 'DELETE' })
    onUsersChange(users.filter(u => u.id !== userId))
    if (currentUserId === userId) {
      const remaining = users.filter(u => u.id !== userId)
      if (remaining.length > 0) {
        onCurrentUserChange(remaining[0].id)
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Icons.Users />
        Users Manager
      </h2>
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-300">Active User</div>
          <select
            value={currentUserId}
            onChange={(e) => onCurrentUserChange(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-100 px-3 py-2 rounded-lg text-sm outline-none cursor-pointer min-w-[220px] focus:border-violet-500"
          >
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-300">All Users</div>
          <button
            onClick={() => handleOpenModal()}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
          >
            + Add User
          </button>
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
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs font-medium rounded bg-zinc-700 text-zinc-400">{user.role}</span>
                <button
                  onClick={() => handleOpenModal(user)}
                  className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <Icons.Edit />
                </button>
                <button
                  onClick={() => handleDelete(user.id)}
                  className="p-1.5 rounded hover:bg-red-900/30 text-zinc-400 hover:text-red-400 transition-colors"
                >
                  <Icons.Trash />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">
              {editingUser ? 'Edit User' : 'Add User'}
            </h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 outline-none focus:border-violet-500"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 outline-none focus:border-violet-500"
                >
                  {ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
              >
                {editingUser ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
