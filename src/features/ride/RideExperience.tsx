import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Pause,
  Pencil,
  Play,
  SendHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from "lucide-react-native";
import type { RidePhaseEntry } from "../../backend";
import type { OnboardingDiscipline } from "../onboarding/OnboardingScreen";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { useReducedMotion } from "../../ui/motion/useReducedMotion";
import { equinaTheme } from "../../ui/theme/theme";
import {
  cancelRideAlerts,
  cancelStaleRideAlerts,
  cueFromClock,
  cueFromTap,
  holdScreenAwake,
  prepareRideCues,
  releaseRideCues,
  scheduleRideAlerts,
  silenceRideCues
} from "./ride-cues";
import {
  isRunning,
  pauseRun,
  phaseAnnouncement,
  phaseProgress,
  phaseRemainingMs,
  phasesDoneAnnouncement,
  plannedMinutes,
  reachedPhases,
  readyRun,
  resumeRun,
  rideElapsedMs,
  ridePhaseEntries,
  rideScheduleKey,
  rideTrainingLabel,
  skipPhase,
  startRun,
  syncRun,
  upcomingRideAlerts,
  type RidePlan,
  type RideRun
} from "./ride-plan";

export type RideMood = "Fresh" | "Focused" | "Tender";

export type RideSession = {
  id: string;
  startedAt: string;
  completedAt: string;
  discipline: OnboardingDiscipline;
  /** The training's id. Absent on rides from before the setup sheet. */
  trainingType?: string;
  focus: string;
  plannedDuration: string;
  elapsedSeconds: number;
  completedPhases: number;
  totalPhases: number;
  phases?: RidePhaseEntry[];
  mood: RideMood;
};

export type RideCompletion = Omit<RideSession, "mood">;

export type RideRecommendation = {
  title: string;
  coach: string;
  duration: string;
  summary: string;
  image: string;
};

/** What a ride was, in the words the rider chose: "Pole work", or the discipline for older rides. */
export const rideSessionLabel = (session: Pick<RideSession, "trainingType" | "discipline">) =>
  rideTrainingLabel(session.trainingType) ?? session.discipline;

const formatElapsed = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

