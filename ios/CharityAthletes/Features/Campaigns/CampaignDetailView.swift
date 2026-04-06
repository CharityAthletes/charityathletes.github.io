import SwiftUI

@MainActor
final class CampaignDetailVM: ObservableObject {
    @Published var leaderboard: [LeaderboardEntry] = []
    @Published var showJoinSheet = false
    @Published var showUnjoinConfirm = false
    @Published var showDeleteConfirm = false
    @Published var showArchiveConfirm = false
    @Published var showEditSheet = false
    @Published var isLoading = false
    @Published var joined = false
    @Published var deleted = false
    @Published var error: String?

    @Published var campaign: Campaign

    init(campaign: Campaign, isJoined: Bool = false) {
        self.campaign = campaign
        self.joined   = isJoined
    }

    func loadLeaderboard() async {
        do { leaderboard = try await APIClient.shared.getLeaderboard(campaignId: campaign.id) }
        catch { }
    }

    func join() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            _ = try await APIClient.shared.joinCampaign(id: campaign.id, flatEnabled: false, perKmJpy: nil)
            joined = true
            showJoinSheet = false
        } catch let e { error = e.localizedDescription }
    }

    func unjoin() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            try await APIClient.shared.unjoinCampaign(id: campaign.id)
            joined = false
        } catch let e { error = e.localizedDescription }
    }

    func delete() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            try await APIClient.shared.deleteCampaign(id: campaign.id)
            deleted = true
        } catch let e { error = e.localizedDescription }
    }

    func archive() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            try await APIClient.shared.archiveCampaign(id: campaign.id)
            deleted = true  // dismiss the view
        } catch let e { error = e.localizedDescription }
    }
}

struct CampaignDetailView: View {
    @StateObject private var vm: CampaignDetailVM
    @EnvironmentObject var i18n: I18n
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    init(campaign: Campaign, isJoined: Bool = false) {
        _vm = StateObject(wrappedValue: CampaignDetailVM(campaign: campaign, isJoined: isJoined))
    }

