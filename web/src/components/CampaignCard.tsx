import Link from 'next/link'
import type { Campaign } from '@/lib/types'

function fmt(n: number) { return n.toLocaleString('ja-JP') }

export default function CampaignCard({ campaign }: { campaign: Campaign }) {
  const progress = campaign.goalKm
    ? Math.min(100, ((campaign.totalKm ?? 0) / campaign.goalKm) * 100)
    : 0

  const isJa = true // TODO: i18n
  const title = isJa ? campaign.titleJa : campaign.titleEn
  const end = new Date(campaign.endDate).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })

  return (
    <Link href={`/campaigns/${campaign.id}`} className="block group">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
        {campaign.coverImageUrl ? (
          <img
            src={campaign.coverImageUrl}
            alt={title}
            className="w-full h-40 object-cover"
          />
        ) : (
          <div className="w-full h-40 bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
            <span className="text-4xl">🏃</span>
          </div>
        )}

        <div className="p-4">
          {campaign.nonprofitLogoUrl && (
            <img
              src={campaign.nonprofitLogoUrl}
              alt={campaign.nonprofitName ?? ''}
              className="h-6 mb-2 object-contain"
            />
          )}

          <h3 className="font-bold text-gray-900 leading-tight line-clamp-2 group-hover:text-orange-500 transition-colors">
            {title}
          </h3>

          <p className="text-xs text-gray-400 mt-1">〜 {end}まで</p>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{fmt(campaign.totalKm ?? 0)} km</span>
              <span>目標 {fmt(campaign.goalKm)} km</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>👥 {campaign.participantCount ?? 0}人参加</span>
            <span className="font-semibold text-orange-500">
              ¥{fmt(campaign.totalRaisedJpy ?? 0)} 集まっています
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
