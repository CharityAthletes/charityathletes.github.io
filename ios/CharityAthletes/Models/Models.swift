import Foundation

// ─── Saved Card ───────────────────────────────────────────────────────────────

struct SavedCard: Decodable {
    let brand: String
    let last4: String
    let expMonth: Int
    let expYear: Int

    var brandIcon: String {
        switch brand.lowercased() {
        case "visa":       return "💳 Visa"
        case "mastercard": return "💳 Mastercard"
        case "amex":       return "💳 Amex"
        case "jcb":        return "💳 JCB"
        default:           return "💳 \(brand.capitalized)"
        }
    }
}

struct PaymentMethodResponse: Decodable {
    let card: SavedCard?
}

// ─── User ─────────────────────────────────────────────────────────────────────

struct UserProfile: Decodable, Identifiable {
    let id: String
    let userId: String
    let displayName: String
    let avatarUrl: String?
    let preferredLanguage: String
    let stravaAthleteId: Int?
    let stripeCustomerId: String?
    let totalDistanceKm: Double
    let totalDonatedJpy: Int
}

// ─── Activity ─────────────────────────────────────────────────────────────────

struct Activity: Decodable, Identifiable {
    let id: String
    let name: String
    let sportType: String
    let distanceMeters: Double
    let movingTimeSeconds: Int
    let totalElevationGain: Double
    let startDate: Date

    var distanceKm: Double { distanceMeters / 1000 }

    var formattedDuration: String {
        let h = movingTimeSeconds / 3600
        let m = (movingTimeSeconds % 3600) / 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }

    var sportIcon: String {
        switch sportType {
        case "Ride", "VirtualRide": return "bicycle"
        case "Run":                  return "figure.walk"
        case "Swim":                 return "figure.pool.swim"
        case "Walk":                 return "figure.walk"
        default:                     return "figure.mixed.cardio"
        }
    }
}

// ─── Nonprofit ────────────────────────────────────────────────────────────────

struct Nonprofit: Decodable, Identifiable {
    let id: String
    let nameJa: String
    let nameEn: String
    let descriptionJa: String?
    let descriptionEn: String?
    let logoUrl: String?
    let websiteUrl: String?
}

// ─── Create Campaign Request ──────────────────────────────────────────────────

struct CreateCampaignRequest: Encodable {
    let nonprofitId: String
    let titleJa: String
    let titleEn: String
    let descriptionJa: String
    let descriptionEn: String
    let sportTypes: [String]
    let hasFlatDonation: Bool
    let hasPerKmDonation: Bool
    let maxDistanceKm: Int?
    let suggestedPerKmJpy: [Int]
    let donorboxCampaignId: String
    let startDate: String
    let endDate: String
    let goalAmountJpy: Int
    let isPublic: Bool
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

struct Campaign: Decodable, Identifiable {
    let id: String
    let titleJa: String
    let titleEn: String
    let descriptionJa: String
    let descriptionEn: String
    let coverImageUrl: String?
    let sportTypes: [String]

    let hasFlatDonation: Bool
    let hasPerKmDonation: Bool
    let maxDistanceKm: Int?
    let suggestedPerKmJpy: [Int]

    let startDate: Date
    let endDate: Date
    let goalAmountJpy: Int
    let raisedAmountJpy: Int
    let participantCount: Int
    let isActive: Bool
    let isPublic: Bool
    let createdBy: String?

    let nonprofits: Nonprofit?

    var progress: Double {
        guard goalAmountJpy > 0 else { return 0 }
        return min(Double(raisedAmountJpy) / Double(goalAmountJpy), 1.0)
    }

}

// ─── Campaign Participation ───────────────────────────────────────────────────

struct CampaignParticipation: Decodable, Identifiable {
    let id: String
    let campaignId: String
    let pledgeFlatEnabled: Bool
    let pledgePerKmJpy: Int?
    let totalDistanceKm: Double
    let totalDonatedJpy: Int
    let activityCount: Int
    let joinedAt: Date
}

// ─── Donation ─────────────────────────────────────────────────────────────────

struct Donation: Decodable, Identifiable {
    let id: String
    let flatAmountJpy: Int
    let perKmAmountJpy: Int
    let totalAmountJpy: Int
    let distanceKm: Double?
    let status: String
    let triggerType: String
    let createdAt: Date
    let campaigns: DonationCampaignRef?
    let activities: DonationActivityRef?

    struct DonationCampaignRef: Decodable {
        let titleJa: String
        let titleEn: String
        let nonprofits: NonprofitRef?
        struct NonprofitRef: Decodable {
            let nameJa: String
            let nameEn: String
        }
    }

    struct DonationActivityRef: Decodable {
        let name: String
        let sportType: String
        let distanceMeters: Double
    }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

struct DonationSummary: Decodable {
    let totalDistanceKm: Double
    let totalDonatedJpy: Int
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

struct LeaderboardEntry: Decodable, Identifiable {
    let id = UUID()
    let totalDonatedJpy: Int
    let totalDistanceKm: Double
    let activityCount: Int
    let userProfiles: UserRef?

