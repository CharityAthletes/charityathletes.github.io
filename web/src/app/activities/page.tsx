'use client'
import { useEffect, useState } from 'react'
import { getActivities } from '@/lib/api'
import type { Activity } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

function sportIcon(type: string): string {
  const t = (type ?? '').toLowerCase()
  if (t.includes('run')) return '🏃'
  if (t.includes('ride') || t.includes('cycling') || t.includes('bike')) return '🚴'
  if (t.includes('swim')) return '🏊'
  if (t.includes('walk')) return '🚶'
  if (t.includes('hike')) return '🥾'
  if (t.includes('ski') || t.includes('snow')) return '⛷️'
  return '🏅'
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtKm(meters: number): string {
  return (meters / 1000).toFixed(2)
}

function fmtDate(iso: string, lang: 'ja' | 'en'): string {
  return new Date(iso).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function ActivitiesPage() {
  const { token, loading: authLoading } = useAuth()
  const { t, lang } = useLang()
  const router = useRouter()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!token) { router.replace('/login'); return }
    getActivities(token).then(setActivities).catch(console.error).finally(() => setLoading(false))
  }, [token, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('アクティビティ', 'Activities')}</h1>

      {activities.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <p className="text-4xl mb-3">🏃</p>
          <p className="font-semibold text-gray-700">{t('アクティビティがありません', 'No activities yet')}</p>
          <p className="text-sm text-gray-400 mt-1">
            {t('Stravaと連携して活動を記録しましょう', 'Connect Strava to sync your workouts')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map(a => (
            <div key={a.id} className="bg-white rounded-2xl px-4 py-3 border border-gray-100 flex items-center gap-3">
              <span className="text-2xl">{sportIcon(a.sportType)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{a.name}</p>
                <p className="text-xs text-gray-400">{fmtDate(a.startDate, lang)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-[#1A9966] text-sm">{fmtKm(a.distanceMeters)} km</p>
                <p className="text-xs text-gray-400">{fmtDuration(a.movingTimeSeconds)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
