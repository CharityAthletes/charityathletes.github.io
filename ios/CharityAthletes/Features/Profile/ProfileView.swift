import SwiftUI
import UIKit

// MARK: - CardInputView

/// Custom card-entry sheet that posts card data directly to Stripe's REST API
/// (bypassing the PaymentSheet SDK entirely), then calls our backend confirm-setup.
private struct CardInputView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var i18n: I18n

    let onSaved: () -> Void

    // ── Form state ────────────────────────────────────────────────────────────
    @State private var cardNumber = ""
    @State private var expiry    = ""
    @State private var cvc       = ""

    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field { case number, expiry, cvc }

    // ── Derived ───────────────────────────────────────────────────────────────
    private var cardDigits:   String { cardNumber.filter(\.isNumber) }
    private var expiryDigits: String { expiry.filter(\.isNumber) }
    private var isValid: Bool {
        cardDigits.count == 16 && expiryDigits.count == 4 && cvc.count >= 3
    }

    // ── View ──────────────────────────────────────────────────────────────────
    var body: some View {
        NavigationStack {
            Form {
                Section(i18n.language == .ja ? "カード番号" : "Card Number") {
                    TextField("4242 4242 4242 4242", text: Binding(
                        get: { cardNumber },
                        set: { cardNumber = formatCardNumber($0) }
                    ))
                    .keyboardType(.numberPad)
                    .focused($focusedField, equals: .number)
                    .font(.system(.body, design: .monospaced))
                    .onChange(of: cardDigits) { _, d in
                        if d.count >= 16 { focusedField = .expiry }
                    }
                }

                Section(i18n.language == .ja ? "有効期限 / CVC" : "Expiry / CVC") {
                    HStack(spacing: 0) {
                        TextField("MM/YY", text: Binding(
                            get: { expiry },
                            set: { expiry = formatExpiry($0) }
                        ))
                        .keyboardType(.numberPad)
                        .focused($focusedField, equals: .expiry)
                        .frame(maxWidth: .infinity)
                        .onChange(of: expiryDigits) { _, d in
                            if d.count >= 4 { focusedField = .cvc }
                        }

                        Divider().padding(.horizontal, 8)

                        TextField("CVC", text: Binding(
                            get: { cvc },
                            set: { cvc = String($0.filter(\.isNumber).prefix(4)) }
                        ))
                        .keyboardType(.numberPad)
                        .focused($focusedField, equals: .cvc)
                        .frame(maxWidth: .infinity)
                    }
                }

                if let err = errorMessage {
                    Section {
                        Label(err, systemImage: "exclamationmark.circle.fill")
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                Section {
                    Button {
                        focusedField = nil
                        Task { await submit() }
                    } label: {
                        HStack {
                            Spacer()
                            if isSubmitting {
                                ProgressView()
                            } else {
                                Text(i18n.language == .ja ? "カードを保存" : "Save Card")
                                    .bold()
                                    .foregroundStyle(isValid ? Color("BrandOrange") : .gray)
                            }
                            Spacer()
                        }
                    }
                    .disabled(isSubmitting || !isValid)
                }
            }
            .navigationTitle(i18n.language == .ja ? "カードを追加" : "Add Card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.language == .ja ? "キャンセル" : "Cancel") { dismiss() }
                }
            }
            .onAppear { focusedField = .number }
        }
    }

    // ── Formatting ────────────────────────────────────────────────────────────

    private func formatCardNumber(_ raw: String) -> String {
        let d = String(raw.filter(\.isNumber).prefix(16))
        var out = ""
        for (i, ch) in d.enumerated() {
            if i > 0 && i % 4 == 0 { out += " " }
            out.append(ch)
        }
        return out
    }

    private func formatExpiry(_ raw: String) -> String {
        let d = String(raw.filter(\.isNumber).prefix(4))
        guard d.count > 2 else { return d }
        return String(d.prefix(2)) + "/" + String(d.dropFirst(2))
    }

    // ── Submission ────────────────────────────────────────────────────────────

    private func submit() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            // 1. Ensure Stripe customer exists on backend
            _ = try? await APIClient.shared.createSetupIntent()

            // 2. Parse expiry
            let parts = expiryDigits
            guard parts.count == 4,
                  let month     = Int(parts.prefix(2)),
                  let yearShort = Int(parts.suffix(2)) else {
                throw CardInputError.invalidExpiry
            }
            let year = 2000 + yearShort

            // 3. Create PaymentMethod directly via Stripe REST API
            //    Card data goes client → Stripe only; never through our servers.
            let pmId = try await createStripePaymentMethod(
                number: cardDigits,
                expMonth: month,
                expYear: year,
                cvc: cvc
            )

            // 4. Confirm setup on our backend (attaches PM, sets as default)
            try await APIClient.shared.confirmSetup(paymentMethodId: pmId)

            await MainActor.run {
                onSaved()
                dismiss()
            }

        } catch let e as CardInputError {
            await MainActor.run { errorMessage = e.message(ja: i18n.language == .ja) }
        } catch {
            await MainActor.run { errorMessage = error.localizedDescription }
        }
    }

    private func createStripePaymentMethod(
        number: String,
        expMonth: Int,
        expYear: Int,
        cvc: String
    ) async throws -> String {
        guard let url = URL(string: "https://api.stripe.com/v1/payment_methods") else {
            throw CardInputError.network
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(AppConfig.stripePublishableKey)",
                     forHTTPHeaderField: "Authorization")
        req.setValue("application/x-www-form-urlencoded",
                     forHTTPHeaderField: "Content-Type")
        let body = "type=card&card[number]=\(number)&card[exp_month]=\(expMonth)&card[exp_year]=\(expYear)&card[cvc]=\(cvc)"
        req.httpBody = body.data(using: .utf8)

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw CardInputError.network }

        if !(200..<300).contains(http.statusCode) {
            struct StripeErr: Decodable {
                struct Inner: Decodable { let message: String }
                let error: Inner
            }
            let msg = (try? JSONDecoder().decode(StripeErr.self, from: data))?.error.message
                      ?? "Card error \(http.statusCode)"
            throw CardInputError.stripe(msg)
        }

        struct PMResponse: Decodable { let id: String }
        return try JSONDecoder().decode(PMResponse.self, from: data).id
    }

    private enum CardInputError: Error {
        case invalidExpiry, network, stripe(String)
        func message(ja: Bool) -> String {
            switch self {
            case .invalidExpiry: return ja ? "有効期限が正しくありません" : "Invalid expiry date"
            case .network:       return ja ? "ネットワークエラー"         : "Network error"
            case .stripe(let m): return m
            }
        }
    }
}

