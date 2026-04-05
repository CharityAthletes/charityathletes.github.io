import SwiftUI

@MainActor
final class AdminQueueVM: ObservableObject {
    @Published var nonprofits: [AdminNonprofitRow] = []
    @Published var selectedFilter: String? = "pending"
    @Published var isLoading = false
    @Published var actionInFlight: String?   // id of the row being acted on
    @Published var error: String?

    // Reject flow
    @Published var rejectTarget: AdminNonprofitRow?
    @Published var rejectReason = ""

    func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { nonprofits = try await APIClient.shared.getAdminNonprofits(status: selectedFilter) }
        catch let e { error = e.localizedDescription }
    }

    func approve(_ row: AdminNonprofitRow) async {
        actionInFlight = row.id
        defer { actionInFlight = nil }
        do {
            try await APIClient.shared.approveNonprofit(id: row.id)
            nonprofits.removeAll { $0.id == row.id }
        } catch let e { error = e.localizedDescription }
    }

    func reject(reason: String) async {
        guard let target = rejectTarget else { return }
        actionInFlight = target.id
        defer { actionInFlight = nil; rejectTarget = nil; rejectReason = "" }
        do {
            try await APIClient.shared.rejectNonprofit(id: target.id, reason: reason)
            nonprofits.removeAll { $0.id == target.id }
        } catch let e { error = e.localizedDescription }
    }
}

struct AdminQueueView: View {
    @StateObject private var vm = AdminQueueVM()
    @EnvironmentObject var i18n: I18n

    private let filters: [(label: String, value: String?)] = [
        ("pending", "pending"), ("approved", "approved"), ("rejected", "rejected"), ("all", nil)
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter picker
                Picker("Filter", selection: $vm.selectedFilter) {
                    ForEach(filters, id: \.label) { f in
                        Text(filterLabel(f.label)).tag(f.value)
                    }
                }
                .pickerStyle(.segmented)
                .padding()
                .onChange(of: vm.selectedFilter) { _ in Task { await vm.load() } }

                if vm.isLoading && vm.nonprofits.isEmpty {
                    Spacer(); ProgressView(); Spacer()
                } else if vm.nonprofits.isEmpty {
                    Spacer()
                    ContentUnavailableView(
                        i18n.language == .ja ? "申請はありません" : "No applications",
                        systemImage: "tray"
                    )
                    Spacer()
                } else {
                    List(vm.nonprofits) { row in
                        NonprofitApplicationRow(
                            row: row,
                            isActing: vm.actionInFlight == row.id,
                            onApprove: { Task { await vm.approve(row) } },
                            onReject:  { vm.rejectTarget = row }
                        )
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(i18n.t(.adminQueue))
            .task { await vm.load() }
            .refreshable { await vm.load() }
            .sheet(item: $vm.rejectTarget) { target in
                RejectSheet(
                    nonprofitName: I18n.shared.pick(ja: target.nameJa, en: target.nameEn),
                    reason: $vm.rejectReason
                ) {
                    Task { await vm.reject(reason: vm.rejectReason) }
                }
            }
            .alert(i18n.t(.commonError), isPresented: Binding(
                get: { vm.error != nil },
                set: { if !$0 { vm.error = nil } }
            )) {
                Button(i18n.t(.commonClose)) { vm.error = nil }
            } message: {
                Text(vm.error ?? "")
            }
        }
    }

    private func filterLabel(_ key: String) -> String {
        switch key {
        case "pending":  return i18n.t(.adminPending)
        case "approved": return i18n.t(.adminApproved)
        case "rejected": return i18n.t(.adminRejected)
        default:         return i18n.language == .ja ? "すべて" : "All"
        }
    }
}

// MARK: - Application row

private struct NonprofitApplicationRow: View {
    let row: AdminNonprofitRow
    let isActing: Bool
    let onApprove: () -> Void
    let onReject: () -> Void
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(i18n.pick(ja: row.nameJa, en: row.nameEn))
                        .font(.headline).lineLimit(1)
                    Text(row.category.labelFor(i18n.language))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                StatusPill(status: row.status)
            }

            HStack(spacing: 6) {
                if let url = row.websiteUrl {
                    Label(url, systemImage: "link").lineLimit(1)
                }
            }
            .font(.caption2).foregroundStyle(.secondary)

            // Action buttons only for pending
            if row.status == .pending {
                HStack(spacing: 12) {
                    Button {
                        onReject()
                    } label: {
                        Label(i18n.t(.adminReject), systemImage: "xmark")
                            .font(.subheadline.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(Color.red.opacity(0.1))
                            .foregroundStyle(.red)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    Button {
                        onApprove()
                    } label: {
                        Label(i18n.t(.adminApprove), systemImage: "checkmark")
                            .font(.subheadline.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(Color.green.opacity(0.1))
                            .foregroundStyle(.green)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                .disabled(isActing)
                .overlay { if isActing { ProgressView() } }
            }

            if let reason = row.rejectionReason, !reason.isEmpty {
                Text("• \(reason)").font(.caption).foregroundStyle(.red)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.vertical, 4)
    }
}

// MARK: - Reject sheet

private struct RejectSheet: View {
    let nonprofitName: String
    @Binding var reason: String
    let onConfirm: () -> Void
    @Environment(\.dismiss) var dismiss
    @ObservedObject private var i18n = I18n.shared

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text(nonprofitName)) {
                    TextField(i18n.t(.adminRejectReason), text: $reason, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle(i18n.t(.adminReject))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(i18n.t(.commonCancel)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(i18n.t(.adminReject)) {
                        onConfirm(); dismiss()
                    }
                    .foregroundStyle(.red)
                    .disabled(reason.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Status pill

struct StatusPill: View {
    let status: NonprofitStatus
    @ObservedObject private var i18n = I18n.shared

    var label: String {
        switch status {
        case .pending:  return i18n.t(.adminPending)
        case .approved: return i18n.t(.adminApproved)
        case .rejected: return i18n.t(.adminRejected)
        }
    }
    var color: Color {
        switch status {
        case .pending:  return .orange
        case .approved: return .green
        case .rejected: return .red
        }
    }
    var body: some View {
        Text(label)
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// MARK: - Category helper

extension NonprofitCategory {
    func labelFor(_ language: Language) -> String {
        language == .ja ? labelJa : labelEn
    }
}
