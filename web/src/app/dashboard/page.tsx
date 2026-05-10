'use client'
import { useEffect, useState } from 'react'
import { getMyCampaigns, getCreatedCampaigns, getDonationSummary } from '@/lib/api'
import type { Campaign, DonationSummary } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import CampaignCard from '@/components/CampaignCard'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function fmt(n: number) { return n.toLocaleString('ja-JP') }

export default function DashboardPage() {
  const { me, token, loading: authLoading } = useAuth()
  const router = useRouter()

  const [joined, setJoined] = useState<Campaign[]>([])
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
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          こんにちは、{me?.displayName ?? 'アスリート'} さん 👋
        </h1>
        <Link
          href="/campaigns/create"
          className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 transition"
        >
          + キャンペーン作成
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">合計寄付額</p>
          <p className="text-2xl font-bold text-orange-500">¥{fmt(summary?.totalJpy ?? 0)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">参加キャンペーン</p>
          <p className="text-2xl font-bold text-gray-800">{joined.length}</p>
        </div>
      </div>

      {/* Joined campaigns */}
      <section>
        <h2 className="text-base font-bold text-gray-800 mb-3">参加中のキャンペーン</h2>
        {joined.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <p className="text-gray-400 text-sm mb-3">まだ参加しているキャンペーンがありません。</p>
            <Link href="/" className="text-orange-500 text-sm font-semibold hover:underline">
              キャンペーンを探す →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {joined.map(c => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        )}
      </section>

      {/* Created campaigns */}
      {created.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-800 mb-3">作成したキャンペーン</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {created.map(c => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        </section>
      )}
    </div>
  )
}