export const rideDurationLabel = (seconds: number) => {
  if (seconds < 60) return "<1 min";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const tickMs = 250;
// A gap this long between ticks means the phone slept. A phase that began
// meanwhile was already announced by its notification, so it is not said again.
const sleptMs = 2_500;
const maxRideMs = 86_400_000;

export function RideModeScreen({
  plan,
  discipline,
  image,
  onFinish,
  onExit,
  onEdit
}: {
  plan: RidePlan;
  /** The horse's or the rider's, for a training that has none of its own. */
  discipline: OnboardingDiscipline;
  image: string;
  onFinish: (session: RideCompletion) => void;
  onExit: () => void;
  /** Back to the setup sheet. Only before the clock starts. */
  onEdit: () => void;
}) {
  const phases = plan.phases;
  const [run, setRun] = useState<RideRun>(readyRun);
  const [now, setNow] = useState(() => Date.now());
  const [voice, setVoice] = useState(true);
  const runRef = useRef(run);
  const voiceRef = useRef(voice);
  const lastTick = useRef(Date.now());
  const alertIds = useRef<string[]>([]);
  const alertQueue = useRef<Promise<void>>(Promise.resolve());
  const entryMotion = useRef(new Animated.Value(0)).current;
  const phaseMotion = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();
  const useNativeDriver = Platform.OS !== "web";
  runRef.current = run;
  voiceRef.current = voice;

  const started = run.startedAt !== null;
  const running = isRunning(run);
  const done = run.phasesDone;
  const currentPhase = phases[run.phaseIndex] ?? phases[0];
  const nextPhase = done ? undefined : phases[run.phaseIndex + 1];
  const isFinalPhase = run.phaseIndex >= phases.length - 1;
  const elapsedSeconds = Math.floor(rideElapsedMs(run, now) / 1000);
  const remainingSeconds = Math.ceil(phaseRemainingMs(run, phases, now) / 1000);
  const progress = phaseProgress(run, phases, now);
  const totalMinutes = plannedMinutes(phases);
  const trainingLabel = plan.trainingType.label;

  useEffect(() => {
    void prepareRideCues();
    void cancelStaleRideAlerts();
    const releaseScreen = holdScreenAwake();
    return () => {
      releaseScreen();
      releaseRideCues();
      const ids = alertIds.current;
      alertIds.current = [];
      void cancelRideAlerts(ids);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      entryMotion.setValue(1);
      return;
    }

    Animated.timing(entryMotion, {
      toValue: 1,
      duration: 280,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver
    }).start();
  }, [entryMotion, reducedMotion, useNativeDriver]);

  const pulsePhase = () => {
    if (reducedMotion || !useNativeDriver) return;
    phaseMotion.setValue(0);
    Animated.timing(phaseMotion, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver
    }).start();
  };

  // The clock. Time comes from timestamps; the interval only wakes the screen
  // to show it and to notice when a phase's minutes are up.
  useEffect(() => {
    if (!running) return;
    lastTick.current = Date.now();
    const interval = setInterval(() => {
      const tick = Date.now();
      const slept = tick - lastTick.current > sleptMs;
      lastTick.current = tick;
      setNow(tick);
      const step = syncRun(runRef.current, phases, tick);
      if (step.run === runRef.current) return;
      runRef.current = step.run;
      setRun(step.run);
      // Out of sight -- locked, or another app in front -- the notification
      // already told the rider; a second voice from the background would not.
      if (slept || AppState.currentState !== "active") return;
      if (step.finished) {
        cueFromClock(phasesDoneAnnouncement, voiceRef.current, "done");
      } else if (step.entered !== null) {
        const entered = phases[step.entered];
        if (entered) cueFromClock(phaseAnnouncement(entered), voiceRef.current, "phase");
      }
      pulsePhase();
    }, tickMs);
    return () => clearInterval(interval);
  }, [running, phases]);

  // What a locked phone is told, kept in step with the ride: every change of
  // phase still ahead, cleared on pause and rebuilt when the times ahead move.
  const alertKey = rideScheduleKey(run, phases);
  useEffect(() => {
    alertQueue.current = alertQueue.current.then(async () => {
      const previous = alertIds.current;
      alertIds.current = [];
      await cancelRideAlerts(previous);
      alertIds.current = await scheduleRideAlerts(upcomingRideAlerts(runRef.current, phases, Date.now()));
    });
  }, [alertKey, phases]);

  const startRide = () => {
    const first = phases[0];
    if (!first) return;
    const tick = Date.now();
    const next = startRun(run, tick);
    runRef.current = next;
    setRun(next);
    setNow(tick);
    cueFromTap(phaseAnnouncement(first), voice);
    pulsePhase();
  };

  const togglePause = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    const tick = Date.now();
    const next = running ? pauseRun(run, tick) : resumeRun(run, tick);
    if (running) silenceRideCues();
    runRef.current = next;
    setRun(next);
    setNow(tick);
  };

  const moveOn = () => {
    const tick = Date.now();
    const next = skipPhase(run, phases, tick);
    if (next === run) return;
    runRef.current = next;
    setRun(next);
    setNow(tick);
    const entered = phases[next.phaseIndex];
    cueFromTap(next.phasesDone || !entered ? phasesDoneAnnouncement : phaseAnnouncement(entered), voice);
    pulsePhase();
  };

  const toggleVoice = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (voice) silenceRideCues();
    setVoice((value) => !value);
  };

  const finishRide = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    silenceRideCues();
    const tick = Date.now();
    const elapsed = Math.min(maxRideMs, rideElapsedMs(run, tick));
    onFinish({
      id: `ride-${tick}`,
      startedAt: new Date(run.startedAt ?? tick).toISOString(),
      completedAt: new Date(tick).toISOString(),
      discipline: plan.trainingType.discipline ?? discipline,
      trainingType: plan.trainingType.id,
      focus: trainingLabel,
      plannedDuration: `${totalMinutes} min`,
      elapsedSeconds: Math.round(elapsed / 1000),
      completedPhases: reachedPhases(run),
      totalPhases: phases.length,
      phases: ridePhaseEntries(run, phases, elapsed)
    });
  };

  const imageMotion = {
    opacity: entryMotion,
    transform: Platform.OS === "web"
      ? []
      : [{ scale: entryMotion.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }]
  };
  const contentMotion = {
    opacity: entryMotion,
    transform: Platform.OS === "web"
      ? []
      : [{ translateY: entryMotion.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }]
  };
  const phaseStyle = {
    opacity: phaseMotion,
    transform: Platform.OS === "web"
      ? []
      : [{ translateY: phaseMotion.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }]
  };

  // Before the start the screen shows the first phase and its full time, so
  // the rider can get on, settle the phone and the horse, then tap Start.
  const phaseLabel = done ? "ALL PHASES DONE" : (currentPhase?.title ?? "").toUpperCase();
  const timerValue = done ? formatElapsed(elapsedSeconds) : formatElapsed(remainingSeconds);
  const timerNote = !started
    ? `Phase 1 of ${phases.length} · the clock waits for you`
    : done
      ? "Total ride time"
      : !running
        ? `Paused · phase ${run.phaseIndex + 1} of ${phases.length}`
        : `remaining · phase ${run.phaseIndex + 1} of ${phases.length}`;

  return (
    <View testID="ride-mode" style={styles.rideRoot}>
      <Animated.Image source={{ uri: image }} resizeMode="cover" style={[styles.rideImage, imageMotion]} />
      <LinearGradient
        colors={["rgba(5,6,5,0.42)", "rgba(5,6,5,0.08)", "rgba(5,6,5,0.88)", "rgba(5,6,5,0.98)"]}
        locations={[0, 0.24, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View style={[styles.rideContent, contentMotion]}>
        <View style={styles.rideTopBar}>
          <MotionPressable
            testID="ride-exit"
            accessibilityRole="button"
            accessibilityLabel="End ride without saving"
            hitSlop={6}
            onPress={onExit}
            style={styles.rideIconButton}
          >
            <X size={20} color={equinaTheme.text.primary} />
          </MotionPressable>

          <View style={styles.rideIdentity}>
            <Text numberOfLines={1} style={styles.rideIdentityName}>{plan.horseName || "Today's ride"}</Text>
            <Text numberOfLines={1} style={styles.rideIdentityMeta}>{trainingLabel} · {totalMinutes} min</Text>
          </View>

          <View style={styles.rideTopActions}>
            <MotionPressable
              testID="ride-voice"
              accessibilityRole="switch"
              accessibilityLabel="Say each phase out loud"
              accessibilityState={{ checked: voice }}
              hitSlop={6}
              onPress={toggleVoice}
              style={styles.rideIconButton}
            >
              {voice ? <Volume2 size={19} color={equinaTheme.text.primary} /> : <VolumeX size={19} color={equinaTheme.text.secondary} />}
            </MotionPressable>
            {!started ? (
              <MotionPressable
                testID="ride-edit"
                accessibilityRole="button"
                accessibilityLabel="Change the training"
                hitSlop={6}
                onPress={onEdit}
                style={styles.rideIconButton}
              >
                <Pencil size={18} color={equinaTheme.text.primary} />
              </MotionPressable>
            ) : null}
          </View>
        </View>

        <View style={styles.rideBottom}>
          <View style={styles.ridePhaseTrack}>
            {phases.map((phase, index) => (
              <View
                key={phase.id}
                style={[styles.ridePhaseSegment, { flex: Math.max(phase.minutes, 3) }]}
              >
                <View style={[styles.ridePhaseFill, { width: `${Math.round((progress[index] ?? 0) * 100)}%` }]} />
              </View>
            ))}
          </View>

          <Animated.View style={[styles.ridePhaseBlock, phaseStyle]}>
            <Text testID="ride-phase-title" accessibilityLiveRegion="polite" style={styles.rideTimerLabel}>{phaseLabel}</Text>
            {done ? (
              <Text style={styles.ridePhaseTitle}>Well ridden.</Text>
            ) : currentPhase?.detail ? (
              <Text numberOfLines={2} style={styles.ridePhaseTitle}>{currentPhase.detail}</Text>
            ) : null}
            <Text testID="ride-countdown" style={styles.rideTimer}>{timerValue}</Text>
            <Text style={styles.rideTimerNote}>{timerNote}</Text>
            {done ? (
              <Text style={styles.ridePhaseCue}>Every phase had its time. Finish when you are off the horse.</Text>
            ) : nextPhase ? (
              <Text numberOfLines={1} style={styles.rideNext}>
                Next · {nextPhase.title}{nextPhase.detail ? ` · ${nextPhase.detail}` : ""} · {nextPhase.minutes} min
              </Text>
            ) : started ? (
              <Text style={styles.rideNext}>Last phase</Text>
            ) : null}
          </Animated.View>

          {!started ? (
            <MotionPressable
              testID="ride-start"
              accessibilityRole="button"
              accessibilityLabel={`Start ${currentPhase?.title ?? "the first phase"} and the clock`}
              onPress={startRide}
              style={styles.ridePrimaryButton}
            >
              <Play size={19} color={equinaTheme.colors.ink} fill={equinaTheme.colors.ink} />
              <Text style={styles.ridePrimaryText}>Start phase</Text>
            </MotionPressable>
          ) : done ? (
            <MotionPressable
              testID="ride-toggle"
              accessibilityRole="button"
              accessibilityLabel="Finish ride and save recap"
              onPress={finishRide}
              style={styles.ridePrimaryButton}
            >
              <CheckCircle2 size={20} color={equinaTheme.colors.ink} />
              <Text style={styles.ridePrimaryText}>Finish ride</Text>
            </MotionPressable>
          ) : (
            <View style={styles.rideActions}>
              <View style={styles.rideActionRow}>
                {/* Big, side by side: they are pressed from the saddle. */}
                <MotionPressable
                  testID={running ? "ride-pause" : "ride-resume"}
                  accessibilityRole="button"
                  accessibilityLabel={running ? "Pause the clock" : "Resume the clock"}
                  onPress={togglePause}
                  style={[running ? styles.rideQuietButton : styles.ridePrimaryButton, styles.rideHalfButton]}
                >
                  {running
                    ? <Pause size={19} color={equinaTheme.text.primary} />
                    : <Play size={19} color={equinaTheme.colors.ink} fill={equinaTheme.colors.ink} />}
                  <Text style={running ? styles.rideQuietText : styles.ridePrimaryText}>{running ? "Pause" : "Resume"}</Text>
                </MotionPressable>
                {isFinalPhase ? (
                  <MotionPressable
                    testID="ride-toggle"
                    accessibilityRole="button"
                    accessibilityLabel="Finish ride and save recap"
                    onPress={finishRide}
                    style={[running ? styles.ridePrimaryButton : styles.rideQuietButton, styles.rideHalfButton]}
                  >
                    <CheckCircle2 size={19} color={running ? equinaTheme.colors.ink : equinaTheme.text.primary} />
                    <Text style={running ? styles.ridePrimaryText : styles.rideQuietText}>Finish ride</Text>
                  </MotionPressable>
                ) : (
                  <MotionPressable
                    testID="ride-next-phase"
                    accessibilityRole="button"
                    accessibilityLabel={`Skip to ${nextPhase?.title ?? "the next phase"}`}
                    onPress={moveOn}
                    style={[running ? styles.ridePrimaryButton : styles.rideQuietButton, styles.rideHalfButton]}
                  >
                    <Text style={running ? styles.ridePrimaryText : styles.rideQuietText}>Skip phase</Text>
                    <ChevronRight size={19} color={running ? equinaTheme.colors.ink : equinaTheme.text.primary} />
                  </MotionPressable>
                )}
              </View>
              {!isFinalPhase ? (
                <MotionPressable
                  testID="ride-finish-now"
                  accessibilityRole="button"
                  accessibilityLabel="Finish the ride now and save it"
                  onPress={finishRide}
                  style={styles.rideSecondaryButton}
                >
                  <Text style={styles.rideSecondaryText}>Finish ride now</Text>
                </MotionPressable>
              ) : null}
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
const moodCopy: Record<RideMood, string> = {
  Fresh: "Forward and available",
  Focused: "Steady and listening",
  Tender: "Quieter than usual"
};

export function RideRecapScreen({
  horseName,
  image,
  session,
  saved,
  recommendation,
  ralfAvailable,
  shared,
  sharingEnabled,
  onMoodChange,
  onOpenAcademy,
  onShare,
  onHome
}: {
  horseName: string;
  image: string;
  session: RideSession;
  /** Written to the journal, or kept for this session only. */
  saved: boolean;
  /** Absent while the Academy has no lesson to suggest; the ride goes to Ralf. */
  recommendation?: RideRecommendation;
  ralfAvailable: boolean;
  shared: boolean;
  sharingEnabled: boolean;
  onMoodChange: (mood: RideMood) => void;
  onOpenAcademy: () => void;
  onShare: () => void;
  onHome: () => void;
}) {
  const completionMotion = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const { height: viewportHeight } = useWindowDimensions();
  const compactHeight = viewportHeight < 740;
  const mood = session.mood;
  const completionBody = useMemo(
    () =>
      mood === "Fresh"
        ? `${horseName} finished with energy. Keep tomorrow precise rather than bigger.`
        : mood === "Tender"
          ? `${horseName} felt quieter. Recovery and a light next session matter more than volume.`
          : `${horseName} stayed with the work. Build the next ride from the same simple rhythm.`,
    [horseName, mood]
  );

  useEffect(() => {
    if (reducedMotion) {
      completionMotion.setValue(1);
      return;
    }

    Animated.timing(completionMotion, {
      toValue: 1,
      duration: equinaTheme.motion.completion,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [completionMotion, reducedMotion]);

  const revealStyle = {
    opacity: completionMotion,
    transform: Platform.OS === "web"
      ? []
      : [
          {
            translateY: completionMotion.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0]
            })
          }
        ]
  };

  return (
    <View testID="ride-recap" style={styles.recapRoot}>
      <Animated.View style={[styles.recapLayer, revealStyle]}>
        <View style={styles.recapTopBar}>
          <View style={styles.recapSavedLine}>
            <Check size={16} color={equinaTheme.colors.brass} />
            <Text style={styles.recapSavedText}>{saved ? "Saved to your journal" : "Saved for this session"}</Text>
          </View>
          <MotionPressable
            testID="ride-recap-home-top"
            accessibilityRole="button"
            accessibilityLabel="Close recap"
            hitSlop={6}
            onPress={onHome}
            style={styles.recapHomeIcon}
          >
            <X size={19} color={equinaTheme.text.primary} />
          </MotionPressable>
        </View>

        <ScrollView
          style={styles.recapScroll}
          contentContainerStyle={[styles.recapScrollContent, compactHeight && styles.recapScrollContentCompact]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.recapHero, compactHeight && styles.recapHeroCompact]}>
            <Image source={{ uri: image }} resizeMode="cover" style={styles.recapHeroImage} />
            <LinearGradient
              colors={["rgba(5,6,5,0.08)", "rgba(5,6,5,0.76)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.recapHeroContent}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={styles.recapHeroTitle}>{horseName}</Text>
              <Text style={styles.recapHeroMeta}>{[rideSessionLabel(session), session.plannedDuration].filter(Boolean).join(" · ")}</Text>
            </View>
          </View>

          <View style={styles.recapIntro}>
            <Text accessibilityRole="header" style={styles.recapTitle}>A useful ride.</Text>
            <Text style={styles.recapBody}>{completionBody}</Text>
          </View>

          <View style={styles.recapMetrics}>
            <RecapFact value={rideDurationLabel(session.elapsedSeconds)} label="ride time" />
            <View style={styles.recapMetricDivider} />
            <RecapFact value={`${session.completedPhases}/${session.totalPhases}`} label="phases" />
            <View style={styles.recapMetricDivider} />
            <RecapFact value={rideSessionLabel(session)} label="training" />
          </View>

          <View style={styles.recapSection}>
            <Text style={styles.recapSectionLabel}>How did {horseName} feel?</Text>
            <View style={styles.recapMoodControl}>
              {(["Fresh", "Focused", "Tender"] as const).map((option) => {
                const active = mood === option;
                return (
                  <MotionPressable
                    key={option}
                    testID={`ride-recap-mood-${option.toLowerCase()}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      void Haptics.selectionAsync().catch(() => undefined);
                      onMoodChange(option);
                    }}
                    style={[styles.recapMoodOption, active && styles.recapMoodOptionActive]}
                  >
                    <Text style={[styles.recapMoodTitle, active && styles.recapMoodTitleActive]}>{option}</Text>
                  </MotionPressable>
                );
              })}
            </View>
            <Text style={styles.recapMoodSelection}>{moodCopy[mood]}</Text>
          </View>

          {recommendation || ralfAvailable ? (
            <View style={styles.recapSection}>
              <View style={styles.recapSectionTopline}>
                <View>
                  <Text style={styles.recapSectionEyebrow}>NEXT FOR YOU</Text>
                  <Text style={styles.recapSectionTitle}>Turn this ride into progress</Text>
                </View>
                <Sparkles size={18} color={equinaTheme.colors.brass} />
              </View>

              <MotionPressable
                testID={recommendation ? "ride-recap-recommendation" : "ride-recap-ralf"}
                accessibilityRole="button"
                accessibilityLabel={recommendation ? `Open ${recommendation.title} in Academy` : "Review this ride with Ralf"}
                onPress={onOpenAcademy}
                style={styles.recapLessonRow}
              >
                {recommendation ? (
                  <Image source={{ uri: recommendation.image }} resizeMode="cover" style={styles.recapLessonImage} />
                ) : (
                  <View style={styles.recapRalfMark}>
                    <Sparkles size={22} color={equinaTheme.colors.brass} />
                  </View>
                )}
                <View style={styles.recapLessonCopy}>
                  <Text numberOfLines={2} style={styles.recapLessonTitle}>
                    {recommendation ? recommendation.title : "Review this ride with Ralf"}
                  </Text>
                  {recommendation ? (
                    <Text numberOfLines={1} style={styles.recapLessonMeta}>
                      {[recommendation.coach, recommendation.duration].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                  <Text numberOfLines={2} style={styles.recapLessonBody}>
                    {recommendation ? recommendation.summary : "What went well, and the one thing to work on next time."}
                  </Text>
                </View>
                <ChevronRight size={18} color={equinaTheme.text.tertiary} />
              </MotionPressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.recapActions}>
          <MotionPressable
            testID="ride-recap-done"
            accessibilityRole="button"
            accessibilityLabel="Done, back to Home"
            onPress={onHome}
            style={styles.recapPrimaryButton}
          >
            <Text style={styles.recapPrimaryText}>Done</Text>
          </MotionPressable>

          {/* With sharing off this used to offer "View Club", sending the rider
              into a frozen area at their most rewarding moment. No button is
              better than one that leads nowhere. */}
          {sharingEnabled ? (
            <View style={styles.recapSecondaryActions}>
              <MotionPressable
                testID="ride-recap-share"
                accessibilityRole="button"
                accessibilityLabel={shared ? "Ride already shared" : "Share ride to Club"}
                disabled={shared}
                onPress={onShare}
                style={styles.recapSecondaryButton}
              >
                {shared
                  ? <Check size={17} color={equinaTheme.colors.brass} />
                  : <SendHorizontal size={17} color={equinaTheme.colors.brass} />}
                <Text style={styles.recapSecondaryText}>{shared ? "Shared" : "Share to Club"}</Text>
              </MotionPressable>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

function RecapFact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.recapFact}>
      <Text style={styles.recapFactValue}>{value}</Text>
      <Text style={styles.recapFactLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rideRoot: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.canvas,
    overflow: "hidden"
  },
  rideImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  rideContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    justifyContent: "space-between"
  },
  rideTopBar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  rideTopActions: {
    flexDirection: "row",
    gap: 8
  },
  rideIconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,7,6,0.46)"
  },
  rideIdentity: {
    flex: 1,
    minWidth: 0,
    alignItems: "center"
  },
  rideIdentityName: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  rideIdentityMeta: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1
  },
  rideTimerLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0.4
  },
  rideTimer: {
    color: equinaTheme.text.primary,
    fontSize: 64,
    lineHeight: 72,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    marginTop: 4
  },
  rideTimerNote: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"]
  },
  rideBottom: {
    gap: 16
  },
  ridePhaseTrack: {
    flexDirection: "row",
    gap: 6
  },
  ridePhaseSegment: {
    height: 4,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(247,243,234,0.18)"
  },
  ridePhaseFill: {
    height: "100%",
    backgroundColor: equinaTheme.colors.brass
  },
  ridePhaseTitle: {
    color: equinaTheme.text.primary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
    marginTop: 4
  },
  ridePhaseCue: {
    color: equinaTheme.text.secondary,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
    maxWidth: 350
  },
  rideNext: {
    color: equinaTheme.text.tertiary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10
  },
  ridePhaseBlock: {
    alignItems: "flex-start"
  },
  rideActions: {
    gap: 6
  },
  rideActionRow: {
    flexDirection: "row",
    gap: 10
  },
  rideHalfButton: {
    flex: 1,
    minHeight: 60
  },
  rideQuietButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.32)",
    backgroundColor: "rgba(8,7,6,0.56)"
  },
  rideQuietText: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  ridePrimaryButton: {
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: equinaTheme.colors.brass
  },
  ridePrimaryText: {
    color: equinaTheme.colors.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  rideSecondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  rideSecondaryText: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600"
  },
  recapRoot: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.frame
  },
  recapLayer: {
    flex: 1
  },
  recapTopBar: {
    minHeight: 58,
    paddingHorizontal: 18,
    paddingTop: 7,
    paddingBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  recapSavedLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  recapSavedText: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  recapHomeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.raised
  },
  recapScroll: {
    flex: 1
  },
  recapScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 24
  },
  recapScrollContentCompact: {
    gap: 16
  },
  recapHero: {
    height: 214,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  recapHeroCompact: {
    height: 160
  },
  recapHeroImage: {
    width: "100%",
    height: "100%"
  },
  recapHeroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: "flex-end"
  },
  recapHeroTitle: {
    color: equinaTheme.text.primary,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "600",
    marginTop: 4
  },
  recapHeroMeta: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3
  },
  recapIntro: {
    gap: 5
  },
  recapTitle: {
    color: equinaTheme.text.primary,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "600"
  },
  recapBody: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20
  },
  recapMetrics: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(247,243,234,0.09)"
  },
  recapFact: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  recapFactValue: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600"
  },
  recapFactLabel: {
    color: equinaTheme.text.secondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1
  },
  recapMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(247,243,234,0.09)"
  },
  recapSection: {
    gap: 12
  },
  recapSectionLabel: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  recapMoodControl: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.raised
  },
  recapMoodOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  recapMoodOptionActive: {
    backgroundColor: equinaTheme.material.selected
  },
  recapMoodTitle: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600"
  },
  recapMoodTitleActive: {
    color: equinaTheme.text.primary
  },
  recapMoodSelection: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 2,
    marginBottom: 8
  },
  recapSectionTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  recapSectionEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600"
  },
  recapSectionTitle: {
    color: equinaTheme.text.primary,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 2
  },
  recapLessonRow: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  recapLessonImage: {
    width: 78,
    height: 96,
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.raised
  },
  recapLessonCopy: {
    flex: 1,
    minWidth: 0
  },
  recapRalfMark: {
    width: 78,
    height: 96,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.raised
  },
  recapLessonTitle: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600"
  },
  recapLessonMeta: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3
  },
  recapLessonBody: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4
  },
  recapActions: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: "rgba(14,13,11,0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(247,243,234,0.08)"
  },
  recapPrimaryButton: {
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: equinaTheme.colors.brass
  },
  recapPrimaryText: {
    color: equinaTheme.colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  recapSecondaryActions: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20
  },
  recapSecondaryButton: {
    minHeight: 44,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7
  },
  recapSecondaryText: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600"
  }
});
