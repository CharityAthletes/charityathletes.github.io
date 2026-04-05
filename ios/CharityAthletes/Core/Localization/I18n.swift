/**
 * I18n — internationalisation manager
 *
 * Default language: Japanese (ja)
 * Toggle to English via the Profile screen; persisted in UserDefaults.
 *
 * Usage:
 *   @EnvironmentObject var i18n: I18n
 *   Text(i18n.t(.campaignsTitle))
 *
 *   // Or via property wrapper in non-View types:
 *   @ObservedObject private var i18n = I18n.shared
 */
import SwiftUI

// ── Language ──────────────────────────────────────────────────────────────────

enum Language: String, CaseIterable, Identifiable {
    case ja, en
    var id: String { rawValue }
    var displayName: String { self == .ja ? "日本語" : "English" }
}

// ── String keys ───────────────────────────────────────────────────────────────

enum L: String {
    // Tabs
    case tabDashboard  = "tab.dashboard"
    case tabCampaigns  = "tab.campaigns"
    case tabActivities = "tab.activities"
    case tabCharities  = "tab.charities"
    case tabProfile    = "tab.profile"

    // Onboarding
    case onboardingTagline  = "onboarding.tagline"
    case onboardingGetStarted = "onboarding.get_started"
    case onboardingSignIn   = "onboarding.sign_in"

    // Auth
    case authEmail          = "auth.email"
    case authPassword       = "auth.password"
    case authDisplayName    = "auth.display_name"
    case authRegister       = "auth.register"
    case authLogin          = "auth.login"
    case authSwitchToSignUp = "auth.switch_signup"
    case authSwitchToLogin  = "auth.switch_login"

    // Dashboard
    case dashboardTitle         = "dashboard.title"
    case dashboardTotalDonated  = "dashboard.total_donated"
    case dashboardTotalDistance = "dashboard.total_distance"
    case dashboardConnectStrava = "dashboard.connect_strava"
    case dashboardConnectHint   = "dashboard.connect_hint"
    case dashboardActiveCampaigns = "dashboard.active_campaigns"

    // Campaigns
    case campaignsTitle       = "campaigns.title"
    case campaignsEmpty       = "campaigns.empty"
    case campaignJoin         = "campaign.join"
    case campaignDonate       = "campaign.donate"
    case campaignRaised       = "campaign.raised"
    case campaignGoal         = "campaign.goal"
    case campaignParticipants = "campaign.participants"
    case campaignLeaderboard  = "campaign.leaderboard"
    case campaignFlatLabel    = "campaign.flat_label"
    case campaignPerKmLabel   = "campaign.per_km_label"
    case campaignJoinTitle    = "campaign.join_title"
    case campaignJoinConfirm  = "campaign.join_confirm"

    // Activities
    case activitiesTitle    = "activities.title"
    case activitiesEmpty    = "activities.empty"
    case activityDistance   = "activity.distance"
    case activityDuration   = "activity.duration"
    case activityElevation  = "activity.elevation"

    // Donations
    case donationsTitle   = "donations.title"
    case donationFlat     = "donation.flat"
    case donationPerKm    = "donation.per_km"
    case donationTotal    = "donation.total"
    case donationPending  = "donation.pending"
    case donationComplete = "donation.complete"
    case donationFailed   = "donation.failed"

    // Profile
    case profileTitle       = "profile.title"
    case profileLanguage    = "profile.language"
    case profileStrava      = "profile.strava"
    case profileStravaConnected = "profile.strava_connected"
    case profileStravaConnect   = "profile.strava_connect"
    case profilePaymentMethod   = "profile.payment_method"
    case profileAddCard     = "profile.add_card"
    case profileSignOut     = "profile.sign_out"

    // Nonprofit signup
    case npSignupTitle       = "np_signup.title"
    case npSignupNameJa      = "np_signup.name_ja"
    case npSignupNameEn      = "np_signup.name_en"
    case npSignupDescJa      = "np_signup.desc_ja"
    case npSignupDescEn      = "np_signup.desc_en"
    case npSignupWebsite     = "np_signup.website"
    case npSignupCategory    = "np_signup.category"
    case npSignupDonorboxId  = "np_signup.donorbox_id"
    case npSignupDonorboxEmail = "np_signup.donorbox_email"
    case npSignupSubmit      = "np_signup.submit"
    case npSignupSuccess     = "np_signup.success"

    // Nonprofit pending
    case npPendingTitle   = "np_pending.title"
    case npPendingMessage = "np_pending.message"
    case npRejectedTitle  = "np_rejected.title"
    case npRejectedMessage = "np_rejected.message"

    // Nonprofit dashboard
    case npDashTitle        = "np_dash.title"
    case npDashTotalRaised  = "np_dash.total_raised"
    case npDashCampaigns    = "np_dash.campaigns"
    case npDashTopAthletes  = "np_dash.top_athletes"
    case npDashRecentDonations = "np_dash.recent_donations"

    // Admin
    case adminTitle         = "admin.title"
    case adminQueue         = "admin.queue"
    case adminStats         = "admin.stats"
    case adminApprove       = "admin.approve"
    case adminReject        = "admin.reject"
    case adminRejectReason  = "admin.reject_reason"
    case adminPending       = "admin.pending"
    case adminApproved      = "admin.approved"
    case adminRejected      = "admin.rejected"
    case adminTotalAthletes = "admin.total_athletes"
    case adminTotalNonprofits = "admin.total_nonprofits"
    case adminActiveCampaigns = "admin.active_campaigns"
    case adminTotalDonated  = "admin.total_donated"

    // Common
    case commonKm      = "common.km"
    case commonYen     = "common.yen"
    case commonLoading = "common.loading"
    case commonError   = "common.error"
    case commonRetry   = "common.retry"
    case commonClose   = "common.close"
    case commonSave    = "common.save"
    case commonCancel  = "common.cancel"
}

// ── Manager ───────────────────────────────────────────────────────────────────

final class I18n: ObservableObject {
    static let shared = I18n()

    @Published var language: Language {
        didSet { UserDefaults.standard.set(language.rawValue, forKey: "ca_language") }
    }

    private init() {
        let saved = UserDefaults.standard.string(forKey: "ca_language") ?? "ja"
        language = Language(rawValue: saved) ?? .ja
    }

    func t(_ key: L) -> String {
        // Look up in the appropriate .lproj bundle
        guard
            let path   = Bundle.main.path(forResource: language.rawValue, ofType: "lproj"),
            let bundle = Bundle(path: path)
        else {
            return NSLocalizedString(key.rawValue, comment: "")
        }
        return NSLocalizedString(key.rawValue, bundle: bundle, comment: "")
    }

    /// Convenience for selecting between two pre-localised strings from the server
    func pick(ja: String, en: String) -> String {
        language == .ja ? ja : en
    }
}
