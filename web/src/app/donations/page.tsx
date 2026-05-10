'use client'
import { useEffect, useState } from 'react'
import { getDonations, getDonationSummary } from '@/lib/api'
import type { Donation, DonationSummary } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

function statusBadge(s: string, t: (ja: string, en: string) => string) {
  if (s === 'complete' || s === 'charged')
    return { label: t('完了', 'Complete'), bg: '#dcfce7', color: '#16a34a' }
  if (s === 'failed')
    return { label: t('失敗', 'Failed'), bg: '#fee2e2', color: '#dc2626' }
  return { label: t('保留中', 'Pending'), bg: '#f3f4f6', color: '#6b7280' }
}

function donationTypeLabel(d: Donation, t: (ja: string, en: string) => string) {
  if (d.perKmAmountJpy && d.perKmAmountJpy > 0)
    return t('距離に応じた寄付', 'Per-km donation')
  return t('活動ごとの寄付', 'Per-activity donation')
}

function fmtDate(iso: string, lang: 'ja' | 'en') {
  const d = new Date(iso)
  if (lang === 'ja') {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
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
      .then(([d, s]) => {
        setDonations(d)
        // Count from list since summary endpoint doesn't return a count
        setSummary({ ...s, donationCount: d.length })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-5">
      <h1 className="text-3xl font-bold text-gray-900">{t('寄付履歴', 'Donation History')}</h1>

      {/* Summary banner */}
      <div className="rounded-2xl p-5 text-center"
        style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
        <p className="text-3xl font-bold text-white">¥{(summary?.totalJpy ?? 0).toLocaleString()}</p>
        <p className="text-white/70 text-xs mt-1">
          {donations.length}{t('件の寄付', ' donations')}
        </p>
      </div>

      {donations.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <p className="text-3xl mb-3">💰</p>
          <p className="font-semibold text-gray-700">{t('まだ寄付はありません', 'No donations yet')}</p>
          <p className="text-sm text-gray-400 mt-1">
            {t('イベントに参加して、寄付を集めましょう', 'Join a campaign and start raising donations')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {donations.map(d => {
            const badge = statusBadge(d.status, t)
            const typeLabel = donationTypeLabel(d, t)
            const title = lang === 'ja' ? d.campaignTitleJa : d.campaignTitleEn
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
                {/* Top row: title + status badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-bold text-gray-900 text-sm flex-1 leading-snug">
                    {title || t('イベント', 'Campaign')}
                  </p>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: badge.bg, color: badge.color }}>
                    {badge.label}
                  </span>
                </div>

                {/* Type + amount row */}
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-400">{typeLabel}</p>
                    <p className="text-sm font-semibold text-gray-700 mt-0.5">
                      {d.perKmAmountJpy && d.perKmAmountJpy > 0
                        ? `¥${d.perKmAmountJpy}/km`
                        : `¥${(d.flatAmountJpy ?? d.amountJpy ?? 0).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{t('合計', 'Total')}</p>
                    <p className="text-lg font-bold" style={{ color: '#1A9966' }}>
                      ¥{(d.amountJpy ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Date */}
                <p className="text-xs text-gray-400 mt-2">{fmtDate(d.createdAt, lang)}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
