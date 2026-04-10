import SwiftUI
import MapKit

struct ActivityDetailView: View {
    let activity: Activity
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {

                // ── Route map ─────────────────────────────────────────────────
                if let polyline = activity.mapPolyline, !polyline.isEmpty {
                    RouteMapView(polylineString: polyline)
                        .frame(height: 260)
                        .clipped()
                }

                VStack(alignment: .leading, spacing: 24) {

                    // ── Stats ─────────────────────────────────────────────────
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

                    // ── Photos ────────────────────────────────────────────────
                    if let photos = activity.photoUrls, !photos.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(i18n.language == .ja ? "フォト" : "Photos")
                                .font(.headline)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(photos, id: \.self) { url in
                                        AsyncImage(url: URL(string: url)) { phase in
                                            switch phase {
                                            case .success(let img):
                                                img.resizable()
                                                    .scaledToFill()
                                                    .frame(width: 220, height: 160)
                                                    .clipped()
                                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                            case .failure:
                                                Color(.systemGray5)
                                                    .frame(width: 220, height: 160)
                                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                                    .overlay(Image(systemName: "photo")
                                                        .foregroundStyle(.secondary))
                                            default:
                                                Color(.systemGray5)
                                                    .frame(width: 220, height: 160)
                                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                                    .overlay(ProgressView())
                                            }
                                        }
                                    }
                                }
                                .padding(.horizontal, 1) // prevent clipping at edges
                            }
                        }
                    }

                    // ── Strava link ───────────────────────────────────────────
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
        }
        .navigationTitle(activity.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Route Map

private struct RouteMapView: View {
    let polylineString: String

    private var coordinates: [CLLocationCoordinate2D] {
        PolylineDecoder.decode(polylineString)
    }

    private var cameraPosition: MapCameraPosition {
        guard coordinates.count > 1 else { return .automatic }
        let lats = coordinates.map(\.latitude)
        let lons = coordinates.map(\.longitude)
        let center = CLLocationCoordinate2D(
            latitude:  (lats.min()! + lats.max()!) / 2,
            longitude: (lons.min()! + lons.max()!) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta:  max((lats.max()! - lats.min()!) * 1.4, 0.005),
            longitudeDelta: max((lons.max()! - lons.min()!) * 1.4, 0.005)
        )
        return .region(MKCoordinateRegion(center: center, span: span))
    }

    var body: some View {
        if coordinates.count > 1 {
            Map(initialPosition: cameraPosition) {
                MapPolyline(coordinates: coordinates)
                    .stroke(Color("BrandOrange"), lineWidth: 3)
                if let start = coordinates.first {
                    Annotation("", coordinate: start) {
                        Circle().fill(.green).frame(width: 12, height: 12)
                            .overlay(Circle().stroke(.white, lineWidth: 2))
                    }
                }
                if let end = coordinates.last {
                    Annotation("", coordinate: end) {
                        Circle().fill(Color("BrandOrange")).frame(width: 12, height: 12)
                            .overlay(Circle().stroke(.white, lineWidth: 2))
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .disabled(true)
        }
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
