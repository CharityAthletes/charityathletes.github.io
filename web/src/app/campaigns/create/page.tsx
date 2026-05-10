'use client'
import { useEffect, useState } from 'react'
import { getNonprofits, createCampaign } from '@/lib/api'
import type { Nonprofit } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

export default function CreateCampaignPage() {
  const { token } = useAuth()
  const { t } = useLang()
  const router = useRouter()
  const [nonprofits, setNonprofits] = useState<Nonprofit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    titleJa: '', titleEn: '',
    descriptionJa: '', descriptionEn: '',
    goalKm: '', goalAmountJpy: '',
    startDate: '', endDate: '',
    nonprofitId: '',
    // Donation types
    hasFlatDonation: false,
    hasPerKmDonation: false,
    maxDistanceKm: '',
  })

  useEffect(() => {
    getNonprofits(token ?? undefined).then(setNonprofits).catch(console.error)
  }, [token])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))
  const setCheck = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.checked }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (!form.hasFlatDonation && !form.hasPerKmDonation) {
      setError(t('寄付タイプを最低1つ選択してください', 'Select at least one donation type'))
      return
    }
    setLoading(true); setError('')
    try {
      const campaign = await createCampaign({
        title_ja: form.titleJa, title_en: form.titleEn,
        description_ja: form.descriptionJa, description_en: form.descriptionEn,
        goal_km: form.goalKm ? Number(form.goalKm) : undefined,
        goal_amount_jpy: form.goalAmountJpy ? Number(form.goalAmountJpy) : undefined,
        start_date: form.startDate, end_date: form.endDate,
        nonprofit_id: form.nonprofitId,
        has_flat_donation: form.hasFlatDonation,
        has_per_km_donation: form.hasPerKmDonation,
        max_distance_km: form.maxDistanceKm ? Number(form.maxDistanceKm) : undefined,
      }, token)
      router.push(`/campaigns/${campaign.id}`)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-12">
      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1 text-sm font-semibold mb-5" style={{ color: '#1A9966' }}>
        <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M7 1L1 7l6 6"/>
        </svg>
        {t('戻る', 'Back')}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('イベントを作成', 'Create Campaign')}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Title */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('タイトル', 'Title')}</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">日本語</label>
            <input type="text" value={form.titleJa} onChange={set('titleJa')} required
              placeholder="例：みらいの森チャリティライド"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">English</label>
            <input type="text" value={form.titleEn} onChange={set('titleEn')} required
              placeholder="e.g. Miraino Mori Charity Ride"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('説明', 'Description')}</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">日本語</label>
            <textarea value={form.descriptionJa} onChange={set('descriptionJa')} rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200 resize-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">English</label>
            <textarea value={form.descriptionEn} onChange={set('descriptionEn')} rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200 resize-none" />
          </div>
        </div>

        {/* Dates */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('期間', 'Period')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('開始日', 'Start Date')}</label>
              <input type="date" value={form.startDate} onChange={set('startDate')} required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('終了日', 'End Date')}</label>
              <input type="date" value={form.endDate} onChange={set('endDate')} required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
            </div>
          </div>
        </div>

        {/* Donation types */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('寄付タイプ', 'Donation Types')}</p>

          {/* Flat */}
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5">
              <input type="checkbox" checked={form.hasFlatDonation} onChange={setCheck('hasFlatDonation')} className="sr-only" />
              <div className="w-5 h-5 rounded flex items-center justify-center border-2 transition"
                style={{ borderColor: form.hasFlatDonation ? '#1A9966' : '#d1d5db', background: form.hasFlatDonation ? '#1A9966' : 'white' }}>
                {form.hasFlatDonation && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{t('活動ごとの寄付', 'Per-activity donation')}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('寄付者が定額を設定します', 'Donors set a flat amount per activity')}</p>
            </div>
          </label>

          {/* Per-km */}
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5">
              <input type="checkbox" checked={form.hasPerKmDonation} onChange={setCheck('hasPerKmDonation')} className="sr-only" />
              <div className="w-5 h-5 rounded flex items-center justify-center border-2 transition"
                style={{ borderColor: form.hasPerKmDonation ? '#1A9966' : '#d1d5db', background: form.hasPerKmDonation ? '#1A9966' : 'white' }}>
                {form.hasPerKmDonation && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">{t('距離に応じた寄付', 'Per-km donation')}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('寄付者が1kmあたりのレートを設定します', 'Donors set a rate per km')}</p>
              {form.hasPerKmDonation && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">{t('最大距離 (km) — 任意', 'Max distance cap (km) — optional')}</label>
                  <input type="number" min="1" value={form.maxDistanceKm} onChange={set('maxDistanceKm')}
                    placeholder="例: 100"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
                </div>
              )}
            </div>
          </label>
        </div>

        {/* Goals */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('目標', 'Goals')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('目標金額 (¥)', 'Goal Amount (¥)')}</label>
              <input type="number" min="1" value={form.goalAmountJpy} onChange={set('goalAmountJpy')}
                placeholder="例: 100000"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('目標距離 (km)', 'Goal Distance (km)')}</label>
              <input type="number" min="1" value={form.goalKm} onChange={set('goalKm')}
                placeholder="例: 500"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
            </div>
          </div>
        </div>

        {/* Nonprofit */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('支援先団体', 'Supported NPO')}</p>
          <select value={form.nonprofitId} onChange={set('nonprofitId')} required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-200">
            <option value="">{t('選択してください', 'Select an NPO')}</option>
            {nonprofits.map(n => (
              <option key={n.id} value={n.id}>{n.nameJa} / {n.nameEn}</option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-50 transition"
          style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
          {loading ? t('作成中...', 'Creating...') : t('イベントを作成', 'Create Campaign')}
        </button>
      </form>
    </div>
  )
}
