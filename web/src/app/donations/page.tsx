'use client'
import { useEffect, useState } from 'react'
import { getDonations, getDonationSummary } from '@/lib/api'
import type { Donation, DonationSummary } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

function statusLabel(s: string, t: (ja: string, en: string) => string) {
  if (s === 'complete' || s === 'charged') return { label: t('完了', 'Complete'), color: '#1A9966' }
  if (s === 'failed')   return { label: t('失敗', 'Failed'), color: '#dc2626' }
  return { label: t('保留中', 'Pending'), color: '#9ca3af' }
}

function fmtDate(iso: string, lang: 'ja' | 'en') {
  return new Date(iso).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export default function DonationsPage() {
  const { token, loading: authLoading } = useAuth()
  const { t, lang } = useLang()
  const router = useRouter()

  const [donations, setDonations] = useState<Donation[]>([])
  const [summary, setSummary] = useState<DonationSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!token) { router.replace('/login'); return }
    Promise.all([getDonations(token), getDonationSummary(token)])
      .then(([d, s]) => { setDonations(d); setSummary(s) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
      <h1 className="text-3xl font-bold text-gray-900">{t('寄付', 'Donations')}</h1>

      {/* Summary banner */}
      {summary && (
        <div className="rounded-2xl p-4 text-center"
          style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
          <p className="text-3xl font-bold text-white">¥{(summary.totalJpy ?? 0).toLocaleString()}</p>
          <p className="text-white/70 text-xs mt-1">
            {summary.donationCount}{t('件の寄付', ' donations total')}
          </p>
        </div>
      )}

      {donations.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <p className="text-3xl mb-3">💰</p>
          <p className="font-semibold text-gray-700">{t('まだ寄付はありません', 'No donations yet')}</p>
          <p className="text-sm text-gray-400 mt-1">
            {t('イベントに参加して、寄付を集めましょう', 'Join a campaign and start raising donations')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {donations.map(d => {
            const st = statusLabel(d.status, t)
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {lang === 'ja' ? d.campaignTitleJa : d.campaignTitleEn}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(d.createdAt, lang)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm" style={{ color: '#1A9966' }}>¥{(d.amountJpy ?? 0).toLocaleString()}</p>
                    <span className="text-[10px] font-semibold" style={{ color: st.color }}>{st.label}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
