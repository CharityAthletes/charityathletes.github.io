'use client'
import { createContext, useContext, useState, useEffect } from 'react'

type Lang = 'ja' | 'en'

interface LangContextValue {
  lang: Lang
  toggle: () => void
  t: (ja: string, en: string) => string
}

const LangContext = createContext<LangContextValue>({
  lang: 'ja',
  toggle: () => {},
  t: (ja) => ja,
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('ja')

  useEffect(() => {
    const stored = localStorage.getItem('lang') as Lang | null
    if (stored === 'en' || stored === 'ja') setLang(stored)
  }, [])

  const toggle = () => {
    setLang(l => {
      const next = l === 'ja' ? 'en' : 'ja'
      localStorage.setItem('lang', next)
      return next
    })
  }

  const t = (ja: string, en: string) => lang === 'ja' ? ja : en

  return <LangContext.Provider value={{ lang, toggle, t }}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)
