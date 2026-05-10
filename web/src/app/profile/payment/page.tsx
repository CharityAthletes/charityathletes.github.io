'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

declare global { interface Window { Stripe: any } }

export default function PaymentMethodPage() {
  const { token, loading: authLoading } = useAuth()
  const { t } = useLang()
  const router = useRouter()

  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [clientSecret, setClientSecret] = useState('')

  const stripeRef = useRef<any>(null)
  const elementsRef = useRef<any>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Load Stripe.js and setup intent on mount
  useEffect(() => {
    if (authLoading || !token) return

    const init = async () => {
      // Load Stripe.js if not already loaded
      if (!window.Stripe) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://js.stripe.com/v3/'
          s.onload = () => resolve()
          s.onerror = () => reject(new Error('Stripe.js load failed'))
          document.head.appendChild(s)
        })
      }

      // Get SetupIntent client secret
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/donations/setup-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Setup failed')
      setClientSecret(data.clientSecret)

      // Mount card element
      const stripe = window.Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
      stripeRef.current = stripe
      const elements = stripe.elements()
      elementsRef.current = elements
      const card = elements.create('card', {
        style: {
          base: { fontSize: '16px', color: '#1d1d1f', fontFamily: '-apple-system, sans-serif', '::placeholder': { color: '#9ca3af' } },
          invalid: { color: '#dc2626' },
        },
      })
      card.mount(cardRef.current!)
      setReady(true)
    }

    init().catch(e => setError(e.message))
  }, [token, authLoading])

  const handleSave = async () => {
    if (!stripeRef.current || !elementsRef.current || !clientSecret) return
    setSaving(true); setError('')
    try {
      const { setupIntent, error: stripeErr } = await stripeRef.current.confirmCardSetup(
        clientSecret,
        { payment_method: { card: elementsRef.current.getElement('card') } }
      )
      if (stripeErr) throw new Error(stripeErr.message)

      // Confirm with backend
      const r = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/donations/confirm-setup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method_id: setupIntent.payment_method }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Save failed')

      setSuccess(true)
      setTimeout(() => router.push('/profile'), 1500)
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  if (authLoading) return null

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      {/* Back button */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1 text-sm font-semibold mb-5" style={{ color: '#1A9966' }}>
        <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M7 1L1 7l6 6"/>
        </svg>
        {t('戻る', 'Back')}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('お支払い方法', 'Payment Method')}</h1>

      {success ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1A9966" strokeWidth="2.5" strokeLinecap="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <p className="font-bold text-gray-900">{t('カードを保存しました', 'Card saved!')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('プロフィールに戻ります...', 'Returning to profile...')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
          <p className="text-sm text-gray-500">
            {t('クレジットカードまたはデビットカードを登録してください。距離に応じた寄付の決済に使用します。',
               'Add a credit or debit card. It will be used for per-km pledge charges at campaign end.')}
          </p>

          {/* Stripe Card Element */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('カード情報', 'Card Details')}
            </label>
            <div
              ref={cardRef}
              className="border border-gray-200 rounded-xl px-4 py-3.5 bg-white"
              style={{ minHeight: '44px' }}
            />
            {!ready && (
              <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={!ready || saving}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50 transition"
            style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}
          >
            {saving
              ? t('保存中...', 'Saving...')
              : t('カードを保存', 'Save Card')}
          </button>

          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            {t('Stripeにより安全に処理されます', 'Secured by Stripe')}
          </div>
        </div>
      )}
    </div>
  )
}
