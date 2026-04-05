import SwiftUI
import UIKit

// Renders two SF Symbols side-by-side into a single UIImage for use in tab bar
private func activitiesTabIcon() -> UIImage {
    let config = UIImage.SymbolConfiguration(pointSize: 11, weight: .medium)
    let bike   = UIImage(systemName: "bicycle",    withConfiguration: config)!.withRenderingMode(.alwaysTemplate)
    let runner = UIImage(systemName: "figure.run", withConfiguration: config)!.withRenderingMode(.alwaysTemplate)

    let gap: CGFloat = 3
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

@main
struct CharityAthletesApp: App {
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
