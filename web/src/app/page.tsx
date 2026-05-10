'use client'
import { useEffect, useState } from 'react'
import { getMyCampaigns, getCampaigns, getDonationSummary } from '@/lib/api'
import type { Campaign, DonationSummary } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import HomeCampaignCard from '@/components/HomeCampaignCard'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function HomePage() {
  const { me, token, loading: authLoading } = useAuth()
  const { t } = useLang()
  const router = useRouter()

  const [mine, setMine]       = useState<Campaign[]>([])
  const [all, setAll]         = useState<Campaign[]>([])
  const [summary, setSummary] = useState<DonationSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!token) { router.replace('/login'); return }

    Promise.all([
      getMyCampaigns(token),
      getCampaigns(token),
      getDonationSummary(token),
    ]).then(([m, a, s]) => {
      setMine(m)
      // "Join" tab = public campaigns not already in mine
      const myIds = new Set(m.map(c => c.id))
      setAll(a.filter(c => !myIds.has(c.id)))
      setSummary(s)
    }).catch(console.error).finally(() => setLoading(false))
  }, [token, authLoading, router])

  const totalKm = mine.reduce((s, c) => s + (c.totalKm ?? 0), 0)

  if (authLoading || loading) {
    return (
      <div className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        <div className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-44 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        {me?.avatarUrl ? (
          <img src={me.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-white shadow" />
        ) : (
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shadow"
            style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
            {(me?.displayName ?? 'A')[0].toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm text-gray-400">{t('おかえりなさい', 'Welcome back')}</p>
          <p className="text-2xl font-bold text-gray-900">{me?.displayName ?? t('アスリート', 'Athlete')}</p>
        </div>
      </div>

      {/* Stats banner */}
      <div className="rounded-2xl p-5 flex"
        style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
        <div className="flex-1 text-center">
          <p className="text-3xl font-bold text-white">¥{(summary?.totalJpy ?? 0).toLocaleString()}</p>
          <p className="text-white/70 text-xs mt-0.5">{t('合計寄付額', 'Total Donated')}</p>
        </div>
        <div className="w-px bg-white/20 mx-2" />
        <div className="flex-1 text-center">
          <p className="text-3xl font-bold text-white">{(totalKm ?? 0).toFixed(1)} <span className="text-lg font-semibold">km</span></p>
          <p className="text-white/70 text-xs mt-0.5">{t('合計距離', 'Total Distance')}</p>
        </div>
      </div>

      {/* My Campaigns */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">{t('マイイベント', 'My Campaigns')}</h2>
          <Link href="/dashboard" className="text-xs font-semibold" style={{ color: '#1A9966' }}>
            {t('すべて見る', 'See all')} →
          </Link>
        </div>
        {mine.length === 0 ? (
          <div className="bg-white rounded-2xl p-5 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">{t('参加中のイベントはありません', 'No campaigns yet')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {mine.map(c => <HomeCampaignCard key={c.id} campaign={c} />)}
          </div>
        )}
      </section>

      {/* Join a Campaign */}
      {all.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">{t('イベントに参加', 'Join a Campaign')}</h2>
            <Link href="/campaigns" className="text-xs font-semibold" style={{ color: '#1A9966' }}>
              {t('すべて見る', 'See all')} →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {all.slice(0, 4).map(c => <HomeCampaignCard key={c.id} campaign={c} showDaysLeft />)}
          </div>
        </section>
      )}
    </div>
  )
}
