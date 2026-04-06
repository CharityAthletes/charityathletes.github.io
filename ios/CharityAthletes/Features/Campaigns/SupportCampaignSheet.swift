import SwiftUI

// MARK: - ViewModel

@MainActor
final class SupportCampaignVM: ObservableObject {
    enum Tab { case flat, perKm }

    // Athlete selection
    @Published var participants: [CampaignParticipant] = []
    @Published var selectedParticipant: CampaignParticipant?
    @Published var isLoadingParticipants = false

    // Tab selection (only shown when campaign supports both)
    @Published var tab: Tab

    // Flat donation
    @Published var flatAmountJpy: Int = 1000
    @Published var customFlatText: String = ""
    @Published var useCustomFlat: Bool = false

    // Per-km pledge
    @Published var perKmRateJpy: Int
    @Published var customRateText: String = ""
    @Published var useCustomRate: Bool = false

    // State
    @Published var isAnonymous: Bool = false
    @Published var isLoading = false
    @Published var error: String?
    @Published var pledgeSuccess = false
    @Published var checkoutURL: URL?

    let campaign: Campaign
    let donorName: String

    private let flatPresets  = [500, 1000, 2000, 5000]

    init(campaign: Campaign, donorName: String) {
        self.campaign  = campaign
        self.donorName = donorName
        // Default tab
        self.tab = campaign.hasPerKmDonation ? .perKm : .flat
        // Default per-km rate = first suggested rate or 50
        self.perKmRateJpy = campaign.suggestedPerKmJpy.first ?? 50
    }

    func loadParticipants() async {
        isLoadingParticipants = true
        defer { isLoadingParticipants = false }
        do {
            participants = try await APIClient.shared.getCampaignParticipants(id: campaign.id)
            if selectedParticipant == nil {
                selectedParticipant = participants.first
            }
        } catch { }
    }

    var flatPresetOptions: [Int] { flatPresets }

    var effectiveFlatAmount: Int {
        if useCustomFlat, let v = Int(customFlatText), v > 0 { return v }
        return flatAmountJpy
    }

    var effectiveRate: Int {
        if useCustomRate, let v = Int(customRateText), v > 0 { return v }
        return perKmRateJpy
    }

    var estimatedTotal: String? {
        guard let cap = campaign.maxDistanceKm else { return nil }
        let total = effectiveRate * cap
        return "¥\(total.formatted())"
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    func submitFlat() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        let amount = effectiveFlatAmount
        guard amount >= 50 else {
            error = "最低寄付額は¥50です / Minimum donation is ¥50"
            return
        }
        do {
            let session = try await APIClient.shared.manualDonate(campaignId: campaign.id, amountJpy: amount)
            if let url = URL(string: session.url) {
                checkoutURL = url
            }
        } catch let e {
            error = e.localizedDescription
        }
    }

    func submitPerKm() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            try await APIClient.shared.pledgeCampaign(
                id: campaign.id,
                perKmRateJpy: effectiveRate,
                donorName: donorName,
                isAnonymous: isAnonymous,
                athleteUserId: selectedParticipant?.userId
            )
            pledgeSuccess = true
        } catch let e {
            error = e.localizedDescription
        }
    }
}

// MARK: - Sheet View

struct SupportCampaignSheet: View {
    @StateObject private var vm: SupportCampaignVM
    @EnvironmentObject var i18n: I18n
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    init(campaign: Campaign, donorName: String) {
        _vm = StateObject(wrappedValue: SupportCampaignVM(campaign: campaign, donorName: donorName))
    }

    private var c: Campaign { vm.campaign }
    private var bothTypes: Bool { c.hasFlatDonation && c.hasPerKmDonation }

