import Foundation
import UIKit
import Supabase
import AuthenticationServices
import CryptoKit
import SafariServices

enum AuthState: Equatable {
    case initializing
    case signedOut
    case signedIn(userId: String)
}

@MainActor
final class AuthManager: ObservableObject {
    @Published private(set) var state: AuthState = .initializing
    @Published private(set) var role: UserRole = .athlete
    @Published private(set) var profile: MeResponse?

    /// Nonprofit-specific: nil until role == .nonprofit
    var nonprofitStatus: NonprofitStatus? { profile?.nonprofitProfile?.status }
    var isStravaConnected: Bool           { profile?.stravaAthleteId != nil }

    private let api = APIClient.shared

    init() { Task { await restoreSession() } }

    // ── Session lifecycle ─────────────────────────────────────────────────────

    func restoreSession() async {
        do {
            let session = try await supabase.auth.session
            api.setToken(session.accessToken)
            state = .signedIn(userId: session.user.id.uuidString)
            await refreshMe()
        } catch {
            // No existing session — go to sign in
            state = .signedOut
        }
    }

    func listenToAuthChanges() {
        Task {
            for await (event, session) in supabase.auth.authStateChanges {
                await MainActor.run {
                    switch event {
                    case .signedIn, .tokenRefreshed:
                        if let s = session {
                            api.setToken(s.accessToken)
                            state = .signedIn(userId: s.user.id.uuidString)
                        }
                    case .signedOut:
                        api.setToken(nil)
                        profile = nil
                        role    = .athlete
                        state   = .signedOut
                    default: break
                    }
                }
                if case .signedIn = event { await refreshMe() }
            }
        }
    }

    // ── Auth actions ──────────────────────────────────────────────────────────

    func signIn(email: String, password: String) async throws {
        let session = try await supabase.auth.signIn(email: email, password: password)
        api.setToken(session.accessToken)
        state = .signedIn(userId: session.user.id.uuidString)
        await refreshMe()
    }

    /// Athlete signup — role assigned via DB trigger (default 'athlete')
    func signUpAthlete(email: String, password: String, displayName: String) async throws {
        let result = try await supabase.auth.signUp(
            email: email,
            password: password,
            data: ["full_name": .string(displayName), "role": .string("athlete")]
        )
        if let s = result.session {
            api.setToken(s.accessToken)
            state = .signedIn(userId: s.user.id.uuidString)
            await refreshMe()
        }
        // else: email confirmation required; stay on signedOut
    }

    /// Nonprofit signup — creates pending profile via backend
    func registerNonprofit(_ reg: NonprofitRegistration) async throws {
        try await api.registerNonprofit(reg)
        // After registration the user must verify email before signing in.
    }

    func signOut() async {
        try? await supabase.auth.signOut()
        api.setToken(nil)
        profile = nil
        role    = .athlete
        state   = .signedOut
    }

    // ── Strava ────────────────────────────────────────────────────────────────

    // ── Google Sign-In ────────────────────────────────────────────────────────

    func signInWithGoogle() async throws {
        let url = try await supabase.auth.getOAuthSignInURL(provider: .google, redirectTo: URL(string: "charityathletes://auth/callback")!)
        await UIApplication.shared.open(url)
    }

    func handleOAuthCallback(_ url: URL) async {
        guard let session = try? await supabase.auth.session(from: url) else { return }
        api.setToken(session.accessToken)
        state = .signedIn(userId: session.user.id.uuidString)
        await refreshMe()
    }

    // ── Sign in with Apple ────────────────────────────────────────────────────

    func signInWithApple(_ result: Result<ASAuthorization, Error>) async throws {
        guard case .success(let auth) = result,
              let credential = auth.credential as? ASAuthorizationAppleIDCredential,
              let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            throw AuthError.appleSignInFailed
        }

