import { useRef, RefObject } from 'react'
import { Icons } from './Icons'

interface SettingsTabProps {
  extensionLoaded: boolean
  extensionInfo: { hasPage: boolean; hasPanel: boolean }
  settingsMountRef: RefObject<HTMLDivElement>
}

export function SettingsTab({ extensionLoaded, extensionInfo, settingsMountRef }: SettingsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Icons.Settings />
        Extension Settings
      </h2>
      {!extensionLoaded && (
        <div className="text-yellow-500 text-sm mb-2">Loading extension...</div>
      )}
      {extensionLoaded && !extensionInfo.hasPanel && (
        <div className="text-red-500 text-sm mb-2">No ExtensionPanel found</div>
      )}
      {extensionInfo.hasPanel && (
        <div className="text-green-500 text-sm mb-2">ExtensionPanel found ✓</div>
      )}
      
      <div className="bg-zinc-900 p-4 rounded mb-4 text-xs font-mono">
        <div>1. window.React exists: {window.React ? 'YES' : 'NO'}</div>
        <div>2. window.ReactDOM exists: {window.ReactDOM ? 'YES' : 'NO'}</div>
        <div>3. settingsMountRef.current exists: {!!settingsMountRef.current}</div>
        <div>4. window.__ctx__ exists: {!!window.__ctx__}</div>
      </div>
      
      <div ref={settingsMountRef} className="h-full min-h-[200px] border-2 border-dashed border-zinc-700 rounded" />
      {!settingsMountRef.current?.hasChildNodes() && extensionLoaded && extensionInfo.hasPanel && (
        <div className="text-zinc-500 text-sm mt-2">ExtensionPanel found but nothing rendered.</div>
      )}
    </div>
  )
}
