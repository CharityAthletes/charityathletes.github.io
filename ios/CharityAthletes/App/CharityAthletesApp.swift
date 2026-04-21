import SwiftUI
import UIKit
import UserNotifications

// Renders two SF Symbols side-by-side into a single UIImage for use in tab bar
private func activitiesTabIcon() -> UIImage {
    let config = UIImage.SymbolConfiguration(pointSize: 17, weight: .medium)
    let bike   = UIImage(systemName: "bicycle",    withConfiguration: config)!.withRenderingMode(.alwaysTemplate)
    let runner = UIImage(systemName: "figure.run", withConfiguration: config)!.withRenderingMode(.alwaysTemplate)

    let gap: CGFloat = 1
    let totalWidth  = bike.size.width + gap + runner.size.width
    let totalHeight = max(bike.size.height, runner.size.height)

    let renderer = UIGraphicsImageRenderer(size: CGSize(width: totalWidth, height: totalHeight))
    let combined = renderer.image { ctx in
        let tint = UIColor.label   // adapts to light/dark mode
        tint.setFill()

        // Draw bicycle left, runner right
        let bikeY   = (totalHeight - bike.size.height)   / 2
        let runnerX = bike.size.width + gap
        let runnerY = (totalHeight - runner.size.height) / 2

        bike.draw(at: CGPoint(x: 0, y: bikeY))
        runner.draw(at: CGPoint(x: runnerX, y: runnerY))
    }
    return combined.withRenderingMode(.alwaysTemplate)
}

// MARK: - AppDelegate (push notification token handling)

final class AppDelegate: NSObject, UIApplicationDelegate {
    /// Hex-encoded APNS device token stored in UserDefaults so it survives app restarts.
    static let tokenKey = "apns_device_token"

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(hex, forKey: AppDelegate.tokenKey)
        Task {
            do {
                try await APIClient.shared.registerDeviceToken(hex)
                print("[Push] Device token registered:", hex.prefix(16), "…")
            } catch {
                print("[Push] Failed to register token:", error)
            }
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[Push] Registration failed:", error)
    }
}

@main
struct CharityAthletesApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var auth = AuthManager()
    @StateObject private var i18n = I18n.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(i18n)
                .onOpenURL { DeepLinkRouter.handle($0, auth: auth) }
                .task { auth.listenToAuthChanges() }
                .onAppear { print("[Config] Backend URL:", AppConfig.backendURL) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await auth.refreshMe() }
            }
        }
    }
}

// MARK: - Root — role-based routing

struct RootView: View {
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        Group {
            switch auth.state {
            case .initializing:
                SplashView()

            case .signedOut:
                OnboardingView()

            case .signedIn:
                signedInView
            }
        }
        .animation(.easeInOut(duration: 0.3), value: auth.state)
    }

    @ViewBuilder
    private var signedInView: some View {
        switch auth.role {
        case .admin:
            AdminTabView()

        case .nonprofit:
            switch auth.nonprofitStatus {
            case .approved:   NonprofitTabView()
            case .rejected:   NonprofitRejectedView()
            default:          NonprofitPendingView()   // nil or .pending
            }

        case .athlete:
            AthleteTabView()
        }
    }
}

// MARK: - Splash

struct SplashView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.05, green: 0.15, blue: 0.35),
                         Color(red: 0.02, green: 0.28, blue: 0.22)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 20) {
                if let uiImg = UIImage(named: "AppLogo") {
                    Image(uiImage: uiImg)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 160, height: 160)
                        .clipShape(RoundedRectangle(cornerRadius: 36, style: .continuous))
                        .shadow(color: .black.opacity(0.4), radius: 20, x: 0, y: 8)
                }

                Text("チャリアス")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.white)

                Text("Charity Athletes")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
    }
}

// MARK: - Athlete tab bar

struct AthleteTabView: View {
    @EnvironmentObject var i18n: I18n
    @AppStorage("hasSeenWalkthrough") private var hasSeenWalkthrough = false

    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label(i18n.t(.tabDashboard), systemImage: "house.fill") }
            CampaignListView()
                .tabItem { Label(i18n.t(.tabCampaigns), systemImage: "heart.fill") }
            ActivityListView()
                .tabItem {
                    Label {
                        Text(i18n.t(.tabActivities))
                    } icon: {
                        Image(uiImage: activitiesTabIcon())
                    }
                }
            CharityDirectoryView()
                .tabItem { Label(i18n.t(.tabCharities), systemImage: "heart.circle.fill") }
            ProfileView()
                .tabItem { Label(i18n.t(.tabProfile), systemImage: "person.fill") }
        }
        .tint(Color("BrandOrange"))
        .fullScreenCover(isPresented: Binding(
            get: { !hasSeenWalkthrough },
            set: { _ in }
        )) {
            WalkthroughView { hasSeenWalkthrough = true }
                .environmentObject(i18n)
        }
        .task { await requestPushPermission() }
    }

    private func requestPushPermission() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            // First time — ask the user.
            do {
                let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
                if granted {
                    await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
                }
            } catch {
                print("[Push] Permission request error:", error)
            }
        case .authorized, .provisional, .ephemeral:
            // Already authorised on a previous launch — refresh the token so the
            // backend always has an up-to-date record.
            await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
        default:
            break // denied — respect the user's choice
        }
    }
}

