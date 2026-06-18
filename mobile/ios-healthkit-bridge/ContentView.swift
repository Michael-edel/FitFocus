import Combine
import SwiftUI

struct ContentView: View {
    @AppStorage("fitfocus.bridge.baseURL") private var baseURLText = "https://fitfocus.pages.dev"
    @AppStorage("fitfocus.bridge.mobileToken") private var mobileToken = ""
    @StateObject private var bridgeHolder = BridgeHolder()
    @State private var isSyncing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    headerCard
                    tokenCard
                    healthKitCard
                    statusCard
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("FitFocus Bridge")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable {
                await syncNow(source: "Pulled to sync")
            }
            .task {
                configureBridge()
            }
            .onOpenURL { url in
                applySetupURL(url)
            }
            .onChange(of: baseURLText) { _, _ in
                configureBridge()
            }
            .onChange(of: mobileToken) { _, _ in
                configureBridge()
            }
        }
    }

    private var headerCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Watch bridge")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Text("Sync HealthKit data to FitFocus")
                            .font(.title3.weight(.bold))
                        Text("Keep your token on this device, grant HealthKit access once, and pull down to push fresh data whenever needed.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 8) {
                        statusPill(text: bridgeHolder.bridge.isHealthDataAvailable ? "HealthKit ready" : "HealthKit unavailable", tint: bridgeHolder.bridge.isHealthDataAvailable ? .green : .red)
                        statusPill(text: isConfigured ? "Connected" : "Needs setup", tint: isConfigured ? .blue : .orange)
                    }
                }

                HStack(spacing: 10) {
                    metricChip(title: "Token", value: mobileToken.isEmpty ? "Missing" : "Saved")
                    metricChip(title: "Base URL", value: normalizedBaseURLText)
                }
            }
        }
    }

    private var tokenCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Connection")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)

                Text("1. Open FitFocus on the web.\n2. Call `POST /api/mobile/token`.\n3. Paste the token below once. It will stay on this device.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Text("You can also open a `fitfocusbridge://setup` link on this iPhone to fill both fields automatically.")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.green)

                VStack(alignment: .leading, spacing: 10) {
                    TextField("FitFocus base URL", text: $baseURLText)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .padding()
                        .background(rowBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                    SecureField("Mobile token", text: $mobileToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding()
                        .background(rowBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }

                HStack(spacing: 10) {
                    Button(role: .destructive) {
                        mobileToken = ""
                    } label: {
                        Label("Clear token", systemImage: "xmark.circle")
                    }
                    .buttonStyle(.bordered)

                    Spacer()

                    if isConfigured {
                        Label("Saved on this device", systemImage: "checkmark.seal.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.secondary)
                    } else {
                        Label("Enter both values to sync", systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                }
            }
        }
    }

    private var healthKitCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("HealthKit")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)

                Text("Grant read access once for steps, exercise minutes, sleep, pulse, and weight. After that, pull to sync or tap the button below.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                HStack(spacing: 12) {
                    Button {
                        Task {
                            do {
                                try await bridgeHolder.bridge.requestAccess()
                                bridgeHolder.message = "HealthKit access granted"
                            } catch {
                                bridgeHolder.message = error.localizedDescription
                            }
                        }
                    } label: {
                        Label("Request access", systemImage: "heart.text.square")
                    }
                    .buttonStyle(.borderedProminent)

                    Button {
                        Task {
                            await syncNow(source: "Syncing now")
                        }
                    } label: {
                        Label("Sync now", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.bordered)
                    .disabled(!isConfigured || isSyncing)
                }

                Text("Tip: pull down on this screen to sync without tapping the button.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var statusCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Status")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)

                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: bridgeHolder.bridge.lastError == nil ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundStyle(bridgeHolder.bridge.lastError == nil ? .green : .red)
                        .font(.title3)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(bridgeHolder.message.isEmpty ? "Ready to sync" : bridgeHolder.message)
                            .font(.headline)
                        if let lastSyncAt = bridgeHolder.bridge.lastSyncAt {
                            Text("Last sync: \(lastSyncAt.formatted(date: .abbreviated, time: .standard))")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        if let lastError = bridgeHolder.bridge.lastError, !lastError.isEmpty {
                            Text(lastError)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                    }
                }
            }
        }
    }

    private var rowBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color.secondary.opacity(0.10))
    }

    private var normalizedBaseURLText: String {
        normalizedBaseURL(from: baseURLText)?.absoluteString ?? "Invalid URL"
    }

    private var isConfigured: Bool {
        normalizedBaseURL(from: baseURLText) != nil && !mobileToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func configureBridge() {
        bridgeHolder.update(baseURLText: baseURLText, token: mobileToken)
    }

    private func applySetupURL(_ url: URL) {
        guard url.scheme?.lowercased() == "fitfocusbridge" else { return }
        guard url.host?.lowercased() == "setup" || url.path == "/setup" || url.path.isEmpty else {
            bridgeHolder.message = "Unsupported setup link"
            return
        }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let query = components?.queryItems ?? []
        let baseValue = query.first(where: { $0.name.lowercased() == "baseurl" })?.value
        let tokenValue = query.first(where: { $0.name.lowercased() == "token" })?.value

        guard let baseValue, !baseValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            bridgeHolder.message = "Setup link missing base URL"
            return
        }
        guard let tokenValue, !tokenValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            bridgeHolder.message = "Setup link missing token"
            return
        }

        baseURLText = baseValue
        mobileToken = tokenValue
        bridgeHolder.message = "Imported bridge setup link"
    }

    private func syncNow(source: String) async {
        guard isConfigured else {
            bridgeHolder.message = "Add a valid base URL and mobile token first"
            return
        }
        guard !isSyncing else { return }

        isSyncing = true
        bridgeHolder.message = source
        await bridgeHolder.bridge.syncNow(appVersion: appVersion)
        await MainActor.run {
            if let error = bridgeHolder.bridge.lastError, !error.isEmpty {
                bridgeHolder.message = error
            } else {
                bridgeHolder.message = "Synced to FitFocus"
            }
            isSyncing = false
        }
    }

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
    }

    private func normalizedBaseURL(from text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let url = URL(string: trimmed), url.scheme != nil {
            return url
        }
        return URL(string: "https://\(trimmed)")
    }
}

