import { Icons } from './Icons'

interface StorageTabProps {
  storage: Record<string, unknown>
  onStorageChange: (storage: Record<string, unknown>) => void
  onRefresh: () => void
  onSave: () => void
}

export function StorageTab({ storage, onStorageChange, onRefresh, onSave }: StorageTabProps) {
  return (
    <div className="flex-1 p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Icons.Database />
          Storage Editor
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            ↻ Refresh
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
      
      <textarea
        value={JSON.stringify(storage, null, 2)}
        onChange={(e) => {
          try {
            onStorageChange(JSON.parse(e.target.value))
          } catch {}
        }}
        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 font-mono outline-none resize-none"
      />
    </div>
  )
}