        let session = try await supabase.auth.signInWithIdToken(
            credentials: .init(
                provider: .apple,
                idToken: tokenString
            )
        )
        api.setToken(session.accessToken)
        state = .signedIn(userId: session.user.id.uuidString)
        await refreshMe()
    }

    // ── Strava ────────────────────────────────────────────────────────────────

    /// Sign in / sign up using Strava via ASWebAuthenticationSession
    /// (intercepts charityathletes:// redirect internally — Safari can't block it)
    func signInWithStrava() async throws {
        let stravaURL = try await api.stravaLoginURL()
        print("[Strava] Starting ASWebAuthenticationSession for login")
        let callbackURL = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(
                url: stravaURL,
                callbackURLScheme: "charityathletes"
            ) { url, error in
                if let error = error {
                    cont.resume(throwing: error)
                } else if let url = url {
                    cont.resume(returning: url)
                } else {
                    cont.resume(throwing: NSError(domain: "Strava", code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "No callback URL received"]))
                }
            }
            session.presentationContextProvider = PresentationContextProvider.shared
            session.prefersEphemeralWebBrowserSession = false
            session.start()
            // Keep session alive
            PresentationContextProvider.shared.activeSession = session
        }
        print("[StravaLogin] callback URL:", callbackURL.absoluteString.prefix(100))
        await handleStravaLogin(callbackURL)
    }

    /// Connect Strava to an existing account via ASWebAuthenticationSession
    func connectStrava() async throws {
        let stravaURL = try await api.stravaAuthURL()
        print("[Strava] Starting ASWebAuthenticationSession for connect")
        let callbackURL = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(
                url: stravaURL,
                callbackURLScheme: "charityathletes"
            ) { url, error in
                if let error = error {
                    cont.resume(throwing: error)
                } else if let url = url {
                    cont.resume(returning: url)
                } else {
                    cont.resume(throwing: NSError(domain: "Strava", code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "No callback URL received"]))
                }
            }
            session.presentationContextProvider = PresentationContextProvider.shared
            session.prefersEphemeralWebBrowserSession = false
            session.start()
            PresentationContextProvider.shared.activeSession = session
        }
        print("[StravaConnect] callback URL:", callbackURL.absoluteString.prefix(100))
        // Backend already updated the DB; refresh profile to show connected state
        try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s for backend to commit
        await refreshMe()
        print("[StravaConnect] after refreshMe, isStravaConnected:", isStravaConnected, "stravaAthleteId:", profile?.stravaAthleteId as Any)
    }

    func disconnectStrava() async throws {
        try await APIClient.shared.disconnectStrava()
        await refreshMe()
    }

    /// Called after Strava login redirects back to the app (also used by deep link fallback)
    func handleStravaLogin(_ url: URL) async {
        print("[StravaLogin] handleStravaLogin called, url:", url.absoluteString.prefix(100))
        let queryString = url.fragment ?? url.query ?? ""
        var params: [String: String] = [:]
        for pair in queryString.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1)
            if parts.count == 2 {
                params[String(parts[0])] = String(parts[1]).removingPercentEncoding ?? String(parts[1])
            }
        }
        guard let accessToken  = params["access_token"],
              let refreshToken = params["refresh_token"] else {
            print("[StravaLogin] missing tokens in URL, params:", params.keys.joined(separator: ","))
            return
        }
        do {
            let session = try await supabase.auth.setSession(
                accessToken:  accessToken,
                refreshToken: refreshToken
            )
            api.setToken(session.accessToken)
            state = .signedIn(userId: session.user.id.uuidString)
            await refreshMe()
        } catch {
            print("[StravaLogin] setSession failed:", error)
        }
    }

    func handleStravaSuccess() async { await refreshMe() }

    // ── Profile refresh ───────────────────────────────────────────────────────

    func refreshMe() async {
        guard case .signedIn = state else { return }
        do {
            let me = try await api.getMe()
            profile = me
            role    = me.role
        } catch {
            print("[refreshMe] error:", error)
        }
    }
}

// MARK: - Deep link router

enum AuthError: LocalizedError {
    case appleSignInFailed
    var errorDescription: String? {
        switch self {
        case .appleSignInFailed: return "Apple Sign-In failed. Please try again."
        }
    }
}

enum DeepLinkRouter {
    static func handle(_ url: URL, auth: AuthManager) {
        guard url.scheme == "charityathletes", let host = url.host else { return }
        switch host {
        case "auth" where url.path == "/strava-success":
            Task { await auth.handleStravaSuccess() }
        case "auth" where url.path == "/strava-login":
            Task { await auth.handleStravaLogin(url) }
        case "auth" where url.path == "/callback":
            Task { await auth.handleOAuthCallback(url) }
        default:
            break
        }
    }
}

// MARK: - ASWebAuthenticationSession presentation context

final class PresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = PresentationContextProvider()
    var activeSession: ASWebAuthenticationSession?

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
