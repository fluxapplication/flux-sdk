interface User {
  id: string
  name: string
  role: string
}

import { Icons } from './Icons'

interface UsersTabProps {
  users: User[]
  currentUserId: string
  onCurrentUserChange: (userId: string) => void
}

export function UsersTab({ users, currentUserId, onCurrentUserChange }: UsersTabProps) {
  return (
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
            onChange={(e) => onCurrentUserChange(e.target.value)}
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
  )
}
