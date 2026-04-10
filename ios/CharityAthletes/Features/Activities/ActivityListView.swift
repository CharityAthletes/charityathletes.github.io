import SwiftUI

@MainActor
final class ActivityListVM: ObservableObject {
    @Published var activities: [Activity] = []
    @Published var isLoading  = false
    @Published var isSyncing  = false
    @Published var syncMessage: String? = nil

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            activities = try await APIClient.shared.request(.activities)
        } catch {
            print("[Activities] load error:", error)
        }
    }

    func syncStrava() async {
        isSyncing   = true
        syncMessage = nil
        defer { isSyncing = false }
        do {
            let count = try await APIClient.shared.syncStrava()
            syncMessage = count > 0
                ? "✓ \(count) new activit\(count == 1 ? "y" : "ies") synced"
                : "Already up to date"
            await load()
        } catch {
            syncMessage = "Sync failed: \(error.localizedDescription)"
        }
        // Clear message after 3 seconds
        try? await Task.sleep(for: .seconds(3))
        syncMessage = nil
    }
}


struct ActivityListView: View {
    @StateObject private var vm = ActivityListVM()
    @EnvironmentObject var i18n: I18n

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.activities.isEmpty {
                    ProgressView(i18n.t(.commonLoading))
                } else if vm.activities.isEmpty {
                    ContentUnavailableView(i18n.t(.activitiesEmpty), systemImage: "bicycle")
                } else {
                    List(vm.activities) { a in
                        NavigationLink(value: a) {
                            ActivityRow(activity: a)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                    .navigationDestination(for: Activity.self) { ActivityDetailView(activity: $0) }
                }
            }
            .navigationTitle(i18n.t(.activitiesTitle))
            .refreshable { await vm.load() }
            .task { await vm.load() }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await vm.syncStrava() }
                    } label: {
                        if vm.isSyncing {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Label(i18n.language == .ja ? "Stravaを同期" : "Sync Strava",
                                  systemImage: "arrow.triangle.2.circlepath")
                        }
                    }
                    .disabled(vm.isSyncing)
                }
            }
            .safeAreaInset(edge: .top) {
                if let msg = vm.syncMessage {
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(msg.hasPrefix("✓") ? Color.green : msg == "Already up to date" ? Color.blue : Color.red)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .animation(.easeInOut, value: vm.syncMessage)
                }
            }
        }
    }
}

struct ActivityRow: View {
    let activity: Activity
    @ObservedObject private var i18n = I18n.shared
    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium; f.timeStyle = .none
        return f
    }()

    private var stravaURL: URL? {
        guard let sid = activity.stravaActivityId else { return nil }
        let appURL = URL(string: "strava://activities/\(sid)")!
        let webURL = URL(string: "https://www.strava.com/activities/\(sid)")!
        return UIApplication.shared.canOpenURL(appURL) ? appURL : webURL
    }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: activity.sportIcon)
                .font(.title2)
                .foregroundStyle(Color("BrandOrange"))
                .frame(width: 44, height: 44)
                .background(Color("BrandOrange").opacity(0.1))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(activity.name).font(.subheadline.bold()).lineLimit(1)
                Text(Self.dateFormatter.string(from: activity.startDate))
                    .font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 12) {
                    Label(String(format: "%.1f km", activity.distanceKm), systemImage: "arrow.forward")
                    Label(activity.formattedDuration, systemImage: "clock")
                }
                .font(.caption2).foregroundStyle(.secondary)
            }

            Spacer()

            if let url = stravaURL {
                Link(destination: url) {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.up.right.square.fill")
                            .font(.caption2)
                        Text("Strava")
                            .font(.caption2.bold())
                    }
                    .foregroundStyle(Color("StravaOrange"))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Color("StravaOrange").opacity(0.12))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 8)
    }
}