// MARK: - Onboarding Walkthrough (#8)

struct WalkthroughView: View {
    let onDone: () -> Void
    @EnvironmentObject var i18n: I18n
    @State private var page = 0

    private struct Step {
        let icon: String
        let color: Color
        let titleJa: String
        let titleEn: String
        let bodyJa: String
        let bodyEn: String
    }

    private let steps: [Step] = [
        Step(icon: "figure.run.circle.fill",
             color: Color("BrandOrange"),
             titleJa: "スポーツで寄付を集める",
             titleEn: "Turn Sport into Donations",
             bodyJa: "ランニング・サイクリング・水泳など、あなたの活動が自動的にチャリティへの寄付に変わります。StravaがすべてのKmを追跡します。",
             bodyEn: "Every km you run, ride or swim automatically raises money for charity. Strava tracks every move — you just train."),
        Step(icon: "heart.circle.fill",
             color: Color("BrandRed"),
             titleJa: "イベントを作って\nシェアしよう",
             titleEn: "Create a Campaign\n& Share It",
             bodyJa: "非営利団体を選んでイベントを作成。リンクをSNSでシェアすれば、支援者が距離連動または定額で寄付できます。",
             bodyEn: "Pick a nonprofit, create a campaign, and share your link. Donors can pledge a flat amount or per km you cover."),
        Step(icon: "yensign.circle.fill",
             color: Color(red: 0.1, green: 0.6, blue: 0.4),
             titleJa: "安心・安全な決済",
             titleEn: "Secure, Zero-Fee Payments",
             bodyJa: "定額寄付はすぐに決済。距離連動はイベント終了後にStripeで自動請求。チャリアスは手数料ゼロです。",
             bodyEn: "Flat donations charge instantly. Per-km pledges are auto-charged at campaign end via Stripe. CharityAthletes takes zero platform fees."),
    ]

    var body: some View {
        ZStack {
            Color.black.opacity(0.03).ignoresSafeArea()

            VStack(spacing: 0) {
                TabView(selection: $page) {
                    ForEach(steps.indices, id: \.self) { idx in
                        let s = steps[idx]
                        VStack(spacing: 28) {
                            Spacer()
                            Image(systemName: s.icon)
                                .font(.system(size: 80))
                                .foregroundStyle(s.color)
                                .symbolRenderingMode(.hierarchical)

                            VStack(spacing: 12) {
                                Text(i18n.language == .ja ? s.titleJa : s.titleEn)
                                    .font(.title2.bold())
                                    .multilineTextAlignment(.center)
                                Text(i18n.language == .ja ? s.bodyJa : s.bodyEn)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                                    .lineSpacing(4)
                                    .padding(.horizontal, 8)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 32)
                        .tag(idx)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .animation(.easeInOut, value: page)

                // CTA
                VStack(spacing: 12) {
                    if page < steps.count - 1 {
                        Button {
                            withAnimation { page += 1 }
                        } label: {
                            Text(i18n.language == .ja ? "次へ" : "Next")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(steps[page].color)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        Button(i18n.language == .ja ? "スキップ" : "Skip") { onDone() }
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Button {
                            onDone()
                        } label: {
                            Text(i18n.language == .ja ? "はじめる！" : "Let's Go!")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color("BrandOrange"))
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 48)
            }
        }
    }
}

// MARK: - Nonprofit tab bar

struct NonprofitTabView: View {
    @EnvironmentObject var i18n: I18n
    var body: some View {
        TabView {
            NonprofitDashboardView()
                .tabItem { Label(i18n.t(.npDashTitle), systemImage: "chart.bar.fill") }
            NonprofitCampaignsView()
                .tabItem { Label(i18n.t(.tabCampaigns), systemImage: "heart.fill") }
            ProfileView()
                .tabItem { Label(i18n.t(.tabProfile), systemImage: "person.fill") }
        }
        .tint(Color("BrandOrange"))
    }
}

// MARK: - Admin tab bar

struct AdminTabView: View {
    @EnvironmentObject var i18n: I18n
    var body: some View {
        TabView {
            AdminQueueView()
                .tabItem { Label(i18n.t(.adminQueue), systemImage: "tray.fill") }
            AdminStatsView()
                .tabItem { Label(i18n.t(.adminStats), systemImage: "chart.xyaxis.line") }
            ProfileView()
                .tabItem { Label(i18n.t(.tabProfile), systemImage: "person.fill") }
        }
        .tint(.purple)
    }
}
