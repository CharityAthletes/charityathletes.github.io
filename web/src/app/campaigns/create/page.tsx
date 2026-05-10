'use client'
import { useEffect, useState } from 'react'
import { getNonprofits, createCampaign } from '@/lib/api'
import type { Nonprofit } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

export default function CreateCampaignPage() {
  const { token, authLoading } = useAuth() as any
  const router = useRouter()
  const [nonprofits, setNonprofits] = useState<Nonprofit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    titleJa: '', titleEn: '',
    descriptionJa: '', descriptionEn: '',
    goalKm: '',
    startDate: '', endDate: '',
    nonprofitId: '',
  })

  useEffect(() => {
    getNonprofits(token ?? undefined).then(setNonprofits).catch(console.error)
  }, [token])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setLoading(true); setError('')
    try {
      const campaign = await createCampaign({
        ...form,
        goal_km: Number(form.goalKm),
        title_ja: form.titleJa, title_en: form.titleEn,
        description_ja: form.descriptionJa, description_en: form.descriptionEn,
        start_date: form.startDate, end_date: form.endDate,
        nonprofit_id: form.nonprofitId,
      }, token)
      router.push(`/campaigns/${campaign.id}`)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const field = (label: string, key: string, type = 'text', opts?: object) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={(form as any)[key]}
        onChange={set(key)}
        required
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        {...opts}
      />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">キャンペーンを作成</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
        {field('タイトル（日本語）', 'titleJa')}
        {field('Title (English)', 'titleEn')}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">説明（日本語）</label>
          <textarea
            value={form.descriptionJa}
            onChange={set('descriptionJa')}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (English)</label>
          <textarea
            value={form.descriptionEn}
            onChange={set('descriptionEn')}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
          />
        </div>

        {field('目標距離 (km)', 'goalKm', 'number', { min: 1 })}

        <div className="grid grid-cols-2 gap-3">
          {field('開始日', 'startDate', 'date')}
          {field('終了日', 'endDate', 'date')}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">支援先団体</label>
          <select
            value={form.nonprofitId}
            onChange={set('nonprofitId')}
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            <option value="">選択してください</option>
            {nonprofits.map(n => (
              <option key={n.id} value={n.id}>{n.nameJa}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? '作成中...' : 'キャンペーンを作成'}
        </button>
      </form>
    </div>
  )
}
