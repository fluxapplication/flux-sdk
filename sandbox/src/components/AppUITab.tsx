import { RefObject } from 'react'
import { Icons } from './Icons'

interface AppUITabProps {
  uiMountRef: RefObject<HTMLDivElement>
}

export function AppUITab({ uiMountRef }: AppUITabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Icons.App />
        Extension UI
      </h2>
      <div ref={uiMountRef} className="h-full min-h-[200px]" />
    </div>
  )
}
