import Foundation

struct WearableSyncSnapshot: Codable {
    var provider: String = "apple_health"
    var date: String?
    var metricsUpdatedAt: String?
    var stepsToday: Double?
    var activeMinutesToday: Double?
    var sleepHoursLastNight: Double?
    var weight: Double?
    var pulse: Double?
    var sourceDevice: String?
    var sourceAppVersion: String?
    var timezone: String?
    var baseVersion: Int?
}

enum WearableSyncField {
    static let apiPath = "/api/wearable/sync"
}

