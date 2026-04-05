import SwiftUI

@MainActor
final class ActivityListVM: ObservableObject {
    @Published var activities: [Activity] = []
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        // Activities are fetched from the local Supabase mirror via the backend
        activities = (try? await APIClient.shared.request(.activities)) ?? []
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
                        ActivityRow(activity: a)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(i18n.t(.activitiesTitle))
            .refreshable { await vm.load() }
            .task { await vm.load() }
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
        }
        .padding(.vertical, 8)
    }
}