// MARK: - ProfileView

struct ProfileView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var i18n: I18n
    @State private var showSignOutConfirm      = false
    @State private var showCardInput           = false
    @State private var stravaError: String?
    @State private var showStravaError         = false
    @State private var savedCard: SavedCard?
    @State private var showDeleteConfirm       = false
    @State private var isDeletingAccount       = false
    @State private var deleteError: String?
    @State private var showDeleteError         = false

    var body: some View {
        NavigationStack {
            List {
                // ── Avatar + stats ─────────────────────────────────────────────
                if let p = auth.profile {
                    Section {
                        HStack(spacing: 14) {
                            if let urlStr = p.avatarUrl, let url = URL(string: urlStr) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let img):
                                        img.resizable().scaledToFill()
                                    default:
                                        Image(systemName: "person.circle.fill")
                                            .resizable()
                                            .foregroundStyle(Color("BrandOrange"))
                                    }
                                }
                                .frame(width: 52, height: 52)
                                .clipShape(Circle())
                            } else {
                                Image(systemName: "person.circle.fill")
                                    .font(.system(size: 52))
                                    .foregroundStyle(Color("BrandOrange"))
                            }
                            VStack(alignment: .leading) {
                                Text(p.displayName).font(.headline)
                                Text("¥\(p.totalDonatedJpy.formatted()) · \(String(format: "%.0f km", p.totalDistanceKm))")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                // ── Language ───────────────────────────────────────────────────
                Section(i18n.t(.profileLanguage)) {
                    Picker(i18n.t(.profileLanguage), selection: Binding(
                        get: { i18n.language },
                        set: { i18n.language = $0 }
                    )) {
                        ForEach(Language.allCases) { lang in
                            Text(lang.displayName).tag(lang)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // ── Strava ─────────────────────────────────────────────────────
                Section(i18n.t(.profileStrava)) {
                    if auth.isStravaConnected {
                        Label(i18n.t(.profileStravaConnected), systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Button(role: .destructive) {
                            Task {
                                do {
                                    try await auth.disconnectStrava()
                                } catch {
                                    stravaError = error.localizedDescription
                                    showStravaError = true
                                }
                            }
                        } label: {
                            Label(i18n.language == .ja ? "Stravaを切断" : "Disconnect Strava",
                                  systemImage: "xmark.circle")
                        }
                    } else {
                        Button {
                            Task {
                                do {
                                    try await auth.connectStrava()
                                } catch {
                                    stravaError = error.localizedDescription
                                    showStravaError = true
                                }
                            }
                        } label: {
                            Label(i18n.t(.profileStravaConnect), systemImage: "link")
                                .foregroundStyle(Color("StravaOrange"))
                        }
                    }
                }

                // ── Payment method ─────────────────────────────────────────────
                Section(i18n.t(.profilePaymentMethod)) {
                    if let card = savedCard {
                        HStack {
                            Image(systemName: "creditcard.fill")
                                .foregroundStyle(.green)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(card.brand.capitalized) •••• \(card.last4)")
                                    .font(.subheadline).bold()
                                Text(String(format: "%02d / %02d", card.expMonth, card.expYear % 100))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(i18n.language == .ja ? "変更" : "Change") {
                                showCardInput = true
                            }
                            .font(.caption).foregroundStyle(Color("BrandOrange"))
                        }
                    } else {
                        Button {
                            showCardInput = true
                        } label: {
                            Label(i18n.t(.profileAddCard), systemImage: "plus.circle")
                                .foregroundStyle(Color("BrandOrange"))
                        }
                    }
                }

                // ── Donation history ───────────────────────────────────────────
                Section {
                    NavigationLink {
                        DonationListView()
                    } label: {
                        Label(i18n.t(.donationsTitle), systemImage: "yensign.circle")
                    }
                }

                // ── Help ───────────────────────────────────────────────────────
                Section {
                    NavigationLink {
                        HowItWorksView()
                            .environmentObject(i18n)
                    } label: {
                        Label(i18n.language == .ja ? "使い方" : "How It Works",
                              systemImage: "questionmark.circle")
                    }
                }

                // ── Sign out ───────────────────────────────────────────────────
                Section {
                    Button(role: .destructive) {
                        showSignOutConfirm = true
                    } label: {
                        Label(i18n.t(.profileSignOut), systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                // ── Danger zone ────────────────────────────────────────────────
                Section(i18n.language == .ja ? "危険な操作" : "Danger Zone") {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        if isDeletingAccount {
                            HStack {
                                ProgressView()
                                    .padding(.trailing, 4)
                                Text(i18n.language == .ja ? "削除中..." : "Deleting...")
                            }
                        } else {
                            Label(
                                i18n.language == .ja ? "アカウントを削除" : "Delete Account",
                                systemImage: "trash"
                            )
                        }
                    }
                    .disabled(isDeletingAccount)
                }
            }
            .navigationTitle(i18n.t(.profileTitle))
            .task {
                await auth.refreshMe()
                await loadSavedCard()
            }
            .refreshable {
                await auth.refreshMe()
                await loadSavedCard()
            }
            .sheet(isPresented: $showCardInput) {
                CardInputView {
                    Task {
                        await auth.refreshMe()
                        await loadSavedCard()
                    }
                }
                .environmentObject(i18n)
            }
            .confirmationDialog(
                i18n.language == .ja ? "ログアウトしますか？" : "Sign out?",
                isPresented: $showSignOutConfirm,
                titleVisibility: .visible
            ) {
                Button(i18n.t(.profileSignOut), role: .destructive) {
                    Task { await auth.signOut() }
                }
                Button(i18n.t(.commonCancel), role: .cancel) {}
            }
            .alert("Strava Error", isPresented: $showStravaError) {
                Button(i18n.t(.commonClose)) { stravaError = nil }
            } message: {
                Text(stravaError ?? "")
            }
            .alert(
                i18n.language == .ja ? "アカウントを削除しますか？" : "Delete Account?",
                isPresented: $showDeleteConfirm
            ) {
                Button(i18n.t(.commonCancel), role: .cancel) {}
                Button(i18n.language == .ja ? "アカウントを削除" : "Delete Account", role: .destructive) {
                    Task { await deleteAccount() }
                }
            } message: {
                Text(
                    i18n.language == .ja
                    ? "本当によろしいですか？アカウントとすべてのデータが完全に削除されます。この操作は元に戻せません。"
                    : "Are you sure? This will permanently delete your account and all data. This cannot be undone."
                )
            }
            .alert(
                i18n.language == .ja ? "削除エラー" : "Delete Error",
                isPresented: $showDeleteError
            ) {
                Button(i18n.t(.commonClose)) { deleteError = nil }
            } message: {
                Text(deleteError ?? "")
            }
        }
    }

    private func deleteAccount() async {
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do {
            try await APIClient.shared.deleteAccount()
            await auth.signOut()
        } catch {
            deleteError = error.localizedDescription
            showDeleteError = true
        }
    }

    private func loadSavedCard() async {
        if let response = try? await APIClient.shared.getPaymentMethod() {
            savedCard = response.card
        }
    }
}

// MARK: - AppConfig Stripe key

extension AppConfig {
    static var stripePublishableKey: String {
        return "pk_live_4rAL2Q26f4qp3BegstagOruP00kKYSdftC"
    }
}
