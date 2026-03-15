import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { Icons } from './Icons'

interface StorageTabProps {
  storage: Record<string, unknown>
  onStorageChange: (storage: Record<string, unknown>) => void
  onRefresh: () => void
  onSave: () => void
}

export function StorageTab({ storage, onStorageChange, onRefresh, onSave }: StorageTabProps) {
  const [error, setError] = useState<string | null>(null)
  const [jsonString, setJsonString] = useState(() => JSON.stringify(storage, null, 2))

  const handleEditorChange = (value: string | undefined) => {
    if (!value) return
    setJsonString(value)
    try {
      const parsed = JSON.parse(value)
      onStorageChange(parsed)
      setError(null)
    } catch (e) {
      setError('Invalid JSON')
    }
  }

  const handleSave = () => {
    if (error) {
      alert('Fix JSON errors before saving')
      return
    }
    onSave()
  }

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonString)
      const formatted = JSON.stringify(parsed, null, 2)
      setJsonString(formatted)
      setError(null)
    } catch {
      setError('Cannot format - fix JSON errors first')
    }
  }

  return (
    <div className="flex-1 p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Icons.Database />
          Storage Editor
        </h2>
        <div className="flex gap-2 items-center">
          {error && (
            <span className="text-red-400 text-xs mr-2">{error}</span>
          )}
          <button
            onClick={formatJson}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition-colors"
          >
            Format
          </button>
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            ↻ Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={!!error}
            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
      
      <div className="flex-1 rounded-lg overflow-hidden border border-zinc-800">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={jsonString}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  )
}
