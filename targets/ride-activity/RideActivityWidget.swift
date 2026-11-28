import ActivityKit
import SwiftUI
import WidgetKit

// The ride on the lock screen and in the Dynamic Island.
//
// No code of Equina's runs here while the phone is locked: the app updates
// the activity only on a tap (start, pause, resume, skip) or when it is open
// as a phase changes. So everything drawn either moves by itself (the ride
// clock, the countdown, the whole-ride bar) or is a clock time that stays
// true. The current phase's name is exact until its planned end, the stale
// date; after that, with the app asleep, the phase line becomes a timetable
// of the phases ahead, which is right whichever of them is running. iOS
// marks an activity stale on its own schedule, not to the second (on the
// simulator no sooner than two minutes after the last update), so a short
// phase's countdown can rest at 0:00 for a moment before the switch.

@main
struct RideActivityBundle: WidgetBundle {
  var body: some Widget {
    RideActivityWidget()
  }
}

/// Equina's colours, from the app's theme (src/ui/theme/theme.ts).
enum Palette {
  /// surfaces.raised, the dark warm ground of the app's cards.
  static let ground = Color(red: 0x17 / 255, green: 0x15 / 255, blue: 0x11 / 255)
  static let ivory = Color(red: 0xF7 / 255, green: 0xF3 / 255, blue: 0xEA / 255)
  static let secondary = ivory.opacity(0.72)
  static let tertiary = ivory.opacity(0.46)
  static let brass = Color(red: 0xC4 / 255, green: 0xA0 / 255, blue: 0x5A / 255)
  static let track = ivory.opacity(0.18)
}

/// Opens the app on the ride (App.tsx handles it).
let rideURL = URL(string: "equina://ride")!

/// The SF Symbol for the ride, the closest to Equina's horse.
let rideGlyph = "figure.equestrian.sports"

/// The activity's attributes and state, read the way the views need them.
struct RideFacts {
  let attributes: RideActivityAttributes
  let state: RideActivityAttributes.ContentState
  /// The current phase's planned end has passed with no update: the app is asleep.
  let stale: Bool

  var name: String { attributes.horseName.isEmpty ? "Today's ride" : attributes.horseName }
  var title: String { "\(name) · \(attributes.training)" }
  var phases: [RideActivityAttributes.Phase] { attributes.phases }
  var isLastPhase: Bool { state.phaseIndex >= phases.count - 1 }
  /// Stale on the last phase means its time ran out: the phases are done by the clock.
  var done: Bool { state.phasesDone || (stale && isLastPhase && state.clockRunning) }
  var paused: Bool { !state.clockRunning }
  /// The phase line counts down: running, not done, and still exact.
  var live: Bool { state.clockRunning && !done && !stale }
  var phase: RideActivityAttributes.Phase? { phases.indices.contains(state.phaseIndex) ? phases[state.phaseIndex] : nil }
  var next: RideActivityAttributes.Phase? {
    phases.indices.contains(state.phaseIndex + 1) ? phases[state.phaseIndex + 1] : nil
  }

  var clockStart: Date { date(state.clockStartMs) }
  var end: Date { date(max(state.endMs, state.clockStartMs)) }
  var phaseStart: Date { date(startMs(state.phaseIndex) ?? state.clockStartMs) }
  var phaseEnd: Date { date(max(startMs(state.phaseIndex + 1) ?? state.endMs, startMs(state.phaseIndex) ?? state.clockStartMs)) }
  /// The countdown's range, never backwards.
  var phaseRange: ClosedRange<Date> { min(phaseStart, phaseEnd)...phaseEnd }
  /// Long enough for any ride; ActivityKit ends an activity after 8 hours.
  var clockRange: ClosedRange<Date> { clockStart...clockStart.addingTimeInterval(24 * 3600) }
  var rideRange: ClosedRange<Date> { clockStart...end }

  /// The planned ride time, pauses left out, in ms.
  var totalMs: Double { max(1, state.endMs - state.clockStartMs) }
  /// Where each phase after the first begins on the whole-ride bar, 0 to 1.
  var ticks: [Double] {
    (1..<max(1, phases.count)).compactMap { index in
      startMs(index).map { min(1, max(0, ($0 - state.clockStartMs) / totalMs)) }
    }
  }
  /// How far the stopped clock is through the plan.
  var stoppedFraction: Double { min(1, max(0, state.elapsedMs / totalMs)) }
  /// Time left in the phase when the clock stopped.
  var stoppedPhaseLeft: Double {
    let phaseEndMs = startMs(state.phaseIndex + 1) ?? state.endMs
    return max(0, phaseEndMs - state.clockStartMs - state.elapsedMs)
  }
  /// The phases after the one the state names, with the clock time each begins.
  var ahead: [(phase: RideActivityAttributes.Phase, start: Date)] {
    phases.indices.filter { $0 > state.phaseIndex }.compactMap { index in
      startMs(index).map { (phases[index], date($0)) }
    }
  }

