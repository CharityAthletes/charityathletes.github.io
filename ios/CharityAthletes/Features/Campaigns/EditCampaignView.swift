import SwiftUI

@MainActor
final class EditCampaignVM: ObservableObject {
    @Published var titleJa: String
    @Published var titleEn: String
    @Published var descriptionJa: String
    @Published var descriptionEn: String
    @Published var startDate: Date
    @Published var endDate: Date
    @Published var goalAmountJpy: String
    @Published var maxDistanceKm: String
    @Published var isPublic: Bool

    @Published var isSaving = false
    @Published var error: String?
    @Published var savedCampaign: Campaign?

    private let campaignId: String

    init(campaign: Campaign) {
        self.campaignId     = campaign.id
        self.titleJa        = campaign.titleJa
        self.titleEn        = campaign.titleEn
        self.descriptionJa  = campaign.descriptionJa
        self.descriptionEn  = campaign.descriptionEn
        self.startDate      = campaign.startDate
        self.endDate        = campaign.endDate
        self.goalAmountJpy  = campaign.goalAmountJpy > 0 ? String(campaign.goalAmountJpy) : ""
        self.maxDistanceKm  = campaign.maxDistanceKm.map { String($0) } ?? ""
        self.isPublic       = campaign.isPublic
    }

    func save() async {
        isSaving = true; error = nil
        defer { isSaving = false }

        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime]

        let body = UpdateCampaignRequest(
            titleJa:        titleJa.isEmpty ? nil : titleJa,
            titleEn:        titleEn.isEmpty ? nil : titleEn,
            descriptionJa:  descriptionJa,
            descriptionEn:  descriptionEn,
            startDate:      fmt.string(from: startDate),
            endDate:        fmt.string(from: endDate),
            goalAmountJpy:  Int(goalAmountJpy),
            isPublic:       isPublic,
            maxDistanceKm:  maxDistanceKm.isEmpty ? nil : Int(maxDistanceKm)
        )

        do {
            let updated = try await APIClient.shared.updateCampaign(id: campaignId, body: body)
            savedCampaign = updated
        } catch let e {
            error = e.localizedDescription
        }
    }
}

struct EditCampaignView: View {
    @StateObject private var vm: EditCampaignVM
    @EnvironmentObject var i18n: I18n
    @Environment(\.dismiss) private var dismiss

    var onSaved: (Campaign) -> Void = { _ in }

    init(campaign: Campaign, onSaved: @escaping (Campaign) -> Void = { _ in }) {
        _vm = StateObject(wrappedValue: EditCampaignVM(campaign: campaign))
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text(i18n.language == .ja ? "タイトル" : "Title")) {
                    LabeledContent("日本語") {
                        TextField("タイトル（日本語）", text: $vm.titleJa)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("English") {
                        TextField("Title (English)", text: $vm.titleEn)
                            .multilineTextAlignment(.trailing)
                    }
                }

                Section(header: Text(i18n.language == .ja ? "説明" : "Description")) {
                    TextField(
                        i18n.language == .ja ? "説明（日本語）" : "Description (Japanese)",
                        text: $vm.descriptionJa,
                        axis: .vertical
                    )
                    .lineLimit(4...)
                    TextField(
                        i18n.language == .ja ? "説明（英語）" : "Description (English)",
                        text: $vm.descriptionEn,
                        axis: .vertical
                    )
                    .lineLimit(4...)
                }

                Section(header: Text(i18n.language == .ja ? "キャンペーン期間" : "Campaign Period")) {
                    DatePicker(
                        i18n.language == .ja ? "開始日" : "Start Date",
                        selection: $vm.startDate,
                        displayedComponents: [.date]
                    )
                    .tint(Color("BrandOrange"))
                    .onChange(of: vm.startDate) { _, newStart in
                        if vm.endDate <= newStart {
                            vm.endDate = Calendar.current.date(byAdding: .day, value: 1, to: newStart) ?? newStart
                        }
                    }
                    DatePicker(
                        i18n.language == .ja ? "終了日" : "End Date",
                        selection: $vm.endDate,
                        in: Calendar.current.date(byAdding: .day, value: 1, to: vm.startDate)!...,
                        displayedComponents: [.date]
                    )
                    .tint(Color("BrandOrange"))
                }

                Section(header: Text(i18n.language == .ja ? "目標金額" : "Fundraising Goal")) {
                    HStack {
                        Text("¥")
                        TextField("0", text: $vm.goalAmountJpy)
                            .keyboardType(.numberPad)
                    }
                }

                Section(
                    header: Text(i18n.language == .ja ? "距離上限（km）" : "Distance Cap (km)"),
                    footer: Text(i18n.language == .ja
                        ? "ドナーへの請求に使う距離の上限。空白にすると上限なし。"
                        : "Maximum km used to calculate per-km donor charges. Leave blank for no cap.")
                        .font(.caption)
                ) {
                    HStack {
                        TextField(i18n.language == .ja ? "例: 100" : "e.g. 100", text: $vm.maxDistanceKm)
                            .keyboardType(.numberPad)
                        Text("km").foregroundStyle(.secondary)
                    }
                }

                Section(header: Text(i18n.language == .ja ? "公開設定" : "Visibility")) {
                    Toggle(
                        i18n.language == .ja ? "公開する（誰でも参加可能）" : "Public (anyone can join)",
                        isOn: $vm.isPublic
                    )
                    .tint(Color("BrandOrange"))
                }

                if let err = vm.error {
                    Section {
                        Text(err).foregroundStyle(.red).font(.caption)
                    }
                }
            }
            .navigationTitle(i18n.language == .ja ? "キャンペーンを編集" : "Edit Campaign")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.language == .ja ? "キャンセル" : "Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if vm.isSaving {
                        ProgressView()
                    } else {
                        Button(i18n.language == .ja ? "保存" : "Save") {
                            Task { await vm.save() }
                        }
                        .fontWeight(.semibold)
                    }
                }
            }
            .onChange(of: vm.savedCampaign) { _, updated in
                if let updated {
                    onSaved(updated)
                    dismiss()
                }
            }
        }
    }
}
