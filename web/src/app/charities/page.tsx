'use client'
import { useEffect, useState } from 'react'
import { getCharities } from '@/lib/api'
import type { Nonprofit } from '@/lib/types'
import { useLang } from '@/lib/lang-context'

export default function CharitiesPage() {
  const { t } = useLang()
  const [charities, setCharities] = useState<Nonprofit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCharities().then(setCharities).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('チャリティ団体', 'Charities')}</h1>

      {charities.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('団体が見つかりませんでした', 'No charities found')}</p>
      ) : (
        <div className="space-y-3">
          {charities.map(c => (
            <div key={c.id} className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-4">
              {c.logoUrl ? (
                <img src={c.logoUrl} alt={c.nameEn} className="w-14 h-14 rounded-xl object-contain border border-gray-100 shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
                  🏢
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">{t(c.nameJa, c.nameEn)}</p>
                {(c.descriptionJa || c.descriptionEn) && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {t(c.descriptionJa ?? '', c.descriptionEn ?? '')}
                  </p>
                )}
                {c.websiteUrl && (
                  <a
                    href={c.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold mt-1 inline-block"
                    style={{ color: '#1A9966' }}
                  >
                    {t('ウェブサイト →', 'Website →')}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
