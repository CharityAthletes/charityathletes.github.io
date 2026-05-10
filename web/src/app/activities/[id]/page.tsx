'use client'
import { use, useEffect, useState } from 'react'
import { getActivity } from '@/lib/api'
import type { Activity } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { token } = useAuth()
  const { t } = useLang()
  const router = useRouter()
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    getActivity(id, token)
      .then(setActivity)
      .catch(() => setActivity(null))
      .finally(() => setLoading(false))
  }, [id, token])

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  if (!activity) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-20 text-center">
        <p className="text-gray-400">{t('アクティビティが見つかりません', 'Activity not found')}</p>
        <Link href="/activities" className="mt-4 inline-block text-sm font-semibold" style={{ color: '#1A9966' }}>
          ← {t('戻る', 'Back')}
        </Link>
      </div>
    )
  }

  const stats = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      ),
      label: t('距離', 'Distance'),
      value: `${(activity.distanceMeters / 1000).toFixed(2)} km`,
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
      ),
      label: t('時間', 'Time'),
      value: fmtDuration(activity.movingTimeSeconds),
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 17l4-8 4 4 4-6 4 10"/>
        </svg>
      ),
      label: t('獲得標高', 'Elevation'),
      value: activity.totalElevationGain != null ? `${Math.round(activity.totalElevationGain)} m` : '—',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      ),
      label: t('平均心拍数', 'Avg Heart Rate'),
      value: activity.averageHeartrate != null ? `${Math.round(activity.averageHeartrate)} bpm` : '—',
    },
  ]

  const stravaUrl = activity.stravaActivityId
    ? `https://www.strava.com/activities/${activity.stravaActivityId}`
    : null

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round">
            <path d="M10 3L5 8l5 5"/>
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 truncate">{activity.name}</h1>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #054738, #1A9966)', color: 'white' }}>
              {s.icon}
            </div>
            <div>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* View on Strava */}
      {stravaUrl && (
        <a
          href={stravaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition hover:opacity-90"
          style={{ background: '#1a1a1a', color: '#FC4C02' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#FC4C02">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 0 9.871h4.172"/>
          </svg>
          {t('Stravaで見る', 'View on Strava')}
        </a>
      )}
    </div>
  )
}
