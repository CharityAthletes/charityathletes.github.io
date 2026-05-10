'use client'
import { useEffect, useState, useCallback } from 'react'
import { getCharities } from '@/lib/api'
import type { Charity } from '@/lib/types'
import { useLang } from '@/lib/lang-context'

const CATEGORIES = [
  { key: '', ja: 'すべて', en: 'All' },
  { key: 'health', ja: 'ヘルス', en: 'Health' },
  { key: 'education', ja: '教育', en: 'Education' },
  { key: 'environment', ja: '環境', en: 'Environment' },
  { key: 'community', ja: 'コミュニティ', en: 'Community' },
  { key: 'children', ja: '子ども', en: 'Children' },
  { key: 'disaster_relief', ja: '災害支援', en: 'Disaster Relief' },
  { key: 'animal_welfare', ja: '動物', en: 'Animals' },
  { key: 'other', ja: 'その他', en: 'Other' },
]

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626','#0284c7']
function avatarColor(id: string) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function CharitiesPage() {
  const { t } = useLang()
  const [all, setAll]           = useState<Charity[]>([])
  const [filtered, setFiltered] = useState<Charity[]>([])
  const [query, setQuery]       = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    getCharities().then(c => { setAll(c); setFiltered(c) }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // Client-side filter (instant, no extra requests)
  useEffect(() => {
    const q = query.toLowerCase()
    setFiltered(all.filter(c => {
      const matchQ = !q || (c.nameEn + c.nameJa + (c.descriptionEn ?? '') + (c.category ?? '')).toLowerCase().includes(q)
      const matchCat = !category || c.category === category
      return matchQ && matchCat
    }))
  }, [query, category, all])

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4">
      {/* Header */}
      <h1 className="text-3xl font-bold text-gray-900 mb-4">{t('チャリティ一覧', 'Charity Directory')}</h1>

      {/* Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('チャリティを検索...', 'Search charities...')}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-200"
        />
      </div>

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition"
            style={category === cat.key
              ? { background: '#1A9966', color: 'white' }
              : { background: 'white', color: '#374151', border: '1px solid #e5e7eb' }}
          >
            {t(cat.ja, cat.en)}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="text-sm text-gray-400 mb-3">{filtered.length} {t('団体', 'organizations')}</p>

      {/* List */}
      <div className="space-y-4">
        {filtered.map(c => {
          const catLabel = CATEGORIES.find(k => k.key === c.category)
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center gap-3 mb-2">
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt={c.nameEn} className="w-12 h-12 rounded-full object-contain border border-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ background: avatarColor(c.id) }}>
                    {initials(c.nameEn)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{t(c.nameJa, c.nameEn)}</span>
                    {c.isFeatured && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ background: '#1A9966' }}>
                        {t('注目', 'Featured')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{t(c.nameJa, c.nameEn) === c.nameEn ? c.nameJa : c.nameEn}</p>
                </div>
              </div>

              {(c.descriptionEn || c.descriptionJa) && (
                <p className="text-sm text-gray-600 leading-relaxed mb-3">
                  {t(c.descriptionJa ?? '', c.descriptionEn ?? '')}
                </p>
              )}

              <div className="flex items-center justify-between">
                {catLabel && (
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-full border border-gray-200 text-gray-500">
                    {t(catLabel.ja, catLabel.en)}
                  </span>
                )}
                <div className="flex items-center gap-3 ml-auto">
                  {c.websiteUrl && (
                    <a href={c.websiteUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-semibold" style={{ color: '#1A9966' }}>
                      {t('ウェブサイト', 'Website')}
                    </a>
                  )}
                  {c.donorboxCampaignId && (
                    <a href={`https://donorbox.org/${c.donorboxCampaignId}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold flex items-center gap-1" style={{ color: '#1A9966' }}>
                      {t('寄付する', 'Donate')} ❤️
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
