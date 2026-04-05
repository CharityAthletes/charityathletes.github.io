import SwiftUI

@MainActor
final class CreateCampaignVM: ObservableObject {
    @Published var nonprofits: [Nonprofit] = []
    @Published var selectedNonprofitId: String = ""

    @Published var titleJa: String = ""
    @Published var titleEn: String = ""
    @Published var descriptionJa: String = ""
    @Published var descriptionEn: String = ""

    @Published var sportTypes: Set<String> = ["Ride"]

    @Published var flatEnabled: Bool = true
    @Published var perKmEnabled: Bool = false
    @Published var maxDistanceKm: String = "100"
    @Published var suggestedRates: Set<Int> = [10, 20, 50]

    @Published var goalAmount: String = ""
    @Published var endDate: Date = Calendar.current.date(byAdding: .day, value: 90, to: Date()) ?? Date()
    @Published var isPublic: Bool = false

    @Published var isLoading = false
    @Published var error: String?
    @Published var created = false

    private let isoFmt: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    func loadNonprofits() async {
        do {
            nonprofits = try await APIClient.shared.getNonprofits()
            if selectedNonprofitId.isEmpty, let first = nonprofits.first {
                selectedNonprofitId = first.id
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func submit() async {
        guard !selectedNonprofitId.isEmpty else { error = "非営利団体を選択してください"; return }
        guard !titleJa.isEmpty else { error = "タイトルを入力してください"; return }
        guard flatEnabled || perKmEnabled else { error = "寄付タイプを1つ以上選択してください"; return }
        guard !sportTypes.isEmpty else { error = "スポーツタイプを選択してください"; return }

        let maxKm = perKmEnabled ? (Int(maxDistanceKm) ?? 100) : nil
        let goal = Int(goalAmount) ?? 0
        let rates = suggestedRates.isEmpty ? [10, 20, 50] : Array(suggestedRates).sorted()

        isLoading = true; error = nil
        defer { isLoading = false }

        let req = CreateCampaignRequest(
            nonprofitId:      selectedNonprofitId,
            titleJa:          titleJa,
            titleEn:          titleEn.isEmpty ? titleJa : titleEn,
            descriptionJa:    descriptionJa,
            descriptionEn:    descriptionEn.isEmpty ? descriptionJa : descriptionEn,
            sportTypes:       Array(sportTypes),
            hasFlatDonation:  flatEnabled,
            hasPerKmDonation: perKmEnabled,
            maxDistanceKm:    maxKm,
            suggestedPerKmJpy: rates,
            donorboxCampaignId: "",
            startDate:        isoFmt.string(from: Date()),
            endDate:          isoFmt.string(from: endDate),
            goalAmountJpy:    goal,
            isPublic:         isPublic
        )

        do {
            _ = try await APIClient.shared.createCampaign(req)
            created = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct CreateCampaignView: View {
    @StateObject private var vm = CreateCampaignVM()
    @EnvironmentObject var i18n: I18n
    @Environment(\.dismiss) var dismiss

    @State private var showPublicConfirm = false

    private let allSports = ["Ride", "VirtualRide", "Run", "Walk", "Swim"]
    private let rateOptions = [5, 10, 20, 50, 100]

    var body: some View {
        NavigationStack {
            Form {

                // Nonprofit picker
                Section(header: Text(i18n.language == .ja ? "寄付先の非営利団体" : "Beneficiary Nonprofit")) {
                    if vm.nonprofits.isEmpty {
                        ProgressView()
                    } else {
                        Picker(i18n.language == .ja ? "団体を選択" : "Select nonprofit",
                               selection: $vm.selectedNonprofitId) {
                            ForEach(vm.nonprofits) { np in
                                Text(i18n.pick(ja: np.nameJa, en: np.nameEn)).tag(np.id)
                            }
                        }
                    }
                }

                // Title
                Section(header: Text(i18n.language == .ja ? "キャンペーン名" : "Campaign Title")) {
                    TextField(i18n.language == .ja ? "タイトル（日本語）" : "Title (Japanese)", text: $vm.titleJa)
                    TextField(i18n.language == .ja ? "タイトル（英語・任意）" : "Title (English, optional)", text: $vm.titleEn)
                }

                // Description
                Section(header: Text(i18n.language == .ja ? "説明（任意）" : "Description (optional)")) {
                    TextField(i18n.language == .ja ? "説明（日本語）" : "Description (Japanese)",
                              text: $vm.descriptionJa, axis: .vertical).lineLimit(3...5)
                    TextField(i18n.language == .ja ? "説明（英語）" : "Description (English)",
                              text: $vm.descriptionEn, axis: .vertical).lineLimit(3...5)
                }

                // Sport types
                Section(header: Text(i18n.language == .ja ? "対象スポーツ" : "Sport Types")) {
                    ForEach(allSports, id: \.self) { sport in
                        Toggle(sportLabel(sport), isOn: Binding(
                            get: { vm.sportTypes.contains(sport) },
                            set: { on in
                                if on { vm.sportTypes.insert(sport) }
                                else  { vm.sportTypes.remove(sport) }
                            }
                        )).tint(Color("BrandOrange"))
                    }
                }

                // Donation types
                Section(header: Text(i18n.language == .ja ? "寄付の方法" : "Donation Types"),
                        footer: Text(i18n.language == .ja
                            ? "ドナーが金額を自由に選択できます"
                            : "Donors choose their own amounts")) {

                    // Flat donation toggle
                    Toggle(isOn: $vm.flatEnabled) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(i18n.language == .ja ? "定額寄付" : "Flat Donation")
                                .font(.body)
                            Text(i18n.language == .ja
                                 ? "ドナーが1回あたりの金額を選択"
                                 : "Donor picks amount per activity")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }.tint(Color("BrandOrange"))

                    // Per-km donation toggle
                    Toggle(isOn: $vm.perKmEnabled) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(i18n.language == .ja ? "距離連動寄付" : "Per-km Donation")
                                .font(.body)
                            Text(i18n.language == .ja
                                 ? "ドナーが1kmあたりの金額を選択"
                                 : "Donor picks rate per km")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }.tint(Color("BrandOrange"))
                }

                // Per-km settings
                if vm.perKmEnabled {
                    Section(header: Text(i18n.language == .ja ? "距離連動の設定" : "Per-km Settings"),
                            footer: Text(i18n.language == .ja
                                ? "上限距離を設定するとドナーの負担が予測しやすくなります"
                                : "A distance cap helps donors know their maximum contribution")) {

                        HStack {
                            Text(i18n.language == .ja ? "最大距離（km上限）" : "Max distance cap (km)")
                            Spacer()
                            TextField("100", text: $vm.maxDistanceKm)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 80)
                            Text("km")
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text(i18n.language == .ja ? "推奨レート（ドナーに表示）" : "Suggested rates (shown to donors)")
                                .font(.caption).foregroundStyle(.secondary)
                            HStack(spacing: 8) {
                                ForEach(rateOptions, id: \.self) { rate in
                                    let selected = vm.suggestedRates.contains(rate)
                                    Button("¥\(rate)/km") {
                                        if selected { vm.suggestedRates.remove(rate) }
                                        else        { vm.suggestedRates.insert(rate) }
                                    }
                                    .buttonStyle(.plain)
                                    .font(.caption.bold())
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(selected ? Color("BrandOrange") : Color(.secondarySystemBackground))
                                    .foregroundStyle(selected ? .white : Color("BrandOrange"))
                                    .clipShape(Capsule())
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                // Goal & end date
                Section(header: Text(i18n.language == .ja ? "目標と期間" : "Goal & Duration")) {
                    HStack {
                        Text(i18n.language == .ja ? "目標金額（任意）¥" : "Fundraising goal (optional) ¥")
                        Spacer()
                        TextField("0", text: $vm.goalAmount)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 100)
                    }
                    DatePicker(i18n.language == .ja ? "終了日" : "End date",
                               selection: $vm.endDate,
                               in: Date()...,
                               displayedComponents: .date)
                        .tint(Color("BrandOrange"))
                }

                // Visibility
                Section(header: Text(i18n.language == .ja ? "公開設定" : "Visibility"),
                        footer: Text(vm.isPublic
                            ? (i18n.language == .ja
                                ? "このキャンペーンはアプリ内のすべてのユーザーに表示されます。"
                                : "This campaign is visible to all users in the app.")
                            : (i18n.language == .ja
                                ? "非公開です。シェアリンクを知っている人だけが閲覧できます。"
                                : "Private. Only people with your share link can view it."))) {
                    Toggle(isOn: Binding(
                        get: { vm.isPublic },
                        set: { newValue in
                            if newValue {
                                showPublicConfirm = true   // ask first
                            } else {
                                vm.isPublic = false
                            }
                        }
                    )) {
                        HStack(spacing: 10) {
                            Image(systemName: vm.isPublic ? "globe" : "lock.fill")
                                .foregroundStyle(vm.isPublic ? Color("BrandOrange") : .secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(vm.isPublic
                                     ? (i18n.language == .ja ? "公開" : "Public")
                                     : (i18n.language == .ja ? "非公開" : "Private"))
                                    .font(.body)
                                Text(vm.isPublic
                                     ? (i18n.language == .ja ? "キャンペーン一覧に表示" : "Shown in community feed")
                                     : (i18n.language == .ja ? "リンクでのみ共有" : "Share via link only"))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .tint(Color("BrandOrange"))
                }
                .confirmationDialog(
                    i18n.language == .ja ? "公開しますか？" : "Make it public?",
                    isPresented: $showPublicConfirm,
                    titleVisibility: .visible
                ) {
                    Button(i18n.language == .ja ? "公開する" : "Make Public", role: .destructive) {
                        vm.isPublic = true
                    }
                    Button(i18n.language == .ja ? "キャンセル" : "Cancel", role: .cancel) { }
                } message: {
                    Text(i18n.language == .ja
                         ? "公開すると、このアプリのすべてのユーザーにキャンペーンが表示されます。"
                         : "Are you sure you want to make it public? All users of this app will be able to see this campaign.")
                }

                // Error
                if let err = vm.error {
                    Section { Text(err).foregroundStyle(.red).font(.caption) }
                }

                // Submit
                Section {
                    Button {
                        Task { await vm.submit() }
                    } label: {
                        HStack {
                            Spacer()
                            if vm.isLoading { ProgressView() }
                            else {
                                Text(i18n.language == .ja ? "キャンペーンを作成" : "Create Campaign")
                                    .bold().foregroundStyle(Color("BrandOrange"))
                            }
                            Spacer()
                        }
                    }
                    .disabled(vm.isLoading || (!vm.flatEnabled && !vm.perKmEnabled))
                }
            }
            .navigationTitle(i18n.language == .ja ? "キャンペーン作成" : "Create Campaign")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.t(.commonCancel)) { dismiss() }
                }
            }
            .task { await vm.loadNonprofits() }
            .onChange(of: vm.created) { _, isCreated in
                if isCreated { dismiss() }
            }
        }
    }

    private func sportLabel(_ sport: String) -> String {
        switch sport {
        case "Ride":        return i18n.language == .ja ? "サイクリング" : "Cycling"
        case "VirtualRide": return i18n.language == .ja ? "バーチャルライド" : "Virtual Ride"
        case "Run":         return i18n.language == .ja ? "ランニング" : "Running"
        case "Walk":        return i18n.language == .ja ? "ウォーキング" : "Walking"
        case "Swim":        return i18n.language == .ja ? "スイミング" : "Swimming"
        default:            return sport
        }
    }
}
