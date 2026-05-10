'use client'
import { useLang } from '@/lib/lang-context'
import { useRouter } from 'next/navigation'

const steps = [
  {
    num: 1,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    ),
    titleJa: '個人リンクをシェアする',
    titleEn: 'Share Your Link',
    bodyJa: 'イベント詳細画面からあなた専用のURLをコピーして友人・家族・SNSにシェアしましょう。寄付者には総走行距離のみが表示され、個別のアクティビティ詳細はあなたにのみ表示されます。',
    bodyEn: 'Copy your personal URL from the campaign page and share it with friends, family, and on social media. Donors see only your total distance — individual activity details stay private.',
  },
  {
    num: 4,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 12 20 22 4 22 4 12"/>
        <rect x="2" y="7" width="20" height="5"/>
        <line x1="12" y1="22" x2="12" y2="7"/>
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
      </svg>
    ),
    titleJa: '寄付を受け取る',
    titleEn: 'Receive Donations',
    bodyJa: 'あなたが走るほど、寄付額が増えます。距離連動型の寄付者はキャンペーン終了後に請求されます。定額型は即時に処理されます。',
    bodyEn: 'The more you move, the more you raise. Per-km donors are charged after the campaign ends. Flat donations are processed immediately.',
  },
]

export default function HowItWorksPage() {
  const { t } = useLang()
  const router = useRouter()

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13" cy="4" r="1.5" fill="white"/>
            <path d="M14 8l-2 5-4 2 2 5M8 13l4-1 1-4"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('チャリアスの使い方', 'How It Works')}</h1>
        <p className="text-gray-400 text-sm mt-2">{t('あなたの運動が、寄付に変わります。', 'Turn your workouts into donations.')}</p>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map(step => (
          <div key={step.num} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4">
            {/* Number + icon */}
            <div className="shrink-0 flex flex-col items-center gap-1">
              <div className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #054738, #1A9966)' }}>
                <span className="text-white font-bold text-sm">{step.num}</span>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1">
              <p className="font-bold text-gray-900 mb-1">{t(step.titleJa, step.titleEn)}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{t(step.bodyJa, step.bodyEn)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-gray-400 mt-6">
        {t('ご不明な点は ', 'Questions? ')}
        <a href="https://charityathletes.org" target="_blank" rel="noopener noreferrer"
          className="font-semibold" style={{ color: '#1A9966' }}>
          charityathletes.org
        </a>
        {t('をご覧ください。', '')}
      </p>
    </div>
  )
}
