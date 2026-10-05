import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
  Play,
  SendHorizontal,
  Sparkles,
  X
} from "lucide-react-native";
import type { OnboardingDiscipline } from "../onboarding/OnboardingScreen";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { useReducedMotion } from "../../ui/motion/useReducedMotion";
import { equinaTheme } from "../../ui/theme/theme";

export type RideMood = "Fresh" | "Focused" | "Tender";

export type RideSession = {
  id: string;
  startedAt: string;
  completedAt: string;
  discipline: OnboardingDiscipline;
  focus: string;
  plannedDuration: string;
  elapsedSeconds: number;
  completedPhases: number;
  totalPhases: number;
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

type RidePhase = {
  title: string;
  duration: string;
  cue: string;
};

type RideBlueprint = {
  label: string;
  plannedDuration: string;
  phases: readonly RidePhase[];
};

const rideBlueprints: Record<OnboardingDiscipline, RideBlueprint> = {
  Dressage: {
    label: "Soft contact",
    plannedDuration: "35 min",
    phases: [
      { title: "Warm-up", duration: "8 min", cue: "Let the walk open, then find an easy forward trot." },
      { title: "Contact & transitions", duration: "20 min", cue: "Keep the hand quiet. Ask once, then let your horse carry the rhythm." },
      { title: "Cool-down", duration: "7 min", cue: "Finish on a long rein and notice what became easier." }
    ]
  },
  Jumping: {
    label: "Poles & rhythm",
    plannedDuration: "30 min",
    phases: [
      { title: "Warm-up", duration: "8 min", cue: "Find one quiet canter before asking for more." },
      { title: "Poles & rhythm", duration: "15 min", cue: "Keep the same canter. Let the line come to you." },
      { title: "Cool-down", duration: "7 min", cue: "Walk long, check breathing, then feel both legs." }
    ]
  },
  Eventing: {
    label: "Fitness & balance",
    plannedDuration: "40 min",
    phases: [
      { title: "Warm-up", duration: "10 min", cue: "Build the pace gradually and keep every turn balanced." },
      { title: "Fitness sets", duration: "20 min", cue: "Hold the rhythm, not the speed. Recover before quality drops." },
      { title: "Recovery", duration: "10 min", cue: "Let the breathing settle before returning to the stable." }
    ]
  },
  Trail: {
    label: "Calm miles",
    plannedDuration: "45 min",
    phases: [
      { title: "Settle", duration: "10 min", cue: "Give your horse time to look, breathe, and walk forward." },
      { title: "Calm miles", duration: "25 min", cue: "Keep a soft rhythm and reward every relaxed response." },
      { title: "Return", duration: "10 min", cue: "Come home quieter than you left." }
    ]
  }
};

export const rideBlueprintFor = (discipline: OnboardingDiscipline) => rideBlueprints[discipline];

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

export function RideModeScreen({
  horseName,
  discipline,
  image,
  onFinish,
  onExit
}: {
  horseName: string;
  discipline: OnboardingDiscipline;
  image: string;
  onFinish: (session: RideCompletion) => void;
  onExit: () => void;
}) {
  const blueprint = rideBlueprintFor(discipline);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const startedAt = useRef(new Date().toISOString()).current;
  const entryMotion = useRef(new Animated.Value(0)).current;
  const phaseMotion = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();
  const useNativePhaseDriver = Platform.OS !== "web";
  const currentPhase = blueprint.phases[phaseIndex] ?? blueprint.phases[0];
  const isFinalPhase = phaseIndex === blueprint.phases.length - 1;

  useEffect(() => {
    if (reducedMotion) {
      entryMotion.setValue(1);
      return;
    }

    Animated.timing(entryMotion, {
      toValue: 1,
      duration: 280,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [entryMotion, reducedMotion]);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => clearInterval(interval);
  }, [paused]);

  const imageMotion = {
    opacity: entryMotion,
    transform: Platform.OS === "web"
      ? []
      : [
          {
            scale: entryMotion.interpolate({
              inputRange: [0, 1],
              outputRange: [1.04, 1]
            })
          }
        ]
  };

  const contentMotion = {
    opacity: entryMotion,
    transform: Platform.OS === "web"
      ? []
      : [
          {
            translateY: entryMotion.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0]
            })
          }
        ]
  };

  const phaseStyle = {
    opacity: phaseMotion,
    transform: Platform.OS === "web"
      ? []
      : [
          {
            translateY: phaseMotion.interpolate({
              inputRange: [0, 1],
              outputRange: [5, 0]
            })
          }
        ]
  };

  const advancePhase = () => {
    if (isFinalPhase) return;
    void Haptics.selectionAsync().catch(() => undefined);

    if (reducedMotion || !useNativePhaseDriver) {
      setPhaseIndex((index) => Math.min(index + 1, blueprint.phases.length - 1));
      return;
    }

    Animated.timing(phaseMotion, {
      toValue: 0,
      duration: 90,
      useNativeDriver: useNativePhaseDriver
    }).start(() => {
      setPhaseIndex((index) => Math.min(index + 1, blueprint.phases.length - 1));
      phaseMotion.setValue(0);
      Animated.timing(phaseMotion, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNativePhaseDriver
      }).start();
    });
  };

  const togglePause = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    setPaused((value) => !value);
  };

  const finishRide = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onFinish({
      id: `ride-${Date.now()}`,
      startedAt,
      completedAt: new Date().toISOString(),
      discipline,
      focus: blueprint.label,
      plannedDuration: blueprint.plannedDuration,
      elapsedSeconds,
      completedPhases: phaseIndex + 1,
      totalPhases: blueprint.phases.length
    });
  };

  return (
    <View testID="ride-mode" style={styles.rideRoot}>
      <Animated.Image source={{ uri: image }} resizeMode="cover" style={[styles.rideImage, imageMotion]} />
      <LinearGradient
        colors={["rgba(5,6,5,0.42)", "rgba(5,6,5,0.08)", "rgba(5,6,5,0.88)", "rgba(5,6,5,0.98)"]}
        locations={[0, 0.28, 0.56, 1]}
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
            <Text numberOfLines={1} style={styles.rideIdentityName}>{horseName}</Text>
            <Text style={styles.rideIdentityMeta}>{blueprint.label} · {blueprint.plannedDuration}</Text>
          </View>

          <MotionPressable
            testID="ride-pause"
            accessibilityRole="button"
            accessibilityLabel={paused ? "Resume ride timer" : "Pause ride timer"}
            hitSlop={6}
            onPress={togglePause}
            style={styles.rideIconButton}
          >
            {paused ? <Play size={19} color={equinaTheme.text.primary} /> : <Pause size={19} color={equinaTheme.text.primary} />}
          </MotionPressable>
        </View>

        <View style={styles.rideBottom}>
          <View style={styles.rideTimerBlock}>
            <Text style={styles.rideTimerLabel}>{paused ? "PAUSED" : "RIDE TIME"}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.rideTimer}>{formatElapsed(elapsedSeconds)}</Text>
          </View>

          <View style={styles.ridePhaseTrack}>
            {blueprint.phases.map((phase, index) => (
              <View
                key={phase.title}
                style={[
                  styles.ridePhaseSegment,
                  index <= phaseIndex && styles.ridePhaseSegmentActive
                ]}
              />
            ))}
          </View>

          <Animated.View style={phaseStyle}>
            <View style={styles.ridePhaseMetaRow}>
              <Text style={styles.ridePhaseIndex}>PHASE {phaseIndex + 1} OF {blueprint.phases.length}</Text>
              <Text style={styles.ridePhaseDuration}>{currentPhase?.duration}</Text>
            </View>
            <Text style={styles.ridePhaseTitle}>{currentPhase?.title}</Text>
            <Text style={styles.ridePhaseCue}>{currentPhase?.cue}</Text>
          </Animated.View>

          {isFinalPhase ? (
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
            <MotionPressable
              testID="ride-next-phase"
              accessibilityRole="button"
              accessibilityLabel={`Continue to ${blueprint.phases[phaseIndex + 1]?.title}`}
              onPress={advancePhase}
              style={styles.ridePrimaryButton}
            >
              <Text style={styles.ridePrimaryText}>Next phase</Text>
              <ChevronRight size={20} color={equinaTheme.colors.ink} />
            </MotionPressable>
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
              <Text style={styles.recapHeroMeta}>{session.discipline} · {session.focus}</Text>
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
            <RecapFact value={session.discipline} label="discipline" />
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
  rideTimerBlock: {
    alignItems: "flex-start"
  },
  rideTimerLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  rideTimer: {
    color: equinaTheme.text.primary,
    fontSize: 56,
    lineHeight: 64,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    marginTop: 2
  },
  rideBottom: {
    gap: 16
  },
  ridePhaseTrack: {
    flexDirection: "row",
    gap: 8
  },
  ridePhaseSegment: {
    flex: 1,
    height: 3,
    borderRadius: 8,
    backgroundColor: "rgba(247,243,234,0.18)"
  },
  ridePhaseSegmentActive: {
    backgroundColor: equinaTheme.colors.brass
  },
  ridePhaseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  ridePhaseIndex: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  ridePhaseDuration: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16
  },
  ridePhaseTitle: {
    color: equinaTheme.text.primary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "600",
    marginTop: 7
  },
  ridePhaseCue: {
    color: equinaTheme.text.secondary,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
    maxWidth: 350
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
