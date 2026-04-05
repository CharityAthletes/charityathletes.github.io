import SwiftUI

@MainActor
final class NonprofitSignupVM: ObservableObject {
    // Account
    @Published var email      = ""
    @Published var password   = ""
    @Published var displayName = ""

    // Organization
    @Published var nameJa     = ""
    @Published var nameEn     = ""
    @Published var descJa     = ""
    @Published var descEn     = ""
    @Published var websiteUrl = ""
    @Published var category: NonprofitCategory = .other

    // Donorbox
    @Published var donorboxCampaignId    = ""
    @Published var donorboxAccountEmail  = ""

    // State
    @Published var currentStep = 0          // 0=Account, 1=Organization, 2=Donorbox
    @Published var isLoading   = false
    @Published var errorMsg: String?
    @Published var submitted   = false

    let totalSteps = 3

    func submit(auth: AuthManager) async {
        isLoading = true; errorMsg = nil
        defer { isLoading = false }
        do {
            try await auth.registerNonprofit(NonprofitRegistration(
                email:                 email,
                password:              password,
                displayName:           displayName,
                nameJa:                nameJa,
                nameEn:                nameEn,
                descriptionJa:         descJa,
                descriptionEn:         descEn,
                websiteUrl:            websiteUrl.isEmpty ? nil : websiteUrl,
                category:              category.rawValue,
                donorboxCampaignId:    donorboxCampaignId,
                donorboxAccountEmail:  donorboxAccountEmail
            ))
            submitted = true
        } catch { errorMsg = error.localizedDescription }
    }
}

struct NonprofitSignupView: View {
    @StateObject private var vm = NonprofitSignupVM()
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var i18n: I18n
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            if vm.submitted {
                SuccessView(message: i18n.t(.npSignupSuccess)) { dismiss() }
            } else {
                VStack(spacing: 0) {
                    // Step indicator
                    StepIndicator(current: vm.currentStep, total: vm.totalSteps)
                        .padding()

                    Form {
                        switch vm.currentStep {
                        case 0: accountSection
                        case 1: organizationSection
                        default: donorboxSection
                        }

                        if let err = vm.errorMsg {
                            Section { Text(err).foregroundStyle(.red).font(.caption) }
                        }
                    }

                    // Navigation buttons
                    HStack(spacing: 16) {
                        if vm.currentStep > 0 {
                            Button(i18n.t(.commonCancel)) { vm.currentStep -= 1 }
                                .buttonStyle(.bordered)
                        }
                        Spacer()
                        Button(vm.currentStep < vm.totalSteps - 1
                               ? (i18n.language == .ja ? "次へ" : "Next")
                               : i18n.t(.npSignupSubmit)
                        ) {
                            if vm.currentStep < vm.totalSteps - 1 {
                                vm.currentStep += 1
                            } else {
                                Task { await vm.submit(auth: auth) }
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color("BrandOrange"))
                        .disabled(vm.isLoading || !stepIsValid)
                    }
                    .padding()
                }
            }
        }
        .navigationTitle(i18n.t(.npSignupTitle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(i18n.t(.commonClose)) { dismiss() }
            }
        }
    }

    // ── Step sections ─────────────────────────────────────────────────────────

    @ViewBuilder
    private var accountSection: some View {
        Section(i18n.language == .ja ? "アカウント情報" : "Account") {
            TextField(i18n.t(.authDisplayName), text: $vm.displayName)
                .autocorrectionDisabled()
            TextField(i18n.t(.authEmail), text: $vm.email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            SecureField(i18n.t(.authPassword), text: $vm.password)
        }
    }

    @ViewBuilder
    private var organizationSection: some View {
        Section(i18n.language == .ja ? "団体情報" : "Organization") {
            TextField(i18n.t(.npSignupNameJa), text: $vm.nameJa)
            TextField(i18n.t(.npSignupNameEn), text: $vm.nameEn)
            TextField(i18n.t(.npSignupDescJa), text: $vm.descJa, axis: .vertical)
                .lineLimit(3...6)
            TextField(i18n.t(.npSignupDescEn), text: $vm.descEn, axis: .vertical)
                .lineLimit(3...6)
            TextField(i18n.t(.npSignupWebsite), text: $vm.websiteUrl)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
            Picker(i18n.t(.npSignupCategory), selection: $vm.category) {
                ForEach(NonprofitCategory.allCases) { cat in
                    Text(i18n.language == .ja ? cat.labelJa : cat.labelEn).tag(cat)
                }
            }
        }
    }

    @ViewBuilder
    private var donorboxSection: some View {
        Section("Donorbox") {
            TextField(i18n.t(.npSignupDonorboxId), text: $vm.donorboxCampaignId)
                .autocorrectionDisabled()
            TextField(i18n.t(.npSignupDonorboxEmail), text: $vm.donorboxAccountEmail)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        Section {
            Text(i18n.language == .ja
                 ? "DonorboxのキャンペーンIDとアカウントメールを入力してください。承認後にキャンペーンが連携されます。"
                 : "Enter your Donorbox campaign ID and account email. Your campaign will be linked after approval.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var stepIsValid: Bool {
        switch vm.currentStep {
        case 0: return !vm.email.isEmpty && vm.password.count >= 8 && !vm.displayName.isEmpty
        case 1: return !vm.nameJa.isEmpty && !vm.nameEn.isEmpty
        default: return !vm.donorboxCampaignId.isEmpty && !vm.donorboxAccountEmail.isEmpty
        }
    }
}

// MARK: - Step indicator

struct StepIndicator: View {
    let current: Int
    let total: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<total, id: \.self) { i in
                Capsule()
                    .fill(i <= current ? Color("BrandOrange") : Color(.systemGray4))
                    .frame(height: 4)
            }
        }
    }
}

// MARK: - Success view

struct SuccessView: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(Color("BrandOrange"))
            Text(message)
                .font(.body)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Spacer()
            Button("OK", action: onDismiss)
                .buttonStyle(.borderedProminent)
                .tint(Color("BrandOrange"))
        }
        .padding()
    }
}

// MARK: - Pending / Rejected holding screens

struct NonprofitPendingView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var i18n: I18n

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "clock.badge.fill")
                .font(.system(size: 72))
                .foregroundStyle(Color("BrandOrange"))
            Text(i18n.t(.npPendingTitle)).font(.title2.bold())
            Text(i18n.t(.npPendingMessage))
                .font(.body).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Spacer()
            Button(i18n.t(.profileSignOut)) { Task { await auth.signOut() } }
                .foregroundStyle(.red)
        }
        .padding()
    }
}

struct NonprofitRejectedView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var i18n: I18n

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.red)
            Text(i18n.t(.npRejectedTitle)).font(.title2.bold())
            if let reason = auth.profile?.nonprofitProfile?.rejectionReason, !reason.isEmpty {
                Text("\(i18n.t(.npRejectedMessage)) \(reason)")
                    .font(.body).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            Spacer()
            Button(i18n.t(.profileSignOut)) { Task { await auth.signOut() } }
                .foregroundStyle(.red)
        }
        .padding()
    }
}
