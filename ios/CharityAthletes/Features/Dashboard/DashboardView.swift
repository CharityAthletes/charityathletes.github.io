import SwiftUI

@MainActor
final class DashboardVM: ObservableObject {
    @Published var summary: DonationSummary?
    @Published var myCampaigns: [Campaign] = []
    @Published var discoverCampaigns: [Campaign] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            async let s = APIClient.shared.getSummary()
            async let mine = APIClient.shared.getMyCampaigns()
            async let all = APIClient.shared.getCampaigns()
            let (sum, myCamps, allCamps) = try await (s, mine, all)
            summary = sum
            myCampaigns = myCamps
            // Discover: public campaigns the user hasn't joined
            let joinedIds = Set(myCamps.map(\.id))
            discoverCampaigns = Array(allCamps.filter { !joinedIds.contains($0.id) }.prefix(4))
        } catch let e { error = e.localizedDescription }
    }
}

struct DashboardView: View {
    @StateObject private var vm = DashboardVM()
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var i18n: I18n

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 20) {
                    // Greeting header with avatar
                    HStack(spacing: 12) {
                        AvatarView(url: auth.profile?.avatarUrl, size: 44)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(i18n.language == .ja ? "おかえりなさい" : "Welcome back")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if let name = auth.profile?.displayName.split(separator: " ").first.map(String.init), !name.isEmpty {
                                Text(i18n.language == .ja ? "\(name)さん" : name)
                                    .font(.title2.bold())
                            } else {
                                Text(i18n.t(.dashboardTitle))
                                    .font(.title2.bold())
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.top, 4)

                    // Stats banner
                    StatsBanner(summary: vm.summary)
                        .padding(.horizontal)

                    // Strava CTA
                    if !auth.isStravaConnected {
                        StravaConnectCard()
                            .padding(.horizontal)
                    }

                    // My joined campaigns
                    if !vm.myCampaigns.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(i18n.language == .ja ? "参加中のイベント" : "My Campaigns")
                                .font(.headline)
                                .padding(.horizontal)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 14) {
                                    ForEach(vm.myCampaigns) { c in
                                        NavigationLink { CampaignDetailView(campaign: c, isJoined: true) } label: {
                                            CampaignMiniCard(campaign: c, joined: true)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }

                    // Discover campaigns
                    if !vm.discoverCampaigns.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(i18n.language == .ja ? "イベントに参加する" : "Join a Campaign")
                                .font(.headline)
                                .padding(.horizontal)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 14) {
                                    ForEach(vm.discoverCampaigns) { c in
                                        NavigationLink { CampaignDetailView(campaign: c, isJoined: false) } label: {
                                            CampaignMiniCard(campaign: c, joined: false)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }

                    // #9 Empty state — no campaigns at all yet
                    if !vm.isLoading && vm.myCampaigns.isEmpty && vm.discoverCampaigns.isEmpty {
                        DashboardEmptyState()
                            .padding(.horizontal)
                    }
                }
                .padding(.vertical)
            }
            .navigationBarTitleDisplayMode(.inline)
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    // Compact language toggle: tap to flip between JA and EN
                    Button {
                        i18n.language = i18n.language == .ja ? .en : .ja
                    } label: {
                        Text(i18n.language == .ja ? "EN" : "日本語")
                            .font(.caption.bold())
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color("BrandOrange").opacity(0.12))
                            .foregroundStyle(Color("BrandOrange"))
                            .clipShape(Capsule())
                    }
                }
            }
            .refreshable { await vm.load() }
            .task { await vm.load() }
        }
    }
}

// MARK: - Avatar View

struct AvatarView: View {
    let url: String?
    var size: CGFloat = 44

    var body: some View {
        Group {
            if let urlStr = url, let imageURL = URL(string: urlStr) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure, .empty:
                        placeholder
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color("BrandOrange").opacity(0.3), lineWidth: 1.5))
    }

    private var placeholder: some View {
        Circle()
            .fill(Color("BrandOrange").opacity(0.15))
            .overlay(
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.45))
                    .foregroundStyle(Color("BrandOrange"))
            )
    }
}

// MARK: - Stats Banner

