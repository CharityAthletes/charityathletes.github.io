'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { getMyCampaigns, getDonationSummary } from '@/lib/api'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProfilePage() {
  const { me, token, loading, signOut } = useAuth()
  const { lang, toggle, t } = useLang()
  const router = useRouter()

  const [totalKm, setTotalKm] = useState(0)
  const [totalJpy, setTotalJpy] = useState(0)

  useEffect(() => {
    if (!loading && !me) { router.replace('/login'); return }
    if (!token) return
    Promise.all([getMyCampaigns(token), getDonationSummary(token)]).then(([campaigns, summary]) => {
      setTotalKm(campaigns.reduce((s, c) => s + (c.totalKm ?? 0), 0))
      setTotalJpy(summary.totalJpy)
    }).catch(() => {})
  }, [me, loading, token, router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (loading || !me) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  const stravaConnected = !!(me as any).stravaAthleteId
  const initials = (me.displayName ?? me.email ?? 'A')[0].toUpperCase()

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
      <h1 className="text-3xl font-bold text-gray-900">{t('プロフィール', 'Profile')}</h1>

      {/* Avatar card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
        {me.avatarUrl ? (
          <img src={me.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
            {initials}
          </div>
        )}
        <div>
          <p className="text-lg font-bold text-gray-900">{me.displayName ?? t('アスリート', 'Athlete')}</p>
          <p className="text-sm text-gray-400">
            ¥{totalJpy.toLocaleString()} · {totalKm.toFixed(0)} km
          </p>
        </div>
      </div>

      {/* Language */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{t('言語', 'Language')}</p>
        <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex">
          <button
            onClick={() => lang === 'en' && toggle()}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
            style={lang === 'ja'
              ? { background: 'linear-gradient(135deg, #0D2659, #054738)', color: 'white' }
              : { color: '#6b7280' }}>
            日本語
          </button>
          <button
            onClick={() => lang === 'ja' && toggle()}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
            style={lang === 'en'
              ? { background: 'linear-gradient(135deg, #0D2659, #054738)', color: 'white' }
              : { color: '#6b7280' }}>
            English
          </button>
        </div>
      </div>

      {/* Strava */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Strava</p>
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: stravaConnected ? '#dcfce7' : '#fee2e2' }}>
              {stravaConnected
                ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              }
            </div>
            <span className="text-sm font-semibold" style={{ color: stravaConnected ? '#16a34a' : '#dc2626' }}>
              {stravaConnected ? t('連携済み', 'Connected') : t('未連携', 'Not connected')}
            </span>
          </div>
          {stravaConnected ? (
            <button className="flex items-center gap-3 px-4 py-3.5 w-full text-left">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#dc2626" strokeWidth="1.5"/><path d="M4 4l8 8M12 4l-8 8" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <span className="text-sm font-semibold text-red-500">{t('Strava連携を解除', 'Disconnect Strava')}</span>
            </button>
          ) : (
            <Link href="/login" className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#fff7ed' }}>
                <span className="text-sm font-bold" style={{ color: '#FC4C02' }}>S</span>
              </div>
              <span className="text-sm font-semibold" style={{ color: '#FC4C02' }}>{t('Stravaで連携する', 'Connect Strava')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Menu rows */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        <Link href="/dashboard" className="flex items-center gap-3 px-4 py-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#f0fdf4' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A9966" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
              <path d="M5 12h4M15 12h4"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-800 flex-1">{t('寄付履歴', 'Donations')}</span>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><path d="M1 1l6 6-6 6"/></svg>
        </Link>
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          </div>
          <span className="text-sm font-semibold text-gray-800 flex-1">{t('使い方', 'How It Works')}</span>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><path d="M1 1l6 6-6 6"/></svg>
        </div>
      </div>

      {/* Role-specific */}
      {(me.role === 'nonprofit' || me.role === 'admin') && (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {me.role === 'nonprofit' && (
            <Link href="/nonprofit" className="flex items-center gap-3 px-4 py-4">
              <span className="text-lg">🏢</span>
              <span className="text-sm font-semibold text-gray-800 flex-1">{t('団体ダッシュボード', 'Nonprofit Dashboard')}</span>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><path d="M1 1l6 6-6 6"/></svg>
            </Link>
          )}
          {me.role === 'admin' && (
            <Link href="/admin" className="flex items-center gap-3 px-4 py-4">
              <span className="text-lg">⚙️</span>
              <span className="text-sm font-semibold text-gray-800 flex-1">{t('管理者パネル', 'Admin Panel')}</span>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><path d="M1 1l6 6-6 6"/></svg>
            </Link>
          )}
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="w-full py-3.5 rounded-2xl text-sm font-semibold text-red-500 bg-white border border-gray-100 hover:bg-red-50 transition"
      >
        {t('ログアウト', 'Sign Out')}
      </button>

      {/* Delete account */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{t('危険な操作', 'Danger Zone')}</p>
        <button
          onClick={async () => {
            if (!confirm(t('本当によろしいですか？アカウントとすべてのデータが完全に削除されます。', 'Are you sure? Your account and all data will be permanently deleted.'))) return
            try {
              await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/account`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              })
              await signOut()
              window.location.href = '/login'
            } catch { alert(t('削除に失敗しました', 'Failed to delete account')) }
          }}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold text-red-500 bg-white border border-red-100 hover:bg-red-50 transition"
        >
          {t('アカウントを削除', 'Delete Account')}
        </button>
      </div>
    </div>
  )
}
