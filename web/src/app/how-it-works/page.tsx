'use client'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

const steps = [
  {
    num: 1,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13" cy="4" r="1.5" fill="white"/>
        <path d="M14 8l-2 5-4 2 2 5M8 13l4-1 1-4"/>
      </svg>
    ),
    titleJa: 'Stravaを連携する',
    titleEn: 'Connect Strava',
    bodyJa: 'プロフィールからStravaアカウントを連携してください。ライド・ラン・スイムなどのアクティビティが自動で同期されます。',
    bodyEn: 'Connect your Strava account from the Profile tab. Rides, runs, swims and more will sync automatically.',
  },
  {
    num: 2,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
        <line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
    ),
    titleJa: 'イベントを作成・参加する',
    titleEn: 'Create or Join a Campaign',
    bodyJa: 'NPOを選んで自分のイベントを作成するか、他のアスリートが作ったイベントに参加しましょう。距離連動型（1kmごとに寄付）または定額型を選べます。',
    bodyEn: 'Choose an NPO and create your own campaign, or join one by another athlete. Pick per-km pledges or a flat donation type.',
  },
  {
    num: 3,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    ),
    titleJa: '個人リンクをシェアする',
    titleEn: 'Share Your Personal Link',
    bodyJa: 'イベント詳細画面からあなた専用のURLをコピーして友人・家族・SNSにシェアしましょう。寄付者には総走行距離のみが表示され、個別のアクティビティ詳細はあなたにのみ表示されます。',
    bodyEn: 'Copy your personal URL from the campaign page and share it with friends, family, and social media. Donors see only your total distance — activity details stay private.',
  },
  {
    num: 4,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
        <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="white"/>
        <path d="M12 17.5V14l-3-3 4-3 2 3h3"/>
      </svg>
    ),
    titleJa: '走る・漕ぐ・泳ぐ',
    titleEn: 'Run, Ride, Swim',
    bodyJa: 'Stravaでアクティビティを記録するだけ！あなたの距離がリアルタイムで寄付者ページに反映されます。',
    bodyEn: 'Just record activities on Strava! Your distance is reflected on your donor page in real time.',
  },
  {
    num: 5,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    titleJa: '寄付者を確認する',
    titleEn: 'See Your Donors',
    bodyJa: 'イベント詳細画面の「あなたの寄付者」で、あなたのリンクから応援してくれた人を確認できます。匿名希望の寄付者は非表示になります。',
    bodyEn: 'Check the "Your Donors" section in the campaign detail to see everyone who supported you. Anonymous donors are hidden.',
  },
  {
    num: 6,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v2M12 16v2M8.5 8.5l1.5 1.5M14 14l1.5 1.5M6 12h2M16 12h2M8.5 15.5L10 14M14 10l1.5-1.5"/>
        <path d="M12 8c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z"/>
      </svg>
    ),
    titleJa: '寄付が集まる',
    titleEn: 'Donations Come In',
    bodyJa: '定額寄付はすぐに処理されます。距離連動の寄付はイベント終了後に、あなた個人の総走行距離をもとに請求されます。',
    bodyEn: 'Flat donations are processed immediately. Per-km pledges are charged after the campaign ends, based on your total distance.',
  },
]

const hints = [
  {
    ja: '複数のイベントに同時に参加・作成できます。',
    en: 'You can join or create multiple campaigns at the same time.',
  },
  {
    ja: '同じイベントに複数のアスリートが参加でき、それぞれ個別のリンクを持ちます。',
    en: 'Multiple athletes can join the same campaign, each with their own personal link.',
  },
  {
    ja: '非公開イベントはURLを持っている人だけが見られます。',
    en: 'Private campaigns are only visible to people who have the URL.',
  },
  {
    ja: '寄付者ページはブラウザで開けるので、アプリ不要で寄付者が寄付できます。',
    en: 'Donor pages open in any browser — donors don\'t need the app to contribute.',
  },
  {
    ja: 'アプリからも「応援する」ボタンでイベントに寄付できます。',
    en: 'Donors can also contribute via the "Support" button directly in the app.',
  },
]

export default function HowItWorksPage() {
  const { t } = useLang()
  const router = useRouter()

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-12">
      {/* Back button */}
      <button onClick={() => router.back()}
        className="w-9 h-9 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm mb-5">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round">
          <path d="M10 3L5 8l5 5"/>
        </svg>
      </button>

      {/* Hero */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13" cy="4" r="1.5" fill="white"/>
            <path d="M14 8l-2 5-4 2 2 5M8 13l4-1 1-4"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('チャリアスの使い方', 'How It Works')}</h1>
        <p className="text-gray-400 text-sm mt-2">{t('あなたの運動が、寄付に変わります。', 'Turn your workouts into donations.')}</p>
      </div>

      {/* Steps */}
      <div className="space-y-3 mb-6">
        {steps.map(step => (
          <div key={step.num} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4">
            <div className="shrink-0">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
                <span className="text-white font-bold text-sm">{step.num}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
                  {step.icon}
                </div>
                <p className="font-bold text-gray-900 text-sm">{t(step.titleJa, step.titleEn)}</p>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{t(step.bodyJa, step.bodyEn)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Hints section */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A9966" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <h2 className="font-bold text-gray-900">{t('ヒント', 'Tips')}</h2>
        </div>
        <ul className="space-y-2.5">
          {hints.map((h, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1A9966' }} />
              <p className="text-sm text-gray-600 leading-relaxed">{t(h.ja, h.en)}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 mt-6">
        {t('ご不明な点は ', 'Questions? Visit ')}
        <a href="https://charityathletes.org" target="_blank" rel="noopener noreferrer"
          className="font-semibold" style={{ color: '#1A9966' }}>
          charityathletes.org
        </a>
      </p>
    </div>
  )
}