    private var c: Campaign { vm.campaign }
    private var isCreator: Bool { c.createdBy == auth.profile?.userId }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 6) {
                    Text(i18n.pick(ja: c.titleJa, en: c.titleEn)).font(.title2.bold())
                    if let np = c.nonprofits {
                        Text(i18n.pick(ja: np.nameJa, en: np.nameEn))
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }

                // Progress
                VStack(alignment: .leading, spacing: 6) {
                    ProgressView(value: c.progress).tint(Color("BrandOrange"))
                    HStack {
                        Text("¥\(c.raisedAmountJpy.formatted())")
                            .font(.headline).foregroundStyle(Color("BrandOrange"))
                        Text(i18n.t(.campaignRaised)).font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Text("¥\(c.goalAmountJpy.formatted()) \(i18n.t(.campaignGoal))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Label("\(c.participantCount) \(i18n.t(.campaignParticipants))", systemImage: "person.2")
                        .font(.caption2).foregroundStyle(.secondary)
                }

                // Donation types explanation
                DonationTypesExplainer(campaign: c)

                // Description
                Text(i18n.pick(ja: c.descriptionJa, en: c.descriptionEn))
                    .font(.body).foregroundStyle(.secondary)

                // CTA
                if !vm.joined {
                    Button {
                        vm.showJoinSheet = true
                    } label: {
                        Text(i18n.t(.campaignJoin))
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color("BrandOrange"))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                } else {
                    HStack {
                        Label(i18n.language == .ja ? "参加中" : "Joined", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(Color("BrandOrange"))
                            .font(.headline)
                        Spacer()
                        Button {
                            vm.showUnjoinConfirm = true
                        } label: {
                            Text(i18n.language == .ja ? "キャンセル" : "Leave")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .disabled(vm.isLoading)
                    }
                }

                // Social share
                SocialShareSection(campaign: c)

                // Leaderboard
                if !vm.leaderboard.isEmpty {
                    LeaderboardSection(entries: vm.leaderboard)
                }
            }
            .padding()
        }
        .navigationTitle(i18n.pick(ja: c.titleJa, en: c.titleEn))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack {
                    ShareLink(
                        item: URL(string: "\(AppConfig.backendURL)/c/\(c.id)")!,
                        subject: Text(c.titleJa),
                        message: Text(i18n.language == .ja ? "私のチャリティキャンペーンを応援してください！" : "Please support my charity campaign!")
                    )
                    if isCreator {
                        Menu {
                            Button {
                                vm.showEditSheet = true
                            } label: {
                                Label(i18n.language == .ja ? "キャンペーンを編集" : "Edit Campaign",
                                      systemImage: "pencil")
                            }
                            Divider()
                            if c.participantCount <= 1 {
                                Button(role: .destructive) {
                                    vm.showDeleteConfirm = true
                                } label: {
                                    Label(i18n.language == .ja ? "キャンペーンを削除" : "Delete Campaign",
                                          systemImage: "trash")
                                }
                            } else {
                                Button(role: .destructive) {
                                    vm.showArchiveConfirm = true
                                } label: {
                                    Label(i18n.language == .ja ? "キャンペーンを終了" : "End Campaign Early",
                                          systemImage: "archivebox")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
            }
        }
        .task { await vm.loadLeaderboard() }
        .onChange(of: vm.deleted) { _, deleted in
            if deleted { dismiss() }
        }
        .sheet(isPresented: $vm.showJoinSheet) {
            JoinCampaignSheet(vm: vm)
        }
        .sheet(isPresented: $vm.showEditSheet) {
            EditCampaignView(campaign: vm.campaign) { [weak vm] updated in
                vm?.campaign = updated
            }
            .environmentObject(i18n)
        }
        .confirmationDialog(
            i18n.language == .ja ? "キャンペーンを退会しますか？" : "Leave this campaign?",
            isPresented: $vm.showUnjoinConfirm,
            titleVisibility: .visible
        ) {
            Button(i18n.language == .ja ? "退会する" : "Leave", role: .destructive) {
                Task { await vm.unjoin() }
            }
            Button(i18n.t(.commonCancel), role: .cancel) {}
        } message: {
            Text(i18n.language == .ja
                 ? "退会後も過去の寄付記録は保持されます。"
                 : "Your past donations will not be affected.")
        }
        .confirmationDialog(
            i18n.language == .ja ? "キャンペーンを削除しますか？" : "Delete this campaign?",
            isPresented: $vm.showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button(i18n.language == .ja ? "削除する" : "Delete", role: .destructive) {
                Task { await vm.delete() }
            }
            Button(i18n.t(.commonCancel), role: .cancel) {}
        } message: {
            Text(i18n.language == .ja ? "この操作は取り消せません。" : "This cannot be undone.")
        }
        .confirmationDialog(
            i18n.language == .ja ? "キャンペーンを終了しますか？" : "End this campaign early?",
            isPresented: $vm.showArchiveConfirm,
            titleVisibility: .visible
        ) {
            Button(i18n.language == .ja ? "終了する" : "End Campaign", role: .destructive) {
                Task { await vm.archive() }
            }
            Button(i18n.t(.commonCancel), role: .cancel) {}
        } message: {
            Text(i18n.language == .ja
                 ? "参加者がいるため削除できません。終了すると新しいアクティビティはカウントされなくなります。"
                 : "Can't delete because others have joined. Ending the campaign stops new activities from counting.")
        }
    }
}

// MARK: - Donation types explainer

private struct DonationTypesExplainer: View {
    let campaign: Campaign
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if campaign.hasFlatDonation {
                HStack {
                    Image(systemName: "bolt.circle.fill").foregroundStyle(Color("BrandOrange"))
                    Text(i18n.t(.campaignFlatLabel))
                    Spacer()
                    Text(i18n.language == .ja ? "金額を選択" : "Donor's choice").bold()
                }
            }
            if campaign.hasPerKmDonation {
                HStack {
                    Image(systemName: "arrow.forward.circle.fill").foregroundStyle(Color("BrandOrange"))
                    Text(i18n.t(.campaignPerKmLabel))
                    Spacer()
                    VStack(alignment: .trailing) {
                        Text(i18n.language == .ja ? "レートを選択" : "Donor's choice").bold()
                        if let cap = campaign.maxDistanceKm {
                            Text("max \(cap) km").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .font(.subheadline)
    }
}

// MARK: - Join sheet

struct JoinCampaignSheet: View {
    @ObservedObject var vm: CampaignDetailVM
    @EnvironmentObject var i18n: I18n
    @Environment(\.dismiss) var dismiss

    private var c: Campaign { vm.campaign }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "figure.run.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(Color("BrandOrange"))

                VStack(spacing: 8) {
                    Text(i18n.pick(ja: c.titleJa, en: c.titleEn))
                        .font(.title3.bold())
                        .multilineTextAlignment(.center)
                    Text(i18n.language == .ja
                         ? "このキャンペーンに参加して、あなたの活動で寄付を集めましょう。ドナーがあなたの走行距離に応じて寄付します。"
                         : "Join this campaign and fundraise through your activities. Donors will pledge donations based on your distance.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                if let err = vm.error {
                    Text(err).foregroundStyle(.red).font(.caption).padding(.horizontal)
                }

                Button {
                    Task { await vm.join() }
                } label: {
                    HStack {
                        Spacer()
                        if vm.isLoading { ProgressView().tint(.white) }
                        else { Text(i18n.t(.campaignJoinConfirm)).bold() }
                        Spacer()
                    }
                    .padding()
                    .background(Color("BrandOrange"))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(vm.isLoading)
                .padding(.horizontal)

                Spacer()
            }
            .navigationTitle(i18n.t(.campaignJoinTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.t(.commonCancel)) { dismiss() }
                }
            }
        }
    }
}

// MARK: - Social Share

private struct SocialShareSection: View {
    let campaign: Campaign
    @ObservedObject private var i18n = I18n.shared

    private var donorURL: String { "\(AppConfig.backendURL)/c/\(campaign.id)" }

    private var shareMessage: String {
        let title = i18n.pick(ja: campaign.titleJa, en: campaign.titleEn)
        return i18n.language == .ja
            ? "チャリアスのキャンペーン「\(title)」に参加しています！ぜひ応援してください🏃‍♂️ \(donorURL) #チャリアス #チャリティ"
            : "I'm fundraising on Charity Athletes! Support my campaign \"\(title)\" 🏃 \(donorURL) #CharityAthletes"
    }

    private var encoded: (text: String, url: String) {
        let allowed = CharacterSet.urlQueryAllowed
        return (
            shareMessage.addingPercentEncoding(withAllowedCharacters: allowed) ?? "",
            donorURL.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(i18n.language == .ja ? "SNSでシェア" : "Share on Social Media")
                .font(.headline)

            HStack(spacing: 16) {
                // X (Twitter)
                socialLink(
                    urlString: "https://twitter.com/intent/tweet?text=\(encoded.text)",
                    label: "X",
                    labelText: "X",
                    color: .black
                )

                // Facebook — copies link to clipboard then opens app (FB strips pre-filled content on mobile)
                facebookButton

                // LinkedIn
                socialLink(
                    urlString: "https://www.linkedin.com/shareArticle?mini=true&url=\(encoded.url)&summary=\(encoded.text)",
                    label: "LinkedIn",
                    labelText: "in",
                    color: Color(red: 0.0, green: 0.47, blue: 0.71)
                )

                // Instagram — opens app, user pastes link manually
                instagramButton
            }

            Text(i18n.language == .ja
                 ? "💡 FacebookとInstagramはリンクがコピーされてアプリが開きます。投稿に貼り付けてください。"
                 : "💡 Facebook & Instagram: your link is copied to clipboard and the app opens — just paste it into your post.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private func socialLink(urlString: String, label: String, labelText: String, color: Color) -> some View {
        if let url = URL(string: urlString) {
            Link(destination: url) {
                SocialPill(labelText: labelText, platformLabel: label, color: color)
            }
        }
    }

    private var facebookButton: some View {
        Button {
            // Facebook strips pre-filled content on mobile — copy link then open app
            UIPasteboard.general.string = donorURL
            let fbApp = URL(string: "fb://")!
            let fbWeb = URL(string: "https://www.facebook.com")!
            let target = UIApplication.shared.canOpenURL(fbApp) ? fbApp : fbWeb
            UIApplication.shared.open(target)
        } label: {
            SocialPill(labelText: "f", platformLabel: "Facebook",
                       color: Color(red: 0.23, green: 0.35, blue: 0.60))
        }
    }

    private var instagramButton: some View {
        Button {
            // Copy donor URL to clipboard then open Instagram
            UIPasteboard.general.string = donorURL
            let igApp  = URL(string: "instagram://app")!
            let igWeb  = URL(string: "https://www.instagram.com")!
            let target = UIApplication.shared.canOpenURL(igApp) ? igApp : igWeb
            UIApplication.shared.open(target)
        } label: {
            SocialPill(labelText: "▶", platformLabel: "Instagram",
                       color: Color(red: 0.83, green: 0.19, blue: 0.53))
        }
    }
}

private struct SocialPill: View {
    let labelText: String
    let platformLabel: String
    let color: Color

    var body: some View {
        VStack(spacing: 5) {
            Text(labelText)
                .font(.system(size: 18, weight: .bold))
                .frame(width: 44, height: 44)
                .background(color)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            Text(platformLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Leaderboard

private struct LeaderboardSection: View {
    let entries: [LeaderboardEntry]
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(i18n.t(.campaignLeaderboard)).font(.headline)
            ForEach(entries.indices, id: \.self) { idx in
                let e = entries[idx]
                HStack {
                    Text("\(idx + 1)").font(.caption.bold()).foregroundStyle(.secondary).frame(width: 22)
                    Text(e.userProfiles?.displayName ?? "—").lineLimit(1)
                    Spacer()
                    Text("¥\(e.totalDonatedJpy.formatted())")
                        .font(.subheadline.bold()).foregroundStyle(Color("BrandOrange"))
                }
                .padding(.vertical, 4)
                if idx < entries.count - 1 { Divider() }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