    struct UserRef: Decodable {
        let displayName: String
        let avatarUrl: String?
    }

    enum CodingKeys: String, CodingKey {
        case totalDonatedJpy, totalDistanceKm, activityCount, userProfiles
    }
}

// ─── User Role ────────────────────────────────────────────────────────────────

enum UserRole: String, Decodable, Equatable {
    case athlete
    case nonprofit
    case admin

    var isAthleteOrAbove: Bool { true }
}

// ─── Nonprofit Profile (user account) ────────────────────────────────────────

enum NonprofitStatus: String, Decodable, Equatable {
    case pending, approved, rejected
}

enum NonprofitCategory: String, CaseIterable, Decodable, Identifiable {
    case education, environment, health, children, disaster_relief, animal_welfare, other
    var id: String { rawValue }

    var labelJa: String {
        switch self {
        case .education:      return "教育"
        case .environment:    return "環境"
        case .health:         return "医療・健康"
        case .children:       return "子ども・青少年"
        case .disaster_relief: return "災害支援"
        case .animal_welfare: return "動物保護"
        case .other:          return "その他"
        }
    }
    var labelEn: String {
        switch self {
        case .education:      return "Education"
        case .environment:    return "Environment"
        case .health:         return "Health"
        case .children:       return "Children & Youth"
        case .disaster_relief: return "Disaster Relief"
        case .animal_welfare: return "Animal Welfare"
        case .other:          return "Other"
        }
    }
}

struct NonprofitProfile: Decodable, Identifiable {
    let id: String
    let userId: String
    let nameJa: String
    let nameEn: String
    let descriptionJa: String
    let descriptionEn: String
    let logoUrl: String?
    let websiteUrl: String?
    let category: NonprofitCategory
    let donorboxCampaignId: String
    let donorboxAccountEmail: String
    let status: NonprofitStatus
    let rejectionReason: String?
    let nonprofitId: String?
    let createdAt: Date
}

// ─── Nonprofit Dashboard ──────────────────────────────────────────────────────

struct NonprofitDashboard: Decodable {
    let totalRaisedJpy: Int
    let campaigns: [Campaign]
    let recentDonations: [NonprofitDonation]
    let topAthletes: [TopAthlete]

    struct NonprofitDonation: Decodable, Identifiable {
        let id: String
        let totalAmountJpy: Int
        let distanceKm: Double?
        let createdAt: Date
        let campaignId: String
        // user_profiles join
        struct AthleteRef: Decodable {
            let displayName: String
            let avatarUrl: String?
        }
        // decoded as userProfiles from join alias
    }

    struct TopAthlete: Decodable, Identifiable {
        let userId: String
        let displayName: String
        let avatarUrl: String?
        let totalDonatedJpy: Int
        let totalDistanceKm: Double
        let activityCount: Int
        var id: String { userId }
    }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

struct PlatformStats: Decodable {
    let totalAthletes: Int
    let totalNonprofits: Int
    let pendingApprovals: Int
    let approvedNonprofits: Int
    let activeCampaigns: Int
    let totalDonatedJpy: Int
    let totalDonations: Int
    let totalActivities: Int
}

struct AdminNonprofitRow: Decodable, Identifiable {
    let id: String
    let nameJa: String
    let nameEn: String
    let category: NonprofitCategory
    let status: NonprofitStatus
    let rejectionReason: String?
    let donorboxCampaignId: String
    let websiteUrl: String?
    let logoUrl: String?
    let createdAt: Date
    let reviewedAt: Date?
}

// ─── API responses ────────────────────────────────────────────────────────────

/// GET /auth/me response — combines user_profiles + role + optional nonprofit_profile
struct MeResponse: Decodable {
    let id: String
    let userId: String
    let displayName: String
    let avatarUrl: String?
    let totalDistanceKm: Double
    let totalDonatedJpy: Int
    let stravaAthleteId: Int?
    let stripeCustomerId: String?
    let role: UserRole
    let nonprofitProfile: NonprofitProfileSummary?

    struct NonprofitProfileSummary: Decodable {
        let id: String
        let status: NonprofitStatus
        let nameJa: String
        let nameEn: String
        let nonprofitId: String?
        let rejectionReason: String?
    }
}

/// POST /auth/nonprofit/register body
struct NonprofitRegistration: Encodable {
    let email: String
    let password: String
    let displayName: String
    let nameJa: String
    let nameEn: String
    let descriptionJa: String
    let descriptionEn: String
    let websiteUrl: String?
    let category: String
    let donorboxCampaignId: String
    let donorboxAccountEmail: String
}

struct AuthResponse: Decodable {
    let accessToken: String
    let userId: String
}

struct CheckoutSession: Decodable {
    let url: String
}

struct SetupIntentResponse: Decodable {
    let clientSecret: String
}
