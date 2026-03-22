import { useState, useEffect } from 'react'
import { Play, RefreshCw } from 'lucide-react'
import { api } from './api'

interface ScheduledJob {
  jobKey: string
  cron: string
  extensionSlug: string
  lastRun: string | null
}

export function JobsTab() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadJobs = async () => {
    try {
      const data = await api.scheduler.listJobs()
      setJobs(data)
      setError(null)
    } catch (e) {
      setError('Failed to load jobs')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadJobs()
  }, [])

  const handleTrigger = async (jobKey: string) => {
    setTriggering(jobKey)
    try {
      await api.scheduler.triggerJob(jobKey)
      await loadJobs()
    } catch (e) {
      console.error('Failed to trigger job:', e)
    } finally {
      setTriggering(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw size={16} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-400 text-sm">{error}</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-100">Scheduled Jobs</h2>
        <button
          onClick={loadJobs}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="p-4 text-sm text-zinc-500 text-center">
            No scheduled jobs registered.
            <br />
            <span className="text-xs">Jobs will appear here when extensions register them via ctx.backend.schedule().</span>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {jobs.map((job) => (
              <div key={job.jobKey} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-violet-400">{job.jobKey}</span>
                    <span className="text-xs text-zinc-500">·</span>
                    <span className="text-xs text-zinc-400">{job.extensionSlug}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs font-mono text-zinc-500">{job.cron}</span>
                    {job.lastRun && (
                      <span className="text-xs text-zinc-600">
                        Last: {new Date(job.lastRun).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleTrigger(job.jobKey)}
                  disabled={triggering === job.jobKey}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                >
                  {triggering === job.jobKey ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  Run
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}