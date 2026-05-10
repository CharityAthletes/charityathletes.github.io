'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLang } from '@/lib/lang-context'

const tabs = [
  {
    href: '/',
    ja: 'ホーム', en: 'Home',
    match: (p: string) => p === '/',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/campaigns',
    ja: 'イベント', en: 'Campaigns',
    match: (p: string) => p.startsWith('/campaigns'),
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    ),
  },
  {
    href: '/activities',
    ja: 'アクティビティ', en: 'Activities',
    match: (p: string) => p.startsWith('/activities'),
    icon: (_active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
        <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor"/>
        <path d="M12 17.5V14l-3-3 4-3 2 3h3"/>
      </svg>
    ),
  },
  {
    href: '/charities',
    ja: '団体一覧', en: 'Charities',
    match: (p: string) => p.startsWith('/charities'),
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    ),
  },
  {
    href: '/profile',
    ja: 'プロフィール', en: 'Profile',
    match: (p: string) => p.startsWith('/profile'),
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
]

export default function TabBar() {
  const pathname = usePathname()
  const { t } = useLang()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-lg mx-auto flex items-stretch">
        {tabs.map(tab => {
          const active = tab.match(pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative"
              style={{ color: active ? '#1A9966' : '#9ca3af' }}
            >
              {/* Active pill background */}
              {active && (
                <span className="absolute inset-x-2 top-1 bottom-1 rounded-2xl opacity-10"
                  style={{ background: '#1A9966' }} />
              )}
              <span className="relative z-10">{tab.icon(active)}</span>
              <span className="relative z-10 text-[10px] font-medium leading-tight">
                {t(tab.ja, tab.en)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
