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
                            Text(i18n.language == .ja ? "参加中のキャンペーン" : "My Campaigns")
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
                            Text(i18n.language == .ja ? "キャンペーンに参加する" : "Join a Campaign")
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
                }
                .padding(.vertical)
            }
            .navigationTitle({
                if let name = auth.profile?.displayName.split(separator: " ").first.map(String.init), !name.isEmpty {
                    return i18n.language == .ja ? "\(name)さんのホーム" : "\(name)'s Home"
                }
                return i18n.t(.dashboardTitle)
            }())
            .refreshable { await vm.load() }
            .task { await vm.load() }
        }
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

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    private var dateRange: String {
        let s = Self.dateFmt.string(from: campaign.startDate)
        let e = Self.dateFmt.string(from: campaign.endDate)
        return "\(s) – \(e)"
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
            Label(dateRange, systemImage: "calendar")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Spacer()
            ProgressView(value: campaign.progress).tint(Color("BrandOrange"))
            HStack {
                Text("¥\(campaign.raisedAmountJpy.formatted())")
                    .font(.caption.bold())
                    .foregroundStyle(Color("BrandOrange"))
                if joined, let km = campaign.myDistanceKm {
                    Spacer()
                    Label(String(format: "%.1f km", km), systemImage: "figure.run")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .frame(width: 200, height: 145)
        .background(joined ? Color("BrandOrange").opacity(0.1) : Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(joined ? Color("BrandOrange").opacity(0.3) : Color.clear, lineWidth: 1)
        )
    }
}
