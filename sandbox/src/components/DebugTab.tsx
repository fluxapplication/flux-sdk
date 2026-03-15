import { useState } from 'react'
import { Icons } from './Icons'

interface DebugLog {
  type: string
  args: string[]
  source: string
}

interface ApiCall {
  method: string
  url: string
  timestamp: string
}

interface DebugTabProps {
  debugLogs: DebugLog[]
  apiCalls: ApiCall[]
  debugPaused: boolean
  debugTab: 'ext-logs' | 'api-calls'
  onClearLogs: () => void
  onTogglePause: () => void
  onTabChange: (tab: 'ext-logs' | 'api-calls') => void
}

export function DebugTab({ debugLogs, apiCalls, debugPaused, debugTab, onClearLogs, onTogglePause, onTabChange }: DebugTabProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0 p-4 border-b border-zinc-800">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Icons.Terminal />
          Debug Console
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={onClearLogs}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            Clear
          </button>
          <button 
            onClick={onTogglePause}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
          >
            {debugPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <button
          onClick={() => onTabChange('ext-logs')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            debugTab === 'ext-logs' 
              ? 'bg-violet-500/15 text-violet-400' 
              : 'text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          Extension Logs
        </button>
        <button
          onClick={() => onTabChange('api-calls')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            debugTab === 'api-calls' 
              ? 'bg-violet-500/15 text-violet-400' 
              : 'text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          API Calls
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
        {debugTab === 'ext-logs' ? (
          debugLogs.map((log, i) => (
            <div 
              key={i} 
              className={`p-2 mb-1 rounded bg-zinc-900 border-l-2 animate-debug-log-in ${
                log.type === 'error' ? 'border-red-500 bg-red-950/30' :
                log.type === 'warn' ? 'border-amber-500 bg-amber-950/30' :
                log.type === 'info' ? 'border-blue-500' :
                'border-green-500'
              }`}
            >
              <span className="text-zinc-500 mr-2">[{log.source}]</span>
              <span className="text-zinc-400">{log.args.join(' ')}</span>
            </div>
          ))
        ) : (
          apiCalls.map((call, i) => (
            <div key={i} className="p-2 mb-1 rounded bg-zinc-900 border-l-2 border-blue-500">
              <span className="text-blue-400 mr-2">{call.method}</span>
              <span className="text-zinc-400">{call.url}</span>
              <span className="text-zinc-600 ml-2">{call.timestamp}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
