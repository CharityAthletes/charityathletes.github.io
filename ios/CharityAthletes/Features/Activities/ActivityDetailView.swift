import SwiftUI

struct ActivityDetailView: View {
    let activity: Activity
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {

                // ── Stats ─────────────────────────────────────────────────────
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                          spacing: 12) {
                    StatCell(icon: "arrow.forward",
                             label: i18n.language == .ja ? "距離" : "Distance",
                             value: String(format: "%.2f km", activity.distanceKm))
                    StatCell(icon: "clock",
                             label: i18n.language == .ja ? "時間" : "Moving Time",
                             value: activity.formattedDuration)
                    StatCell(icon: "mountain.2",
                             label: i18n.language == .ja ? "獲得標高" : "Elevation",
                             value: String(format: "%.0f m", activity.totalElevationGain))
                    if let hr = activity.averageHeartrate {
                        StatCell(icon: "heart",
                                 label: i18n.language == .ja ? "平均心拍数" : "Avg Heart Rate",
                                 value: "\(Int(hr)) bpm")
                    }
                }

                // ── Strava link ───────────────────────────────────────────────
                if let sid = activity.stravaActivityId {
                    let appURL = URL(string: "strava://activities/\(sid)")!
                    let webURL = URL(string: "https://www.strava.com/activities/\(sid)")!
                    let url = UIApplication.shared.canOpenURL(appURL) ? appURL : webURL
                    Link(destination: url) {
                        Label(i18n.language == .ja ? "Stravaで見る" : "View on Strava",
                              systemImage: "arrow.up.right.square")
                            .font(.subheadline.bold())
                            .foregroundStyle(Color("StravaOrange"))
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity)
                            .background(Color("StravaOrange").opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            .padding(20)
        }
        .navigationTitle(activity.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Stat Cell

private struct StatCell: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color("BrandOrange"))
                .frame(width: 32, height: 32)
                .background(Color("BrandOrange").opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.subheadline.bold())
            }
            Spacer()
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
