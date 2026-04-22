import SwiftUI

@MainActor
final class CampaignListVM: ObservableObject {
    @Published var campaigns: [Campaign] = []
    @Published var joinedIds: Set<String> = []
    @Published var myCampaigns: [Campaign] = []   // from /mine — includes myDistanceKm
    @Published var createdCampaigns: [Campaign] = []
    @Published var isLoading = false
    @Published var error: String?

    /// Lookup: campaign id → athlete's distance for that campaign
    var myDistanceById: [String: Double] {
        Dictionary(uniqueKeysWithValues: myCampaigns.compactMap { c in
            guard let km = c.myDistanceKm else { return nil }
            return (c.id, km)
        })
    }

    func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            async let all = APIClient.shared.getCampaigns()
            async let mine = APIClient.shared.getMyCampaigns()
            async let created = APIClient.shared.getCreatedCampaigns()
            let (allCamps, myCamps, createdCamps) = try await (all, mine, created)
            campaigns = allCamps
            myCampaigns = myCamps
            joinedIds = Set(myCamps.map(\.id))
            createdCampaigns = createdCamps
        }
        catch let e { error = e.localizedDescription }
    }
}

struct CampaignListView: View {
    @StateObject private var vm = CampaignListVM()
    @EnvironmentObject var i18n: I18n
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.campaigns.isEmpty && vm.createdCampaigns.isEmpty {
                    ProgressView(i18n.t(.commonLoading))
                } else if let err = vm.error {
                    ContentUnavailableView("エラー", systemImage: "exclamationmark.triangle",
                                          description: Text(err))
                } else {
                    let createdIds = Set(vm.createdCampaigns.map(\.id))

                    // All campaigns the user has joined (from public list + created list)
                    let allJoined: [Campaign] = {
                        var seen = Set<String>()
                        var result: [Campaign] = []
                        // Joined public campaigns
                        for c in vm.campaigns where vm.joinedIds.contains(c.id) {
                            if seen.insert(c.id).inserted { result.append(c) }
                        }
                        // Joined created campaigns (private ones not in public list)
                        for c in vm.createdCampaigns where vm.joinedIds.contains(c.id) {
                            if seen.insert(c.id).inserted { result.append(c) }
                        }
                        return result
                    }()

                    // Created but NOT joined — shown separately so user can join their own campaign
                    let createdNotJoined = vm.createdCampaigns.filter { !vm.joinedIds.contains($0.id) }

                    // Discover: public, not joined, not created
                    let discover = vm.campaigns.filter {
                        !vm.joinedIds.contains($0.id) && !createdIds.contains($0.id)
                    }

                    List {
                        // Joined campaigns (including created+joined)
                        if !allJoined.isEmpty {
                            Section {
                                ForEach(allJoined) { c in
                                    NavigationLink { CampaignDetailView(campaign: c, isJoined: true) } label: {
                                        CampaignRow(campaign: c, joined: true, isCreated: createdIds.contains(c.id), showPrivateBadge: !c.isPublic, myDistanceKm: vm.myDistanceById[c.id])
                                    }
                                    .listRowBackground(Color.clear)
                                    .listRowSeparator(.hidden)
                                }
                            } header: {
                                Label(i18n.language == .ja ? "参加中のイベント" : "Joined Campaigns",
                                      systemImage: "checkmark.circle.fill")
                                    .foregroundStyle(Color("BrandOrange"))
                                    .font(.subheadline.bold())
                                    .textCase(nil)
                            }
                        }

                        // Created but not yet joined
                        if !createdNotJoined.isEmpty {
                            Section {
                                ForEach(createdNotJoined) { c in
                                    NavigationLink { CampaignDetailView(campaign: c, isJoined: false) } label: {
                                        CampaignRow(campaign: c, joined: false, isCreated: true, showPrivateBadge: !c.isPublic)
                                    }
                                    .listRowBackground(Color.clear)
                                    .listRowSeparator(.hidden)
                                }
                            } header: {
                                Label(i18n.language == .ja ? "作成したイベント" : "My Created Campaigns",
                                      systemImage: "star.circle.fill")
                                    .foregroundStyle(Color("BrandOrange"))
                                    .font(.subheadline.bold())
                                    .textCase(nil)
                            }
                        }

                        // Discover
                        if !discover.isEmpty {
                            Section {
                                ForEach(discover) { c in
                                    NavigationLink { CampaignDetailView(campaign: c, isJoined: false) } label: {
                                        CampaignRow(campaign: c, joined: false)
                                    }
                                    .listRowBackground(Color.clear)
                                    .listRowSeparator(.hidden)
                                }
                            } header: {
                                Label(i18n.language == .ja ? "イベントに参加する" : "Join a Campaign",
                                      systemImage: "magnifyingglass")
                                    .foregroundStyle(.secondary)
                                    .font(.subheadline.bold())
                                    .textCase(nil)
                            }
                        }

                        if allJoined.isEmpty && createdNotJoined.isEmpty && discover.isEmpty {
                            ContentUnavailableView(i18n.t(.campaignsEmpty), systemImage: "heart.slash")
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(i18n.t(.campaignsTitle))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showCreate = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .refreshable { await vm.load() }
            .task { await vm.load() }
            .sheet(isPresented: $showCreate) {
                CreateCampaignView()
                    .environmentObject(i18n)
                    .onDisappear { Task { await vm.load() } }
            }
        }
    }
}

// MARK: - Campaign Row

struct CampaignRow: View {
    let campaign: Campaign
    var joined: Bool = false
    var isCreated: Bool = false
    var showPrivateBadge: Bool = false
    var myDistanceKm: Double? = nil
    @ObservedObject private var i18n = I18n.shared

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "Asia/Tokyo")
        f.dateFormat = "MMM d"
        return f
    }()

    private var dateRange: String {
        let s = Self.dateFmt.string(from: campaign.startDate)
        let e = Self.dateFmt.string(from: campaign.endDate)
        return "\(s) – \(e)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .top, spacing: 6) {
                        Text(i18n.pick(ja: campaign.titleJa, en: campaign.titleEn))
                            .font(.headline).lineLimit(2)
                        if showPrivateBadge || !campaign.isPublic {
                            Label(i18n.language == .ja ? "非公開" : "Private",
                                  systemImage: "lock.fill")
                                .font(.caption2.bold())
                                .lineLimit(1)
                                .fixedSize()
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.15))
                                .foregroundStyle(.secondary)
                                .clipShape(Capsule())
                        }
                    }
                    if let np = campaign.nonprofits {
                        Text(i18n.pick(ja: np.nameJa, en: np.nameEn))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 6) {
                        Label(dateRange, systemImage: "calendar")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        // #10 countdown badge
                        let d = Calendar.current.dateComponents([.day], from: Date(), to: campaign.endDate).day ?? -1
                        if d >= 0 {
                            CountdownBadge(daysLeft: d, compact: true)
                        }
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    if joined {
                        Label(i18n.language == .ja ? "参加中" : "Joined",
                              systemImage: "checkmark.circle.fill")
                            .font(.caption2.bold())
                            .foregroundStyle(Color("BrandOrange"))
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Color("BrandOrange").opacity(0.12))
                            .clipShape(Capsule())
                    }
                    if isCreated {
                        Label(i18n.language == .ja ? "作成者" : "My Campaign",
                              systemImage: "star.fill")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Color("BrandOrange"))
                            .clipShape(Capsule())
                    }
                }
            }

            // Donation type chips
            HStack(spacing: 8) {
                if campaign.hasFlatDonation {
                    DonationChip(label: i18n.language == .ja ? "定額" : "Flat", icon: "bolt.fill")
                }
                if campaign.hasPerKmDonation {
                    let cap = campaign.maxDistanceKm.map { " / \($0)km cap" } ?? ""
                    DonationChip(label: (i18n.language == .ja ? "距離連動" : "Per km") + cap,
                                 icon: "arrow.forward")
                }
            }

            SportProgressBar(progress: campaign.progress, sportTypes: campaign.sportTypes, compact: true)

            HStack {
                Text("¥\(campaign.raisedAmountJpy.formatted())")
                    .font(.subheadline.bold()).foregroundStyle(Color("BrandOrange"))
                Text("/ ¥\(campaign.goalAmountJpy.formatted())")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
                SportBadges(sportTypes: campaign.sportTypes)
                if let km = myDistanceKm {
                    Label(String(format: "%.1f km", km), systemImage: "figure.run")
                        .font(.caption).foregroundStyle(Color("BrandOrange"))
                } else {
                    Label("\(campaign.participantCount)", systemImage: "person.2")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .background(joined ? Color("BrandOrange").opacity(0.08) : Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(joined ? Color("BrandOrange").opacity(0.35) : Color.clear, lineWidth: 1)
        )
        .padding(.vertical, 4)
    }
}

// MARK: - Subviews

struct SportBadges: View {
    let sportTypes: [String]
    var body: some View {
        HStack(spacing: 4) {
            ForEach(sportTypes, id: \.self) { t in
                Image(systemName: icon(for: t))
                    .font(.caption)
                    .padding(6)
                    .background(Color("BrandOrange").opacity(0.12))
                    .clipShape(Circle())
                    .foregroundStyle(Color("BrandOrange"))
            }
        }
    }
    private func icon(for t: String) -> String {
        switch t {
        case "Ride", "VirtualRide": return "bicycle"
        case "Run":                 return "figure.run"
        case "Walk":                return "figure.walk"
        case "Swim":                return "figure.pool.swim"
        default:                    return "figure.mixed.cardio"
        }
    }
}

struct DonationChip: View {
    let label: String
    let icon: String
    var body: some View {
        Label(label, systemImage: icon)
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color("BrandOrange").opacity(0.1))
            .foregroundStyle(Color("BrandOrange"))
            .clipShape(Capsule())
    }
}
