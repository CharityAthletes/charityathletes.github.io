import SwiftUI

@MainActor
final class AdminStatsVM: ObservableObject {
    @Published var stats: PlatformStats?
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        stats = try? await APIClient.shared.getAdminStats()
    }
}

struct AdminStatsView: View {
    @StateObject private var vm = AdminStatsVM()
    @EnvironmentObject var i18n: I18n

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.stats == nil {
                    ProgressView(i18n.t(.commonLoading))
                } else if let s = vm.stats {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            // Donation highlight
                            DonationHighlight(amountJpy: s.totalDonatedJpy, count: s.totalDonations)
                                .padding(.horizontal)

                            // User stats grid
                            StatGrid(stats: s).padding(.horizontal)

                            // Activity count card
                            SingleStatCard(
                                value: s.totalActivities.formatted(),
                                label: i18n.language == .ja ? "連携された活動数" : "Synced Activities",
                                icon: "bicycle",
                                color: Color("BrandOrange")
                            )
                            .padding(.horizontal)
                        }
                        .padding(.vertical)
                    }
                } else {
                    ContentUnavailableView(i18n.t(.commonError), systemImage: "chart.bar.xaxis")
                }
            }
            .navigationTitle(i18n.t(.adminStats))
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }
}

// MARK: - Sub-views

private struct DonationHighlight: View {
    let amountJpy: Int
    let count: Int
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(spacing: 8) {
            Text(i18n.t(.adminTotalDonated))
                .font(.subheadline).foregroundStyle(.white.opacity(0.85))
            Text("¥\(amountJpy.formatted())")
                .font(.system(size: 42, weight: .bold)).foregroundStyle(.white)
            Text(i18n.language == .ja
                 ? "\(count.formatted())件の寄付"
                 : "\(count.formatted()) donations")
                .font(.caption).foregroundStyle(.white.opacity(0.75))
        }
        .frame(maxWidth: .infinity).padding(.vertical, 28)
        .background(
            LinearGradient(colors: [Color("BrandOrange"), Color("BrandRed")],
                           startPoint: .leading, endPoint: .trailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

private struct StatGrid: View {
    let stats: PlatformStats
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatTile(value: stats.totalAthletes.formatted(),
                     label: i18n.t(.adminTotalAthletes),
                     icon: "figure.walk", color: Color("BrandOrange"))

            StatTile(value: stats.approvedNonprofits.formatted(),
                     label: i18n.t(.adminTotalNonprofits),
                     icon: "building.2", color: .blue)

            StatTile(value: stats.pendingApprovals.formatted(),
                     label: i18n.t(.adminPending),
                     icon: "clock.badge", color: .orange)

            StatTile(value: stats.activeCampaigns.formatted(),
                     label: i18n.t(.adminActiveCampaigns),
                     icon: "heart.fill", color: .green)
        }
    }
}

private struct StatTile: View {
    let value: String
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2).foregroundStyle(color)
            Text(value).font(.title.bold())
            Text(label).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct SingleStatCard: View {
    let value: String
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        HStack {
            Image(systemName: icon).font(.title).foregroundStyle(color)
            VStack(alignment: .leading) {
                Text(value).font(.title2.bold())
                Text(label).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
