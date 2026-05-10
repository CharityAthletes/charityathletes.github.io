'use client'
import { useEffect, useState } from 'react'
import { getCampaigns } from '@/lib/api'
import type { Campaign } from '@/lib/types'
import HomeCampaignCard from '@/components/HomeCampaignCard'
import { useLang } from '@/lib/lang-context'

export default function CampaignsPage() {
  const { t } = useLang()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCampaigns().then(setCampaigns).catch(console.error).finally(() => setLoading(false))
  }, [])

  const active = campaigns.filter(c => c.status === 'active')
  const past   = campaigns.filter(c => c.status !== 'active')

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 grid grid-cols-2 gap-3">
        {[...Array(6)].map((_, i) => <div key={i} className="h-44 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-3">{t('開催中', 'Active Campaigns')}</h2>
        {active.length === 0 ? (
          <p className="text-sm text-gray-400">{t('現在開催中のキャンペーンはありません', 'No active campaigns')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {active.map(c => <HomeCampaignCard key={c.id} campaign={c} showDaysLeft />)}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">{t('過去のキャンペーン', 'Past Campaigns')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {past.map(c => <HomeCampaignCard key={c.id} campaign={c} />)}
          </div>
        </section>
      )}
    </div>
  )
}
