'use client'
import { use, useEffect, useState, useRef } from 'react'
import {
  getCampaign, getCampaignUpdates, getCampaignParticipants,
  getCampaignPledges, joinCampaign, unjoinCampaign, postCampaignUpdate,
} from '@/lib/api'
import type { Campaign, CampaignUpdate, CampaignParticipant, DonorPledge } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string, lang: 'ja' | 'en') {
  return new Date(s).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}
function relativeTime(s: string, lang: 'ja' | 'en') {
  const diff = Date.now() - new Date(s).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)  return lang === 'ja' ? 'たった今' : 'just now'
  if (min < 60) return lang === 'ja' ? `${min}分前` : `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)  return lang === 'ja' ? `${hr}時間前` : `${hr} hr. ago`
  return lang === 'ja' ? `${Math.floor(hr / 24)}日前` : `${Math.floor(hr / 24)}d ago`
}

// ── Post Update modal ─────────────────────────────────────────────────────────

function PostUpdateModal({ campaignId, token, onClose, onPosted }: {
  campaignId: string; token: string; onClose: () => void; onPosted: () => void
}) {
  const { t } = useLang()
  const [message, setMessage] = useState('')
  const [posting, setPosting] = useState(false)

  const submit = async () => {
    if (!message.trim()) return
    setPosting(true)
    try {
      await postCampaignUpdate(campaignId, message.trim(), null, token)
      onPosted()
      onClose()
    } catch (e: any) { alert(e.message) }
    setPosting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{t('投稿する', 'Post Update')}</h3>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
        </div>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={t('寄付者へのメッセージを入力...', 'Write a message to your donors...')}
          rows={4}
          className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-200"
        />
        <button
          onClick={submit}
          disabled={posting || !message.trim()}
          className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition"
          style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}
        >
          {posting ? t('投稿中...', 'Posting...') : t('投稿する', 'Post')}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { me, token } = useAuth()
  const { t, lang } = useLang()
  const router = useRouter()

  const [campaign, setCampaign]       = useState<Campaign | null>(null)
  const [updates, setUpdates]         = useState<CampaignUpdate[]>([])
  const [participants, setParticipants] = useState<CampaignParticipant[]>([])
  const [pledges, setPledges]         = useState<DonorPledge[]>([])
  const [joined, setJoined]           = useState(false)
  const [loading, setLoading]         = useState(true)
  const [joining, setJoining]         = useState(false)
  const [showPostModal, setShowPostModal] = useState(false)

  const load = async () => {
    const [c, u, p, pl] = await Promise.all([
      getCampaign(id, token ?? undefined),
      getCampaignUpdates(id, token ?? undefined),
      getCampaignParticipants(id, token ?? undefined),
      token ? getCampaignPledges(id, token).catch(() => []) : Promise.resolve([]),
    ])
    setCampaign(c); setUpdates(u); setParticipants(p); setPledges(pl as DonorPledge[])
    if (me) setJoined(p.some(pt => pt.userId === me.id))
  }

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false))
  }, [id, token, me])

  const handleJoin = async () => {
    if (!token) { router.push('/login'); return }
    setJoining(true)
    try { await joinCampaign(id, false, null, token); await load(); setJoined(true) }
    catch (e: any) { alert(e.message) }
    setJoining(false)
  }

  const handleLeave = async () => {
    if (!token) return
    setJoining(true)
    try { await unjoinCampaign(id, token); await load(); setJoined(false) }
    catch (e: any) { alert(e.message) }
    setJoining(false)
  }

  const donorURL   = `${process.env.NEXT_PUBLIC_BACKEND_URL}/c/${id}`
  const shareText  = campaign ? `${t(campaign.titleJa, campaign.titleEn)} — Charity Athletes` : ''
  const shareURL   = `https://app.charityathletes.org/campaigns/${id}`

  const shareOn = (platform: string) => {
    const urls: Record<string, string> = {
      x:         `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareURL)}&text=${encodeURIComponent(shareText)}`,
      facebook:  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareURL)}`,
      linkedin:  `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareURL)}`,
      instagram: shareURL, // copy link — Instagram doesn't have a web share URL
    }
    if (platform === 'instagram') {
      navigator.clipboard?.writeText(shareURL)
      alert(t('リンクをコピーしました', 'Link copied! Paste it on Instagram.'))
    } else {
      window.open(urls[platform], '_blank', 'width=600,height=400')
    }
  }

  const copyShareCard = async () => {
    await navigator.clipboard?.writeText(donorURL)
    alert(t('寄付者ページのURLをコピーしました', 'Donor page URL copied!'))
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }
  if (!campaign) {
    return <div className="text-center py-20 text-gray-400">{t('キャンペーンが見つかりません', 'Campaign not found')}</div>
  }

  const progress    = campaign.goalKm ? Math.min(100, ((campaign.totalKm ?? 0) / campaign.goalKm) * 100) : 0
  const isCreator   = me?.id === campaign.createdBy
  const description = t(campaign.descriptionJa, campaign.descriptionEn)

  return (
    <>
      {showPostModal && token && (
        <PostUpdateModal
          campaignId={id} token={token}
          onClose={() => setShowPostModal(false)}
          onPosted={() => getCampaignUpdates(id, token ?? undefined).then(setUpdates)}
        />
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4">

        {/* Back */}
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-semibold" style={{ color: '#1A9966' }}>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M7 1L1 7l6 6"/></svg>
          {t('戻る', 'Back')}
        </button>

        {/* ── Campaign header ─────────────────────────────────── */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">{t(campaign.titleJa, campaign.titleEn)}</h1>
          {campaign.nonprofitName && (
            <p className="text-sm text-gray-400">{campaign.nonprofitName}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {fmtDate(campaign.startDate, lang)} – {fmtDate(campaign.endDate, lang)}
          </div>

          {/* Progress bar */}
          <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #e6a817, #f5c842)' }} />
          </div>

          {/* Raised / Goal */}
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold" style={{ color: '#1A9966' }}>
                ¥{(campaign.totalRaisedJpy ?? 0).toLocaleString()}
              </span>
              <span className="text-sm text-gray-400 ml-1">{t('集まっています', 'Raised')}</span>
            </div>
            {campaign.goalAmountJpy && (
              <span className="text-sm text-gray-400">
                ¥{campaign.goalAmountJpy.toLocaleString()} {t('目標', 'Goal')}
              </span>
            )}
          </div>

          {/* Participants */}
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {campaign.participantCount ?? participants.length} {t('人参加', 'Participants')}
          </div>
        </div>

        {/* ── Donation info card ─────────────────────────────── */}
        {(campaign.hasFlatDonation || campaign.hasPerKmDonation) && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
            {campaign.hasFlatDonation && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#f0fdf4' }}>
                    <span className="text-sm">⚡</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{t('活動ごとの寄付', 'Flat donation per activity')}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-700">
                  {campaign.suggestedPerKmJpy ? `¥${campaign.suggestedPerKmJpy}` : t('金額は寄付者が決定', "Donor's choice")}
                </span>
              </div>
            )}
            {campaign.hasPerKmDonation && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-blue-50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">{t('距離ごとの寄付', 'Per-km donation rate')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-700">{t('金額は寄付者が決定', "Donor's choice")}</p>
                  {campaign.maxDistanceKm && (
                    <p className="text-xs text-gray-400">max {campaign.maxDistanceKm} km</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Description ────────────────────────────────────── */}
        {description && (
          <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        )}

        {/* ── Join / Leave ───────────────────────────────────── */}
        {me?.role === 'athlete' && (
          joined ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2" style={{ color: '#1A9966' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span className="text-sm font-bold">{t('アスリートとして参加中', 'Joined as an Athlete')}</span>
              </div>
              <button
                onClick={handleLeave}
                disabled={joining}
                className="text-sm font-semibold text-gray-400 hover:text-red-500 transition"
              >
                {t('退出', 'Leave')}
              </button>
            </div>
          ) : (
            campaign.status === 'active' && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50 transition"
                style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}
              >
                {joining ? '...' : t('キャンペーンに参加する', 'Join Campaign')}
              </button>
            )
          )
        )}

        {/* ── Donate button ──────────────────────────────────── */}
        <a
          href={donorURL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold border-2 transition hover:bg-green-50"
          style={{ borderColor: '#1A9966', color: '#1A9966' }}
        >
          <span>❤️</span>
          {t('このキャンペーンに寄付する', 'Donate to This Campaign')}
        </a>

        {/* ── Share on Social Media ──────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <h2 className="font-bold text-gray-900">{t('SNSでシェア', 'Share on Social Media')}</h2>
          <button
            onClick={copyShareCard}
            className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            {t('シェアカードを作成', 'Create Share Card')}
          </button>
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'x',        label: 'X',         bg: '#000',     icon: <span className="text-white font-bold text-sm">X</span> },
              { key: 'facebook', label: 'Facebook',  bg: '#1877f2',  icon: <span className="text-white font-bold text-sm">f</span> },
              { key: 'linkedin', label: 'LinkedIn',  bg: '#0a66c2',  icon: <span className="text-white font-bold text-xs">in</span> },
              { key: 'instagram',label: 'Instagram', bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg> },
            ].map(s => (
              <button key={s.key} onClick={() => shareOn(s.key)}
                className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: s.bg }}>
                  {s.icon}
                </div>
                <span className="text-[10px] text-gray-400">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Updates for Donors ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📢</span>
            <h2 className="font-bold text-gray-900">{t('寄付者向け投稿', 'Updates for Donors')}</h2>
          </div>

          {(joined || isCreator) && token && (
            <button
              onClick={() => setShowPostModal(true)}
              className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}
            >
              <span className="text-lg leading-none">+</span>
              {t('投稿する', 'Post Update')}
            </button>
          )}

          {updates.length === 0 ? (
            <p className="text-sm text-gray-400">{t('まだ投稿がありません', 'No updates yet')}</p>
          ) : (
            <div className="space-y-4">
              {updates.map(u => (
                <div key={u.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
                      {u.userProfiles?.displayName?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-800">{u.userProfiles?.displayName ?? t('アスリート', 'Athlete')}</p>
                      <p className="text-[10px] text-gray-400">{relativeTime(u.createdAt, lang)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{u.message}</p>
                  {u.photoUrl && (
                    <img src={u.photoUrl} alt="" className="mt-2 w-full rounded-xl object-cover max-h-64" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── All Donors ─────────────────────────────────────── */}
        {token && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-900">{t('すべての寄付者', 'All Donors')}</h2>
              <span className="text-xs text-gray-400">{pledges.length} {t('件', 'pledge(s)')}</span>
            </div>
            {pledges.length === 0 ? (
              <p className="text-sm text-gray-400">{t('まだ寄付がありません', 'No pledges yet')}</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {pledges.map(p => {
                  const isFlat   = !p.perKmRateJpy
                  const amount   = (p as any).flatAmountJpy ?? (p as any).chargedAmountJpy
                  const confirmed = (p as any).status === 'confirmed' || (p as any).status === 'charged'
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-3">
                      {confirmed ? (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#dcfce7' }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">
                          {p.isAnonymous ? t('匿名', 'Anonymous') : p.donorName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {isFlat ? t('フラット寄付', 'Flat donation') : `¥${p.perKmRateJpy}/km`}
                        </p>
                      </div>
                      {amount ? (
                        <span className="text-sm font-bold" style={{ color: '#1A9966' }}>¥{amount.toLocaleString()}</span>
                      ) : confirmed ? (
                        <span className="text-xs text-gray-400">{t('確認済み', 'Confirmed')}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
