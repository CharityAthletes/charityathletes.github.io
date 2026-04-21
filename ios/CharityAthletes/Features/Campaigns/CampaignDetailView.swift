import SwiftUI

@MainActor
final class CampaignDetailVM: ObservableObject {
    @Published var leaderboard: [LeaderboardEntry] = []
    @Published var donorPledges: [DonorPledge] = []
    @Published var showJoinSheet = false
    @Published var showUnjoinConfirm = false
    @Published var showDeleteConfirm = false
    @Published var showArchiveConfirm = false
    @Published var showEditSheet = false
    @Published var showFinalizeConfirm = false
    @Published var showFinalizeResult = false
    @Published var finalizeResult: FinalizeResult?
    @Published var showSupportSheet = false
    @Published var showThankYouSheet = false
    @Published var isLoading = false
    @Published var joined = false
    @Published var deleted = false
    @Published var error: String?

    @Published var campaign: Campaign

    init(campaign: Campaign, isJoined: Bool = false) {
        self.campaign = campaign
        self.joined   = isJoined
    }

    func loadCampaign() async {
        do { campaign = try await APIClient.shared.getCampaign(id: campaign.id) }
        catch { }
    }

    func loadLeaderboard() async {
        do { leaderboard = try await APIClient.shared.getLeaderboard(campaignId: campaign.id) }
        catch { }
    }

    func loadDonorPledges() async {
        do {
            donorPledges = try await APIClient.shared.getCampaignPledges(id: campaign.id)
            print("[DonorPledges] loaded \(donorPledges.count) pledges for campaign \(campaign.id)")
        } catch {
            print("[DonorPledges] error: \(error)")
        }
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

    func finalize() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            let result = try await APIClient.shared.finalizeCampaign(id: campaign.id)
            finalizeResult = result
            showFinalizeResult = true
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

    private static let dateFmtJa: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "yyyy年M月d日"
        return f
    }()

