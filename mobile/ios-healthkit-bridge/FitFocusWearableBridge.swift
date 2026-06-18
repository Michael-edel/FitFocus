import Foundation
import HealthKit
import UIKit

final class FitFocusWearableBridge: ObservableObject {
    private let store = HKHealthStore()
    private let session: URLSession
    private let baseURL: URL
    private let tokenProvider: () -> String?

    @Published var lastError: String?
    @Published var lastSyncAt: Date?

    init(baseURL: URL, session: URLSession = .shared, tokenProvider: @escaping () -> String?) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    var isHealthDataAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    func requestAccess() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw NSError(domain: "HealthKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Health data unavailable on this device"])
        }

        let stepType = HKObjectType.quantityType(forIdentifier: .stepCount)!
        let activeMinutesType = HKObjectType.quantityType(forIdentifier: .appleExerciseTime)!
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        let heartRateType = HKObjectType.quantityType(forIdentifier: .restingHeartRate)!
        let weightType = HKObjectType.quantityType(forIdentifier: .bodyMass)!

        try await store.requestAuthorization(toShare: [], read: [stepType, activeMinutesType, sleepType, heartRateType, weightType])
    }

    func syncNow(baseVersion: Int? = nil, appVersion: String = "1.0.0") async {
        do {
            let snapshot = try await collectSnapshot(baseVersion: baseVersion, appVersion: appVersion)
            try await send(snapshot: snapshot)
            await MainActor.run {
                self.lastError = nil
                self.lastSyncAt = Date()
            }
        } catch {
            await MainActor.run {
                self.lastError = error.localizedDescription
            }
        }
    }

    private func collectSnapshot(baseVersion: Int?, appVersion: String) async throws -> WearableSyncSnapshot {
        let now = Date()
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: now)

        let steps = try await queryCumulativeSum(quantityIdentifier: .stepCount, start: startOfDay, end: now)
        let activeMinutes = try await queryCumulativeSum(quantityIdentifier: .appleExerciseTime, start: startOfDay, end: now)
        let restingPulse = try await queryLatestQuantity(quantityIdentifier: .restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()))
        let bodyWeight = try await queryLatestQuantity(quantityIdentifier: .bodyMass, unit: HKUnit.gramUnit(with: .kilo))
        let sleepHours = try await querySleepHours(start: startOfDay, end: now)

        let formatter = ISO8601DateFormatter()
        formatter.timeZone = .current
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        return WearableSyncSnapshot(
            provider: "apple_health",
            date: formatter.string(from: now),
            metricsUpdatedAt: formatter.string(from: now),
            stepsToday: steps,
            activeMinutesToday: activeMinutes,
            sleepHoursLastNight: sleepHours,
            weight: bodyWeight,
            pulse: restingPulse,
            sourceDevice: UIDevice.current.model,
            sourceAppVersion: appVersion,
            timezone: TimeZone.current.identifier,
            baseVersion: baseVersion
        )
    }

    private func queryCumulativeSum(quantityIdentifier: HKQuantityTypeIdentifier, start: Date, end: Date) async throws -> Double {
        guard let type = HKObjectType.quantityType(forIdentifier: quantityIdentifier) else { return 0 }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                let unit: HKUnit = quantityIdentifier == .appleExerciseTime ? .minute() : .count()
                let value = stats?.sumQuantity()?.doubleValue(for: unit) ?? 0
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }

    private func queryLatestQuantity(quantityIdentifier: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: quantityIdentifier) else { return nil }
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: sort) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let sample = samples?.first as? HKQuantitySample else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: sample.quantity.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func querySleepHours(start: Date, end: Date) async throws -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: sort) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }
                let asleep: Double = samples.reduce(0) { partial, sample in
                    let asleepValues: Set<Int> = [HKCategoryValueSleepAnalysis.asleep.rawValue, HKCategoryValueSleepAnalysis.asleepCore.rawValue, HKCategoryValueSleepAnalysis.asleepDeep.rawValue, HKCategoryValueSleepAnalysis.asleepREM.rawValue, HKCategoryValueSleepAnalysis.inBed.rawValue]
                    guard asleepValues.contains(sample.value) else { return partial }
                    return partial + sample.endDate.timeIntervalSince(sample.startDate) / 3600.0
                }
                continuation.resume(returning: asleep)
            }
            store.execute(query)
        }
    }

    private func send(snapshot: WearableSyncSnapshot) async throws {
        let url = baseURL.appendingPathComponent("api/wearable/sync")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONEncoder().encode(snapshot)

        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "FitFocusWearableBridge", code: 2, userInfo: [NSLocalizedDescriptionKey: "No HTTP response"])
        }
        guard (200...299).contains(http.statusCode) else {
            throw NSError(domain: "FitFocusWearableBridge", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "Sync failed with status \(http.statusCode)"])
        }
    }
}
