'use client'
import { useEffect, useState } from 'react'
import { getCampaigns } from '@/lib/api'
import type { Campaign } from '@/lib/types'
import CampaignCard from '@/components/CampaignCard'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

export default function HomePage() {
  const { me } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCampaigns().then(setCampaigns).catch(console.error).finally(() => setLoading(false))
  }, [])

  const active = campaigns.filter(c => c.status === 'active')
  const past   = campaigns.filter(c => c.status !== 'active')

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero */}
      <div className="text-center mb-10 py-8 px-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
        <h1 className="text-3xl font-bold text-white mb-2">
          走ることで、世界を変えよう 🏃
        </h1>
        <p className="text-white/70 max-w-xl mx-auto">
          Charity Athletes は、アスリートの活動を寄付につなげるプラットフォームです。
        </p>
        {me?.role === 'athlete' && (
          <Link
            href="/campaigns/create"
            className="inline-block mt-4 px-6 py-2.5 rounded-full font-semibold text-white transition hover:opacity-90"
            style={{ background: '#1A9966' }}
          >
            キャンペーンを作成
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-64 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-4">開催中のキャンペーン</h2>
            {active.length === 0 ? (
              <p className="text-gray-400 text-sm">現在開催中のキャンペーンはありません。</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {active.map(c => <CampaignCard key={c.id} campaign={c} />)}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-12">
              <h2 className="text-lg font-bold text-gray-800 mb-4">過去のキャンペーン</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {past.map(c => <CampaignCard key={c.id} campaign={c} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
