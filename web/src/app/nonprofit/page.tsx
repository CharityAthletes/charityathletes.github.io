'use client'
import { useEffect, useState } from 'react'
import { getNonprofitDashboard, getNonprofitCampaigns, getNonprofitProfile } from '@/lib/api'
import type { NonprofitDashboard, Campaign, NonprofitProfile } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import CampaignCard from '@/components/CampaignCard'

function fmt(n: number) { return n.toLocaleString('ja-JP') }
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}

export default function NonprofitPage() {
  const { token, me } = useAuth()
  const [profile, setProfile] = useState<NonprofitProfile | null>(null)
  const [dashboard, setDashboard] = useState<NonprofitDashboard | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    Promise.all([
      getNonprofitProfile(token),
      getNonprofitDashboard(token),
      getNonprofitCampaigns(token),
    ]).then(([p, d, c]) => {
      setProfile(p); setDashboard(d); setCampaigns(c)
    }).catch(console.error).finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        {profile?.logoUrl && (
          <img src={profile.logoUrl} alt={profile.nameJa} className="h-14 object-contain" />
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile?.nameJa}</h1>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            profile?.status === 'approved' ? 'bg-green-100 text-green-700' :
            profile?.status === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
                                             'bg-red-100 text-red-600'
          }`}>
            {profile?.status === 'approved' ? '承認済み' :
             profile?.status === 'pending'  ? '審査中' : '非承認'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '合計寄付額', value: `¥${fmt(dashboard?.totalRaisedJpy ?? 0)}` },
          { label: 'アクティブキャンペーン', value: String(dashboard?.activeCampaigns ?? 0) },
          { label: '寄付者数', value: String(dashboard?.totalDonors ?? 0) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-orange-500">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Recent donations */}
      {(dashboard?.recentDonations?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-800 mb-3">最近の寄付</h2>
          <div className="space-y-2">
            {dashboard!.recentDonations.slice(0, 5).map(d => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{d.campaignTitleJa}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-xs">{fmtDate(d.createdAt)}</span>
                  <span className="font-semibold text-orange-500">¥{fmt(d.amountJpy)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaigns */}
      <section>
        <h2 className="text-base font-bold text-gray-800 mb-3">キャンペーン一覧</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-gray-400">キャンペーンはまだありません。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {campaigns.map(c => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        )}
      </section>
    </div>
  )
}
