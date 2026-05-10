'use client'
import { useEffect, useState } from 'react'
import { getMyCampaigns, getCreatedCampaigns, getDonationSummary } from '@/lib/api'
import type { Campaign, DonationSummary } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import HomeCampaignCard from '@/components/HomeCampaignCard'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function fmt(n: number) { return n.toLocaleString('ja-JP') }

export default function DashboardPage() {
  const { me, token, loading: authLoading } = useAuth()
  const { t } = useLang()
  const router = useRouter()

  const [joined, setJoined]   = useState<Campaign[]>([])
  const [created, setCreated] = useState<Campaign[]>([])
  const [summary, setSummary] = useState<DonationSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!token) { router.replace('/login'); return }
    Promise.all([
      getMyCampaigns(token),
      getCreatedCampaigns(token),
      getDonationSummary(token),
    ]).then(([j, c, s]) => {
      setJoined(j); setCreated(c); setSummary(s)
    }).catch(console.error).finally(() => setLoading(false))
  }, [token, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          {t('おかえりなさい、', 'Welcome back, ')}{me?.displayName ?? t('アスリート', 'Athlete')}{t('さん', '')} 👋
        </h1>
        <Link
          href="/campaigns/create"
          className="px-3 py-1.5 rounded-full text-sm font-semibold text-white hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}
        >
          + {t('イベント作成', 'Create')}
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">{t('合計寄付額', 'Total Donated')}</p>
          <p className="text-2xl font-bold" style={{ color: '#1A9966' }}>¥{fmt(summary?.totalJpy ?? 0)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">{t('参加イベント', 'Events Joined')}</p>
          <p className="text-2xl font-bold text-gray-800">{joined.length}</p>
        </div>
      </div>

      {/* Joined */}
      <section>
        <h2 className="text-base font-bold text-gray-800 mb-3">{t('参加中のイベント', 'Joined Events')}</h2>
        {joined.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <p className="text-gray-400 text-sm mb-3">{t('まだイベントに参加していません', 'You haven\'t joined any events yet')}</p>
            <Link href="/campaigns" className="text-sm font-semibold hover:underline" style={{ color: '#1A9966' }}>
              {t('イベントを探す →', 'Browse events →')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {joined.map(c => <HomeCampaignCard key={c.id} campaign={c} />)}
          </div>
        )}
      </section>

      {/* Created */}
      {created.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-800 mb-3">{t('作成したイベント', 'My Created Events')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {created.map(c => <HomeCampaignCard key={c.id} campaign={c} />)}
          </div>
        </section>
      )}
    </div>
  )
}
