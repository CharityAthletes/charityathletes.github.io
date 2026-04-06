enum Endpoint {
    // Auth / identity
    case me, stravaAuth, stravaLogin, stravaDisconnect
    case nonprofitRegister

    // Athlete
    case nonprofits
    case campaigns, myCampaigns, createdCampaigns, createCampaign, campaign(String), leaderboard(String)
    case joinCampaign(String), unjoinCampaign(String), deleteCampaign(String), archiveCampaign(String), updateCampaign(String), donateCampaign(String), finalizeCampaign(String), pledgeCampaign(String), campaignPledges(String), campaignParticipants(String)
    case donations, donationSummary, setupPayment, confirmSetup, paymentMethod
    case activities
    case stravaSync

    // Nonprofit
    case nonprofitProfile
    case nonprofitDashboard
    case nonprofitCampaigns

    // Charities
    case charities(String?, String?) // (query, category)
    case charityRequest

    // Admin
    case adminStats
    case adminNonprofits(String?)        // optional ?status= filter
    case adminNonprofitDetail(String)
    case adminApproveNonprofit(String)
    case adminRejectNonprofit(String)
    case adminUsers

    var path: String {
        switch self {
        case .me:                            return "/auth/me"
        case .stravaAuth:                    return "/auth/strava"
        case .stravaLogin:                   return "/auth/strava/login"
        case .stravaDisconnect:              return "/auth/strava"
        case .nonprofitRegister:             return "/auth/nonprofit/register"

        case .nonprofits:                    return "/nonprofits"
        case .campaigns:                     return "/campaigns"
        case .myCampaigns:                   return "/campaigns/mine"
        case .createdCampaigns:              return "/campaigns/created"
        case .createCampaign:                return "/campaigns"
        case .campaign(let id):              return "/campaigns/\(id)"
        case .leaderboard(let id):           return "/campaigns/\(id)/leaderboard"
        case .joinCampaign(let id):          return "/campaigns/\(id)/join"
        case .unjoinCampaign(let id):        return "/campaigns/\(id)/join"
        case .deleteCampaign(let id):        return "/campaigns/\(id)"
        case .archiveCampaign(let id):       return "/campaigns/\(id)/archive"
        case .updateCampaign(let id):        return "/campaigns/\(id)"
        case .donateCampaign(let id):        return "/campaigns/\(id)/donate"
        case .finalizeCampaign(let id):      return "/campaigns/\(id)/finalize"
        case .pledgeCampaign(let id):        return "/campaigns/\(id)/pledge"
        case .campaignPledges(let id):       return "/campaigns/\(id)/pledges"
        case .campaignParticipants(let id):  return "/campaigns/\(id)/participants"
        case .donations:                     return "/donations"
        case .donationSummary:               return "/donations/summary"
        case .setupPayment:                  return "/donations/setup-payment"
        case .confirmSetup:                  return "/donations/confirm-setup"
        case .paymentMethod:                 return "/donations/payment-method"
        case .activities:                    return "/activities"
        case .stravaSync:                    return "/auth/strava/sync"

        case .nonprofitProfile:              return "/nonprofit/profile"
        case .nonprofitDashboard:            return "/nonprofit/dashboard"
        case .nonprofitCampaigns:            return "/nonprofit/campaigns"

        case .charities(let q, let cat):
            var parts: [String] = []
            if let q = q, !q.isEmpty { parts.append("q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)") }
            if let cat = cat, !cat.isEmpty { parts.append("category=\(cat.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cat)") }
            return parts.isEmpty ? "/charities" : "/charities?\(parts.joined(separator: "&"))"
        case .charityRequest:                return "/charities/request"

        case .adminStats:                    return "/admin/stats"
        case .adminNonprofits(let status):
            return status != nil ? "/admin/nonprofits?status=\(status!)" : "/admin/nonprofits"
        case .adminNonprofitDetail(let id):  return "/admin/nonprofits/\(id)"
        case .adminApproveNonprofit(let id): return "/admin/nonprofits/\(id)/approve"
        case .adminRejectNonprofit(let id):  return "/admin/nonprofits/\(id)/reject"
        case .adminUsers:                    return "/admin/users"
        }
    }

    var method: String {
        switch self {
        case .unjoinCampaign, .deleteCampaign, .stravaDisconnect:
            return "DELETE"
        case .archiveCampaign, .updateCampaign:
            return "PATCH"
        case .nonprofitRegister,
             .createCampaign,
             .joinCampaign, .donateCampaign, .setupPayment, .confirmSetup,
             .finalizeCampaign, .pledgeCampaign,
             .adminApproveNonprofit, .adminRejectNonprofit,
             .charityRequest, .stravaSync:
            return "POST"
        default:
            return "GET"
        }
    }
}