    var body: some View {
        NavigationStack {
            Group {
                if vm.pledgeSuccess {
                    pledgeSuccessView
                } else {
                    mainForm
                }
            }
            .navigationTitle(i18n.language == .ja ? "キャンペーンを応援" : "Support Campaign")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.language == .ja ? "閉じる" : "Close") { dismiss() }
                }
            }
        }
        .task { await vm.loadParticipants() }
        .onChange(of: vm.checkoutURL) { _, url in
            if let url {
                openURL(url)
                dismiss()
            }
        }
    }

    // ── Main form ─────────────────────────────────────────────────────────────

    private var mainForm: some View {
        ScrollView {
            VStack(spacing: 24) {

                // Campaign name
                VStack(spacing: 4) {
                    Image(systemName: "heart.circle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(Color("BrandOrange"))
                    Text(i18n.pick(ja: c.titleJa, en: c.titleEn))
                        .font(.headline)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 8)

                // Athlete picker (hidden when only one participant)
                if vm.participants.count > 1 {
                    athletePicker
                }

                // Tab picker (only when both types available)
                if bothTypes {
                    Picker("", selection: $vm.tab) {
                        Text(i18n.language == .ja ? "一回寄付" : "One-time").tag(SupportCampaignVM.Tab.flat)
                        Text(i18n.language == .ja ? "距離連動" : "Per-km Pledge").tag(SupportCampaignVM.Tab.perKm)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                }

                // Content
                if !c.hasFlatDonation {
                    perKmSection
                } else if !c.hasPerKmDonation {
                    flatSection
                } else {
                    // both
                    switch vm.tab {
                    case .flat:  flatSection
                    case .perKm: perKmSection
                    }
                }

                // Error
                if let err = vm.error {
                    Text(err)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
            }
            .padding(.bottom, 32)
        }
    }

    // ── Flat donation section ─────────────────────────────────────────────────

    private var flatSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(i18n.language == .ja
                 ? "寄付金額を選択してください"
                 : "Choose a donation amount")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            // Preset grid
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(vm.flatPresetOptions, id: \.self) { amount in
                    Button {
                        vm.flatAmountJpy = amount
                        vm.useCustomFlat = false
                    } label: {
                        Text("¥\(amount.formatted())")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(vm.flatAmountJpy == amount && !vm.useCustomFlat
                                        ? Color("BrandOrange") : Color(.secondarySystemBackground))
                            .foregroundStyle(vm.flatAmountJpy == amount && !vm.useCustomFlat
                                             ? .white : .primary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .padding(.horizontal)

            // Custom amount
            VStack(alignment: .leading, spacing: 6) {
                Text(i18n.language == .ja ? "金額を入力" : "Custom amount")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack {
                    Text("¥").foregroundStyle(.secondary)
                    TextField("0", text: $vm.customFlatText)
                        .keyboardType(.numberPad)
                        .onChange(of: vm.customFlatText) { _, _ in
                            vm.useCustomFlat = !vm.customFlatText.isEmpty
                        }
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(vm.useCustomFlat ? Color("BrandOrange") : Color.clear, lineWidth: 1.5)
                )
            }
            .padding(.horizontal)

            // Note about Stripe checkout
            Label(
                i18n.language == .ja
                    ? "Stripeの安全な決済ページに移動します"
                    : "You'll be taken to Stripe's secure checkout page",
                systemImage: "lock.fill"
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
            .padding(.horizontal)

            anonymousToggle
            actionButton(label: i18n.language == .ja ? "寄付する" : "Donate") {
                Task { await vm.submitFlat() }
            }
        }
    }

    // ── Per-km pledge section ─────────────────────────────────────────────────

    private var perKmSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(i18n.language == .ja
                     ? "1kmあたりの金額を選択"
                     : "Choose your pledge rate")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(i18n.language == .ja
                     ? "アスリートが走った距離に応じてキャンペーン終了時に請求されます"
                     : "You'll be charged based on the athlete's total distance when the campaign closes")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)

            // Suggested rate chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(c.suggestedPerKmJpy, id: \.self) { rate in
                        Button {
                            vm.perKmRateJpy = rate
                            vm.useCustomRate = false
                        } label: {
                            Text("¥\(rate)/km")
                                .font(.subheadline.bold())
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(vm.perKmRateJpy == rate && !vm.useCustomRate
                                            ? Color("BrandOrange") : Color(.secondarySystemBackground))
                                .foregroundStyle(vm.perKmRateJpy == rate && !vm.useCustomRate
                                                 ? .white : .primary)
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding(.horizontal)
            }

            // Custom rate
            VStack(alignment: .leading, spacing: 6) {
                Text(i18n.language == .ja ? "金額を入力" : "Custom rate")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack {
                    Text("¥").foregroundStyle(.secondary)
                    TextField("0", text: $vm.customRateText)
                        .keyboardType(.numberPad)
                        .onChange(of: vm.customRateText) { _, _ in
                            vm.useCustomRate = !vm.customRateText.isEmpty
                        }
                    Text("/km").foregroundStyle(.secondary)
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(vm.useCustomRate ? Color("BrandOrange") : Color.clear, lineWidth: 1.5)
                )
            }
            .padding(.horizontal)

            // Estimated total (if max distance cap set)
            if let est = vm.estimatedTotal, let cap = c.maxDistanceKm {
                HStack {
                    Image(systemName: "info.circle")
                        .foregroundStyle(Color("BrandOrange"))
                    Text(i18n.language == .ja
                         ? "距離上限 \(cap) km — 最大請求額 \(est)"
                         : "Distance cap \(cap) km — max charge \(est)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)
            }

            // Card note
            Label(
                i18n.language == .ja
                    ? "プロフィールに保存済みのカードで請求されます"
                    : "Your saved card on file will be charged when the campaign ends",
                systemImage: "creditcard"
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
            .padding(.horizontal)

            anonymousToggle
            actionButton(label: i18n.language == .ja ? "プレッジする" : "Pledge") {
                Task { await vm.submitPerKm() }
            }
        }
    }

    // ── Athlete picker ────────────────────────────────────────────────────────

    private var athletePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(i18n.language == .ja ? "応援するアスリートを選択" : "Choose an athlete to support")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(vm.participants) { p in
                        Button {
                            vm.selectedParticipant = p
                        } label: {
                            Text(p.displayName)
                                .font(.subheadline.bold())
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(vm.selectedParticipant?.userId == p.userId
                                            ? Color("BrandOrange") : Color(.secondarySystemBackground))
                                .foregroundStyle(vm.selectedParticipant?.userId == p.userId
                                                 ? .white : .primary)
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    // ── Anonymous toggle ──────────────────────────────────────────────────────

    private var anonymousToggle: some View {
        Toggle(isOn: $vm.isAnonymous) {
            VStack(alignment: .leading, spacing: 2) {
                Text(i18n.language == .ja ? "匿名で寄付する" : "Donate anonymously")
                    .font(.subheadline)
                Text(i18n.language == .ja
                     ? "キャンペーン作成者にお名前は表示されません"
                     : "Your name won't be shown to the campaign creator")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .tint(Color("BrandOrange"))
        .padding(.horizontal)
    }

    // ── Shared action button ──────────────────────────────────────────────────

    @ViewBuilder
    private func actionButton(label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Spacer()
                if vm.isLoading { ProgressView().tint(.white) }
                else { Text(label).font(.headline).bold() }
                Spacer()
            }
            .padding()
            .background(Color("BrandOrange"))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(vm.isLoading)
        .padding(.horizontal)
    }

    // ── Success view ──────────────────────────────────────────────────────────

    private var pledgeSuccessView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.green)

            VStack(spacing: 8) {
                Text(i18n.language == .ja ? "プレッジ完了！" : "Pledge confirmed!")
                    .font(.title2.bold())
                Text(i18n.language == .ja
                     ? "¥\(vm.effectiveRate)/km のプレッジを登録しました。\nキャンペーン終了時にカードに請求されます。"
                     : "Your pledge of ¥\(vm.effectiveRate)/km has been saved.\nYour card will be charged when the campaign ends.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

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
    }
}
