'use client'
import { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const BRAND_GRADIENT = 'linear-gradient(135deg, #0D2659, #054738)'

export default function ProfilePage() {
  const { me, loading, signOut } = useAuth()
  const { t } = useLang()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !me) router.replace('/login')
  }, [me, loading, router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  if (loading || !me) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
      </div>
    )
  }

  const initials = (me.displayName ?? me.email ?? '?')[0].toUpperCase()

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Avatar + name */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 flex items-center gap-4">
        {me.avatarUrl ? (
          <img src={me.avatarUrl} alt={me.displayName ?? ''} className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ background: BRAND_GRADIENT }}>
            {initials}
          </div>
        )}
        <div>
          <p className="text-lg font-bold text-gray-900">{me.displayName ?? t('アスリート', 'Athlete')}</p>
          <p className="text-sm text-gray-400">{me.email}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
            style={{ background: '#1A9966' }}>
            {me.role === 'athlete' ? t('アスリート', 'Athlete')
              : me.role === 'nonprofit' ? t('団体', 'Nonprofit')
              : t('管理者', 'Admin')}
          </span>
        </div>
      </div>

      {/* Strava status */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔗</span>
            <div>
              <p className="text-sm font-semibold text-gray-800">{t('Strava連携', 'Strava Connected')}</p>
              <p className="text-xs text-gray-400">
                {(me as any).stravaAthleteId
                  ? t('連携済み', 'Connected')
                  : t('未連携', 'Not connected')}
              </p>
            </div>
          </div>
          {!(me as any).stravaAthleteId && (
            <Link
              href="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
              style={{ backgroundColor: '#FC4C02' }}
            >
              {t('連携する', 'Connect')}
            </Link>
          )}
        </div>
      </div>

      {/* Role-specific links */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        {me.role === 'athlete' && (
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
            <span className="text-xl">📊</span>
            <span className="text-sm font-semibold text-gray-800">{t('マイダッシュボード', 'My Dashboard')}</span>
            <span className="ml-auto text-gray-300">›</span>
          </Link>
        )}
        {me.role === 'nonprofit' && (
          <Link href="/nonprofit" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
            <span className="text-xl">🏢</span>
            <span className="text-sm font-semibold text-gray-800">{t('団体ダッシュボード', 'Nonprofit Dashboard')}</span>
            <span className="ml-auto text-gray-300">›</span>
          </Link>
        )}
        {me.role === 'admin' && (
          <Link href="/admin" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
            <span className="text-xl">⚙️</span>
            <span className="text-sm font-semibold text-gray-800">{t('管理者パネル', 'Admin Panel')}</span>
            <span className="ml-auto text-gray-300">›</span>
          </Link>
        )}
        <Link href="/activities" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
          <span className="text-xl">🏃</span>
          <span className="text-sm font-semibold text-gray-800">{t('アクティビティ', 'My Activities')}</span>
          <span className="ml-auto text-gray-300">›</span>
        </Link>
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-red-500 bg-white border border-gray-100 hover:bg-red-50 transition"
      >
        {t('サインアウト', 'Sign Out')}
      </button>
    </div>
  )
}
