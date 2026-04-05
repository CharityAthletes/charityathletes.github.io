import SwiftUI
import AuthenticationServices

struct OnboardingView: View {
    @EnvironmentObject var i18n: I18n
    @State private var showAthleteAuth    = false
    @State private var showNonprofitSignup = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color("BrandOrange"), Color("BrandRed")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ).ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                Image(systemName: "bicycle")
                    .font(.system(size: 88, weight: .thin))
                    .foregroundStyle(.white)
                    .padding(.bottom, 24)

                Text("チャリアス")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(.white)
                Text("Charity Athletes")
                    .font(.title3).foregroundStyle(.white.opacity(0.7))
                    .padding(.bottom, 32)

                Text(i18n.t(.onboardingTagline))
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.9))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)

                Spacer()

                VStack(spacing: 12) {
                    // Athlete CTA
                    Button { showAthleteAuth = true } label: {
                        Label(i18n.t(.onboardingGetStarted), systemImage: "figure.walk")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(.white)
                            .foregroundStyle(Color("BrandOrange"))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    // Sign-in link
                    Button { showAthleteAuth = true } label: {
                        Text(i18n.t(.onboardingSignIn))
                            .font(.subheadline).foregroundStyle(.white.opacity(0.85))
                    }

                    Divider().background(.white.opacity(0.3)).padding(.vertical, 4)

                    // Nonprofit CTA
                    Button { showNonprofitSignup = true } label: {
                        Label(
                            i18n.language == .ja ? "団体として登録する" : "Register as a Nonprofit",
                            systemImage: "building.2"
                        )
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.white.opacity(0.15))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 52)
            }
        }
        .sheet(isPresented: $showAthleteAuth)     { AthleteAuthSheet() }
        .sheet(isPresented: $showNonprofitSignup) { NonprofitSignupView() }
    }
}

// MARK: - Athlete auth sheet (sign-in + sign-up)

struct AthleteAuthSheet: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var i18n: I18n
    @Environment(\.dismiss) var dismiss

    @State private var isSignUp   = false
    @State private var email      = ""
    @State private var password   = ""
    @State private var displayName = ""
    @State private var isLoading  = false
    @State private var errorMsg: String?

    var body: some View {
        NavigationStack {
            Form {
                if isSignUp {
                    Section {
                        TextField(i18n.t(.authDisplayName), text: $displayName)
                            .autocorrectionDisabled()
                    }
                }
                Section {
                    TextField(i18n.t(.authEmail), text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField(i18n.t(.authPassword), text: $password)
                }
                if let err = errorMsg {
                    Section { Text(err).foregroundStyle(.red).font(.caption) }
                }
                Section {
                    Button { Task { await submit() } } label: {
                        HStack {
                            Spacer()
                            if isLoading { ProgressView() }
                            else { Text(isSignUp ? i18n.t(.authRegister) : i18n.t(.authLogin)).bold() }
                            Spacer()
                        }
                    }
                    .disabled(isLoading)
                }
                Section {
                    Button(isSignUp ? i18n.t(.authSwitchToLogin) : i18n.t(.authSwitchToSignUp)) {
                        isSignUp.toggle(); errorMsg = nil
                    }
                    .foregroundStyle(Color("BrandOrange"))
                }

                Section {
                    // Strava Sign-In
                    Button {
                        Task { await signInWithStrava() }
                    } label: {
                        HStack {
                            Spacer()
                            Image(systemName: "figure.run")
                            Text(i18n.language == .ja ? "Stravaでログイン" : "Sign in with Strava")
                                .bold()
                            Spacer()
                        }
                    }
                    .foregroundStyle(.white)
                    .listRowBackground(Color(red: 0.98, green: 0.33, blue: 0.07))

                    // Google Sign-In
                    Button {
                        Task { await signInWithGoogle() }
                    } label: {
                        HStack {
                            Spacer()
                            Image(systemName: "globe")
                            Text(i18n.language == .ja ? "Googleでログイン" : "Sign in with Google")
                                .bold()
                            Spacer()
                        }
                    }
                    .foregroundStyle(.white)
                    .listRowBackground(Color(red: 0.26, green: 0.52, blue: 0.96))

                    // Sign in with Apple
                    SignInWithAppleButton(
                        isSignUp ? .signUp : .signIn,
                        onRequest: { request in
                            request.requestedScopes = [.fullName, .email]
                        },
                        onCompletion: { result in
                            Task { await handleAppleResult(result) }
                        }
                    )
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 44)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }
            }
            .navigationTitle(isSignUp ? i18n.t(.authRegister) : i18n.t(.authLogin))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.t(.commonClose)) { dismiss() }
                }
            }
        }
    }

    private func submit() async {
        isLoading = true; errorMsg = nil
        defer { isLoading = false }
        do {
            if isSignUp {
                try await auth.signUpAthlete(email: email, password: password, displayName: displayName)
            } else {
                try await auth.signIn(email: email, password: password)
            }
            dismiss()
        } catch { errorMsg = error.localizedDescription }
    }

    private func signInWithStrava() async {
        isLoading = true; errorMsg = nil
        defer { isLoading = false }
        do {
            try await auth.signInWithStrava()
            // No dismiss — the deep link callback will sign the user in
        } catch { errorMsg = error.localizedDescription }
    }

    private func signInWithGoogle() async {
        isLoading = true; errorMsg = nil
        defer { isLoading = false }
        do {
            try await auth.signInWithGoogle()
            dismiss()
        } catch { errorMsg = error.localizedDescription }
    }

    private func handleAppleResult(_ result: Result<ASAuthorization, Error>) async {
        isLoading = true; errorMsg = nil
        defer { isLoading = false }
        do {
            try await auth.signInWithApple(result)
            dismiss()
        } catch { errorMsg = error.localizedDescription }
    }
}
