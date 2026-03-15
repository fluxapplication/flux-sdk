import { RefObject } from 'react'
import { Icons } from './Icons'

interface SettingsTabProps {
  settingsMountRef: RefObject<HTMLDivElement>
}

export function SettingsTab({ settingsMountRef }: SettingsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Icons.Settings />
        Extension Settings
      </h2>
      <div ref={settingsMountRef} className="h-full min-h-[200px]" />
    </div>
  )
}