  private func startMs(_ index: Int) -> Double? {
    state.phaseStartMs.indices.contains(index) ? state.phaseStartMs[index] : nil
  }
}

func date(_ ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }

/// "23:41", or "1:02:05" past the hour: the ride screen's clock.
func clockText(_ ms: Double) -> String {
  let seconds = max(0, Int(ms / 1000))
  let hours = seconds / 3600
  let minutes = (seconds % 3600) / 60
  let rest = seconds % 60
  return hours > 0
    ? String(format: "%d:%02d:%02d", hours, minutes, rest)
    : String(format: "%02d:%02d", minutes, rest)
}

struct RideActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RideActivityAttributes.self) { context in
      LockScreenView(ride: RideFacts(attributes: context.attributes, state: context.state, stale: context.isStale))
        .activityBackgroundTint(Palette.ground)
        .activitySystemActionForegroundColor(Palette.ivory)
        .widgetURL(rideURL)
    } dynamicIsland: { context in
      let ride = RideFacts(attributes: context.attributes, state: context.state, stale: context.isStale)
      return DynamicIsland {
        // The regions beside the camera are narrow: the horse and the
        // training go below it when they do not fit, and the phase, which
        // needs the width, has the whole bottom.
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Image(systemName: rideGlyph).foregroundStyle(Palette.brass)
            Text(ride.title).font(.subheadline.weight(.semibold)).lineLimit(1)
          }
          .foregroundStyle(Palette.ivory)
          .padding(.leading, 4)
          .dynamicIsland(verticalPlacement: .belowIfTooWide)
        }
        DynamicIslandExpandedRegion(.trailing) {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            RideClock(ride: ride).font(.subheadline.weight(.semibold).monospacedDigit())
            Text("ride").font(.caption).foregroundStyle(Palette.secondary)
          }
          .foregroundStyle(Palette.ivory)
          .padding(.trailing, 4)
          .dynamicIsland(verticalPlacement: .belowIfTooWide)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 8) {
            PhaseLine(ride: ride)
            PhaseTrack(ride: ride)
            NextLine(ride: ride)
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        HStack(spacing: 4) {
          Image(systemName: rideGlyph).foregroundStyle(Palette.brass)
          if let phase = ride.phase, !ride.done {
            Text(phase.title).font(.caption2.weight(.semibold)).lineLimit(1).frame(maxWidth: 64, alignment: .leading)
          }
        }
        .foregroundStyle(Palette.ivory)
      } compactTrailing: {
        CompactTime(ride: ride)
          .font(.caption2.weight(.semibold).monospacedDigit())
          .foregroundStyle(ride.live ? Palette.brass : Palette.ivory)
      } minimal: {
        Image(systemName: ride.paused ? "pause.fill" : rideGlyph).foregroundStyle(Palette.brass)
      }
      .widgetURL(rideURL)
      .keylineTint(Palette.brass)
    }
  }
}

/// The ride clock, counting up while it runs, still while it is stopped.
struct RideClock: View {
  let ride: RideFacts
  var body: some View {
    if ride.paused {
      Text(clockText(ride.state.elapsedMs))
    } else {
      // A timer text takes all the width it is given: held to the clock's own.
      Text(timerInterval: ride.clockRange, countsDown: false)
        .multilineTextAlignment(.trailing)
        .frame(width: 62, alignment: .trailing)
    }
  }
}

/// Time left in the phase, else the ride clock; a pause sign while paused.
struct CompactTime: View {
  let ride: RideFacts
  var body: some View {
    if ride.paused {
      Image(systemName: "pause.fill")
    } else if ride.live {
      Text(timerInterval: ride.phaseRange, countsDown: true)
        .multilineTextAlignment(.trailing)
        .frame(width: 40, alignment: .trailing)
    } else {
      Text(timerInterval: ride.clockRange, countsDown: false)
        .multilineTextAlignment(.trailing)
        .frame(width: 40, alignment: .trailing)
    }
  }
}

