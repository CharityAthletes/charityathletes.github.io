'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { getDonationSummary, getPaymentMethod, getMyCampaigns } from '@/lib/api'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProfilePage() {
  const { me, token, loading, signOut } = useAuth()
  const { lang, toggle, t } = useLang()
  const router = useRouter()

  const [totalKm, setTotalKm] = useState(0)
  const [totalJpy, setTotalJpy] = useState(0)
  const [card, setCard] = useState<{ brand: string; last4: string; expMonth: number; expYear: number } | null>(null)

  useEffect(() => {
    if (!loading && !me) { router.replace('/login'); return }
    if (!token) return
    getDonationSummary(token).then(summary => {
      setTotalJpy(summary.totalJpy ?? 0)
    }).catch(() => {})
    getMyCampaigns(token).then(campaigns => {
      setTotalKm(campaigns.reduce((s, c) => s + (c.totalKm ?? 0), 0))
    }).catch(() => {})
    getPaymentMethod(token).then(r => setCard(r.card)).catch(() => {})
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

  const Chevron = () => (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
      <path d="M1 1l6 6-6 6"/>
    </svg>
  )

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-5">
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
            ¥{(totalJpy ?? 0).toLocaleString()} · {(totalKm ?? 0).toFixed(0)} km
          </p>
        </div>
      </div>

      {/* Language */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{t('言語', 'Language')}</p>
        <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex">
          <button onClick={() => lang === 'en' && toggle()}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
            style={lang === 'ja' ? { background: 'linear-gradient(135deg, #0D2659, #054738)', color: 'white' } : { color: '#6b7280' }}>
            日本語
          </button>
          <button onClick={() => lang === 'ja' && toggle()}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
            style={lang === 'en' ? { background: 'linear-gradient(135deg, #0D2659, #054738)', color: 'white' } : { color: '#6b7280' }}>
            English
          </button>
        </div>
      </div>

      {/* Strava 連携 */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{t('Strava連携', 'Strava')}</p>
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: stravaConnected ? '#dcfce7' : '#fee2e2' }}>
              {stravaConnected
                ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <span className="text-sm font-semibold" style={{ color: stravaConnected ? '#16a34a' : '#dc2626' }}>
              {stravaConnected ? t('連携済み', 'Connected') : t('未連携', 'Not connected')}
            </span>
          </div>
          {stravaConnected ? (
            <button
              onClick={async () => {
                if (!confirm(t('Stravaとの連携を解除しますか？', 'Disconnect Strava? Your activities will no longer sync.'))) return
                try {
                  await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/strava/disconnect`, {
                    method: 'POST', headers: { Authorization: `Bearer ${token}` },
                  })
                  window.location.reload()
                } catch { alert(t('切断に失敗しました', 'Failed to disconnect')) }
              }}
              className="flex items-center gap-3 px-4 py-3.5 w-full text-left">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#dc2626" strokeWidth="1.5"/><path d="M4 4l8 8M12 4l-8 8" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <span className="text-sm font-semibold text-red-500">{t('Stravaを切断', 'Disconnect Strava')}</span>
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

      {/* お支払い方法 */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{t('お支払い方法', 'Payment Method')}</p>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#eff6ff' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
              <rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>
            </svg>
          </div>
          {card ? (
            <>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 capitalize">
                  {card.brand} ···· {card.last4}
                </p>
                <p className="text-xs text-gray-400">
                  {String(card.expMonth).padStart(2, '0')} / {String(card.expYear).slice(-2)}
                </p>
              </div>
              <Link href="/profile/payment" className="text-xs font-semibold" style={{ color: '#1A9966' }}>
                {t('変更', 'Change')}
              </Link>
            </>
          ) : (
            <>
              <span className="text-sm text-gray-400 flex-1">{t('カード未登録', 'No card saved')}</span>
              <Link href="/profile/payment" className="text-xs font-semibold" style={{ color: '#1A9966' }}>
                {t('追加', 'Add')}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Menu rows */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
        <Link href="/donations" className="flex items-center gap-3 px-4 py-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#f0fdf4' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A9966" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6M9 12h6"/>
              <path d="M12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-800 flex-1">{t('寄付履歴', 'Donation History')}</span>
          <Chevron />
        </Link>
        <Link href="/how-it-works" className="flex items-center gap-3 px-4 py-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-800 flex-1">{t('使い方', 'How It Works')}</span>
          <Chevron />
        </Link>
        <a href="https://charityathletes.org" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#f0fdfa' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A9966" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <span className="text-sm font-semibold flex-1" style={{ color: '#1A9966' }}>{t('ウェブサイト', 'Website')}</span>
          <Chevron />
        </a>
      </div>

      {/* Role-specific */}
      {(me.role === 'nonprofit' || me.role === 'admin') && (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
          {me.role === 'nonprofit' && (
            <Link href="/nonprofit" className="flex items-center gap-3 px-4 py-4">
              <span className="text-lg">🏢</span>
              <span className="text-sm font-semibold text-gray-800 flex-1">{t('団体ダッシュボード', 'Nonprofit Dashboard')}</span>
              <Chevron />
            </Link>
          )}
          {me.role === 'admin' && (
            <Link href="/admin" className="flex items-center gap-3 px-4 py-4">
              <span className="text-lg">⚙️</span>
              <span className="text-sm font-semibold text-gray-800 flex-1">{t('管理者パネル', 'Admin Panel')}</span>
              <Chevron />
            </Link>
          )}
        </div>
      )}

      {/* ログアウト */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <button onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-4 w-full text-left">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-red-500 flex-1">{t('ログアウト', 'Log Out')}</span>
        </button>
      </div>

      {/* 危険な操作 */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{t('危険な操作', 'Danger Zone')}</p>
        <div className="bg-white rounded-2xl border border-red-100">
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
            className="flex items-center gap-3 px-4 py-4 w-full text-left"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-red-500 flex-1">{t('アカウントを削除', 'Delete Account')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
