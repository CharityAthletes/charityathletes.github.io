'use client'
import { useEffect, useState } from 'react'
import { getActivities } from '@/lib/api'
import type { Activity } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

// Teal sport icon SVGs inside a circle — mirrors iOS activity icons
function SportIcon({ type }: { type: string }) {
  const t = (type ?? '').toLowerCase()

  const icon = t.includes('ride') || t.includes('cycling') || t.includes('bike') ? (
    // Bicycle
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h3"/>
    </svg>
  ) : t.includes('run') ? (
    // Runner
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="1.5" fill="white"/>
      <path d="M14 8l-2 5-4 2 2 5M8 13l4-1 1-4"/>
    </svg>
  ) : t.includes('walk') ? (
    // Walker
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="1.5" fill="white"/>
      <path d="M9 19l1-5-2-3 4-4 2 4h3M9 9l-2 4"/>
    </svg>
  ) : t.includes('swim') ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-4 6-4 8 0s6 4 8 0M2 17c2-4 6-4 8 0s6 4 8 0"/>
      <circle cx="12" cy="6" r="2" fill="white"/>
    </svg>
  ) : (
    // Generic person
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" fill="white"/>
      <path d="M12 7v6M9 10h6M9 20l3-7 3 7"/>
    </svg>
  )

  return (
    <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
      {icon}
    </div>
  )
}

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(iso: string, lang: 'ja' | 'en') {
  return new Date(iso).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

export default function ActivitiesPage() {
  const { token, loading: authLoading } = useAuth()
  const { t, lang } = useLang()
  const router = useRouter()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = (tok: string) =>
    getActivities(tok).then(setActivities).catch(console.error).finally(() => setLoading(false))

  useEffect(() => {
    if (authLoading) return
    if (!token) { router.replace('/login'); return }
    load(token)
  }, [token, authLoading, router])

  const handleSync = async () => {
    if (!token || syncing) return
    setSyncing(true)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/strava/sync`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      await load(token)
    } catch { /* ignore */ } finally { setSyncing(false) }
  }

  if (authLoading || loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-2">
        {[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-3xl font-bold text-gray-900">{t('アクティビティ', 'Activities')}</h1>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}
          title={t('Stravaと同期', 'Sync with Strava')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className={syncing ? 'animate-spin' : ''}>
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      {/* Subtitle hint */}
      <div className="flex items-center gap-2 mb-5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2"/><path d="M12 7v6M9 10h6M9 20l3-7 3 7"/>
        </svg>
        <p className="text-sm text-gray-400">{t('アクティビティをタップして詳細を見る', 'Tap an activity to see details')}</p>
      </div>

      {activities.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <p className="text-3xl mb-3">🏃</p>
          <p className="font-semibold text-gray-700">{t('アクティビティがありません', 'No activities yet')}</p>
          <p className="text-sm text-gray-400 mt-1">
            {t('Stravaと連携して活動を記録しましょう', 'Connect Strava to sync your workouts')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {activities.map(a => (
            <div key={a.id} className="flex items-center gap-4 py-4">
              <SportIcon type={a.sportType} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{a.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.startDate, lang)}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    {(a.distanceMeters / 1000).toFixed(1)} km
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    {fmtDuration(a.movingTimeSeconds)}
                  </span>
                </div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1l6 6-6 6"/>
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