private struct StatsBanner: View {
    let summary: DonationSummary?
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        HStack {
            StatCell(
                value: summary.map { "¥\($0.totalDonatedJpy.formatted())" } ?? "—",
                label: i18n.t(.dashboardTotalDonated)
            )
            Divider().frame(height: 44).background(.white.opacity(0.5))
            StatCell(
                value: summary.map { String(format: "%.1f km", $0.totalDistanceKm) } ?? "—",
                label: i18n.t(.dashboardTotalDistance)
            )
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(
            LinearGradient(colors: [Color("BrandOrange"), Color("BrandRed")],
                           startPoint: .leading, endPoint: .trailing)
        )
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

private struct StatCell: View {
    let value: String
    let label: String
    var body: some View {
        VStack(spacing: 4) {
            Text(value).font(.title2.bold())
            Text(label).font(.caption2).opacity(0.85)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Dashboard Empty State (#9)

struct DashboardEmptyState: View {
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "figure.run.circle")
                .font(.system(size: 56))
                .foregroundStyle(Color("BrandOrange").opacity(0.7))

            VStack(spacing: 6) {
                Text(i18n.language == .ja ? "まだイベントに参加していません" : "You haven't joined a campaign yet")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                Text(i18n.language == .ja
                     ? "イベントに参加してあなたのランニングや\nサイクリングで社会に貢献しましょう！"
                     : "Join a campaign and turn your running,\ncycling or swimming into donations!")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            NavigationLink {
                CampaignListView()
            } label: {
                Label(i18n.language == .ja ? "イベントを探す" : "Browse Campaigns",
                      systemImage: "heart.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color("BrandOrange"))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
        }
        .padding(24)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

// MARK: - Strava CTA

struct StravaConnectCard: View {
    @EnvironmentObject var auth: AuthManager
    @ObservedObject private var i18n = I18n.shared
    @State private var errorMsg: String?
    @State private var isLoading = false

    var body: some View {
        VStack {
            Button {
                Task {
                    isLoading = true
                    do {
                        try await auth.connectStrava()
                    } catch {
                        errorMsg = "Strava接続エラー: \(error.localizedDescription)"
                    }
                    isLoading = false
                }
            } label: {
                HStack(spacing: 14) {
                    Image(systemName: "link.circle.fill")
                        .font(.title)
                        .foregroundStyle(Color("StravaOrange"))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(i18n.t(.dashboardConnectStrava)).font(.headline)
                        Text(i18n.t(.dashboardConnectHint)).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if isLoading { ProgressView() }
                    else { Image(systemName: "chevron.right").foregroundStyle(.secondary) }
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            if let err = errorMsg {
                Text(err).font(.caption).foregroundStyle(.red).padding(.horizontal)
            }
        }
    }
}

// MARK: - Mini campaign card

struct CampaignMiniCard: View {
    let campaign: Campaign
    var joined: Bool = false
    @ObservedObject private var i18n = I18n.shared

    private static let dateFmtJa: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "M月d日"
        return f
    }()
    private static let dateFmtEn: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    private var dateRange: String {
        let fmt = i18n.language == .ja ? Self.dateFmtJa : Self.dateFmtEn
        let sep = i18n.language == .ja ? "〜" : " – "
        return "\(fmt.string(from: campaign.startDate))\(sep)\(fmt.string(from: campaign.endDate))"
    }

    /// Days until end date; nil if already ended
    private var daysLeft: Int? {
        let days = Calendar.current.dateComponents([.day], from: Date(), to: campaign.endDate).day ?? 0
        return days >= 0 ? days : nil
    }

    private func sportIcon(for t: String) -> String {
        switch t {
        case "Ride", "VirtualRide": return "bicycle"
        case "Run":                 return "figure.run"
        case "Walk":                return "figure.walk"
        case "Swim":                return "figure.pool.swim"
        default:                    return "figure.mixed.cardio"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(i18n.pick(ja: campaign.titleJa, en: campaign.titleEn))
                    .font(.subheadline.bold())
                    .lineLimit(2)
                Spacer()
                if joined {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color("BrandOrange"))
                        .font(.caption)
                }
            }
            Text(campaign.nonprofits.map { i18n.pick(ja: $0.nameJa, en: $0.nameEn) } ?? "")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            // #10 Countdown badge
            HStack(spacing: 6) {
                Label(dateRange, systemImage: "calendar")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if let d = daysLeft {
                    CountdownBadge(daysLeft: d, compact: true)
                }
            }

            Spacer()
            SportProgressBar(progress: campaign.progress, sportTypes: campaign.sportTypes, compact: true)
            HStack(spacing: 6) {
                Text("¥\(campaign.raisedAmountJpy.formatted())")
                    .font(.caption.bold())
                    .foregroundStyle(Color("BrandOrange"))
                Spacer()
                ForEach(campaign.sportTypes, id: \.self) { t in
                    Image(systemName: sportIcon(for: t))
                        .font(.caption2)
                        .foregroundStyle(Color("BrandOrange"))
                }
                if joined, let km = campaign.myDistanceKm {
                    Text(String(format: "%.1f km", km))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .frame(width: 200, height: 155)
        .background(joined ? Color("BrandOrange").opacity(0.1) : Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(joined ? Color("BrandOrange").opacity(0.3) : Color.clear, lineWidth: 1)
        )
    }
}

// MARK: - Countdown Badge (#10)

/// Reusable countdown badge used in both DashboardView and CampaignListView
struct CountdownBadge: View {
    let daysLeft: Int
    var compact: Bool = false
    @ObservedObject private var i18n = I18n.shared

    private var label: String {
        if daysLeft == 0 { return i18n.language == .ja ? "本日終了" : "Last day!" }
        if i18n.language == .ja { return "\(daysLeft)日" }
        return daysLeft == 1 ? "1d left" : "\(daysLeft)d left"
    }

    private var urgentColor: Color {
        if daysLeft <= 3  { return .red }
        if daysLeft <= 7  { return Color("BrandOrange") }
        return .secondary
    }

    var body: some View {
        Text(label)
            .font(compact ? .system(size: 9, weight: .bold) : .caption2.bold())
            .padding(.horizontal, compact ? 5 : 7)
            .padding(.vertical, compact ? 2 : 3)
            .background(urgentColor.opacity(0.12))
            .foregroundStyle(urgentColor)
            .clipShape(Capsule())
    }
}