/// What the rider is doing now: the phase and its time left, paused, done, or
/// once the app has slept past a phase change, the clock times ahead.
struct PhaseLine: View {
  let ride: RideFacts

  var body: some View {
    if ride.done {
      VStack(alignment: .leading, spacing: 0) {
        Text("All phases done").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ivory)
        Text("Finish the ride in Equina").font(.caption).foregroundStyle(Palette.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else if ride.paused {
      HStack(alignment: .firstTextBaseline) {
        Text("Paused · \(ride.phase?.title ?? "")").font(.subheadline.weight(.semibold)).lineLimit(1)
        Spacer(minLength: 8)
        Text("\(clockText(ride.stoppedPhaseLeft)) left").font(.subheadline.monospacedDigit()).foregroundStyle(Palette.secondary)
      }
      .foregroundStyle(Palette.ivory)
    } else if ride.stale {
      // The app has not run since the phase's planned end: which phase is on
      // now is not known here, but when each one starts still is.
      timetable
        .font(.caption.monospacedDigit())
        .foregroundStyle(Palette.ivory)
        .lineLimit(2)
        .frame(maxWidth: .infinity, alignment: .leading)
    } else if let phase = ride.phase {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 0) {
          Text(phase.title.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(Palette.brass).lineLimit(1)
          if !phase.detail.isEmpty {
            Text(phase.detail).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ivory).lineLimit(1)
          }
        }
        Spacer(minLength: 8)
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(timerInterval: ride.phaseRange, countsDown: true)
            .font(.title3.weight(.semibold).monospacedDigit())
            .multilineTextAlignment(.trailing)
            .frame(width: 72, alignment: .trailing)
          Text("left").font(.caption).foregroundStyle(Palette.secondary)
        }
        .foregroundStyle(Palette.ivory)
      }
    }
  }

  /// "Cool-down 18:07 · Stretch 18:22 · ends 18:30"
  private var timetable: Text {
    var text = Text("")
    for item in ride.ahead {
      text = text + Text("\(item.phase.title) ") + Text(item.start, style: .time) + Text(" · ")
    }
    return text + Text("ends ") + Text(ride.end, style: .time)
  }
}

/// The whole ride as one bar, with a tick where each phase begins, and when
/// the plan ends. Running, the bar fills by itself; stopped, it holds.
struct PhaseTrack: View {
  let ride: RideFacts

  var body: some View {
    HStack(spacing: 10) {
      bar
        .tint(Palette.brass)
        .overlay {
          GeometryReader { geometry in
            ForEach(Array(ride.ticks.enumerated()), id: \.offset) { _, tick in
              Capsule()
                .fill(Palette.ground)
                .frame(width: 2, height: 8)
                .position(x: geometry.size.width * tick, y: geometry.size.height / 2)
            }
          }
        }
        .accessibilityHidden(true)
      // Stale, the timetable above already ends with it.
      if ride.done || ride.paused || ride.stale {
        EmptyView()
      } else {
        (Text("ends ") + Text(ride.end, style: .time))
          .font(.caption.monospacedDigit())
          .foregroundStyle(Palette.secondary)
          .fixedSize()
      }
    }
  }

  @ViewBuilder private var bar: some View {
    if ride.paused || ride.done {
      ProgressView(value: ride.paused ? ride.stoppedFraction : 1)
    } else {
      ProgressView(timerInterval: ride.rideRange, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
    }
  }
}

/// What comes after the phase now, in the expanded Dynamic Island.
struct NextLine: View {
  let ride: RideFacts

  var body: some View {
    if let next = ride.next, ride.live || ride.paused {
      Text("Next · \(next.title) · \(next.minutes) min")
        .font(.caption)
        .foregroundStyle(Palette.secondary)
        .lineLimit(1)
    }
  }
}

struct LockScreenView: View {
  let ride: RideFacts

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Image(systemName: rideGlyph).foregroundStyle(Palette.brass)
        Text(ride.title).font(.subheadline.weight(.semibold)).lineLimit(1)
        Spacer(minLength: 8)
        RideClock(ride: ride).font(.subheadline.weight(.semibold).monospacedDigit())
        Text("ride").font(.caption).foregroundStyle(Palette.secondary)
      }
      .foregroundStyle(Palette.ivory)
      PhaseLine(ride: ride)
      PhaseTrack(ride: ride)
    }
    .padding(16)
  }
}
