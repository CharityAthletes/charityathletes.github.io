import Foundation

// MARK: - Error

enum APIError: LocalizedError {
    case unauthorized
    case httpError(Int, String)
    case decoding(Error)
    case badURL

    var errorDescription: String? {
        switch self {
        case .unauthorized:         return "ログインし直してください / Please sign in again"
        case .httpError(_, let m):  return m
        case .decoding(let e):      return e.localizedDescription
        case .badURL:               return "Invalid URL"
        }
    }
}

// MARK: - Client

final class APIClient {
    static let shared = APIClient()

    private let base = URL(string: AppConfig.backendURL)!
    private var token: String?
    private let session = URLSession.shared
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        // Supabase returns ISO8601 with fractional seconds e.g. "2026-04-04T22:54:38.716436+00:00"
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoNoFrac = ISO8601DateFormatter()
        isoNoFrac.formatOptions = [.withInternetDateTime]
        d.dateDecodingStrategy = .custom { decoder in
            let str = try decoder.singleValueContainer().decode(String.self)
            if let date = iso.date(from: str) { return date }
            if let date = isoNoFrac.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Cannot parse date: \(str)")
        }
        return d
    }()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    private init() {}

    func setToken(_ token: String?) { self.token = token }

    // ── Core request ──────────────────────────────────────────────────────────

    func request<T: Decodable, B: Encodable>(
        _ ep: Endpoint,
        body: B? = nil as String?
    ) async throws -> T {
        guard let url = URL(string: ep.path, relativeTo: base) else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = ep.method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body  { req.httpBody = try encoder.encode(body) }

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.httpError(0, "No response") }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? decoder.decode(ErrorEnvelope.self, from: data))?.error ?? "Error \(http.statusCode)"
            throw APIError.httpError(http.statusCode, msg)
        }
        do    { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decoding(error) }
    }

    private struct ErrorEnvelope: Decodable { let error: String }
    private struct Empty: Encodable {}

    // ── Identity ──────────────────────────────────────────────────────────────

    func getMe() async throws -> MeResponse { try await request(.me) }

    func stravaAuthURL() async throws -> URL {
        struct R: Decodable { let url: String }
        let r: R = try await request(.stravaAuth)
        guard let url = URL(string: r.url) else { throw APIError.badURL }
        return url
    }

    func stravaLoginURL() async throws -> URL {
        struct R: Decodable { let url: String }
        let r: R = try await request(.stravaLogin)
        guard let url = URL(string: r.url) else { throw APIError.badURL }
        return url
    }

    func registerNonprofit(_ body: NonprofitRegistration) async throws {
        struct R: Decodable { let message: String }
        let _: R = try await request(.nonprofitRegister, body: body)
    }

    // ── Athlete ───────────────────────────────────────────────────────────────

    func getCampaigns() async throws -> [Campaign]          { try await request(.campaigns) }
    func getMyCampaigns() async throws -> [Campaign]        { try await request(.myCampaigns) }
    func getCreatedCampaigns() async throws -> [Campaign]   { try await request(.createdCampaigns) }
    func getCampaign(id: String) async throws -> Campaign   { try await request(.campaign(id)) }
    func getNonprofits() async throws -> [Nonprofit]     { try await request(.nonprofits) }

    func createCampaign(_ body: CreateCampaignRequest) async throws -> Campaign {
        try await request(.createCampaign, body: body)
    }

    func getLeaderboard(campaignId: String) async throws -> [LeaderboardEntry] {
        try await request(.leaderboard(campaignId))
    }

    func joinCampaign(id: String, flatEnabled: Bool, perKmJpy: Int?) async throws -> CampaignParticipation {
        struct B: Encodable { let pledgeFlatEnabled: Bool; let pledgePerKmJpy: Int? }
        return try await request(.joinCampaign(id), body: B(pledgeFlatEnabled: flatEnabled, pledgePerKmJpy: perKmJpy))
    }

    func unjoinCampaign(id: String) async throws {
        struct R: Decodable { let ok: Bool }
        let _: R = try await request(.unjoinCampaign(id))
    }

    func deleteCampaign(id: String) async throws {
        struct R: Decodable { let ok: Bool }
        let _: R = try await request(.deleteCampaign(id))
    }

    func archiveCampaign(id: String) async throws {
        struct R: Decodable { let ok: Bool }
        let _: R = try await request(.archiveCampaign(id))
    }

    func manualDonate(campaignId: String, amountJpy: Int) async throws -> CheckoutSession {
        struct B: Encodable { let amountJpy: Int }
        return try await request(.donateCampaign(campaignId), body: B(amountJpy: amountJpy))
    }

    func getDonations() async throws -> [Donation]           { try await request(.donations) }
    func getSummary() async throws -> DonationSummary        { try await request(.donationSummary) }
    func createSetupIntent() async throws -> SetupIntentResponse {
        try await request(.setupPayment, body: Empty())
    }

    func confirmSetup(paymentMethodId: String) async throws {
        struct B: Encodable { let paymentMethodId: String }
        struct R: Decodable { let clientSecret: String }
        let _: R = try await request(.confirmSetup, body: B(paymentMethodId: paymentMethodId))
    }

    func getPaymentMethod() async throws -> PaymentMethodResponse { try await request(.paymentMethod) }

    // ── Nonprofit ─────────────────────────────────────────────────────────────

    func getNonprofitProfile() async throws -> NonprofitProfile { try await request(.nonprofitProfile) }
    func getNonprofitDashboard() async throws -> NonprofitDashboard { try await request(.nonprofitDashboard) }
    func getNonprofitCampaigns() async throws -> [Campaign]     { try await request(.nonprofitCampaigns) }

    // ── Admin ─────────────────────────────────────────────────────────────────

    func getCharities(query: String? = nil, category: String? = nil) async throws -> [Charity] {
        try await request(.charities(query, category))
    }

    func submitCharityRequest(_ body: CharityRequestBody) async throws {
        struct R: Decodable { let ok: Bool }
        let _: R = try await request(.charityRequest, body: body)
    }

    func getAdminStats() async throws -> PlatformStats { try await request(.adminStats) }

    func getAdminNonprofits(status: String? = nil) async throws -> [AdminNonprofitRow] {
        try await request(.adminNonprofits(status))
    }

    func approveNonprofit(id: String) async throws {
        struct R: Decodable { let ok: Bool }
        let _: R = try await request(.adminApproveNonprofit(id), body: Empty())
    }

    func rejectNonprofit(id: String, reason: String) async throws {
        struct B: Encodable { let reason: String }
        struct R: Decodable { let ok: Bool }
        let _: R = try await request(.adminRejectNonprofit(id), body: B(reason: reason))
    }
}
