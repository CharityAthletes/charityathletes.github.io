import SwiftUI

struct HowItWorksView: View {
    @EnvironmentObject var i18n: I18n

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {

                // Hero
                VStack(spacing: 10) {
                    Image(systemName: "figure.run.circle.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(Color("BrandOrange"))
                    Text(i18n.language == .ja
                         ? "チャリアスの使い方"
                         : "How Charity Athletes Works")
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    Text(i18n.language == .ja
                         ? "あなたの運動が、寄付に変わります。"
                         : "Your workouts raise money for charity.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 8)

                // Steps
                VStack(spacing: 16) {
                    StepCard(
                        number: 1,
                        icon: "figure.run",
                        title: i18n.language == .ja ? "Stravaを連携する" : "Connect Strava",
                        description: i18n.language == .ja
                            ? "プロフィールからStravaアカウントを連携してください。ライド・ラン・スイムなどのアクティビティが自動で同期されます。"
                            : "Link your Strava account from the Profile tab. Your rides, runs, swims and more will sync automatically."
                    )
                    StepCard(
                        number: 2,
                        icon: "flag.fill",
                        title: i18n.language == .ja ? "キャンペーンを作成・参加する" : "Create or Join a Campaign",
                        description: i18n.language == .ja
                            ? "NPOを選んで自分のキャンペーンを作成するか、他のアスリートが作ったキャンペーンに参加しましょう。距離連動型（1kmごとに寄付）または定額型を選べます。"
                            : "Create your own campaign for a charity, or join a campaign started by another athlete. Choose per-km (donors give per km you cover) or flat donation — or both."
                    )
                    StepCard(
                        number: 3,
                        icon: "square.and.arrow.up",
                        title: i18n.language == .ja ? "個人リンクをシェアする" : "Share Your Personal Link",
                        description: i18n.language == .ja
                            ? "キャンペーン詳細画面からあなた専用のURLをコピーして友人・家族・SNSにシェアしましょう。そのリンクからの寄付はあなたの活動に紐づきます。"
                            : "Copy your personal campaign link from the campaign detail screen. Donors who open your link will see your activities and pledge based on your distance."
                    )
                    StepCard(
                        number: 4,
                        icon: "bicycle",
                        title: i18n.language == .ja ? "走る・漕ぐ・泳ぐ" : "Run, Ride, or Swim",
                        description: i18n.language == .ja
                            ? "Stravaでアクティビティを記録するだけ！あなたの距離がリアルタイムで寄付者ページに反映されます。"
                            : "Just record your activity on Strava. Your distance updates automatically on your personal donor page in real time."
                    )
                    StepCard(
                        number: 5,
                        icon: "person.2.fill",
                        title: i18n.language == .ja ? "寄付者を確認する" : "See Your Donors",
                        description: i18n.language == .ja
                            ? "キャンペーン詳細画面の「あなたの寄付者」で、あなたのリンクから応援してくれた人を確認できます。匿名希望の寄付者は非表示になります。"
                            : "View supporters who pledged through your personal link in the \"Your Donors\" section on the campaign detail screen. Anonymous donors will show as Anonymous."
                    )
                    StepCard(
                        number: 6,
                        icon: "yensign.circle.fill",
                        title: i18n.language == .ja ? "寄付が集まる" : "Donations Roll In",
                        description: i18n.language == .ja
                            ? "定額寄付はすぐに処理されます。距離連動の寄付はキャンペーン終了後に、あなた個人の総走行距離をもとに請求されます。"
                            : "Flat donations are charged immediately. Per-km pledges are charged at campaign end based on your individual total distance — not the combined campaign total."
                    )
                }

                // Tips box
                VStack(alignment: .leading, spacing: 10) {
                    Label(i18n.language == .ja ? "ヒント" : "Tips",
                          systemImage: "lightbulb.fill")
                        .font(.subheadline.bold())
                        .foregroundStyle(Color("BrandOrange"))

                    tipRow(i18n.language == .ja
                           ? "複数のキャンペーンに同時に参加・作成できます。"
                           : "You can create or join multiple campaigns at the same time.")
                    tipRow(i18n.language == .ja
                           ? "同じキャンペーンに複数のアスリートが参加でき、それぞれ個別のリンクを持ちます。"
                           : "Multiple athletes can join the same campaign, each with their own personal link and donor list.")
                    tipRow(i18n.language == .ja
                           ? "非公開キャンペーンはURLを持っている人だけが見られます。"
                           : "Private campaigns are only visible to people with the link.")
                    tipRow(i18n.language == .ja
                           ? "寄付者ページはブラウザで開けるので、アプリ不要で寄付者が寄付できます。"
                           : "Donors give through a web page — no app needed.")
                    tipRow(i18n.language == .ja
                           ? "アプリからも「応援する」ボタンでキャンペーンに寄付できます。"
                           : "Athletes can also donate to campaigns directly in the app using the Support button.")
                }
                .padding()
                .background(Color("BrandOrange").opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 14))

            }
            .padding()
        }
        .navigationTitle(i18n.language == .ja ? "使い方" : "How It Works")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func tipRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•").foregroundStyle(Color("BrandOrange"))
            Text(text).font(.subheadline).foregroundStyle(.secondary)
        }
    }
}

// MARK: - Step Card

private struct StepCard: View {
    let number: Int
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color("BrandOrange"))
                    .frame(width: 40, height: 40)
                Text("\(number)")
                    .font(.headline.bold())
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 4) {
                Label(title, systemImage: icon)
                    .font(.subheadline.bold())
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
