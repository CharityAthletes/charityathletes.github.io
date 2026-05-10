'use client'
import { useEffect, useState } from 'react'
import { getMyCampaigns, getCampaigns } from '@/lib/api'
import type { Campaign } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function daysLeft(endDate: string) {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000))
}
function fmtDate(iso: string, lang: 'ja' | 'en') {
  return new Date(iso).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric' })
}

function CampaignRow({ campaign, joined }: { campaign: Campaign; joined?: boolean }) {
  const { t, lang } = useLang()
  const days = daysLeft(campaign.endDate)
  const progress = campaign.goalKm
    ? Math.min(100, ((campaign.totalKm ?? 0) / campaign.goalKm) * 100) : 0

  return (
    <Link href={`/campaigns/${campaign.id}`} className="block">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-tight">
              {t(campaign.titleJa, campaign.titleEn)}
            </p>
            {campaign.nonprofitName && (
              <p className="text-xs text-gray-400 mt-0.5">{campaign.nonprofitName}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {joined && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-[#1A9966] border-[#1A9966]">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {t('参加中', 'Joined')}
              </span>
            )}
            {campaign.createdBy && joined && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#1A9966' }}>
                ★ {t('マイキャン', 'My Campaign')}
              </span>
            )}
          </div>
        </div>

        {/* Date + days left */}
        <div className="flex items-center gap-2">
          <span className="text-gray-300 text-xs">📅</span>
          <span className="text-xs text-gray-500">
            {fmtDate(campaign.startDate, lang)} – {fmtDate(campaign.endDate, lang)}
          </span>
          {days > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {days}{lang === 'ja' ? '日残り' : 'd left'}
            </span>
          )}
        </div>

        {/* Pledge type badges */}
        {(campaign.hasFlatDonation || campaign.hasPerKmDonation) && (
          <div className="flex gap-2">
            {campaign.hasFlatDonation && (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-600">
                ⚡ {t('フラット', 'Flat')}
              </span>
            )}
            {campaign.hasPerKmDonation && (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-600">
                → {t('距離ごと', 'Per km')}{campaign.maxDistanceKm ? ` / ${campaign.maxDistanceKm}km cap` : ''}
              </span>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #054738, #1A9966)' }} />
          </div>
        </div>

        {/* Bottom stats */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: '#1A9966' }}>
            ¥{(campaign.totalRaisedJpy ?? 0).toLocaleString()}
            {campaign.goalAmountJpy ? (
              <span className="text-xs font-normal text-gray-400"> / ¥{campaign.goalAmountJpy.toLocaleString()}</span>
            ) : null}
          </span>
          <span className="text-xs text-gray-400">
            {(campaign.totalKm ?? 0).toFixed(1)} km
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function CampaignsPage() {
  const { token, me, loading: authLoading } = useAuth()
  const { t } = useLang()
  const router = useRouter()
  const [mine, setMine]     = useState<Campaign[]>([])
  const [explore, setExplore] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!token) { router.replace('/login'); return }
    Promise.all([getMyCampaigns(token), getCampaigns(token)])
      .then(([m, all]) => {
        setMine(m)
        const myIds = new Set(m.map(c => c.id))
        setExplore(all.filter(c => !myIds.has(c.id)))
      })
      .catch(console.error).finally(() => setLoading(false))
  }, [token, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">{t('イベント', 'Campaigns')}</h1>
        {me?.role === 'athlete' && (
          <Link href="/campaigns/create"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md"
            style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
            <span className="text-xl leading-none">+</span>
          </Link>
        )}
      </div>

      {/* Joined */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#1A9966"><path d="M13 4L6.5 11 3 7.5" stroke="#1A9966" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <h2 className="text-base font-bold" style={{ color: '#1A9966' }}>{t('参加中のイベント', 'Joined Campaigns')}</h2>
        </div>
        {mine.length === 0 ? (
          <div className="bg-white rounded-2xl p-5 text-center border border-gray-100">
            <p className="text-sm text-gray-400">{t('まだイベントに参加していません', 'You haven\'t joined any campaigns yet')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mine.map(c => <CampaignRow key={c.id} campaign={c} joined />)}
          </div>
        )}
      </section>

      {/* Explore */}
      {explore.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-700 mb-3">{t('イベントを探す', 'Explore Campaigns')}</h2>
          <div className="space-y-3">
            {explore.map(c => <CampaignRow key={c.id} campaign={c} />)}
          </div>
        </section>
      )}
    </div>
  )
}
