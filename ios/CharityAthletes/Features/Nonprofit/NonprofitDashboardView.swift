import SwiftUI

@MainActor
final class NonprofitDashboardVM: ObservableObject {
    @Published var dashboard: NonprofitDashboard?
    @Published var isLoading = false
    @Published var error: String?

    func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { dashboard = try await APIClient.shared.getNonprofitDashboard() }
        catch let e { error = e.localizedDescription }
    }
}

struct NonprofitDashboardView: View {
    @StateObject private var vm = NonprofitDashboardVM()
    @EnvironmentObject var i18n: I18n

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.dashboard == nil {
                    ProgressView(i18n.t(.commonLoading))
                } else if let d = vm.dashboard {
                    ScrollView {
                        LazyVStack(spacing: 20) {
                            // Total raised hero
                            TotalRaisedBanner(amountJpy: d.totalRaisedJpy)
                                .padding(.horizontal)

                            // By campaign
                            if !d.campaigns.isEmpty {
                                SectionCard(title: i18n.t(.npDashCampaigns)) {
                                    ForEach(d.campaigns) { c in
                                        CampaignStatRow(campaign: c)
                                        if c.id != d.campaigns.last?.id { Divider() }
                                    }
                                }
                                .padding(.horizontal)
                            }

                            // Top athletes
                            if !d.topAthletes.isEmpty {
                                SectionCard(title: i18n.t(.npDashTopAthletes)) {
                                    ForEach(d.topAthletes.indices, id: \.self) { idx in
                                        TopAthleteRow(rank: idx + 1, athlete: d.topAthletes[idx])
                                        if idx < d.topAthletes.count - 1 { Divider() }
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                        .padding(.vertical)
                    }
                } else {
                    ContentUnavailableView(i18n.t(.commonError), systemImage: "exclamationmark.triangle")
                }
            }
            .navigationTitle(i18n.t(.npDashTitle))
            .refreshable { await vm.load() }
            .task { await vm.load() }
        }
    }
}

// MARK: - Total raised banner

private struct TotalRaisedBanner: View {
    let amountJpy: Int
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(spacing: 4) {
            Text(i18n.t(.npDashTotalRaised))
                .font(.subheadline).foregroundStyle(.white.opacity(0.85))
            Text("¥\(amountJpy.formatted())")
                .font(.system(size: 44, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .background(
            LinearGradient(colors: [Color("BrandOrange"), Color("BrandRed")],
                           startPoint: .leading, endPoint: .trailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

// MARK: - Section card

struct SectionCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            VStack(spacing: 0) { content() }
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }
}

// MARK: - Campaign stat row

private struct CampaignStatRow: View {
    let campaign: Campaign
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(i18n.pick(ja: campaign.titleJa, en: campaign.titleEn))
                    .font(.subheadline.bold()).lineLimit(1)
                Spacer()
                Text("¥\(campaign.raisedAmountJpy.formatted())")
                    .font(.subheadline.bold()).foregroundStyle(Color("BrandOrange"))
            }
            ProgressView(value: campaign.progress).tint(Color("BrandOrange"))
            HStack {
                Label("\(campaign.participantCount)", systemImage: "person.2")
                Spacer()
                Text("/ ¥\(campaign.goalAmountJpy.formatted())")
            }
            .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Top athlete row

private struct TopAthleteRow: View {
    let rank: Int
    let athlete: NonprofitDashboard.TopAthlete

    var body: some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .font(.caption.bold())
                .foregroundStyle(.secondary)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(athlete.displayName).font(.subheadline.bold()).lineLimit(1)
                Text(String(format: "%.1f km · %d 回", athlete.totalDistanceKm, athlete.activityCount))
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            Text("¥\(athlete.totalDonatedJpy.formatted())")
                .font(.subheadline.bold()).foregroundStyle(Color("BrandOrange"))
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Nonprofit campaigns list (tab)

struct NonprofitCampaignsView: View {
    @State private var campaigns: [Campaign] = []
    @State private var isLoading = false
    @EnvironmentObject var i18n: I18n

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && campaigns.isEmpty {
                    ProgressView(i18n.t(.commonLoading))
                } else if campaigns.isEmpty {
                    ContentUnavailableView(i18n.t(.campaignsEmpty), systemImage: "heart.slash")
                } else {
                    List(campaigns) { c in
                        NavigationLink { CampaignDetailView(campaign: c) } label: {
                            CampaignRow(campaign: c)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(i18n.t(.tabCampaigns))
            .task {
                isLoading = true
                campaigns = (try? await APIClient.shared.getNonprofitCampaigns()) ?? []
                isLoading = false
            }
            .refreshable {
                campaigns = (try? await APIClient.shared.getNonprofitCampaigns()) ?? []
            }
        }
    }
}
