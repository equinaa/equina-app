import ActivityKit
import Foundation

// The ride in progress, as the lock screen and the Dynamic Island show it.
//
// ActivityKit finds an activity's type by its name, so the app and this
// extension each compile their own copy of this file:
// modules/ride-activity/ios/RideActivityAttributes.swift is the app's, and
// tests/ride-live-activity.test.ts keeps the two identical. The app fills it
// from src/features/ride/ride-live-activity.ts, which says what each field
// means; change all three together.
//
// Times are epoch milliseconds, the way the app's ride clock keeps them, so
// the JSON the app sends (and a push later) decodes with no date strategy.

@available(iOS 16.1, *)
struct RideActivityAttributes: ActivityAttributes {
  struct Phase: Codable, Hashable {
    var title: String
    var detail: String
    var minutes: Int
  }

  struct ContentState: Codable, Hashable {
    /// The phase the rider is in.
    var phaseIndex: Int
    /// The ride clock is running. A paused ride, or one brought back after its planned end, is not.
    var clockRunning: Bool
    /// Every phase has had its time. The clock still runs until the rider finishes.
    var phasesDone: Bool
    /// When the ride clock read zero, pauses left out: the clock counts up from here.
    var clockStartMs: Double
    /// The ride clock while it is stopped. Zero while it runs.
    var elapsedMs: Double
    /// When each phase begins on that clock: for the phase now and the ones ahead, the time it
    /// starts if the clock keeps running.
    var phaseStartMs: [Double]
    /// When the planned time runs out if the clock keeps running.
    var endMs: Double
  }

  /// The ride's start, epoch ms: how the app finds this ride's activity after a relaunch.
  var rideId: String
  /// Empty for a ride with no horse.
  var horseName: String
  var training: String
  var phases: [Phase]
}
