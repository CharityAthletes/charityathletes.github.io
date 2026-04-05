import SwiftUI

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
            Color("BrandOrange").ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "bicycle")
                    .font(.system(size: 72))
                    .foregroundStyle(.white)
                Text("チャリアス")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.white)
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
                .tabItem { Label(i18n.t(.tabActivities), systemImage: "bicycle") }
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
