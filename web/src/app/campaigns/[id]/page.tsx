'use client'
import { use, useEffect, useState, useRef } from 'react'
import {
  getCampaign, getCampaignUpdates, getCampaignParticipants,
  getCampaignPledges, joinCampaign, unjoinCampaign, postCampaignUpdate, sendThankYou,
} from '@/lib/api'
import type { Campaign, CampaignUpdate, CampaignParticipant, DonorPledge, MeResponse } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

declare global { interface Window { Stripe: any } }

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

// ── Thank Donors modal ────────────────────────────────────────────────────────

function ThankDonorsModal({ campaignId, token, onClose }: {
  campaignId: string; token: string; onClose: () => void
}) {
  const { t } = useLang()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sentTo: number } | null>(null)

  const submit = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      const r = await sendThankYou(campaignId, message.trim(), token)
      setResult(r)
    } catch (e: any) { alert(e.message) }
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-4">
        {result ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">💌</div>
            <p className="font-bold text-gray-900">{t('お礼を送りました', 'Thank you sent!')}</p>
            <p className="text-sm text-gray-400 mt-1">
              {result.sentTo}{t('人の寄付者にメッセージを送りました', ' donor(s) notified')}
            </p>
            <button onClick={onClose} className="mt-4 px-6 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
              {t('閉じる', 'Close')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{t('寄付者にお礼を送る', 'Thank Your Donors')}</h3>
              <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-gray-400">
              {t('寄付してくださった方々に感謝のメッセージを送りましょう', 'Send a message of gratitude to everyone who donated')}
            </p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('お礼のメッセージを入力...', 'Write your thank-you message...')}
              rows={4}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-200"
            />
            <button
              onClick={submit}
              disabled={sending || !message.trim()}
              className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}
            >
              {sending ? t('送信中...', 'Sending...') : t('お礼を送る', 'Send Thank You')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Post Update modal ─────────────────────────────────────────────────────────

function PostUpdateModal({ campaignId, token, onClose, onPosted }: {
  campaignId: string; token: string; onClose: () => void; onPosted: () => void
}) {
  const { t } = useLang()
  const [message, setMessage] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  const submit = async () => {
    if (!message.trim() && !photo) return
    setPosting(true)
    try {
      let photoUrl: string | null = null
      if (photo) {
        const form = new FormData()
        form.append('photo', photo)
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/campaigns/${campaignId}/updates/photo`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
        )
        if (!res.ok) throw new Error(t('写真のアップロードに失敗しました', 'Photo upload failed'))
        const data = await res.json()
        photoUrl = data.url
      }
      await postCampaignUpdate(campaignId, message.trim(), photoUrl, token)
      onPosted()
      onClose()
    } catch (e: any) { alert(e.message) }
    setPosting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{t('報告する', 'Post Update')}</h3>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
        </div>

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={t('寄付者へのメッセージを入力...', 'Write a message to your donors...')}
          rows={4}
          className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-200"
        />

        {/* Photo picker */}
        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
        {preview ? (
          <div className="relative">
            <img src={preview} alt="" className="w-full rounded-xl object-cover max-h-48" />
            <button
              onClick={() => { setPhoto(null); setPreview(null) }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white text-sm leading-none"
            >×</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 flex items-center justify-center gap-2 hover:bg-gray-50 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            {t('写真を追加', 'Add Photo')}
          </button>
        )}

        <button
          onClick={submit}
          disabled={posting || (!message.trim() && !photo)}
          className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition"
          style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}
        >
          {posting ? t('投稿中...', 'Posting...') : t('報告する', 'Post')}
        </button>
      </div>
    </div>
  )
}

// ── Donate modal ──────────────────────────────────────────────────────────────

function DonateModal({ campaign, campaignId, me, onClose, onSuccess }: {
  campaign: Campaign; campaignId: string; me: MeResponse
  onClose: () => void; onSuccess: () => void
}) {
  const { t } = useLang()
  const showFlat  = !!campaign.hasFlatDonation
  const showPerKm = !!campaign.hasPerKmDonation

  const [tab, setTab]               = useState<'flat' | 'perkm'>(showFlat ? 'flat' : 'perkm')
  const [amount, setAmount]         = useState<number | null>(null)
  const [customAmt, setCustomAmt]   = useState('')
  const [rate, setRate]             = useState<number | null>(null)
  const [customRate, setCustomRate] = useState('')
  const [anonymous, setAnonymous]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const [stripeReady, setStripeReady] = useState(false)

  const stripeRef   = useRef<any>(null)
  const elementsRef = useRef<any>(null)
  const cardRef     = useRef<HTMLDivElement>(null)

  const FLAT_PRESETS = [500, 1000, 3000, 5000]
  const KM_RATES     = [10, 20, 50]

  useEffect(() => {
    const init = async () => {
      if (!window.Stripe) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://js.stripe.com/v3/'
          s.onload = () => res(); s.onerror = () => rej(new Error('Stripe load failed'))
          document.head.appendChild(s)
        })
      }
      const stripe   = window.Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
      stripeRef.current   = stripe
      const elements = stripe.elements()
      elementsRef.current = elements
      const card = elements.create('card', {
        style: { base: { fontSize: '16px', color: '#111827', fontFamily: '-apple-system,sans-serif', '::placeholder': { color: '#9ca3af' } }, invalid: { color: '#dc2626' } },
      })
      card.mount(cardRef.current!)
      setStripeReady(true)
    }
    init().catch(e => setError(e.message))
  }, [])

  const handleSubmit = async () => {
    const finalAmt  = amount  ?? (customAmt  ? parseInt(customAmt)  : null)
    const finalRate = rate    ?? (customRate ? parseInt(customRate) : null)
    if (tab === 'flat'  && !finalAmt)  return setError(t('金額を選択してください', 'Please select an amount'))
    if (tab === 'perkm' && !finalRate) return setError(t('レートを選択してください', 'Please select a rate'))
    if (!stripeRef.current || !elementsRef.current) return

    setSubmitting(true); setError('')
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/c/${campaignId}/pledge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            donor_name:       (me as any).displayName || me.email,
            donor_email:      me.email,
            flat_amount_jpy:  tab === 'flat'  ? finalAmt  : null,
            per_km_rate_jpy:  tab === 'perkm' ? finalRate : null,
            is_anonymous:     anonymous,
            athlete_user_id:  campaign.createdBy ?? null,
            currency:         'jpy',
          }),
        }
      )
      const pledge = await res.json()
      if (!res.ok) throw new Error(pledge.error ?? 'Pledge failed')

      const card = elementsRef.current.getElement('card')
      let intentId: string
      if (pledge.type === 'payment') {
        const { paymentIntent, error: e } = await stripeRef.current.confirmCardPayment(
          pledge.client_secret, { payment_method: { card } }
        )
        if (e) throw new Error(e.message)
        intentId = paymentIntent.id
      } else {
        const { setupIntent, error: e } = await stripeRef.current.confirmCardSetup(
          pledge.client_secret, { payment_method: { card } }
        )
        if (e) throw new Error(e.message)
        intentId = setupIntent.id
      }

      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/c/${campaignId}/pledge/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent_id: intentId }),
      })

      setSuccess(true)
      setTimeout(() => { onSuccess(); onClose() }, 2000)
    } catch (e: any) { setError(e.message) }
    setSubmitting(false)
  }

  const maxKm  = campaign.maxDistanceKm
  const effRate = rate ?? (customRate ? parseInt(customRate) : 0)
  const maxCharge = maxKm && effRate ? `¥${(maxKm * effRate).toLocaleString()}` : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="bg-white rounded-t-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <button onClick={onClose} className="text-sm font-semibold" style={{ color: '#1A9966' }}>
            {t('閉じる', 'Close')}
          </button>
          <p className="font-bold text-gray-900 text-base">{t('支援する', 'Support Campaign')}</p>
          <div className="w-12" />
        </div>

        {/* Campaign title */}
        <div className="text-center px-5 pb-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <p className="font-bold text-gray-900 text-lg leading-snug">
            {t(campaign.titleJa, campaign.titleEn)}
          </p>
        </div>

        {success ? (
          <div className="text-center py-10 px-5">
            <div className="text-5xl mb-3">🎉</div>
            <p className="font-bold text-gray-900 text-lg">{t('ありがとうございます！', 'Thank you!')}</p>
            <p className="text-sm text-gray-400 mt-1">{t('寄付が確認されました。', 'Your pledge has been confirmed.')}</p>
          </div>
        ) : (
          <div className="px-5 pb-8 space-y-5">
            {/* Tab switcher */}
            {showFlat && showPerKm && (
              <div className="flex gap-1 p-1 rounded-2xl bg-gray-100">
                <button onClick={() => setTab('flat')}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
                  style={tab === 'flat' ? { background: 'white', color: '#111827', boxShadow: '0 1px 4px rgba(0,0,0,.1)' } : { color: '#6b7280' }}>
                  {t('活動ごとの寄付', 'One-time')}
                </button>
                <button onClick={() => setTab('perkm')}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
                  style={tab === 'perkm' ? { background: 'white', color: '#111827', boxShadow: '0 1px 4px rgba(0,0,0,.1)' } : { color: '#6b7280' }}>
                  {t('距離に応じた寄付', 'Per-km Pledge')}
                </button>
              </div>
            )}

            {/* ── Flat donation ── */}
            {tab === 'flat' && (
              <div className="space-y-4">
                <div>
                  <p className="font-bold text-gray-900">{t('金額を選択', 'Choose your amount')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t('活動1回ごとに寄付されます', 'Charged once per activity')}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {FLAT_PRESETS.map(v => (
                    <button key={v} onClick={() => { setAmount(v); setCustomAmt('') }}
                      className="px-4 py-2 rounded-2xl text-sm font-bold transition"
                      style={amount === v && !customAmt
                        ? { background: '#1A9966', color: 'white' }
                        : { background: '#f3f4f6', color: '#374151' }}>
                      ¥{v.toLocaleString()}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">{t('カスタム金額', 'Custom amount')}</p>
                  <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2.5 bg-white">
                    <span className="text-gray-400 mr-2">¥</span>
                    <input type="number" min="100" value={customAmt}
                      onChange={e => { setCustomAmt(e.target.value); setAmount(null) }}
                      placeholder="0"
                      className="flex-1 outline-none text-sm text-gray-900" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Per-km pledge ── */}
            {tab === 'perkm' && (
              <div className="space-y-4">
                <div>
                  <p className="font-bold text-gray-900">{t('レートを選択', 'Choose your pledge rate')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('キャンペーン終了時にアスリートの総走行距離に応じて請求されます', 'Charged based on the athlete\'s total distance when the campaign closes')}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {KM_RATES.map(v => (
                    <button key={v} onClick={() => { setRate(v); setCustomRate('') }}
                      className="px-4 py-2 rounded-2xl text-sm font-bold transition"
                      style={rate === v && !customRate
                        ? { background: '#1A9966', color: 'white' }
                        : { background: '#f3f4f6', color: '#374151' }}>
                      ¥{v}/km
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">{t('カスタムレート', 'Custom rate')}</p>
                  <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2.5 bg-white">
                    <span className="text-gray-400 mr-2">¥</span>
                    <input type="number" min="1" value={customRate}
                      onChange={e => { setCustomRate(e.target.value); setRate(null) }}
                      placeholder="0"
                      className="flex-1 outline-none text-sm text-gray-900" />
                    <span className="text-gray-400 ml-2">/km</span>
                  </div>
                </div>
                {/* Distance cap + max charge */}
                {maxKm && (
                  <div className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                    </svg>
                    <p className="text-xs text-blue-700">
                      {t(`距離上限 ${maxKm} km`, `Distance cap ${maxKm} km`)}
                      {maxCharge && ` — ${t('最大請求', 'max charge')} ${maxCharge}`}
                    </p>
                  </div>
                )}
                <div className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
                    <rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>
                  </svg>
                  <p className="text-xs text-gray-500">
                    {t('登録したカードはキャンペーン終了後に請求されます', 'Your saved card will be charged when the campaign ends')}
                  </p>
                </div>
              </div>
            )}

            {/* Card input */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500">{t('カード情報', 'Card Details')}</p>
              <div ref={cardRef} className="border border-gray-200 rounded-xl px-4 py-3.5 bg-white" style={{ minHeight: '44px' }} />
              {!stripeReady && <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />}
            </div>

            {/* Anonymous toggle */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-gray-900">{t('匿名で寄付する', 'Donate anonymously')}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('あなたの名前はアスリートに表示されません', 'Your name won\'t be shown to the campaign creator')}</p>
              </div>
              <button onClick={() => setAnonymous(a => !a)}
                className="shrink-0 w-12 h-7 rounded-full transition-all relative"
                style={{ background: anonymous ? '#1A9966' : '#d1d5db' }}>
                <span className="absolute top-1 transition-all rounded-full w-5 h-5 bg-white shadow"
                  style={{ left: anonymous ? '24px' : '4px' }} />
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </p>
            )}

            <button onClick={handleSubmit} disabled={submitting || !stripeReady}
              className="w-full py-4 rounded-2xl text-base font-bold text-white disabled:opacity-50 transition"
              style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
              {submitting ? t('処理中...', 'Processing...') : tab === 'flat' ? t('寄付する', 'Donate') : t('誓約する', 'Pledge')}
            </button>
          </div>
        )}
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
  const [showPostModal, setShowPostModal]   = useState(false)
  const [showThankModal, setShowThankModal] = useState(false)
  const [showDonateModal, setShowDonateModal] = useState(false)

  const load = async () => {
    const [c, u, p, pl] = await Promise.all([
      getCampaign(id, token ?? undefined),
      getCampaignUpdates(id, token ?? undefined).catch(() => []),
      getCampaignParticipants(id, token ?? undefined).catch(() => []),
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

  const donorURL   = `https://donate.charityathletes.org/c/${id}`
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
    alert(t('URLをコピーしました！', 'Donor page URL copied!'))
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }
  if (!campaign) {
    return <div className="text-center py-20 text-gray-400">{t('イベントが見つかりません', 'Campaign not found')}</div>
  }

  // Progress bar: based on ¥ raised vs goal amount (like iOS), capped at 100% for display
  const raisedJpy   = campaign.totalRaisedJpy ?? 0
  const goalJpy     = campaign.goalAmountJpy ?? 0
  const progress    = goalJpy > 0 ? Math.min(100, (raisedJpy / goalJpy) * 100) : 0
  const isGold      = goalJpy > 0 && raisedJpy >= goalJpy
  const isCreator   = me?.id === campaign.createdBy
  const description = t(campaign.descriptionJa, campaign.descriptionEn)

  return (
    <>
      {showThankModal && token && (
        <ThankDonorsModal
          campaignId={id} token={token}
          onClose={() => setShowThankModal(false)}
        />
      )}
      {showDonateModal && me && (
        <DonateModal
          campaign={campaign} campaignId={id} me={me as any}
          onClose={() => setShowDonateModal(false)}
          onSuccess={() => load()}
        />
      )}
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

          {/* Progress bar — gold, based on ¥ raised / ¥ goal */}
          <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: isGold
                  ? 'linear-gradient(90deg, #f5c842, #f5c842)'
                  : 'linear-gradient(90deg, #e6a817, #f5c842)',
              }} />
          </div>

          {/* Raised / Goal */}
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold" style={{ color: '#1A9966' }}>
                ¥{(campaign.totalRaisedJpy ?? 0).toLocaleString()}
              </span>
              <span className="text-sm text-gray-400 ml-1">{t('集まった金額', 'Raised')}</span>
            </div>
            {campaign.goalAmountJpy && (
              <span className="text-sm text-gray-400">
                ¥{campaign.goalAmountJpy.toLocaleString()} {t('目標金額', 'Goal')}
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
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#f0fdf4' }}>
                    <span className="text-sm">⚡</span>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">{t('活動ごとの寄付', 'Flat per activity')}</p>
                </div>
                <span className="text-sm font-bold text-gray-700 shrink-0">{t('金額を選択', 'Choose amount')}</span>
              </div>
            )}
            {campaign.hasPerKmDonation && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-blue-50 shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">
                    {t('距離に応じた寄付 (1kmあたり)', 'Per-km donation rate')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-gray-700">{t('レートを選択', 'Choose rate')}</p>
                  {campaign.maxDistanceKm && (
                    <p className="text-xs text-gray-400">{t('最大', 'max ')}{campaign.maxDistanceKm} km</p>
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
                {joining ? '...' : t('イベントに参加する', 'Join Campaign')}
              </button>
            )
          )
        )}

        {/* ── Donate button ──────────────────────────────────── */}
        <button
          onClick={() => me ? setShowDonateModal(true) : router.push('/login')}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold transition"
          style={{ background: 'linear-gradient(135deg, #054738, #1A9966)', color: 'white' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {t('このイベントに寄付する', 'Donate to This Campaign')}
        </button>

        {/* ── Share on Social Media ──────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <h2 className="font-bold text-gray-900">{t('SNSでシェア', 'Share on Social Media')}</h2>
          <button
            onClick={copyShareCard}
            className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            {t('寄付ページのURLをコピー', 'Copy Donor Page Link')}
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
              {t('報告する', 'Post Update')}
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

        {/* ── Thank Donors — creator only, at bottom like iOS ── */}
        {isCreator && token && (
          <button
            onClick={() => setShowThankModal(true)}
            className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #054738, #1A9966)', color: 'white' }}
          >
            ✉️ {t('寄付者にお礼メッセージを送る', 'Send Thank-You to Donors')}
          </button>
        )}
      </div>
    </>
  )
}
