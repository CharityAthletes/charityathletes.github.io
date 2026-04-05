import SwiftUI

// MARK: - CharityDirectoryView

struct CharityDirectoryView: View {
    @EnvironmentObject var i18n: I18n

    @State private var charities:  [Charity] = []
    @State private var isLoading   = true
    @State private var searchText  = ""
    @State private var selectedCat: String? = nil
    @State private var showRequest = false

    private let categories = ["Health", "Education", "Environment",
                               "Community", "Animal Welfare", "Disaster Relief"]

    private var filtered: [Charity] {
        charities.filter { c in
            let matchesCat = selectedCat == nil || c.category == selectedCat
            let q = searchText.lowercased()
            let matchesQ = q.isEmpty || c.nameEn.lowercased().contains(q)
                || (c.nameJa ?? "").contains(q)
                || (c.descriptionEn ?? "").lowercased().contains(q)
                || (c.category ?? "").lowercased().contains(q)
            return matchesCat && matchesQ
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // ── Search bar ─────────────────────────────────────────────
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField(i18n.language == .ja ? "名前・カテゴリで検索" : "Search charities…",
                              text: $searchText)
                        .autocorrectionDisabled()
                }
                .padding(10)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal)
                .padding(.top, 8)
                .padding(.bottom, 6)

                // ── Category pills ─────────────────────────────────────────
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        CategoryPill(
                            label: i18n.language == .ja ? "すべて" : "All",
                            isSelected: selectedCat == nil,
                            action: { selectedCat = nil }
                        )
                        ForEach(categories, id: \.self) { cat in
                            CategoryPill(
                                label: cat,
                                isSelected: selectedCat == cat,
                                action: { selectedCat = selectedCat == cat ? nil : cat }
                            )
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 8)
                }

                Divider()

                // ── Content ────────────────────────────────────────────────
                if isLoading {
                    Spacer()
                    ProgressView()
                    Spacer()
                } else if filtered.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").font(.largeTitle)
                            .foregroundStyle(.tertiary)
                        Text(i18n.language == .ja ? "該当する団体が見つかりませんでした" : "No charities found")
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            Text("\(filtered.count) " + (i18n.language == .ja ? "団体" : "organization\(filtered.count == 1 ? "" : "s")"))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal)
                                .padding(.top, 8)

                            ForEach(filtered) { charity in
                                CharityCard(charity: charity)
                                    .padding(.horizontal)
                            }
                            Spacer(minLength: 20)
                        }
                    }
                }
            }
            .navigationTitle(i18n.language == .ja ? "チャリティ一覧" : "Charity Directory")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showRequest = true
                    } label: {
                        Label(i18n.language == .ja ? "申請" : "Request",
                              systemImage: "plus.circle")
                    }
                }
            }
            .sheet(isPresented: $showRequest) {
                CharityRequestView()
                    .environmentObject(i18n)
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        isLoading = true
        if let result = try? await APIClient.shared.getCharities() {
            charities = result
        }
        isLoading = false
    }
}

// MARK: - Category Pill

private struct CategoryPill: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption).fontWeight(.medium)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(isSelected ? Color("BrandOrange") : Color(.systemGray6))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
    }
}

// MARK: - CharityCard

