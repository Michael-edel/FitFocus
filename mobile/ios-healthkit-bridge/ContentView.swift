import SwiftUI

struct ContentView: View {
    @State private var baseURLText = "https://YOUR-FITFOCUS-DOMAIN.example"
    @State private var mobileToken = ""
    @StateObject private var bridgeHolder = BridgeHolder()

    var body: some View {
        NavigationStack {
            Form {
                Section("FitFocus connection") {
                    TextField("Base URL", text: $baseURLText)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    SecureField("Mobile token", text: $mobileToken)
                    Text("Get the token from `POST /api/mobile/token` after logging in to FitFocus.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("HealthKit") {
                    Button("Request HealthKit access") {
                        Task {
                            do {
                                try await bridgeHolder.bridge.requestAccess()
                            } catch {
                                bridgeHolder.message = error.localizedDescription
                            }
                        }
                    }

                    Button("Sync now") {
                        Task {
                            await bridgeHolder.bridge.syncNow(appVersion: "1.0.0")
                            bridgeHolder.message = bridgeHolder.bridge.lastError ?? "Synced"
                        }
                    }
                    .disabled(baseURLText.isEmpty || mobileToken.isEmpty)
                }

                Section("Status") {
                    Text(bridgeHolder.message.isEmpty ? "Ready" : bridgeHolder.message)
                    if let lastSyncAt = bridgeHolder.bridge.lastSyncAt {
                        Text("Last sync: \(lastSyncAt.formatted(date: .abbreviated, time: .standard))")
                    }
                }
            }
            .navigationTitle("FitFocus Bridge")
            .onChange(of: baseURLText) { _, newValue in
                bridgeHolder.update(baseURL: newValue, token: mobileToken)
            }
            .onChange(of: mobileToken) { _, newValue in
                bridgeHolder.update(baseURL: baseURLText, token: newValue)
            }
        }
    }
}

private final class BridgeHolder: ObservableObject {
    @Published var bridge: FitFocusWearableBridge
    @Published var message: String = ""

    private var token: String = ""

    init() {
        self.bridge = FitFocusWearableBridge(
            baseURL: URL(string: "https://YOUR-FITFOCUS-DOMAIN.example")!,
            tokenProvider: { nil }
        )
    }

    func update(baseURL: String, token: String) {
        self.token = token
        guard let url = URL(string: baseURL) else { return }
        bridge = FitFocusWearableBridge(baseURL: url) { [weak self] in self?.token }
    }
}

