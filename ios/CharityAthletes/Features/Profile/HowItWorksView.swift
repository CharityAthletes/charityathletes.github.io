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
                        body: i18n.language == .ja
                            ? "プロフィールからStravaアカウントを連携してください。ライド・ラン・スイムなどのアクティビティが自動で同期されます。"
                            : "Link your Strava account from the Profile tab. Your rides, runs, swims and more will sync automatically."
                    )
                    StepCard(
                        number: 2,
                        icon: "flag.fill",
                        title: i18n.language == .ja ? "キャンペーンを作成する" : "Create a Campaign",
                        body: i18n.language == .ja
                            ? "支援したいNPOを選び、キャンペーンを作成します。距離連動型（1kmごとに寄付）または定額型を選べます。"
                            : "Choose a charity and create a campaign. Set it up as per-km (donors give per km you cover) or flat donation."
                    )
                    StepCard(
                        number: 3,
                        icon: "square.and.arrow.up",
                        title: i18n.language == .ja ? "ドナーページをシェアする" : "Share Your Donor Page",
                        body: i18n.language == .ja
                            ? "キャンペーン詳細画面から専用URLをコピーして、SNSや友人・家族にシェアしましょう。"
                            : "Copy your campaign link from the campaign detail screen and share it on social media or with friends and family."
                    )
                    StepCard(
                        number: 4,
                        icon: "bicycle",
                        title: i18n.language == .ja ? "走る・漕ぐ・泳ぐ" : "Run, Ride, or Swim",
                        body: i18n.language == .ja
                            ? "Stravaでアクティビティを記録するだけ！距離が自動的にドナーページに反映されます。"
                            : "Just record your activity on Strava. Your distance updates automatically on the donor page."
                    )
                    StepCard(
                        number: 5,
                        icon: "yensign.circle.fill",
                        title: i18n.language == .ja ? "寄付が集まる" : "Donations Roll In",
                        body: i18n.language == .ja
                            ? "定額寄付はすぐに処理されます。距離連動の寄付はキャンペーン終了後に、あなたの総走行距離をもとに請求されます。"
                            : "Flat donations are charged immediately. Per-km pledges are charged at campaign end based on your total distance."
                    )
                }

                // Tips box
                VStack(alignment: .leading, spacing: 10) {
                    Label(i18n.language == .ja ? "ヒント" : "Tips",
                          systemImage: "lightbulb.fill")
                        .font(.subheadline.bold())
                        .foregroundStyle(Color("BrandOrange"))

                    tipRow(i18n.language == .ja
                           ? "キャンペーンは複数作成できます。"
                           : "You can run multiple campaigns at once.")
                    tipRow(i18n.language == .ja
                           ? "非公開キャンペーンはURLを持っている人だけが見られます。"
                           : "Private campaigns are only visible to people with the link.")
                    tipRow(i18n.language == .ja
                           ? "ドナーページはブラウザで開けるので、アプリ不要でドナーが寄付できます。"
                           : "Donors give through a web page — no app needed.")
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
    let body: String

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
                Text(body)
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
