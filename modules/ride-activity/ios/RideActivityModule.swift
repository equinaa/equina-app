import ActivityKit
import ExpoModulesCore
import Foundation

// Starts, updates and ends the ride's Live Activity: the ride on the lock
// screen and in the Dynamic Island, drawn by the RideActivity widget
// extension (targets/ride-activity). The app decides what it shows
// (src/features/ride/useRideLiveActivity.ts); this only hands it over.
//
// Attributes and state arrive as JSON, decoded straight into the same
// Codable struct the extension decodes, so the two can never read a field
// differently. The app runs from iOS 15.1 and ActivityKit from 16.2 (the
// stale date), so every call checks first and does nothing on an older
// phone. Ending is always immediate: a finished ride is on the recap screen,
// and a ride thrown away should not linger on the lock screen.

final class LiveActivitiesUnavailable: Exception, @unchecked Sendable {
  override var reason: String { "Live Activities need iOS 16.2 or later" }
}

private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
  try JSONDecoder().decode(type, from: Data(json.utf8))
}

private func staleDate(_ ms: Double?) -> Date? {
  ms.map { Date(timeIntervalSince1970: $0 / 1000) }
}

public final class RideActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RideActivity")

    // The phone can show one: iOS 16.2 or later, and Live Activities on
    // for Equina (Settings, Equina, Live Activities).
    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // Only from the foreground: iOS refuses a start from the background.
    AsyncFunction("start") { (attributesJson: String, stateJson: String, staleDateMs: Double?) async throws -> String in
      guard #available(iOS 16.2, *) else { throw LiveActivitiesUnavailable() }
      let attributes = try decode(RideActivityAttributes.self, attributesJson)
      let state = try decode(RideActivityAttributes.ContentState.self, stateJson)
      let activity = try Activity.request(
        attributes: attributes,
        content: ActivityContent(state: state, staleDate: staleDate(staleDateMs)),
        pushType: nil
      )
      return activity.id
    }

    // False when that activity is gone (ended by the rider or the system).
    AsyncFunction("update") { (id: String, stateJson: String, staleDateMs: Double?) async throws -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      let state = try decode(RideActivityAttributes.ContentState.self, stateJson)
      guard let activity = Activity<RideActivityAttributes>.activities.first(where: { $0.id == id }),
            activity.activityState == .active || activity.activityState == .stale
      else { return false }
      await activity.update(ActivityContent(state: state, staleDate: staleDate(staleDateMs)))
      return true
    }

    AsyncFunction("end") { (id: String) async in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<RideActivityAttributes>.activities where activity.id == id {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    // The ride activities still showing, with the ride each is for: after a
    // relaunch, the app takes back the one for its ride and ends the rest.
    AsyncFunction("list") { () async -> [[String: String]] in
      guard #available(iOS 16.2, *) else { return [] }
      return Activity<RideActivityAttributes>.activities
        .filter { $0.activityState == .active || $0.activityState == .stale }
        .map { ["id": $0.id, "rideId": $0.attributes.rideId] }
    }

    AsyncFunction("endAll") { () async in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<RideActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
