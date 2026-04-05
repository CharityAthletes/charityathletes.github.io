import SwiftUI

@MainActor
final class DonationListVM: ObservableObject {
    @Published var donations: [Donation] = []
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        donations = (try? await APIClient.shared.getDonations()) ?? []
    }
}

struct DonationListView: View {
    @StateObject private var vm = DonationListVM()
    @EnvironmentObject var i18n: I18n

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.donations.isEmpty {
                    ProgressView(i18n.t(.commonLoading))
                } else if vm.donations.isEmpty {
                    ContentUnavailableView(i18n.t(.donationsTitle), systemImage: "yensign.circle")
                } else {
                    List(vm.donations) { d in
                        DonationRow(donation: d)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(i18n.t(.donationsTitle))
            .refreshable { await vm.load() }
            .task { await vm.load() }
        }
    }
}

struct DonationRow: View {
    let donation: Donation
    @ObservedObject private var i18n = I18n.shared
    private static let df: DateFormatter = { let f = DateFormatter(); f.dateStyle = .short; return f }()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(donation.campaigns.map { i18n.pick(ja: $0.titleJa, en: $0.titleEn) } ?? "—")
                    .font(.subheadline.bold()).lineLimit(1)
                Spacer()
                StatusBadge(status: donation.status)
            }
            // Breakdown
            HStack(spacing: 12) {
                if donation.flatAmountJpy > 0 {
                    amountLabel(donation.flatAmountJpy, label: i18n.t(.donationFlat))
                }
                if donation.perKmAmountJpy > 0 {
                    amountLabel(donation.perKmAmountJpy, label: i18n.t(.donationPerKm))
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text(i18n.t(.donationTotal)).font(.caption2).foregroundStyle(.secondary)
                    Text("¥\(donation.totalAmountJpy.formatted())").font(.headline).foregroundStyle(Color("BrandOrange"))
                }
            }
            Text(Self.df.string(from: donation.createdAt))
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.vertical, 4)
    }

    private func amountLabel(_ amount: Int, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text("¥\(amount.formatted())").font(.caption.bold())
        }
    }
}

private struct StatusBadge: View {
    let status: String
    @ObservedObject private var i18n = I18n.shared
    var label: String {
        switch status {
        case "completed": return i18n.t(.donationComplete)
        case "failed":    return i18n.t(.donationFailed)
        default:          return i18n.t(.donationPending)
        }
    }
    var color: Color {
        switch status {
        case "completed": return .green
        case "failed":    return .red
        default:          return .orange
        }
    }
    var body: some View {
        Text(label)
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
