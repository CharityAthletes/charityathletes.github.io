'use client'
import { use, useEffect, useState } from 'react'
import {
  getCampaign, getLeaderboard, getCampaignUpdates,
  getCampaignParticipants, joinCampaign, unjoinCampaign,
} from '@/lib/api'
import type { Campaign, LeaderboardEntry, CampaignUpdate, CampaignParticipant } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'

function fmt(n: number) { return n.toLocaleString('ja-JP') }
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}
function relativeTime(s: string) {
  const diff = Date.now() - new Date(s).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  return `${Math.floor(hr / 24)}日前`
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { me, token } = useAuth()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [updates, setUpdates] = useState<CampaignUpdate[]>([])
  const [participants, setParticipants] = useState<CampaignParticipant[]>([])
  const [joined, setJoined] = useState(false)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    Promise.all([
      getCampaign(id, token ?? undefined),
      getLeaderboard(id, token ?? undefined),
      getCampaignUpdates(id, token ?? undefined),
      getCampaignParticipants(id, token ?? undefined),
    ]).then(([c, lb, u, p]) => {
      setCampaign(c)
      setLeaderboard(lb)
      setUpdates(u)
      setParticipants(p)
      if (me) setJoined(p.some(pt => pt.userId === me.id))
    }).catch(console.error).finally(() => setLoading(false))
  }, [id, token, me])

  const handleJoin = async () => {
    if (!token) return
    setJoining(true)
    try {
      await joinCampaign(id, false, null, token)
      setJoined(true)
      const p = await getCampaignParticipants(id, token)
      setParticipants(p)
    } catch (e: any) { alert(e.message) }
    setJoining(false)
  }

  const handleUnjoin = async () => {
    if (!token) return
    setJoining(true)
    try {
      await unjoinCampaign(id, token)
      setJoined(false)
      const p = await getCampaignParticipants(id, token)
      setParticipants(p)
    } catch (e: any) { alert(e.message) }
    setJoining(false)
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <div className="h-48 bg-white rounded-2xl animate-pulse" />
        <div className="h-32 bg-white rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!campaign) {
    return <div className="text-center py-20 text-gray-400">キャンペーンが見つかりません</div>
  }

  const progress = Math.min(100, ((campaign.totalKm ?? 0) / campaign.goalKm) * 100)
  const isCreator = me?.id === campaign.createdBy
  const donorURL = `${process.env.NEXT_PUBLIC_BACKEND_URL}/c/${id}`

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      {/* Cover */}
      {campaign.coverImageUrl ? (
        <img src={campaign.coverImageUrl} alt={campaign.titleJa} className="w-full h-52 object-cover rounded-2xl" />
      ) : (
        <div className="w-full h-52 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center text-6xl">🏃</div>
      )}

      {/* Title & info */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">{campaign.titleJa}</h1>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
            campaign.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {campaign.status === 'active' ? '開催中' : '終了'}
          </span>
        </div>

        <p className="text-sm text-gray-500 mt-1">
          {fmtDate(campaign.startDate)} 〜 {fmtDate(campaign.endDate)}
        </p>

        <p className="text-sm text-gray-600 mt-3 leading-relaxed">{campaign.descriptionJa}</p>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-semibold text-gray-800">{fmt(campaign.totalKm ?? 0)} km</span>
            <span className="text-gray-400">目標 {fmt(campaign.goalKm)} km</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>👥 {campaign.participantCount ?? participants.length}人参加</span>
            <span className="text-orange-500 font-semibold">¥{fmt(campaign.totalRaisedJpy ?? 0)} 集まっています</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {me?.role === 'athlete' && campaign.status === 'active' && (
            joined ? (
              <button
                onClick={handleUnjoin}
                disabled={joining}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-500 transition disabled:opacity-50"
              >
                {joining ? '...' : '参加をやめる'}
              </button>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 transition disabled:opacity-50"
              >
                {joining ? '...' : 'キャンペーンに参加'}
              </button>
            )
          )}
          <a
            href={donorURL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-orange-200 text-orange-600 hover:bg-orange-50 transition"
          >
            寄付者ページを見る 🔗
          </a>
          {isCreator && (
            <Link
              href={`/campaigns/${id}/edit`}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:border-gray-400 transition"
            >
              編集
            </Link>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-800 mb-3">🏆 リーダーボード</h2>
          <div className="space-y-2">
            {leaderboard.slice(0, 5).map((entry, i) => (
              <div key={entry.userId} className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-bold text-gray-400">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-600 shrink-0">
                  {entry.displayName?.[0]?.toUpperCase() ?? '?'}
                </div>
                <span className="flex-1 text-sm text-gray-800">{entry.displayName}</span>
                <span className="text-sm font-semibold text-orange-500">{fmt(entry.totalKm)} km</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Updates */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-bold text-gray-800 mb-3">📣 寄付者向け投稿</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-gray-400">まだ投稿がありません。</p>
        ) : (
          <div className="space-y-4">
            {updates.map(u => (
              <div key={u.id} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-600">
                    {u.userProfiles?.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{u.userProfiles?.displayName ?? 'Athlete'}</span>
                  <span className="text-xs text-gray-400">{relativeTime(u.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{u.message}</p>
                {u.photoUrl && (
                  <img src={u.photoUrl} alt="" className="mt-2 rounded-xl max-h-60 object-cover" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