    private static let dateFmtEn: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d, yyyy"
        return f
    }()

    private func dateRangeString(start: Date, end: Date) -> String {
        let fmt = i18n.language == .ja ? Self.dateFmtJa : Self.dateFmtEn
        let sep = i18n.language == .ja ? "〜" : " – "
        return "\(fmt.string(from: start))\(sep)\(fmt.string(from: end))"
    }

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
                    Label(dateRangeString(start: c.startDate, end: c.endDate),
                          systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Progress
                VStack(alignment: .leading, spacing: 6) {
                    SportProgressBar(progress: c.progress, sportTypes: c.sportTypes)
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

                // CTA — Join (participate as athlete)
                if !vm.joined {
                    Button {
                        vm.showJoinSheet = true
                    } label: {
                        Label(
                            i18n.language == .ja ? "アスリートとして参加する" : "Join as an Athlete",
                            systemImage: "figure.run"
                        )
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color("BrandOrange"))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                } else {
                    HStack {
                        Label(i18n.language == .ja ? "アスリートとして参加中" : "Joined as an Athlete",
                              systemImage: "checkmark.circle.fill")
                            .foregroundStyle(Color("BrandOrange"))
                            .font(.headline)
                        Spacer()
                        Button {
                            vm.showUnjoinConfirm = true
                        } label: {
                            Text(i18n.language == .ja ? "退会する" : "Leave")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .disabled(vm.isLoading)
                    }
                }

                // Donate button — shown for everyone
                Button {
                    vm.showSupportSheet = true
                } label: {
                    Label(
                        i18n.language == .ja ? "このイベントに寄付する" : "Donate to This Campaign",
                        systemImage: "heart.fill"
                    )
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .foregroundStyle(Color("BrandOrange"))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color("BrandOrange"), lineWidth: 1.5)
                    )
                }

                // Social share — include athlete ID so donor page shows this athlete's activities
                let shareAthleteId = (isCreator || vm.joined) ? auth.profile?.userId : nil
                SocialShareSection(campaign: c, athleteId: shareAthleteId)

                // Leaderboard
                if !vm.leaderboard.isEmpty {
                    LeaderboardSection(entries: vm.leaderboard)
                }

                // Donor list — creator sees all; joined athletes see their own donors
                if isCreator || vm.joined {
                    DonorPledgeSection(pledges: vm.donorPledges, isCreator: isCreator)

                    // #6 — Thank-you message button (visible when there are donors)
                    if !vm.donorPledges.isEmpty {
                        Button {
                            vm.showThankYouSheet = true
                        } label: {
                            Label(
                                i18n.language == .ja ? "寄付者にお礼メッセージを送る" : "Send Thank-You to Donors",
                                systemImage: "envelope.heart.fill"
                            )
                            .font(.subheadline.bold())
                            .frame(maxWidth: .infinity)
                            .padding(12)
                            .background(Color(red: 0.1, green: 0.6, blue: 0.4).opacity(0.1))
                            .foregroundStyle(Color(red: 0.1, green: 0.6, blue: 0.4))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12)
                                .stroke(Color(red: 0.1, green: 0.6, blue: 0.4).opacity(0.4), lineWidth: 1))
                        }
                    }
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
                        message: Text(i18n.language == .ja ? "私のチャリティイベントを応援してください！" : "Please support my charity campaign!")
                    )
                    if isCreator {
                        Menu {
                            Button {
                                vm.showEditSheet = true
                            } label: {
                                Label(i18n.language == .ja ? "イベントを編集" : "Edit Campaign",
                                      systemImage: "pencil")
                            }
                            Divider()
                            Button {
                                vm.showFinalizeConfirm = true
                            } label: {
                                Label(i18n.language == .ja ? "イベントを確定・請求" : "Finalize & Charge Donors",
                                      systemImage: "checkmark.seal")
                            }
                            Divider()
                            if c.participantCount <= 1 {
                                Button(role: .destructive) {
                                    vm.showDeleteConfirm = true
                                } label: {
                                    Label(i18n.language == .ja ? "イベントを削除" : "Delete Campaign",
                                          systemImage: "trash")
                                }
                            } else {
                                Button(role: .destructive) {
                                    vm.showArchiveConfirm = true
                                } label: {
                                    Label(i18n.language == .ja ? "イベントを終了" : "End Campaign Early",
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
        .refreshable {
            async let a: Void = vm.loadCampaign()
            async let b: Void = vm.loadLeaderboard()
            async let c: Void = vm.loadDonorPledges()
            _ = await (a, b, c)
        }
        .task {
            async let a: Void = vm.loadCampaign()
            async let b: Void = vm.loadLeaderboard()
            async let c: Void = vm.loadDonorPledges()
            _ = await (a, b, c)
        }
        .onChange(of: auth.profile?.userId) { _, userId in
            guard userId != nil else { return }
            Task { await vm.loadDonorPledges() }
        }
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
        .sheet(isPresented: $vm.showSupportSheet) {
            SupportCampaignSheet(
                campaign: vm.campaign,
                donorName: auth.profile?.displayName ?? ""
            )
            .environmentObject(i18n)
        }
        .confirmationDialog(
            i18n.language == .ja ? "イベントを退会しますか？" : "Leave this campaign?",
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
            i18n.language == .ja ? "イベントを削除しますか？" : "Delete this campaign?",
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
            i18n.language == .ja ? "イベントを終了しますか？" : "End this campaign early?",
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
        .confirmationDialog(
            i18n.language == .ja ? "イベントを確定して請求しますか？" : "Finalize campaign and charge donors?",
            isPresented: $vm.showFinalizeConfirm,
            titleVisibility: .visible
        ) {
            Button(i18n.language == .ja ? "確定・請求する" : "Finalize & Charge", role: .destructive) {
                Task { await vm.finalize() }
            }
            Button(i18n.t(.commonCancel), role: .cancel) {}
        } message: {
            Text(i18n.language == .ja
                 ? "距離連動プレッジの寄付者に実際の走行距離に基づいて請求されます。イベントは終了します。この操作は取り消せません。"
                 : "Per-km pledge donors will be charged based on actual distance covered. The campaign will be closed. This cannot be undone.")
        }
        .sheet(isPresented: $vm.showFinalizeResult) {
            if let result = vm.finalizeResult {
                FinalizeResultSheet(result: result)
                    .environmentObject(i18n)
            }
        }
        .sheet(isPresented: $vm.showThankYouSheet) {
            ThankYouSheet(campaignId: vm.campaign.id)
                .environmentObject(i18n)
        }
    }
}

// MARK: - Thank You Sheet (#6)

struct ThankYouSheet: View {
    let campaignId: String
    @EnvironmentObject var i18n: I18n
    @Environment(\.dismiss) private var dismiss
    @State private var message = ""
    @State private var isLoading = false
    @State private var sentTo: Int? = nil
    @State private var errorMsg: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if let n = sentTo {
                    VStack(spacing: 16) {
                        Image(systemName: "envelope.badge.checkmark.rtl.fill")
                            .font(.system(size: 64))
                            .foregroundStyle(Color(red: 0.1, green: 0.6, blue: 0.4))
                        Text(i18n.language == .ja
                             ? "✅ \(n) 名の寄付者にメッセージを送りました！"
                             : "✅ Sent to \(n) donor\(n == 1 ? "" : "s")!")
                            .font(.headline)
                            .multilineTextAlignment(.center)
                        Button(i18n.language == .ja ? "閉じる" : "Done") { dismiss() }
                            .font(.headline)
                            .frame(maxWidth: .infinity).padding()
                            .background(Color(red: 0.1, green: 0.6, blue: 0.4))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .padding()
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(i18n.language == .ja
                             ? "寄付してくださった方々に感謝のメッセージを送りましょう。匿名の方を除いたすべての寄付者にメールでお届けします。"
                             : "Write a thank-you note to your donors. We'll email everyone who donated (except anonymous donors).")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        TextEditor(text: $message)
                            .frame(minHeight: 150)
                            .padding(8)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.secondary.opacity(0.25), lineWidth: 1))

                        if let err = errorMsg {
                            Text(err).font(.caption).foregroundStyle(.red)
                        }
                    }
                    .padding()

                    Button {
                        Task { await send() }
                    } label: {
                        HStack {
                            Spacer()
                            if isLoading { ProgressView().tint(.white) }
                            else {
                                Label(i18n.language == .ja ? "送信する" : "Send Message",
                                      systemImage: "paperplane.fill")
                                    .font(.headline)
                            }
                            Spacer()
                        }
                        .padding()
                        .background(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    ? Color.gray : Color(red: 0.1, green: 0.6, blue: 0.4))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
                    .padding(.horizontal)
                }
                Spacer()
            }
            .navigationTitle(i18n.language == .ja ? "お礼メッセージ" : "Thank-You Message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.language == .ja ? "閉じる" : "Close") { dismiss() }
                }
            }
        }
    }

    private func send() async {
        isLoading = true; errorMsg = nil
        defer { isLoading = false }
        do {
            let n = try await APIClient.shared.sendThankYou(campaignId: campaignId, message: message)
            sentTo = n
        } catch {
            errorMsg = error.localizedDescription
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
                            Text(i18n.language == .ja ? "最大\(cap) km" : "max \(cap) km").font(.caption).foregroundStyle(.secondary)
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
                         ? "このイベントに参加して、あなたの活動で寄付を集めましょう。寄付者があなたの走行距離に応じて寄付します。"
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

// MARK: - Social Share (#3 enhanced with share card)

private struct SocialShareSection: View {
    let campaign: Campaign
    let athleteId: String?
    @ObservedObject private var i18n = I18n.shared
    @State private var shareImage: UIImage? = nil
    @State private var showShareSheet = false

    private var donorURL: String {
        let base = "\(AppConfig.backendURL)/c/\(campaign.id)"
        if let aid = athleteId, !aid.isEmpty { return "\(base)?a=\(aid)" }
        return base
    }

    private var shareMessage: String {
        let title = i18n.pick(ja: campaign.titleJa, en: campaign.titleEn)
        return i18n.language == .ja
            ? "チャリアスのイベント「\(title)」に参加しています！ぜひ応援してください🏃‍♂️ \(donorURL) #チャリアス #チャリティ"
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

            // #3 — Share card button (renders a PNG for Instagram Stories / LINE etc.)
            Button {
                renderShareCard()
            } label: {
                HStack {
                    Image(systemName: "photo.on.rectangle.angled")
                    Text(i18n.language == .ja ? "シェア用カードを作成" : "Create Share Card")
                        .font(.subheadline.bold())
                }
                .frame(maxWidth: .infinity)
                .padding(10)
                .background(
                    LinearGradient(colors: [Color("BrandOrange"), Color("BrandRed")],
                                   startPoint: .leading, endPoint: .trailing)
                )
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .sheet(isPresented: $showShareSheet) {
                if let img = shareImage {
                    ShareSheet(items: [img, shareMessage])
                }
            }

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

    @MainActor
    private func renderShareCard() {
        let card = CampaignShareCard(campaign: campaign, donorURL: donorURL)
        let renderer = ImageRenderer(content: card)
        renderer.scale = UIScreen.main.scale
        if let img = renderer.uiImage {
            shareImage = img
            showShareSheet = true
        }
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

// MARK: - Campaign Share Card (rendered via ImageRenderer for #3)

private struct CampaignShareCard: View {
    let campaign: Campaign
    let donorURL: String
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top gradient header
            LinearGradient(
                colors: [Color("BrandOrange"), Color("BrandRed")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .frame(height: 12)

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "figure.run.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Color("BrandOrange"))
                    Text("チャリアス / Charity Athletes")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }

                Text(i18n.pick(ja: campaign.titleJa, en: campaign.titleEn))
                    .font(.title3.bold())
                    .lineLimit(2)

                if let np = campaign.nonprofits {
                    Label(i18n.pick(ja: np.nameJa, en: np.nameEn),
                          systemImage: "heart.fill")
                        .font(.subheadline)
                        .foregroundStyle(Color("BrandOrange"))
                }

                // Progress
                VStack(alignment: .leading, spacing: 4) {
                    SportProgressBar(progress: campaign.progress, sportTypes: campaign.sportTypes)
                    HStack {
                        Text("¥\(campaign.raisedAmountJpy.formatted())")
                            .font(.headline.bold())
                            .foregroundStyle(Color("BrandOrange"))
                        Text("/ ¥\(campaign.goalAmountJpy.formatted())")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("\(Int(campaign.progress * 100))%")
                            .font(.caption.bold())
                            .foregroundStyle(Color("BrandOrange"))
                    }
                }

                Divider()

                // QR placeholder text (can't render actual QR in ImageRenderer easily)
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(i18n.language == .ja ? "寄付はこちらから" : "Support this campaign")
                            .font(.caption.bold())
                        Text(donorURL)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer()
                }
            }
            .padding(20)
        }
        .background(Color(.systemBackground))
        .frame(width: 380)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 4)
    }
}

// MARK: - Share Sheet wrapper

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
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

// MARK: - Donor Pledge Section (creator only)

private struct DonorPledgeSection: View {
    let pledges: [DonorPledge]
    let isCreator: Bool
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(isCreator
                     ? (i18n.language == .ja ? "全寄付者一覧" : "All Donors")
                     : (i18n.language == .ja ? "あなたの寄付者" : "Your Donors"))
                    .font(.headline)
                Spacer()
                Text(i18n.language == .ja ? "\(pledges.count) 件" : "\(pledges.count) pledge(s)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if pledges.isEmpty {
                Text(i18n.language == .ja ? "まだ寄付者はいません" : "No donors yet")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 8)
            } else {
                ForEach(pledges.indices, id: \.self) { idx in
                    let p = pledges[idx]
                    VStack(spacing: 0) {
                        HStack(alignment: .top, spacing: 10) {
                            Text(p.statusIcon)
                                .font(.body)
                                .frame(width: 24)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.displayName)
                                    .font(.subheadline.bold())
                                    .lineLimit(1)
                                if p.isPerKm {
                                    Text("¥\(p.perKmRateJpy ?? 0)/km")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                } else {
                                    Text(i18n.language == .ja ? "定額寄付" : "Flat donation")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 2) {
                                if let charged = p.chargedAmountJpy, charged > 0 {
                                    Text("¥\(charged.formatted())")
                                        .font(.subheadline.bold())
                                        .foregroundStyle(Color("BrandOrange"))
                                } else if !p.isPerKm, let flat = p.flatAmountJpy {
                                    Text("¥\(flat.formatted())")
                                        .font(.subheadline.bold())
                                        .foregroundStyle(Color("BrandOrange"))
                                } else {
                                    Text(localizedStatus(p.status))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 8)

                        if idx < pledges.count - 1 {
                            Divider().padding(.leading, 34)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func localizedStatus(_ status: String) -> String {
        switch status {
        case "confirmed": return i18n.language == .ja ? "確定済み" : "Confirmed"
        case "pending":   return i18n.language == .ja ? "保留中" : "Pending"
        case "charged":   return i18n.language == .ja ? "請求済み" : "Charged"
        case "skipped":   return i18n.language == .ja ? "スキップ" : "Skipped"
        case "failed":    return i18n.language == .ja ? "失敗" : "Failed"
        default:          return status
        }
    }
}

// MARK: - Finalize Result Sheet

struct FinalizeResultSheet: View {
    let result: FinalizeResult
    @EnvironmentObject var i18n: I18n
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()

                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(Color("BrandOrange"))

                Text(i18n.language == .ja ? "イベント確定完了" : "Campaign Finalized")
                    .font(.title2.bold())

                VStack(spacing: 16) {
                    ResultRow(
                        icon: "figure.run",
                        label: i18n.language == .ja ? "合計距離" : "Total Distance",
                        value: String(format: "%.1f km", result.totalKm)
                    )
                    Divider()
                    ResultRow(
                        icon: "creditcard.fill",
                        label: i18n.language == .ja ? "請求成功" : "Successfully Charged",
                        value: i18n.language == .ja ? "\(result.charged) 件" : "\(result.charged) donor(s)",
                        valueColor: .green
                    )
                    if result.skipped > 0 {
                        Divider()
                        ResultRow(
                            icon: "exclamationmark.circle",
                            label: i18n.language == .ja ? "スキップ（¥50未満）" : "Skipped (< ¥50)",
                            value: i18n.language == .ja ? "\(result.skipped) 件" : "\(result.skipped) donor(s)",
                            valueColor: .secondary
                        )
                    }
                    if result.failed > 0 {
                        Divider()
                        ResultRow(
                            icon: "xmark.circle",
                            label: i18n.language == .ja ? "請求失敗" : "Failed",
                            value: i18n.language == .ja ? "\(result.failed) 件" : "\(result.failed) donor(s)",
                            valueColor: .red
                        )
                    }
                    Divider()
                    ResultRow(
                        icon: "yensign.circle.fill",
                        label: i18n.language == .ja ? "合計請求額" : "Total Charged",
                        value: "¥\(result.totalChargedJpy.formatted())",
                        valueColor: Color("BrandOrange"),
                        bold: true
                    )
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal)

                Spacer()

                Button {
                    dismiss()
                } label: {
                    Text(i18n.language == .ja ? "閉じる" : "Done")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color("BrandOrange"))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal)
                .padding(.bottom)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.language == .ja ? "閉じる" : "Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Sport Progress Bar

struct SportProgressBar: View {
    let progress: Double      // 0.0 – 1.0
    let sportTypes: [String]
    var compact: Bool = false // true → smaller icon for mini cards / rows

    private var iconD: CGFloat { compact ? 20 : 26 }
    private var barH: CGFloat  { compact ? 4  : 6  }

    private var iconName: String {
        for sport in sportTypes {
            switch sport {
            case "Ride", "VirtualRide": return "figure.outdoor.cycle"
            case "Run":                 return "figure.run"
            case "Walk":                return "figure.walk"
            case "Swim":                return "figure.pool.swim"
            default: break
            }
        }
        return "figure.mixed.cardio"
    }

    private var goalReached: Bool { progress >= 1.0 }
    private var iconColor: Color { goalReached ? Color(red: 0.85, green: 0.65, blue: 0.0) : Color("BrandOrange") }
    private var fillColor: Color { goalReached ? Color(red: 0.85, green: 0.65, blue: 0.0) : Color("BrandOrange") }

    var body: some View {
        GeometryReader { proxy in
            let clamped = min(max(progress, 0), 1)
            let w = proxy.size.width
            let r = iconD / 2
            // Clamp icon center so it never overflows the track edges
            let cx = min(max(clamped * w, r), w - r)

            ZStack(alignment: .topLeading) {
                // Grey track
                Capsule()
                    .fill(Color.gray.opacity(0.18))
                    .frame(width: w, height: barH)
                    .offset(y: (iconD - barH) / 2)

                // Fill — gold when goal reached
                Capsule()
                    .fill(fillColor)
                    .frame(width: cx, height: barH)
                    .offset(y: (iconD - barH) / 2)

                // Sport icon bubble — gold with glow + star badge when goal reached
                ZStack(alignment: .topTrailing) {
                    Circle()
                        .fill(iconColor)
                        .frame(width: iconD, height: iconD)
                        .overlay(
                            Image(systemName: iconName)
                                .font(.system(size: compact ? 10 : 13, weight: .semibold))
                                .foregroundStyle(.white)
                        )
                        .shadow(
                            color: goalReached
                                ? Color(red: 0.85, green: 0.65, blue: 0.0).opacity(0.7)
                                : Color("BrandOrange").opacity(0.4),
                            radius: goalReached ? 6 : 3,
                            x: 0, y: 2
                        )

                    // ⭐ badge when goal reached
                    if goalReached {
                        Image(systemName: "star.fill")
                            .font(.system(size: compact ? 7 : 9, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: compact ? 12 : 15, height: compact ? 12 : 15)
                            .background(Color(red: 0.85, green: 0.65, blue: 0.0))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Color.white, lineWidth: 1))
                            .offset(x: compact ? 4 : 5, y: compact ? -4 : -5)
                    }
                }
                .offset(x: cx - r)
            }
        }
        .frame(height: iconD)
    }
}

private struct ResultRow: View {
    let icon: String
    let label: String
    let value: String
    var valueColor: Color = .primary
    var bold: Bool = false

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(Color("BrandOrange"))
                .frame(width: 28)
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .fontWeight(bold ? .bold : .regular)
                .foregroundStyle(valueColor)
        }
        .font(.subheadline)
    }
}
