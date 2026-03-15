interface DirectMessage {
  id: string
  senderId: string
  recipientId: string
  content: string
  createdAt: string
  sender: { id: string; name: string }
  recipient: { id: string; name: string }
}

import { Icons } from './Icons'

interface DMsTabProps {
  directMessages: DirectMessage[]
}

export function DMsTab({ directMessages }: DMsTabProps) {
  return (
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
                  <span className="text-xs text-zinc-500 ml-auto">{dm.createdAt ? new Date(dm.createdAt).toLocaleString() : ''}</span>
                </div>
                <div className="text-sm text-zinc-400">{dm.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
