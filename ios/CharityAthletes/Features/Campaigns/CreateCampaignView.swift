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
    @Published var startDate: Date = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @Published var endDate: Date = Calendar.current.date(byAdding: .day, value: 90, to: Date()) ?? Date()
    @Published var isPublic: Bool = false

    @Published var isLoading = false
    @Published var error: String?
    @Published var created = false

    // #14 — Goal auto-calculation
    /// Estimated km over the campaign based on sport type and duration
    var suggestedGoal: Int? {
        let days = Calendar.current.dateComponents([.day], from: startDate, to: endDate).day ?? 0
        guard days > 0, !sportTypes.isEmpty else { return nil }
        // Typical daily km estimates per sport
        let dailyKm: Double
        if sportTypes.contains("Ride") || sportTypes.contains("VirtualRide") {
            dailyKm = 15
        } else if sportTypes.contains("Run") {
            dailyKm = 5
        } else if sportTypes.contains("Swim") {
            dailyKm = 2
        } else {
            dailyKm = 4
        }
        let estimatedKm = dailyKm * Double(days) * 0.5 // assume ~50% activity rate
        let rateJpy = Double(suggestedRates.min() ?? 20)
        let goal = Int((estimatedKm * rateJpy / 1000).rounded()) * 1000
        return max(goal, 5000)
    }

    /// Human-readable explanation for the suggestion footer
    var goalSuggestion: String? {
        guard let g = suggestedGoal else { return nil }
        let days = Calendar.current.dateComponents([.day], from: startDate, to: endDate).day ?? 0
        let i18n = I18n.shared
        if i18n.language == .ja {
            return "¥\(g.formatted()) を提案（\(days)日間 × 推定走行距離に基づく）"
        } else {
            return "Suggested ¥\(g.formatted()) based on \(days)-day campaign & estimated km"
        }
    }

    // Format a date as local-day start/end with the device's actual timezone offset
    // e.g. "2026-04-30T23:59:59+10:00" so iOS decodes it back as April 30 locally
    private func localDayString(_ date: Date, endOfDay: Bool) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        let y = c.year!, m = c.month!, d = c.day!
        let offset = TimeZone.current.secondsFromGMT()
        let sign = offset >= 0 ? "+" : "-"
        let h = abs(offset) / 3600
        let min = (abs(offset) % 3600) / 60
        let tz = String(format: "%@%02d:%02d", sign, h, min)
        return endOfDay
            ? String(format: "%04d-%02d-%02dT23:59:59\(tz)", y, m, d)
            : String(format: "%04d-%02d-%02dT00:00:00\(tz)", y, m, d)
    }

    func loadNonprofits() async {
        do {
            nonprofits = try await APIClient.shared.getNonprofits()
            if selectedNonprofitId.isEmpty {
                // Default to Cycling for Charity, fall back to first
                let preferred = nonprofits.first { $0.nameEn.lowercased().contains("cycling") }
                selectedNonprofitId = (preferred ?? nonprofits.first)?.id ?? ""
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
            startDate:        localDayString(startDate, endOfDay: false),
            endDate:          localDayString(endDate, endOfDay: true),
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
                Section(header: Text(i18n.language == .ja ? "イベント名" : "Campaign Title")) {
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
                            ? "寄付者が金額を自由に選択できます"
                            : "Donors choose their own amounts")) {

                    // Flat donation toggle
                    Toggle(isOn: $vm.flatEnabled) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(i18n.language == .ja ? "定額寄付" : "Flat Donation")
                                .font(.body)
                            Text(i18n.language == .ja
                                 ? "寄付者が1回あたりの金額を選択"
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
                                 ? "寄付者が1kmあたりの金額を選択"
                                 : "Donor picks rate per km")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }.tint(Color("BrandOrange"))
                }

                // Per-km settings
                if vm.perKmEnabled {
                    Section(header: Text(i18n.language == .ja ? "距離連動の設定" : "Per-km Settings"),
                            footer: Text(i18n.language == .ja
                                ? "上限距離を設定すると寄付者の負担が予測しやすくなります"
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
                            Text(i18n.language == .ja ? "推奨レート（寄付者に表示）" : "Suggested rates (shown to donors)")
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

                // Goal & date range
                Section(header: Text(i18n.language == .ja ? "目標と期間" : "Goal & Duration"),
                        footer: vm.goalSuggestion.map { s in
                            HStack(spacing: 4) {
                                Image(systemName: "lightbulb.fill").foregroundStyle(.yellow)
                                Text(s).font(.caption)
                            }
                        }) {
                    HStack {
                        Text(i18n.language == .ja ? "目標金額（任意）¥" : "Fundraising goal (optional) ¥")
                        Spacer()
                        TextField("0", text: $vm.goalAmount)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 100)
                        // #14 — suggest button
                        Button {
                            if let s = vm.suggestedGoal { vm.goalAmount = String(s) }
                        } label: {
                            Text(i18n.language == .ja ? "提案" : "Suggest")
                                .font(.caption.bold())
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(Color("BrandOrange").opacity(0.15))
                                .foregroundStyle(Color("BrandOrange"))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                    DatePicker(i18n.language == .ja ? "開始日" : "Start date",
                               selection: $vm.startDate,
                               in: Calendar.current.date(byAdding: .day, value: 1, to: Date())!...,
                               displayedComponents: .date)
                        .tint(Color("BrandOrange"))
                        .onChange(of: vm.startDate) { _, newStart in
                            // Keep end date after start date
                            if vm.endDate <= newStart {
                                vm.endDate = Calendar.current.date(byAdding: .day, value: 1, to: newStart) ?? newStart
                            }
                        }
                    DatePicker(i18n.language == .ja ? "終了日" : "End date",
                               selection: $vm.endDate,
                               in: Calendar.current.date(byAdding: .day, value: 1, to: vm.startDate)!...,
                               displayedComponents: .date)
                        .tint(Color("BrandOrange"))
                }

                // Visibility
                Section(header: Text(i18n.language == .ja ? "公開設定" : "Visibility"),
                        footer: Text(vm.isPublic
                            ? (i18n.language == .ja
                                ? "このイベントはアプリ内のすべてのユーザーに表示されます。"
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
                                     ? (i18n.language == .ja ? "イベント一覧に表示" : "Shown in community feed")
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
                         ? "公開すると、このアプリのすべてのユーザーにイベントが表示されます。"
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
                                Text(i18n.language == .ja ? "イベントを作成" : "Create Campaign")
                                    .bold().foregroundStyle(Color("BrandOrange"))
                            }
                            Spacer()
                        }
                    }
                    .disabled(vm.isLoading || (!vm.flatEnabled && !vm.perKmEnabled))
                }
            }
            .navigationTitle(i18n.language == .ja ? "イベント作成" : "Create Campaign")
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
