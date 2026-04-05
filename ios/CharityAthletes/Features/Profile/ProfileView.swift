import SwiftUI
import UIKit
import StripePaymentSheet

struct ProfileView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var i18n: I18n
    @State private var showSignOutConfirm = false
    @State private var paymentSheet: PaymentSheet?
    @State private var isPreparingSheet = false
    @State private var paymentResult: PaymentSheetResult?
    @State private var showPaymentResult = false
    @State private var stravaError: String?
    @State private var showStravaError = false
    @State private var savedCard: SavedCard?

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
                                Task { await prepareAndShowPaymentSheet() }
                            }
                            .font(.caption).foregroundStyle(Color("BrandOrange"))
                            .disabled(isPreparingSheet)
                        }
                    } else {
                        Button {
                            Task { await prepareAndShowPaymentSheet() }
                        } label: {
                            HStack {
                                Label(i18n.t(.profileAddCard), systemImage: "plus.circle")
                                    .foregroundStyle(Color("BrandOrange"))
                                Spacer()
                                if isPreparingSheet { ProgressView() }
                            }
                        }
                        .disabled(isPreparingSheet)
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

                // ── Sign out ───────────────────────────────────────────────────
                Section {
                    Button(role: .destructive) {
                        showSignOutConfirm = true
                    } label: {
                        Label(i18n.t(.profileSignOut), systemImage: "rectangle.portrait.and.arrow.right")
                    }
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
            .alert(
                paymentResultTitle,
                isPresented: $showPaymentResult
            ) {
                Button(i18n.t(.commonClose)) { paymentResult = nil }
            } message: {
                Text(paymentResultMessage)
            }
            .alert("Strava Error", isPresented: $showStravaError) {
                Button(i18n.t(.commonClose)) { stravaError = nil }
            } message: {
                Text(stravaError ?? "")
            }
        }
    }

    // ── Stripe PaymentSheet setup ─────────────────────────────────────────────

    private func prepareAndShowPaymentSheet() async {
        isPreparingSheet = true
        defer { isPreparingSheet = false }

        let intent: SetupIntentResponse
        do {
            intent = try await APIClient.shared.createSetupIntent()
        } catch {
            print("[PaymentSheet] createSetupIntent failed:", error)
            return
        }

        StripeAPI.defaultPublishableKey = AppConfig.stripePublishableKey

        var config = PaymentSheet.Configuration()
        config.merchantDisplayName = "チャリアス / Charity Athletes"
        config.allowsDelayedPaymentMethods = false
        config.returnURL = "charityathletes://stripe-return"
        config.defaultBillingDetails.address.country = "JP"

        let sheet = PaymentSheet(
            setupIntentClientSecret: intent.clientSecret,
            configuration: config
        )
        paymentSheet = sheet

        // Present imperatively so it opens immediately after preparing
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController else { return }

        await MainActor.run {
            sheet.present(from: root, completion: handlePaymentResult)
        }
    }

    private func handlePaymentResult(_ result: PaymentSheetResult) {
        paymentResult = result
        showPaymentResult = true
        if case .completed = result {
            Task {
                await auth.refreshMe()
                await loadSavedCard()
            }
            paymentSheet = nil
        }
    }

    private func loadSavedCard() async {
        guard auth.profile?.stripeCustomerId != nil else { return }
        if let response = try? await APIClient.shared.getPaymentMethod() {
            savedCard = response.card
        }
    }

    private var paymentResultTitle: String {
        switch paymentResult {
        case .completed:  return i18n.language == .ja ? "カードを登録しました" : "Card saved"
        case .failed:     return i18n.t(.commonError)
        case .canceled:   return i18n.t(.commonCancel)
        case .none:       return ""
        }
    }

    private var paymentResultMessage: String {
        if case .failed(let err) = paymentResult { return err.localizedDescription }
        return ""
    }
}

// MARK: - AppConfig Stripe key

extension AppConfig {
    static var stripePublishableKey: String {
        // xcconfig strips content after // and may load stale values — hardcode until xcconfig is fixed
        return "pk_test_51ET8NyGpfRXqkavb9HUKY9p5pJyha9BqRYjFBa5ymmoVSMfdh0maNRrg7hUf5ha35iJRNEP4tm5DdXWebvfJraiw00Xt5PKkTL"
    }
}