private struct Card<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
        )
    }
}

private struct MetricChip: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.callout.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.secondary.opacity(0.10))
        )
    }
}

private struct StatusPill: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .foregroundStyle(tint)
            .background(
                Capsule(style: .continuous)
                    .fill(tint.opacity(0.12))
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(tint.opacity(0.35), lineWidth: 1)
            )
    }
}

private extension ContentView {
    func metricChip(title: String, value: String) -> some View {
        MetricChip(title: title, value: value)
    }

    func statusPill(text: String, tint: Color) -> some View {
        StatusPill(text: text, tint: tint)
    }
}

private final class BridgeHolder: ObservableObject {
    @Published var bridge: FitFocusWearableBridge
    @Published var message: String = ""

    private var token: String = ""
    private var bridgeChangeCancellable: AnyCancellable?

    init() {
        bridge = FitFocusWearableBridge(
            baseURL: URL(string: "https://fitfocus.pages.dev")!,
            tokenProvider: { nil }
        )
        bindBridge()
        message = "Ready to connect"
    }

    func update(baseURLText: String, token: String) {
        self.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = normalizedBaseURL(from: baseURLText) else {
            message = "Enter a valid FitFocus URL"
            return
        }

        bridge = FitFocusWearableBridge(baseURL: url) { [weak self] in
            let value = self?.token.trimmingCharacters(in: .whitespacesAndNewlines)
            return (value?.isEmpty == false) ? value : nil
        }
        bindBridge()
        message = self.token.isEmpty ? "Paste your mobile token to enable sync" : "Bridge ready"
    }

    private func bindBridge() {
        bridgeChangeCancellable = bridge.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    private func normalizedBaseURL(from text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let url = URL(string: trimmed), url.scheme != nil {
            return url
        }
        return URL(string: "https://\(trimmed)")
    }
}