private struct CharityCard: View {
    let charity: Charity
    @EnvironmentObject var i18n: I18n

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header row
            HStack(spacing: 12) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(Color(hex: charity.categoryColor.bg))
                        .frame(width: 44, height: 44)
                    Text(charity.initials)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: charity.categoryColor.text))
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(charity.nameEn)
                            .font(.subheadline).bold()
                            .lineLimit(1)
                        if charity.isFeatured == true {
                            Text("Featured")
                                .font(.system(size: 10, weight: .semibold))
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color(hex: "#E1F5EE"))
                                .foregroundStyle(Color(hex: "#0F6E56"))
                                .clipShape(Capsule())
                        }
                    }
                    if let ja = charity.nameJa {
                        Text(ja)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }

            // Description
            if let desc = i18n.language == .ja ? (charity.descriptionJa ?? charity.descriptionEn) : charity.descriptionEn,
               !desc.isEmpty {
                Text(desc)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            // Footer: badge + links
            HStack {
                if let cat = charity.category {
                    Text(cat)
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color(hex: charity.categoryColor.bg))
                        .foregroundStyle(Color(hex: charity.categoryColor.text))
                        .clipShape(Capsule())
                }
                Spacer()
                HStack(spacing: 12) {
                    if let web = charity.websiteUrl, let url = URL(string: web) {
                        Link(destination: url) {
                            Text(i18n.language == .ja ? "ウェブサイト" : "Website")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if let db = charity.donorboxUrl, let url = URL(string: db) {
                        Link(destination: url) {
                            Text("Donate ❤️")
                                .font(.caption).fontWeight(.semibold)
                                .foregroundStyle(Color(hex: "#0F6E56"))
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 2)
    }
}

// MARK: - CharityRequestView

struct CharityRequestView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var i18n: I18n

    @State private var orgName     = ""
    @State private var donorboxUrl = ""
    @State private var websiteUrl  = ""
    @State private var category    = ""
    @State private var reason      = ""
    @State private var submittedBy = ""
    @State private var isSubmitting = false
    @State private var errorMsg: String?
    @State private var submitted   = false

    private let categories = ["Health", "Education", "Environment",
                               "Community", "Animal Welfare", "Disaster Relief"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(i18n.language == .ja
                         ? "DonorBoxに登録済みの団体のみ申請できます。"
                         : "The org must have an active DonorBox profile to be considered.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section(i18n.language == .ja ? "必須情報" : "Required") {
                    TextField(i18n.language == .ja ? "団体名" : "Organization name", text: $orgName)
                    TextField("DonorBox URL (https://donorbox.org/…)", text: $donorboxUrl)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Picker(i18n.language == .ja ? "カテゴリ" : "Category",
                           selection: $category) {
                        Text(i18n.language == .ja ? "選択してください" : "Select…").tag("")
                        ForEach(categories, id: \.self) { Text($0).tag($0) }
                    }
                }

                Section(i18n.language == .ja ? "任意情報" : "Optional") {
                    TextField(i18n.language == .ja ? "ウェブサイト" : "Website URL", text: $websiteUrl)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    TextField(i18n.language == .ja ? "支援すべき理由" : "Why should athletes support this org?",
                              text: $reason, axis: .vertical)
                        .lineLimit(3...6)
                    TextField(i18n.language == .ja ? "あなたの名前 / プロフィール" : "Your name or athlete profile",
                              text: $submittedBy)
                }

                if let err = errorMsg {
                    Section {
                        Label(err, systemImage: "exclamationmark.circle")
                            .foregroundStyle(.red).font(.caption)
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack {
                            Spacer()
                            if isSubmitting { ProgressView() }
                            else {
                                Text(i18n.language == .ja ? "申請する" : "Submit Request")
                                    .bold()
                                    .foregroundStyle(isValid ? Color("BrandOrange") : .gray)
                            }
                            Spacer()
                        }
                    }
                    .disabled(isSubmitting || !isValid)
                }
            }
            .navigationTitle(i18n.language == .ja ? "団体を申請する" : "Request an Org")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.language == .ja ? "キャンセル" : "Cancel") { dismiss() }
                }
            }
            .alert(i18n.language == .ja ? "申請完了！" : "Request Submitted!",
                   isPresented: $submitted) {
                Button("OK") { dismiss() }
            } message: {
                Text(i18n.language == .ja
                     ? "ありがとうございます。審査後にご連絡いたします。"
                     : "Thank you! We'll review your request and get back to you.")
            }
        }
    }

    private var isValid: Bool {
        !orgName.isEmpty && !donorboxUrl.isEmpty && !category.isEmpty
            && donorboxUrl.contains("donorbox.org")
    }

    private func submit() async {
        errorMsg = nil
        isSubmitting = true
        defer { isSubmitting = false }

        if !donorboxUrl.contains("donorbox.org") {
            errorMsg = i18n.language == .ja
                ? "DonorBoxのURLを入力してください"
                : "Please enter a valid DonorBox URL"
            return
        }

        do {
            try await APIClient.shared.submitCharityRequest(
                CharityRequestBody(
                    orgName: orgName,
                    donorboxUrl: donorboxUrl,
                    websiteUrl: websiteUrl.isEmpty ? nil : websiteUrl,
                    category: category,
                    reason: reason.isEmpty ? nil : reason,
                    submittedBy: submittedBy.isEmpty ? nil : submittedBy
                )
            )
            await MainActor.run { submitted = true }
        } catch {
            await MainActor.run { errorMsg = error.localizedDescription }
        }
    }
}

// MARK: - Hex Color helper

private extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int = UInt64(0)
        Scanner(string: h).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int         & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
