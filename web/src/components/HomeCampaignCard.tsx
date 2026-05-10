'use client'
import Link from 'next/link'
import type { Campaign } from '@/lib/types'
import { useLang } from '@/lib/lang-context'

const SPORT_ICONS: Record<string, string> = {
  run: '🏃', ride: '🚴', swim: '🏊', walk: '🚶', hike: '🥾', ski: '⛷️',
}

function sportIcon(type?: string) {
  const t = (type ?? '').toLowerCase()
  for (const [k, v] of Object.entries(SPORT_ICONS)) { if (t.includes(k)) return v }
  return '🏅'
}

function daysLeft(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000))
}

function fmtDate(iso: string, lang: 'ja' | 'en') {
  return new Date(iso).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric' })
}

interface Props {
  campaign: Campaign
  showDaysLeft?: boolean
}

export default function HomeCampaignCard({ campaign, showDaysLeft }: Props) {
  const { t, lang } = useLang()

  const progress = campaign.goalKm
    ? Math.min(100, ((campaign.totalKm ?? 0) / (campaign.goalKm)) * 100)
    : 0

  const days = daysLeft(campaign.endDate)
  const kmStr = (campaign.totalKm ?? 0).toFixed(1)

  return (
    <Link href={`/campaigns/${campaign.id}`} className="block">
      <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm h-full flex flex-col">
        {/* Title + nonprofit */}
        <p className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">
          {t(campaign.titleJa, campaign.titleEn)}
        </p>
        {campaign.nonprofitName && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{campaign.nonprofitName}</p>
        )}

        {/* Date row */}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-gray-300 text-xs">📅</span>
          <span className="text-xs text-gray-400 truncate">
            {fmtDate(campaign.startDate, lang)} – {fmtDate(campaign.endDate, lang)}
          </span>
          {showDaysLeft && days > 0 && (
            <span className="ml-auto shrink-0 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">
              {days}{t('日', 'd')} {t('残り', 'left')}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #e6a817, #f5c842)',
            }}
          />
        </div>

        {/* Stats row */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: '#1A9966' }}>
            ¥{(campaign.totalRaisedJpy ?? 0).toLocaleString()}
          </span>
          <span className="text-xs text-gray-400">{kmStr} km</span>
        </div>
      </div>
    </Link>
  )
}
