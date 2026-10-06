import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
  View
} from "react-native";
import { BlurView } from "expo-blur";
import { Asset } from "expo-asset";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView } from "expo-video";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  BadgeCheck,
  Bot,
  BookOpen,
  Camera,
  Activity,
  Award,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Droplets,
  Ellipsis,
  Heart,
  HeartPulse,
  House,
  Info,
  LockKeyhole,
  Medal,
  MessageCircle,
  MessageSquareText,
  PackageCheck,
  Play,
  PlayCircle,
  Plus,
  Search,
  Scale,
  SendHorizontal,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Store,
  Upload,
  WalletCards,
  Wheat,
  X,
  Zap
} from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import type { EquinaBackend, HorseTimelineRecord, PlanState } from "./backend";
import { noPicksLeft } from "./backend/plan-repository";
import type { Discipline, Listing, Order } from "./domain/types";
import { equinaFeatureFlags } from "./config/feature-flags";
import {
  OnboardingScreen,
  onboardingSteps,
  type OnboardingAuthProvider,
  type OnboardingCompletionMode,
  type OnboardingDiscipline,
  type OnboardingPhotoAsset,
  type OnboardingStep
} from "./features/onboarding/OnboardingScreen";
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  saveOnboardingDraft
} from "./features/onboarding/onboarding-draft";
import { AccountScreen } from "./features/account/AccountScreen";
import { AuthVerificationScreen } from "./features/account/AuthVerificationScreen";
import { BetaAccessScreen } from "./features/account/BetaAccessScreen";
import { PasswordRecoveryScreen } from "./features/account/PasswordRecoveryScreen";
import { SessionGateScreen } from "./features/account/SessionGateScreen";
import { loadsPlan, showsBetaDoor } from "./features/account/session-capabilities";
import { socialAuthAvailability } from "./features/account/social-auth";
import type { AccountMode, AccountRoute } from "./features/account/account-types";
import { useAccount } from "./features/account/useAccount";
import { useEquinaSession } from "./features/account/useEquinaSession";
import { RalfScreen } from "./features/coach/CoachScreen";
import { trainingFocusByDiscipline, type CoachConversationContext } from "./features/coach/coach-types";
import { clearDemoCoachHistory } from "./features/coach/useCoachConversation";
import { ShopConversationScreen } from "./features/messaging/ShopConversationScreen";
import { ShopThreadList } from "./features/messaging/ShopThreadList";
import { useConnectedShopCatalog } from "./features/messaging/useConnectedShopCatalog";
import { clearShopDrafts, useShopConversation } from "./features/messaging/useShopConversation";
import { usePushRegistration } from "./features/notifications/usePushRegistration";
import {
  HorseEditorSheet,
  RecordEditorSheet
} from "./features/records/HorseRecordSheets";
import { CareSchedule } from "./features/records/CareSchedule";
import { SignInScreen } from "./features/account/SignInScreen";
import { signInCopy } from "./features/account/sign-in-copy";
import { emailRequestOutcome, signInErrorCopy } from "./features/account/sign-in-errors";
import {
  academyCredit,
  academyPathFor,
  allLevelsLabel,
  formatChapterTime,
  liveLessonView,
  metaLine,
  pathProgress,
  personalizedLessons,
  recommendedLessonFor,
  type AcademyLessonView
} from "./features/academy/academy-catalog";
import { useAcademy } from "./features/academy/useAcademy";
import { lessonOpen, picksLeft, planFor } from "./features/plans/plan-rules";
import { usePlan } from "./features/plans/usePlan";
import { PlanOfferScreen } from "./features/plans/PlanOfferScreen";
import { usePurchases } from "./features/plans/usePurchases";
import { useSignUpPlanOffer } from "./features/plans/useSignUpPlanOffer";
import { useLessonVideo } from "./features/academy/useLessonVideo";
import type { AcademyPlaybackLink } from "./backend/contracts";
import { ClubScreen, type ClubRideShare } from "./features/club/ClubScreen";
import { rideShareLine, spaceSlugForDiscipline } from "./features/club/club-format";
import type { ClubSpaceImageKey } from "./features/club/club-groups";
import { useClub } from "./features/club/useClub";
import { RideSummaryCard } from "./features/ride/RideSummaryCard";
import { summarise, type RidePeriod } from "./domain/ride-stats";
import type { RideEntry } from "./backend/contracts";
import { buildCareSchedule, completionFor, type CareItem } from "./domain/care-schedule";
import {
  useHorseRecords,
  type HorseRecordsController,
  type TimelineRecordInput
} from "./features/records/useHorseRecords";
import {
  RideModeScreen,
  RideRecapScreen,
  rideDurationLabel,
  type RideCompletion,
  type RideMood,
  type RideRecommendation,
  type RideSession
} from "./features/ride/RideExperience";
import { useRideJournal } from "./features/ride/useRideJournal";
import { createSeededEquinaApi } from "./seed/seed-data";
import { getFitScreening, type HorseFitContext } from "./product/product-truth";
import { MotionPressable } from "./ui/motion/MotionPressable";
import { EquinaIconButton, EquinaSegmentedTabs } from "./ui/primitives/EquinaPrimitives";
import { useReducedMotion } from "./ui/motion/useReducedMotion";
import { equinaTheme } from "./ui/theme/theme";
import { floatingDockContentInset, floatingDockMetrics } from "./ui/layout/metrics";

type Tab = "home" | "gear" | "stable" | "assistant" | "community" | "profile";
type Filter = "All" | "Saddles" | "Dressage" | "Jumping";
type ShopMode = "browse" | "sell";
type ShopBuyerView = "browse" | "product" | "checkout" | "orders" | "saved" | "messages" | "conversation" | "fit" | "protection";
type ShopSellerView = "dashboard" | "orders" | "revenue" | "messages" | "conversation" | "listing";
type ShopMessage = {
  id: string;
  listingId: string;
  author: "buyer" | "seller";
  text: string;
  sentAt: string;
};
// The Academy is one page and the lesson it opens. Ralf, who used to be its
// third tab, opens from every tab now (see openRalf).
type AcademyMode = "home" | "video";
const academyTopics = ["All", "Dressage", "Jumping", "Care", "Mindset"] as const;
type AcademyTopic = (typeof academyTopics)[number];
type CoachDiscipline = OnboardingDiscipline;
type RiderLevel = "Beginner" | "Intermediate" | "Advanced" | "Pro";
type RiderGoal = "Daily training" | "Competition" | "Horse care" | "Learn faster";
type RiderContext = {
  name: string;
  level: RiderLevel;
  discipline: CoachDiscipline;
  goal: RiderGoal;
  frequency: string;
};
type MoodOption = RideMood;
type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  confidence?: "high" | "medium" | "low";
  label?: string;
};
type HorseState = {
  hasHorse: boolean;
  name: string;
  sessionCount: number;
  careLogged: boolean;
  rideActive: boolean;
  lastRide: RideSession | null;
};
type AcademyState = {
  progress: number;
  mode: AcademyMode;
  selectedLessonId: string;
};
// Care is the schedule and the health records together, so each record has one
// home. Nutrition stays out until a horse has a real feeding plan to show.
type StableView = "overview" | "care" | "docs" | "nutrition";
type NutritionMealId = "morning" | "pre-ride" | "evening";
type NutritionState = {
  completedMeals: NutritionMealId[];
  waterLiters: number;
};

const toDomainDiscipline = (value: CoachDiscipline): Discipline =>
  value.toLowerCase() as Discipline;

const toDomainLevel = (value: RiderLevel): "beginner" | "intermediate" | "advanced" | "pro" =>
  value.toLowerCase() as "beginner" | "intermediate" | "advanced" | "pro";

const toCoachDiscipline = (value?: Discipline): CoachDiscipline => {
  const label = value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "Jumping";
  return (["Dressage", "Jumping", "Eventing", "Trail"] as CoachDiscipline[]).includes(label as CoachDiscipline)
    ? label as CoachDiscipline
    : "Jumping";
};

const toRiderLevel = (value?: string): RiderLevel => {
  const label = value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "Intermediate";
  return (["Beginner", "Intermediate", "Advanced", "Pro"] as RiderLevel[]).includes(label as RiderLevel)
    ? label as RiderLevel
    : "Intermediate";
};

const stableNutritionMeals: Array<{
  id: NutritionMealId;
  time: string;
  title: string;
  body: string;
  amount: string;
}> = [
  { id: "morning", time: "07:00", title: "Morning forage", body: "Hay + mineral balancer", amount: "7 kg" },
  { id: "pre-ride", time: "14:30", title: "Before training", body: "Water + small forage", amount: "2 kg" },
  { id: "evening", time: "19:00", title: "Evening forage", body: "Hay + saved supplements", amount: "8 kg" }
];
const stableWaterGoal = 35;
// Nothing has been fed and nothing has been drunk until the rider says so.
// The meal plan itself is still a sample, but "already completed" and a water
// total are claims about care that was given — the one thing a horse-health
// product must never assert on the rider's behalf.
const initialNutritionState: NutritionState = {
  completedMeals: [],
  waterLiters: 0
};

function HorseshoeIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  active = false
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
  active?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 4v8a6 6 0 0 0 12 0V4h-3v8a3 3 0 0 1-6 0V4H6Z"
        stroke={color}
        fill={active ? "rgba(216,169,74,0.14)" : "none"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7.5 7h.01M16.5 7h.01M8 11h.01M16 11h.01"
        stroke={color}
        strokeWidth={strokeWidth + 0.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

type DockTab = { id: Tab; label: string; Icon: typeof Store | typeof HorseshoeIcon };

// The rider's own work comes first: the day, the horse, learning, then other
// riders. The Shop is built but its buying, selling and messaging are switched
// off, so its tab only joins the dock once one of them is on.
const coreTabs: DockTab[] = [
  { id: "home", label: "Home", Icon: House },
  { id: "stable", label: "Horse", Icon: HorseshoeIcon },
  { id: "assistant", label: "Academy", Icon: BookOpen },
  { id: "community", label: "Club", Icon: MessageCircle }
];
const shopTab: DockTab = { id: "gear", label: "Shop", Icon: ShoppingBag };
const tabTitles: Record<Tab, string> = {
  home: "Home",
  stable: "Horse",
  assistant: "Academy",
  community: "Club",
  gear: "Shop",
  profile: "Account"
};

const nightTheme = {
  bg: equinaTheme.surfaceRole.canvas,
  frame: equinaTheme.surfaceRole.base,
  surface: equinaTheme.surfaceRole.raised,
  surfaceSoft: equinaTheme.surfaces.elevated,
  accent: equinaTheme.colorRole.accent,
  accentFill: equinaTheme.material.selected,
  accentFillStrong: "rgba(196,160,90,0.24)",
  accentGlow: "rgba(196,160,90,0.28)",
  border: "rgba(247,243,234,0.1)",
  borderStrong: "rgba(247,243,234,0.16)",
  text: equinaTheme.text.primary,
  muted: equinaTheme.text.secondary,
  faint: equinaTheme.text.tertiary
} as const;

const filters: Filter[] = ["All", "Saddles", "Dressage", "Jumping"];
const jumpingEditorial = {
  home: Asset.fromModule(require("../assets/images/equestrian/jumping-home.jpg")).uri,
  lesson: Asset.fromModule(require("../assets/images/equestrian/jumping-lesson.jpg")).uri,
  club: Asset.fromModule(require("../assets/images/equestrian/jumping-club.jpg")).uri,
  coach: Asset.fromModule(require("../assets/images/equestrian/jumping-coach.jpg")).uri
};
const equinaImages = {
  home: jumpingEditorial.home,
  stable: "https://images.pexels.com/photos/30010796/pexels-photo-30010796.jpeg?auto=compress&cs=tinysrgb&w=1200",
  profile: "https://images.pexels.com/photos/1996333/pexels-photo-1996333.jpeg?auto=compress&cs=tinysrgb&w=1200",
  tack: "https://images.pexels.com/photos/635499/pexels-photo-635499.jpeg?auto=compress&cs=tinysrgb&w=1200",
  dressage: "https://images.pexels.com/photos/10263545/pexels-photo-10263545.jpeg?auto=compress&cs=tinysrgb&w=1200",
  jumping: jumpingEditorial.lesson,
  jumpingHome: jumpingEditorial.home,
  jumpingClub: jumpingEditorial.club,
  jumpingCoach: jumpingEditorial.coach,
  eventing: "https://images.pexels.com/photos/27669462/pexels-photo-27669462.jpeg?auto=compress&cs=tinysrgb&w=1200",
  trail: "https://images.pexels.com/photos/35105157/pexels-photo-35105157.jpeg?auto=compress&cs=tinysrgb&w=1200"
};
// Group cards in the Club reuse the photos already shipped; spaces without
// one of their own (western, endurance, Coach Q&A) show the stable.
const clubSpaceImages: Record<ClubSpaceImageKey, string> = {
  dressage: equinaImages.dressage,
  jumping: equinaImages.jumpingClub,
  eventing: equinaImages.eventing,
  trail: equinaImages.trail,
  stable: equinaImages.stable
};
const equinaCoach = {
  name: "Ralf",
  role: "Equina training guide"
} as const;
const webTextInputReset = Platform.OS === "web"
  ? ({ outline: "none", outlineStyle: "none", boxShadow: "none" } as any)
  : undefined;
const onboardingEditorial = {
  Dressage: Asset.fromModule(require("../assets/images/equestrian/dressage-onboarding.jpg")).uri,
  Eventing: Asset.fromModule(require("../assets/images/equestrian/eventing-onboarding.jpg")).uri,
  Trail: Asset.fromModule(require("../assets/images/equestrian/trail-onboarding.jpg")).uri
};
const disciplineVisuals: Record<CoachDiscipline, { home: string; lesson: string; club: string; coach: string }> = {
  Dressage: { home: onboardingEditorial.Dressage, lesson: equinaImages.dressage, club: equinaImages.stable, coach: equinaImages.dressage },
  Jumping: { home: equinaImages.jumpingHome, lesson: equinaImages.jumping, club: equinaImages.jumpingClub, coach: equinaImages.jumpingCoach },
  Eventing: { home: onboardingEditorial.Eventing, lesson: equinaImages.eventing, club: equinaImages.stable, coach: equinaImages.eventing },
  Trail: { home: onboardingEditorial.Trail, lesson: equinaImages.trail, club: equinaImages.stable, coach: equinaImages.trail }
};
const onboardingDisciplineImages: Record<OnboardingDiscipline, string> = {
  Dressage: disciplineVisuals.Dressage.home,
  Jumping: disciplineVisuals.Jumping.home,
  Eventing: disciplineVisuals.Eventing.home,
  Trail: disciplineVisuals.Trail.home
};
const coachImageByDiscipline: Record<CoachDiscipline, string> = {
  Dressage: disciplineVisuals.Dressage.lesson,
  Jumping: disciplineVisuals.Jumping.lesson,
  Eventing: disciplineVisuals.Eventing.lesson,
  Trail: disciplineVisuals.Trail.lesson
};
const defaultCoachDiscipline: CoachDiscipline = "Jumping";
const defaultCoachGoal = "Transitions";
const defaultCoachLoad = "Normal week";
const defaultCoachStyle = "Calm";
const coachDisciplines: CoachDiscipline[] = ["Dressage", "Jumping", "Eventing", "Trail"];
const coachGoalsByDiscipline: Record<CoachDiscipline, readonly string[]> = trainingFocusByDiscipline;
const riderLevels: readonly RiderLevel[] = ["Beginner", "Intermediate", "Advanced", "Pro"];
const onboardingGoals: readonly RiderGoal[] = ["Daily training", "Competition", "Horse care", "Learn faster"];
const ridingFrequencies = ["2 rides/week", "3-4 rides/week", "5+ rides/week"] as const;
const horsePhotoOptionsByDiscipline = {
  Dressage: [
    { id: "portrait", label: "Wide", image: disciplineVisuals.Dressage.home, value: "sample:dressage:wide" },
    { id: "stable", label: "Close", image: equinaImages.stable, value: "sample:dressage:close" },
    { id: "action", label: "Detail", image: disciplineVisuals.Dressage.home, value: "sample:dressage:detail" }
  ],
  Jumping: [
    { id: "portrait", label: "Wide", image: disciplineVisuals.Jumping.lesson, value: "sample:jumping:wide" },
    { id: "stable", label: "Close", image: disciplineVisuals.Jumping.coach, value: "sample:jumping:close" },
    { id: "action", label: "Detail", image: disciplineVisuals.Jumping.club, value: "sample:jumping:detail" }
  ],
  Eventing: [
    { id: "portrait", label: "Wide", image: disciplineVisuals.Eventing.home, value: "sample:eventing:wide" },
    { id: "stable", label: "Close", image: equinaImages.stable, value: "sample:eventing:close" },
    { id: "action", label: "Detail", image: disciplineVisuals.Eventing.home, value: "sample:eventing:detail" }
  ],
  Trail: [
    { id: "portrait", label: "Wide", image: disciplineVisuals.Trail.home, value: "sample:trail:wide" },
    { id: "stable", label: "Close", image: equinaImages.stable, value: "sample:trail:close" },
    { id: "action", label: "Detail", image: disciplineVisuals.Trail.home, value: "sample:trail:detail" }
  ]
} as const;
const horseSexes = ["Mare", "Gelding", "Stallion"] as const;
const horseRideFeels = ["Calm warm-up", "Extra energy", "Needs quiet aids"] as const;
const carePriorities = ["Training plan", "Recovery", "Vet records", "Gear fit"] as const;
const appPriorities = ["Ride plan", "Health records", "Lessons", "Club", "Shop"] as const;
const homeFriendStories = [
  { initials: "M", name: "Mara", horse: "Atlas", status: "Riding", accent: equinaTheme.colors.brass },
  { initials: "S", name: "Sofia", horse: "Nero", status: "Streak", accent: equinaTheme.colorRole.positive },
  { initials: "N", name: "Noor", horse: "Vega", status: "Lesson", accent: equinaTheme.colors.pine }
];
const homeFeedItems = [
  { rider: "Mara", horse: "Atlas", title: "Clean changes", body: "42 min dressage · changes logged.", tag: "12m" },
  { rider: "Sofia", horse: "Nero", title: "New streak", body: "3 days in a row · gymnastic line done.", tag: "1h" }
];
const communityFeedMedia = [equinaImages.jumpingClub, equinaImages.dressage, equinaImages.stable];
const homeMoodOptions: Array<{
  id: MoodOption;
  label: string;
  body: string;
  Icon: typeof Store;
  planTitle: string;
  planBody: string;
}> = [
  {
    id: "Fresh",
    label: "Fresh",
    body: "forward",
    Icon: Zap,
    planTitle: "Use the good energy.",
    planBody: "Transitions first, then one clean stretch."
  },
  {
    id: "Focused",
    label: "Focused",
    body: "ready",
    Icon: Sparkles,
    planTitle: "Keep it simple and precise.",
    planBody: "35 min flatwork with soft contact."
  },
  {
    id: "Tender",
    label: "Tender",
    body: "lighter",
    Icon: HeartPulse,
    planTitle: "Go lighter today.",
    planBody: "Walk, loosen, check legs after."
  }
];
const academyDemoVideo = require("../assets/videos/jumping-academy.mp4");

// Demo mode's Academy. These lessons were never filmed: they show the shape
// of the Academy, credit no coach, and all play the one bundled clip.
const academyPreviewLessons: AcademyLessonView[] = ([
  {
    title: "Elastic Contact",
    minutes: 18,
    level: "Intermediate",
    topic: "Dressage",
    summary: "Create a softer hand while keeping Ralfy forward and relaxed.",
    image: onboardingEditorial.Dressage,
    chapters: [[0, "Warm-up feel"], [260, "Soft rein connection"], [730, "Finish on stretch"]]
  },
  {
    title: "Confident Lines",
    minutes: 14,
    level: "Intermediate",
    topic: "Jumping",
    summary: "Build rhythm through small lines without rushing the last stride.",
    image: equinaImages.jumping,
    chapters: [[0, "Canter rhythm"], [210, "Two-pole line"], [580, "Confidence repeat"]]
  },
  {
    title: "Ride the Turn",
    minutes: 12,
    level: "Intermediate",
    topic: "Jumping",
    summary: "Carry a balanced canter through the turn so the line starts before the fence.",
    image: equinaImages.jumpingCoach,
    chapters: [[0, "Set the outside aids"], [230, "Hold the canter quality"], [510, "Ride the line early"]]
  },
  {
    title: "Find the Canter",
    minutes: 10,
    level: "Beginner",
    topic: "Jumping",
    summary: "Learn a steady approach rhythm before adding height or technical lines.",
    image: equinaImages.jumpingClub,
    chapters: [[0, "Count the rhythm"], [190, "Poles before fences"], [440, "Finish on confidence"]]
  },
  {
    title: "See the Distance",
    minutes: 17,
    level: "Advanced",
    topic: "Jumping",
    summary: "Refine line, pace, and decision timing without chasing the distance.",
    image: equinaImages.jumpingCoach,
    chapters: [[0, "Read the first stride"], [340, "Hold the line"], [750, "Compare two quality reps"]]
  },
  {
    title: "Competition Warm-up",
    minutes: 12,
    level: "Pro",
    topic: "Jumping",
    summary: "Build a concise warm-up that sharpens performance without spending the horse.",
    image: equinaImages.jumpingHome,
    chapters: [[0, "Set the intent"], [225, "Use fewer efforts"], [530, "Enter the ring fresh"]]
  },
  {
    title: "Recovery Check",
    minutes: 11,
    level: allLevelsLabel,
    topic: "Care",
    summary: "A clean post-ride check for legs, back, mood, and hydration.",
    image: equinaImages.stable,
    chapters: [[0, "Leg scan"], [195, "Back and saddle marks"], [470, "What to log"]]
  },
  {
    title: "Better Transitions",
    minutes: 16,
    level: "Beginner",
    topic: "Dressage",
    summary: "Make walk-trot transitions cleaner with a simple three-cue routine.",
    image: equinaImages.profile,
    chapters: [[0, "Seat first"], [305, "Leg timing"], [690, "Reward the try"]]
  },
  {
    title: "Brave Oxer Mindset",
    minutes: 13,
    level: allLevelsLabel,
    topic: "Mindset",
    summary: "A calm mental reset for riders who overthink the bigger fence.",
    image: onboardingEditorial.Eventing,
    chapters: [[0, "Breathe before turn"], [240, "Eyes and line"], [555, "Debrief without drama"]]
  },
  {
    title: "Saddle Marks 101",
    minutes: 9,
    level: allLevelsLabel,
    topic: "Care",
    summary: "Spot pressure signs early and know when to ask a saddler.",
    image: equinaImages.tack,
    chapters: [[0, "Normal marks"], [165, "Pressure warning signs"], [390, "Saddler notes"]]
  }
] satisfies Array<{
  title: string;
  minutes: number;
  level: string;
  topic: Exclude<AcademyTopic, "All">;
  summary: string;
  image: string;
  chapters: Array<[number, string]>;
}>).map((lesson) => ({
  id: `preview-${lesson.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  title: lesson.title,
  coach: academyCredit,
  coachTitle: "Preview lesson",
  duration: `${lesson.minutes} min`,
  durationSeconds: lesson.minutes * 60,
  level: lesson.level,
  topic: lesson.topic,
  summary: lesson.summary,
  image: lesson.image,
  chapters: lesson.chapters.map(([seconds, title]) => ({ time: formatChapterTime(seconds), title, seconds })),
  progress: 0,
  positionSeconds: 0,
  completed: false,
  video: "preview",
  access: "free"
}));

// A live lesson has no picture of its own until posters arrive with the
// upload pipeline; until then its topic chooses one.
const academyTopicImages: Record<string, string> = {
  Dressage: equinaImages.dressage,
  Jumping: equinaImages.jumping,
  Care: equinaImages.stable,
  Mindset: onboardingEditorial.Eventing
};
const academyImageFor = (topic: string, discipline?: string) =>
  academyTopicImages[topic] ??
  (discipline === "eventing" ? equinaImages.eventing : discipline === "trail" ? equinaImages.trail : equinaImages.profile);

const academyPaths = [
  { title: "Dressage base", body: "Contact, rhythm, transitions", progress: 0, lessons: "4 lessons", accent: equinaTheme.colors.pine },
  { title: "Jumping calm", body: "Lines, rhythm, confidence", progress: 0, lessons: "3 lessons", accent: equinaTheme.colors.pine },
  { title: "Care basics", body: "Recovery, saddle marks, checks", progress: 0, lessons: "3 lessons", accent: equinaTheme.colorRole.positive }
];

const levelGuidance: Record<
  RiderLevel,
  { headline: string; principle: string; planRule: string; quickPlan: string }
> = {
  Beginner: {
    headline: "Confidence before complexity.",
    principle: "Clear cues, short blocks, and one successful repeat build the best foundation.",
    planRule: "Keep each exercise simple, explain the purpose, and stop before confidence drops.",
    quickPlan: "Plan a simple ride"
  },
  Intermediate: {
    headline: "Make good rides repeatable.",
    principle: "Consistency in rhythm and aids matters more than adding another exercise.",
    planRule: "Use repeatable patterns, one measurable focus, and a short debrief.",
    quickPlan: "Plan today's ride"
  },
  Advanced: {
    headline: "Turn feel into precision.",
    principle: "Small decisions in pace, line, and recovery create the next performance gain.",
    planRule: "Set a technical intention, compare two quality reps, and protect recovery.",
    quickPlan: "Plan precision work"
  },
  Pro: {
    headline: "Refine the competitive edge.",
    principle: "Marginal gains only matter when workload, intent, and recovery stay aligned.",
    planRule: "Work from competition intent, track one performance signal, and finish fresh.",
    quickPlan: "Plan performance"
  }
};

const coachPromptsFor = (rider: RiderContext, horse: HorseState) => [
  levelGuidance[rider.level].quickPlan,
  rider.level === "Beginner" ? "Explain an exercise" : "Review last ride",
  horse.careLogged ? "Choose next focus" : "Post-ride check"
];

const conditionLabel = (condition: Listing["conditionGrade"]) => condition.replace("_", " ");

const filterLiveListings = (listings: Listing[], search: string, filter: Filter) =>
  listings.filter((listing) => {
    if (listing.status !== "active") return false;
    const query = search.trim().toLowerCase();
    const matchesSearch =
      query.length === 0 ||
      [listing.title, listing.brand, listing.model, listing.category, listing.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesFilter =
      filter === "All" ||
      (filter === "Saddles" && listing.category === "saddle") ||
      (filter === "Dressage" && listing.metadata?.saddleType === "dressage") ||
      (filter === "Jumping" && listing.metadata?.saddleType === "jumping");
    return matchesSearch && matchesFilter;
  });

const money = (listing: Listing) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: listing.currency,
    maximumFractionDigits: 0
  }).format(listing.priceAmount);

const orderMoney = (amount: number, currency: Order["currency"]) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);

const orderStatusLabel: Record<Order["status"], string> = {
  payment_pending: "Payment pending",
  paid: "Preparing shipment",
  shipped: "In transit",
  inspection: "Inspection open",
  released: "Complete",
  disputed: "Under review",
  refunded: "Refunded"
};

const orderTotalsLabel = (orders: Order[]) => {
  const totals = orders.reduce<Partial<Record<Order["currency"], number>>>((current, order) => ({
    ...current,
    [order.currency]: (current[order.currency] ?? 0) + order.amount
  }), {});
  const labels = (Object.entries(totals) as Array<[Order["currency"], number]>).map(([currency, amount]) => orderMoney(amount, currency));
  return labels.length > 0 ? labels.join(" · ") : "No sales";
};

const createCoachReply = ({
  prompt,
  horseName,
  discipline,
  level,
  goal,
  load,
  style,
  sessionCount,
  careLogged,
  lastRide,
  listing
}: {
  prompt: string;
  horseName: string;
  discipline: CoachDiscipline;
  level: RiderLevel;
  goal: string;
  load: string;
  style: string;
  sessionCount: number;
  careLogged: boolean;
  lastRide?: RideSession | null;
  listing?: Listing;
}): Omit<ChatMessage, "id" | "role"> => {
  const text = prompt.toLowerCase();
  const voice = style === "Direct" ? "Short answer:" : style === "Detailed" ? "Your plan:" : "For you today:";
  const guidance = levelGuidance[level];
  const levelArticle = /^[AEIOU]/.test(level) ? "an" : "a";
  const planByDiscipline: Record<CoachDiscipline, string> = {
    Dressage: "8 min loosen, 12 min rhythm, 8 min transitions, then stretch",
    Jumping: "10 min loosen, poles for rhythm, four calm lines, then stretch",
    Eventing: "10 min loosen, balance work, a short canter set, then recovery",
    Trail: "a long walk, gentle hills if relaxed, loose rein, then a legs check"
  };
  const loadRule =
    load === "Light week"
      ? "Keep it near 25 minutes."
      : load === "Heavy week"
        ? "Keep it light; quality beats another hard effort."
        : "Aim for 35 minutes and finish with energy left.";
  const signalByDiscipline: Record<CoachDiscipline, string> = {
    Dressage: `Notice whether ${horseName}'s contact stays soft through each transition.`,
    Jumping: `Notice whether ${horseName}'s tempo stays the same from poles to line.`,
    Eventing: `Notice whether ${horseName} recovers without losing balance.`,
    Trail: `Notice whether ${horseName} stays relaxed as the terrain changes.`
  };
  const latestRideSummary = lastRide
    ? `${rideDurationLabel(lastRide.elapsedSeconds)}, ${lastRide.completedPhases}/${lastRide.totalPhases} phases, and it felt ${lastRide.mood.toLowerCase()}`
    : null;
  const recoveryRule = lastRide?.mood === "Tender"
    ? `${horseName}'s latest ride felt tender, so keep this session recovery-led and stop if anything feels unusual.`
    : "";

  if (text.includes("saddle") || text.includes("tack") || text.includes("fit")) {
    return {
      label: "Fit",
      confidence: listing?.metadata?.treeSize ? "medium" : "low",
      text: listing
        ? `${voice} I can screen the ${listing.brand} ${listing.model ?? "item"}, not confirm fit. Ask for panel photos, tree width, serial, and a no-pad placement video, then involve a qualified saddler.`
        : `${voice} add photos, tree size, panel shape, and ${horseName}'s back measurements first. A qualified saddler should confirm the final fit.`
    };
  }

  if (text.includes("lame") || text.includes("swollen") || text.includes("colic") || text.includes("pain")) {
    return {
      label: "Safety",
      confidence: "medium",
      text: `${voice} pause work. Log the time, behaviour, appetite, legs, temperature if you normally take it, and photos. Contact your vet before returning to training.`
    };
  }

  if (text.includes("summarize") || text.includes("recap") || text.includes("review") || text.includes("last ride")) {
    return {
      label: "Ride review",
      confidence: lastRide ? "medium" : "low",
      text: lastRide
        ? `${voice} ${horseName}'s latest ride was ${latestRideSummary}. ${lastRide.mood === "Tender" ? "Make the next ride a quiet recovery check and keep the first ask simple." : "Repeat the clearest phase once next time, then build only if the rhythm stays easy."}`
        : `${voice} for ${levelArticle} ${level.toLowerCase()} ${discipline.toLowerCase()} rider, log three things: where the rhythm changed, which aid worked, and when ${horseName} felt easiest. With ${sessionCount} rides logged, compare the pattern before changing the exercise.`
    };
  }

  if (text.includes("care") || text.includes("recovery") || text.includes("post-ride") || text.includes("legs") || text.includes("track") || text.includes("after")) {
    return {
      label: "Aftercare",
      confidence: "medium",
      text: `${voice} cool ${horseName} down fully, check legs and saddle marks, note drinking and normal behaviour, then log anything unusual. If a change persists or worries you, pause work and contact your vet.`
    };
  }

  if (text.includes("afraid") || text.includes("nervous") || text.includes("confidence") || text.includes("brave")) {
    return {
      label: "Confidence",
      confidence: "medium",
      text: `${voice} lower the question until both of you can answer calmly. Keep one familiar line, repeat only while the rhythm stays the same, and finish after one confident effort. ${guidance.planRule}`
    };
  }

  if (text.includes("explain") || text.includes("exercise")) {
    return {
      label: `${level} lesson`,
      confidence: "medium",
      text: `${voice} use one exercise with one purpose: poles on a steady rhythm, then notice whether your line and ${horseName}'s tempo stay unchanged. ${guidance.planRule}`
    };
  }

  return {
    label: `${level} · ${goal}`,
    confidence: "medium",
    text: `${voice} ${recoveryRule || planByDiscipline[discipline]} ${loadRule} ${signalByDiscipline[discipline]}`
  };
};

export default function App() {
  return (
    <SafeAreaProvider>
      <EquinaApp />
    </SafeAreaProvider>
  );
}

function EquinaApp() {
  const equinaSession = useEquinaSession();
  const seeded = useMemo(() => createSeededEquinaApi(), []);
  const { api, buyerSession, sellerSession, horse } = seeded;
  const [accountCreated, setAccountCreated] = useState(false);
  // Signed-out riders land on the sign-in screen. "create" hands them to
  // onboarding, which collects the rider and horse before the account.
  const [entryRoute, setEntryRoute] = useState<"signin" | "create">("signin");
  const [signInNotice, setSignInNotice] = useState("");
  const [otpVisible, setOtpVisible] = useState(false);
  // What the emailed code or link is for. Each needs a different resend and a
  // different next step once verified.
  const [otpPurpose, setOtpPurpose] = useState<"create" | "signin" | "recovery">("create");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pendingAuthPassword, setPendingAuthPassword] = useState("");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("you");
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingEmail, setOnboardingEmail] = useState("");
  const [onboardingDiscipline, setOnboardingDiscipline] = useState<CoachDiscipline>("Jumping");
  const [onboardingLevel, setOnboardingLevel] = useState<RiderLevel>("Intermediate");
  const [onboardingGoal, setOnboardingGoal] = useState<RiderGoal>("Daily training");
  const [onboardingHasHorse, setOnboardingHasHorse] = useState(true);
  const [onboardingHorsePhoto, setOnboardingHorsePhoto] = useState("");
  // Only set when the rider picked a real photo. Sample photos carry a marker
  // value and nothing to upload.
  const [onboardingHorsePhotoAsset, setOnboardingHorsePhotoAsset] =
    useState<OnboardingPhotoAsset | null>(null);
  const [onboardingHorseName, setOnboardingHorseName] = useState("");
  const [onboardingHorseBreed, setOnboardingHorseBreed] = useState("");
  const [onboardingHorseSex, setOnboardingHorseSex] = useState<(typeof horseSexes)[number]>("Gelding");
  // Empty, not a sample value. Onboarding never asks for either, so any default
  // here is shown to the rider as a fact about their own horse.
  const [onboardingHorseAge, setOnboardingHorseAge] = useState("");
  const [onboardingHorseHeight, setOnboardingHorseHeight] = useState("");
  const [onboardingRideFeel, setOnboardingRideFeel] = useState<(typeof horseRideFeels)[number]>("Extra energy");
  const [onboardingFrequency, setOnboardingFrequency] = useState<(typeof ridingFrequencies)[number]>("3-4 rides/week");
  const [onboardingCarePriority, setOnboardingCarePriority] = useState<(typeof carePriorities)[number]>("Training plan");
  const [onboardingAppPriority, setOnboardingAppPriority] = useState<(typeof appPriorities)[number]>("Ride plan");
  const [tab, setTab] = useState<Tab>("home");
  // Account opens over the tab the rider was on, and closing it goes back there.
  const [accountReturnTab, setAccountReturnTab] = useState<Tab>("home");
  const [accountInitialRoute, setAccountInitialRoute] = useState<AccountRoute>("root");
  // Ralf opens over whichever tab asked for him, with that tab's question.
  const [ralfOpen, setRalfOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState(api.store.listings[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [marketSearch, setMarketSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<Filter>("All");
  const [shopMode, setShopMode] = useState<ShopMode>("browse");
  const [shopBuyerView, setShopBuyerView] = useState<ShopBuyerView>("browse");
  const [shopSellerView, setShopSellerView] = useState<ShopSellerView>("dashboard");
  const [shopOpenedListingId, setShopOpenedListingId] = useState(api.store.listings[0]?.id ?? "");
  const [pendingShopConversationId, setPendingShopConversationId] = useState("");
  const [rideActive, setRideActive] = useState(false);
  // Seeded for demo mode only. A connected account counts its real journal.
  const [localSessionCount, setLocalSessionCount] = useState(4);
  const [careLogged, setCareLogged] = useState(false);
  // Starts at zero. Engagement is the one number a social product must never
  // invent — it is the whole signal a rider reads the feed for.
  const [communityLikes, setCommunityLikes] = useState(0);
  // Bumped by "Share ride" to open the Club composer with the ride attached.
  const [clubComposeRequest, setClubComposeRequest] = useState(0);
  const [sharedRide, setSharedRide] = useState(false);
  const [lastRideRecapVisible, setLastRideRecapVisible] = useState(false);
  const [dailyMood, setDailyMood] = useState<MoodOption>("Focused");
  // Kept as the fallback for demo mode and for accounts where ride_logging is
  // still off. When the capability is on, the journal below is the source.
  const [localLastRide, setLocalLastRide] = useState<RideSession | null>(null);
  const [focusStarted, setFocusStarted] = useState(false);
  const [focusProgress, setFocusProgress] = useState(64);
  const [coachDiscipline, setCoachDiscipline] = useState<CoachDiscipline>(defaultCoachDiscipline);
  const [coachGoal, setCoachGoal] = useState(defaultCoachGoal);
  const [coachLoad, setCoachLoad] = useState(defaultCoachLoad);
  const [coachStyle, setCoachStyle] = useState(defaultCoachStyle);
  const [coachOnboarded, setCoachOnboarded] = useState(false);
  const [pendingCoachPrompt, setPendingCoachPrompt] = useState("");
  const [academyProgress, setAcademyProgress] = useState(0);
  const [academyMode, setAcademyMode] = useState<AcademyMode>("home");
  // Empty means "the lesson the Academy recommends", whichever that is today.
  const [selectedAcademyLessonId, setSelectedAcademyLessonId] = useState("");
  // What the rider typed, and nothing else, is what gets saved. The display
  // fallback only fills a header before a name exists.
  const riderName = onboardingName.trim();
  const riderDisplayName = riderName || "Rider";
  const riderMonogram = riderDisplayName.slice(0, 2).toUpperCase();
  const primaryHorseName = onboardingHasHorse ? onboardingHorseName.trim() || horse.name : "";
  const rideHorseName = primaryHorseName || "Today's horse";
  const horseContextName = primaryHorseName || "the horse you ride";
  const [coachMessages, setCoachMessages] = useState<ChatMessage[]>([
    {
      id: "coach-welcome",
      role: "assistant",
      label: "Welcome",
      confidence: "medium",
      text: `I use your level, discipline, training focus, and ${horseContextName} to keep our work relevant.`
    }
  ]);
  const [nutritionState, setNutritionState] = useState<NutritionState>(initialNutritionState);
  const [savedListingIds, setSavedListingIds] = useState<string[]>(() =>
    api.store.listings.filter((listing) => listing.status === "active").slice(1, 3).map((listing) => listing.id)
  );
  const [reservedListingId, setReservedListingId] = useState("");
  const [onboardingTransitioning, setOnboardingTransitioning] = useState(false);
  const accountMode: AccountMode = equinaSession.phase === "demo" ? "demo" : "connected";
  const authAuditMode =
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("audit") === "auth";
  const onboardingCompletionMode: OnboardingCompletionMode = authAuditMode
    ? "connected"
    : equinaSession.configured
      ? "connected"
      : equinaSession.demoAllowed
        ? "preview"
        : "unavailable";
  // Everything a previous account or the demo left in memory. Runs on an
  // explicit sign-out and when a session ends on its own (revoked, expired,
  // deleted) -- otherwise the next person to sign in on this device would
  // start from the last one's name, horse and progress.
  const resetAccountUi = () => {
    setCoachMessages([]);
    setLocalLastRide(null);
    setAccountCreated(false);
    setOtpVisible(false);
    setOtpPurpose("create");
    setAuthError("");
    setSignInNotice("");
    setPendingAuthPassword("");
    setEntryRoute("signin");
    setOnboardingStep("you");
    setOnboardingName("");
    setOnboardingEmail("");
    setOnboardingDiscipline("Jumping");
    setOnboardingLevel("Intermediate");
    setOnboardingHasHorse(true);
    setOnboardingHorsePhoto("");
    setOnboardingHorsePhotoAsset(null);
    setOnboardingHorseName("");
    setOnboardingHorseBreed("");
    // Demo mode fills these; none of it may carry into the next account.
    setOnboardingGoal("Daily training");
    setOnboardingHorseSex("Gelding");
    setOnboardingHorseAge("");
    setOnboardingHorseHeight("");
    setCoachDiscipline(defaultCoachDiscipline);
    setCoachGoal(defaultCoachGoal);
    setCoachLoad(defaultCoachLoad);
    setCoachStyle(defaultCoachStyle);
    setCoachOnboarded(false);
    setAcademyProgress(0);
    setAcademyMode("home");
    setRalfOpen(false);
    setAccountReturnTab("home");
    setTab("home");
  };
  const accountController = useAccount({
    mode: accountMode,
    backend: equinaSession.backend,
    connectedSnapshot: equinaSession.account,
    fallback: {
      displayName: riderDisplayName,
      email: onboardingEmail,
      horseName: primaryHorseName || undefined,
      discipline: toDomainDiscipline(onboardingDiscipline),
      skillLevel: toDomainLevel(onboardingLevel)
    },
    onConnectedSnapshot: equinaSession.updateAccount,
    onSignOut: async () => {
      await clearShopDrafts(equinaSession.session?.user.id);
      await clearOnboardingDraft();
      await equinaSession.signOut();
      resetAccountUi();
    },
    onClearDemoCoach: () => {
      void clearDemoCoachHistory();
      setCoachMessages([]);
    }
  });
  const horseRecords = useHorseRecords({
    backend: equinaSession.backend,
    enabled: accountMode === "connected" && equinaSession.phase === "authenticated",
    canManageHorse:
      accountMode === "connected" &&
      equinaSession.phase === "authenticated" &&
      equinaSession.capabilities.horseManagement,
    canMutateRecords:
      accountMode === "connected" &&
      equinaSession.phase === "authenticated" &&
      equinaSession.capabilities.records,
    onPersist: equinaSession.refreshAccount
  });
  const ridePersistence =
    accountMode === "connected" &&
    equinaSession.phase === "authenticated" &&
    equinaSession.capabilities.rideLogging;
  const rideJournal = useRideJournal({
    backend: equinaSession.backend,
    enabled: ridePersistence
  });
  // While ride_logging is off the recap still works, it just does not outlive
  // the session. That difference is stated in the copy rather than hidden.
  const lastRide = ridePersistence ? rideJournal.lastRide : localLastRide;
  // The app states this number back to the rider as fact ("N rides are now in
  // your journal"), so it has to come from the journal, never from a seed.
  const sessionCount = ridePersistence ? rideJournal.entries.length : localSessionCount;
  // The rider's plan (202610060001): which paid lessons are open and how much
  // of the Club. Until plans are enforced it says everything is open.
  const planController = usePlan({
    backend: equinaSession.backend,
    enabled: loadsPlan(accountMode, equinaSession.phase, equinaSession.capabilities)
  });
  const plan = planController.plan;
  // Selling plans through RevenueCat. Nothing native runs, and the plan
  // screen sells nothing, until every condition in purchasesAvailable holds.
  const purchases = usePurchases({
    backend: equinaSession.backend,
    connected: accountMode === "connected" && equinaSession.phase === "authenticated",
    userId: equinaSession.session?.user.id ?? null,
    capability: equinaSession.capabilities.purchases,
    plan,
    onPlanChanged: planController.refresh
  });
  // A new account sees the plans once, after onboarding, and only while they
  // are on sale with prices loaded.
  const signUpPlanOffer = useSignUpPlanOffer({
    userId: equinaSession.session?.user.id ?? null,
    ready:
      purchases.available &&
      purchases.status === "ready" &&
      purchases.offers.length > 0 &&
      accountCreated &&
      !onboardingTransitioning
  });
  // A signed-in account outside the beta waits at the door (202610060003).
  const betaDoor = showsBetaDoor(equinaSession.phase, equinaSession.capabilities);
  // The account that finished onboarding in this run. One that did so while
  // still outside the beta was offered the plans when none could be sold, so
  // coming through the door is when it really arrives.
  const newAccountId = useRef<string | null>(null);
  // A horse photo picked in onboarding by an account still outside the beta.
  // Uploading is a beta feature, so it waits here and goes up as the account
  // comes through the door, rather than failing behind it.
  const heldHorsePhoto = useRef<{ userId: string; horseId: string; asset: OnboardingPhotoAsset } | null>(null);
  const uploadHeldHorsePhoto = useRef<(horseId: string, asset: OnboardingPhotoAsset) => Promise<void>>(async () => {});
  const wasAtBetaDoor = useRef(false);
  const arrivingUserId = equinaSession.session?.user.id;
  const offerPlansTo = signUpPlanOffer.offerTo;
  useEffect(() => {
    if (betaDoor) {
      wasAtBetaDoor.current = true;
      return;
    }
    if (!wasAtBetaDoor.current) return;
    wasAtBetaDoor.current = false;
    const held = heldHorsePhoto.current;
    heldHorsePhoto.current = null;
    if (held && held.userId === arrivingUserId) void uploadHeldHorsePhoto.current(held.horseId, held.asset);
    if (arrivingUserId && newAccountId.current === arrivingUserId) offerPlansTo(arrivingUserId);
  }, [arrivingUserId, betaDoor, offerPlansTo]);
  const club = useClub({
    backend: equinaSession.backend,
    userId: equinaSession.session?.user.id,
    enabled:
      accountMode === "connected" &&
      equinaSession.phase === "authenticated" &&
      plan.clubAccess !== "none" &&
      (equinaSession.capabilities.clubPublishing || equinaSession.capabilities.clubInteractions)
  });
  const clubSharing = accountMode === "connected"
    ? equinaSession.capabilities.clubPublishing
    : equinaFeatureFlags.clubPublishing;
  // A connected account needs the server to open a part of the marketplace;
  // demo mode follows this build's switches.
  const marketplaceOpen = accountMode === "connected"
    ? equinaSession.capabilities.checkout ||
      equinaSession.capabilities.listingCreation ||
      equinaSession.capabilities.messaging
    : equinaFeatureFlags.shopTransactions ||
      equinaFeatureFlags.shopListingCreation ||
      equinaFeatureFlags.shopMessaging;
  const dockTabs = marketplaceOpen ? [...coreTabs, shopTab] : coreTabs;
  // Every "Ask Ralf" disappears with him, so none of them leads to a dead end.
  const ralfAvailable = accountMode === "demo" || equinaSession.capabilities.coachChat;
  const latestRideEntry = ridePersistence ? rideJournal.latestEntry : null;
  const clubRideShare: ClubRideShare | undefined = latestRideEntry
    ? {
        id: latestRideEntry.id,
        horseId: latestRideEntry.horseId,
        summary: rideShareLine({
          horseName: latestRideEntry.horseId ? primaryHorseName : undefined,
          elapsedSeconds: latestRideEntry.elapsedSeconds,
          focus: latestRideEntry.focus,
          mood: latestRideEntry.mood
        })
      }
    : undefined;
  const connectedCatalog = useConnectedShopCatalog({
    backend: equinaSession.backend,
    enabled: accountMode === "connected" && equinaSession.phase === "authenticated"
  });
  const pushRegistration = usePushRegistration({
    backend: equinaSession.backend,
    enabled: accountMode === "connected" && equinaSession.capabilities.pushNotifications,
    authenticated: equinaSession.phase === "authenticated",
    onOpenConversation: (conversationId) => {
      setPendingShopConversationId(conversationId);
      setShopMode("browse");
      setShopBuyerView("conversation");
      setTab("gear");
    }
  });
  const screenAnim = useRef(new Animated.Value(1)).current;
  const onboardingArrival = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  const effectiveListings =
    accountMode === "connected"
      ? connectedCatalog.listings
      : api.store.listings;
  const selectedListing = effectiveListings.find((listing) => listing.id === selectedListingId) ?? effectiveListings[0];
  const marketListings = filterLiveListings(effectiveListings, marketSearch, marketFilter);
  const seller = api.store.profiles.find((profile) => profile.userId === sellerSession.userId);
  const reservedListing = effectiveListings.find((listing) => listing.id === reservedListingId);
  // Seeded orders belong to the demo only. A connected rider has none, and a
  // statistics row is read as fact regardless of the word next to it.
  const buyerOrders = accountMode === "demo"
    ? api.store.orders.filter((order) => order.buyerId === buyerSession.userId)
    : [];
  const sellerOrders = accountMode === "demo"
    ? api.store.orders.filter((order) => order.sellerId === sellerSession.userId)
    : [];
  const sellerRevenueLabel = orderTotalsLabel(sellerOrders);
  const activeSellerListings = effectiveListings.filter((listing) => listing.sellerId === sellerSession.userId && listing.status === "active").length;
  const horseState: HorseState = {
    hasHorse: onboardingHasHorse,
    name: rideHorseName,
    sessionCount,
    careLogged,
    rideActive,
    lastRide
  };
  const riderContext: RiderContext = {
    name: riderDisplayName,
    level: onboardingLevel,
    discipline: onboardingDiscipline,
    goal: onboardingGoal,
    frequency: onboardingFrequency
  };
  // A connected account reads the published catalogue; demo mode keeps the
  // preview. An empty catalogue is real, and the Academy opens on Ralf.
  const academyLive = useAcademy({
    backend: equinaSession.backend,
    enabled: accountMode === "connected" && equinaSession.phase === "authenticated"
  });
  const academyLessons = useMemo(
    () => accountMode === "connected"
      ? academyLive.lessons.map((lesson) => liveLessonView(lesson, academyLive.progress[lesson.id], academyImageFor))
      : academyPreviewLessons,
    [accountMode, academyLive.lessons, academyLive.progress]
  );
  const academyCatalogReady = accountMode !== "connected" || academyLive.loaded;
  const academyFocus = lastRide?.mood === "Tender" ? "Recovery" : coachGoal;
  const academyState: AcademyState = {
    // The preview counts taps on "Complete lesson"; a real account counts
    // what the rider actually watched along their path.
    progress: accountMode === "connected"
      ? pathProgress(academyPathFor(academyLessons, riderContext, academyFocus))
      : academyProgress,
    mode: academyMode,
    selectedLessonId: selectedAcademyLessonId
  };
  const postRideLesson = recommendedLessonFor(academyLessons, riderContext, academyFocus);
  const postRideRecommendation: RideRecommendation | undefined = postRideLesson
    ? {
        title: postRideLesson.title,
        coach: postRideLesson.coach,
        duration: postRideLesson.duration,
        summary: postRideLesson.summary,
        image: postRideLesson.image
      }
    : undefined;

  // However the session ended -- signing out, an expired session, a failed
  // link -- the way back in starts at the sign-in screen, where the session's
  // notice explains it.
  const previousPhase = useRef(equinaSession.phase);
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = equinaSession.phase;
    if (equinaSession.phase !== "signedOut") return;
    setEntryRoute("signin");
    // A failed emailed link lands here too; the "waiting for your link" screen
    // must not stay up over the notice that says the link did not work.
    setOtpVisible(false);
    if (previous === "authenticated" || previous === "onboarding" || previous === "demo") {
      void clearOnboardingDraft();
      resetAccountUi();
    }
  }, [equinaSession.phase]);

  // A notice from the session (expired, failed link) is newer than whatever
  // this screen last said, such as "we sent a link".
  useEffect(() => {
    if (equinaSession.signedOutNotice) setSignInNotice("");
  }, [equinaSession.signedOutNotice]);

  useEffect(() => {
    const snapshot = equinaSession.account;
    if (!snapshot) return;
    let active = true;
    setOnboardingName(snapshot.profile.displayName);
    setOnboardingEmail(snapshot.email);
    setOnboardingDiscipline(toCoachDiscipline(snapshot.profile.discipline));
    setOnboardingLevel(toRiderLevel(snapshot.profile.skillLevel));
    if (snapshot.primaryHorse) {
      setOnboardingHasHorse(true);
      setOnboardingHorseName(snapshot.primaryHorse.name);
      setOnboardingHorseBreed(snapshot.primaryHorse.breed ?? "");
    } else {
      setOnboardingHasHorse(false);
      setOnboardingHorseName("");
      setOnboardingHorseBreed("");
      setOnboardingHorsePhoto("");
    }
    if (equinaSession.phase === "authenticated") {
      setAccountCreated(true);
      setOtpVisible(false);
      setAuthError("");
      void clearOnboardingDraft();
    } else if (equinaSession.phase === "onboarding") {
      setAccountCreated(false);
      setOtpVisible(false);
      // Start at the beginning. Jumping to "preview" was right when riders
      // always filled onboarding before signing in; a rider who signs in first
      // has nothing to preview, and would land on a summary of empty fields.
      // Only a saved draft for this same email resumes at the end.
      setOnboardingStep("you");
      void readOnboardingDraft().then((draft) => {
        if (!active) return;
        if (!draft || draft.email.trim().toLowerCase() !== snapshot.email.trim().toLowerCase()) {
          // The form now shows this account, not the one a photo was picked
          // for. Kept, it would be uploaded to a horse that never showed it.
          setOnboardingHorsePhotoAsset(null);
          return;
        }
        setOnboardingStep("preview");
        setOnboardingName(draft.name);
        setOnboardingEmail(draft.email);
        setOnboardingDiscipline(draft.discipline);
        setOnboardingLevel(draft.level);
        setOnboardingHasHorse(draft.hasHorse);
        setOnboardingHorsePhoto(draft.horsePhoto);
        setOnboardingHorseName(draft.horseName);
        setOnboardingHorseBreed(draft.horseBreed);
      });
    }
    return () => {
      active = false;
    };
  }, [equinaSession.account, equinaSession.phase]);

  useEffect(() => {
    if (
      accountMode !== "connected" ||
      equinaSession.phase !== "authenticated" ||
      !horseRecords.loaded
    ) {
      return;
    }
    const selectedHorse = horseRecords.selectedHorse;
    if (!selectedHorse) {
      setOnboardingHasHorse(false);
      setOnboardingHorseName("");
      setOnboardingHorseBreed("");
      setOnboardingHorsePhoto("");
      return;
    }
    setOnboardingHasHorse(true);
    setOnboardingHorseName(selectedHorse.name);
    setOnboardingHorseBreed(selectedHorse.breed ?? "");
    setOnboardingHorsePhoto(selectedHorse.photoUrl ?? "");
    setOnboardingDiscipline(toCoachDiscipline(selectedHorse.discipline));
    if (selectedHorse.sex) {
      const sexLabel = `${selectedHorse.sex.charAt(0).toUpperCase()}${selectedHorse.sex.slice(1)}`;
      if (horseSexes.includes(sexLabel as (typeof horseSexes)[number])) {
        setOnboardingHorseSex(sexLabel as (typeof horseSexes)[number]);
      }
    }
    if (selectedHorse.heightCm) setOnboardingHorseHeight(String(selectedHorse.heightCm));
    if (selectedHorse.birthDate) {
      const birthYear = Number(selectedHorse.birthDate.slice(0, 4));
      if (Number.isFinite(birthYear)) {
        setOnboardingHorseAge(String(Math.max(0, new Date().getFullYear() - birthYear)));
      }
    }
  }, [
    accountMode,
    equinaSession.phase,
    horseRecords.loaded,
    horseRecords.selectedHorse
  ]);

  // The training profile saved in Account is where the Academy path and Ralf
  // start from. Before, the saved focus was stored and then never used.
  // A connected account reads only what the server returned; its placeholder
  // snapshot, shown while loading, would otherwise set a focus nobody chose.
  const trainingSnapshot = accountMode === "connected" ? equinaSession.account : accountController.snapshot;
  const savedFocus = trainingSnapshot?.preferences.academyFocus;
  const savedDiscipline = trainingSnapshot?.profile.discipline;
  const savedLevel = trainingSnapshot?.profile.skillLevel;
  useEffect(() => {
    if (savedFocus) setCoachGoal(savedFocus);
  }, [savedFocus]);
  useEffect(() => {
    if (savedDiscipline) setOnboardingDiscipline(toCoachDiscipline(savedDiscipline));
  }, [savedDiscipline]);
  useEffect(() => {
    if (savedLevel) setOnboardingLevel(toRiderLevel(savedLevel));
  }, [savedLevel]);

  useEffect(() => {
    if (effectiveListings[0] && !effectiveListings.some((listing) => listing.id === selectedListingId)) {
      setSelectedListingId(effectiveListings[0].id);
      setShopOpenedListingId(effectiveListings[0].id);
    }
  }, [effectiveListings, selectedListingId]);

  useEffect(() => {
    if (reducedMotion) {
      screenAnim.setValue(1);
      return;
    }

    screenAnim.setValue(0);
    Animated.timing(screenAnim, {
      toValue: 1,
      duration: equinaTheme.motion.transition,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [reducedMotion, screenAnim, tab]);

  useEffect(() => {
    if (!message || message.startsWith("Welcome")) return;
    const timeout = setTimeout(() => setMessage(""), 2400);
    return () => clearTimeout(timeout);
  }, [message]);

  const screenMotionStyle = {
    opacity: screenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.82, 1]
    }),
    transform: Platform.OS === "web"
      ? []
      : [
          {
            translateY: screenAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [6, 0]
            })
          }
        ]
  };
  const onboardingExitStyle = {
    opacity: onboardingArrival.interpolate({
      inputRange: [0, 0.72, 1],
      outputRange: [1, 0.92, 0]
    }),
    transform: [
      {
        scale: onboardingArrival.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.012]
        })
      }
    ]
  };
  const appArrivalStyle = {
    opacity: onboardingArrival.interpolate({
      inputRange: [0, 0.16, 1],
      outputRange: [0, 0, 1]
    }),
    transform: [
      {
        translateY: onboardingArrival.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0]
        })
      },
      {
        scale: onboardingArrival.interpolate({
          inputRange: [0, 1],
          outputRange: [0.988, 1]
        })
      }
    ]
  };

  const refresh = (nextMessage: string) => {
    setMessage(nextMessage);
  };

  const startRide = () => {
    if (rideActive) return;
    setRideActive(true);
    setLastRideRecapVisible(false);
    setDailyMood("Focused");
    refresh("Ride started. Keep the rhythm easy.");
  };

  const finishRide = (session: RideCompletion) => {
    setRideActive(false);
    setLocalLastRide({ ...session, mood: dailyMood });
    setCareLogged(false);
    setSharedRide(false);
    setLocalSessionCount((count) => count + 1);
    setFocusProgress((progress) => Math.min(100, progress + 10));
    setLastRideRecapVisible(true);

    if (!ridePersistence) {
      refresh(
        onboardingHasHorse
          ? `Ride captured for this preview. Add how ${primaryHorseName} felt, then choose the next useful step.`
          : "Ride captured for this preview. Add how it felt, then choose the next useful step."
      );
      return;
    }

    // The recap is shown immediately from local state and reconciled once the
    // write lands, so a slow network never blocks the rider's own summary.
    void rideJournal
      .logRide({
        session,
        mood: dailyMood,
        horseId: horseRecords.selectedHorseId || undefined
      })
      .then(() => {
        refresh(
          onboardingHasHorse
            ? `Ride saved. Add how ${primaryHorseName} felt, then choose the next useful step.`
            : "Ride saved. Add how it felt, then choose the next useful step."
        );
      })
      .catch((saveError: unknown) => {
        refresh(saveError instanceof Error
          ? saveError.message
          : "The ride could not be saved. It is still shown here for this session.");
      });
  };

  const cancelRide = () => {
    setRideActive(false);
    setLastRideRecapVisible(false);
    refresh("Ride ended without saving.");
  };

  const logCare = () => {
    setCareLogged(true);
    refresh(
      onboardingHasHorse
        ? `Care checked for this preview. ${primaryHorseName} is up to date for this session.`
        : "Ride note saved for this preview."
    );
  };

  // A prompt arrives already asked, the way the place it came from put it.
  const openRalf = (prompt?: string) => {
    if (!ralfAvailable) return;
    void Haptics.selectionAsync().catch(() => undefined);
    setLastRideRecapVisible(false);
    if (prompt) setPendingCoachPrompt(prompt);
    setRalfOpen(true);
    refresh("");
  };

  const closeRalf = () => {
    setPendingCoachPrompt("");
    setRalfOpen(false);
  };

  const openAccountAt = (route: AccountRoute) => {
    if (tab !== "profile") setAccountReturnTab(tab);
    setAccountInitialRoute(route);
    setRalfOpen(false);
    setTab("profile");
  };
  const openAccount = () => openAccountAt("root");
  // "See plans" from the Academy, the Club or Ralf goes straight to the plan,
  // and back returns the rider to where they were.
  const openPlans = () => {
    void planController.refresh();
    if (purchases.status === "failed") purchases.reload();
    openAccountAt("plan");
  };

  const closeAccount = () => {
    setTab(accountReturnTab === "profile" ? "home" : accountReturnTab);
  };

  // Finishing a preview lesson only moves the preview's bar. A real lesson is
  // recorded, and the bar follows what the rider actually finished.
  const completeAcademyLesson = (lessonId: string, positionSeconds: number) => {
    if (accountMode === "connected") {
      void academyLive.recordProgress(lessonId, positionSeconds, true);
      return;
    }
    setAcademyProgress((progress) => Math.min(100, progress + 8));
    refresh("Lesson progress updated for this preview.");
  };

  const navigateAcademy = (mode: AcademyMode) => {
    setAcademyMode(mode);
  };

  const openAcademyLesson = (lessonId: string) => {
    setSelectedAcademyLessonId(lessonId);
    navigateAcademy("video");
  };

  const openPostRideLesson = () => {
    setLastRideRecapVisible(false);
    if (!postRideLesson) {
      // No lesson to continue with yet, so the ride goes to Ralf instead.
      openRalf("Review last ride");
      return;
    }
    setSelectedAcademyLessonId(postRideLesson.id);
    setAcademyMode("video");
    setTab("assistant");
    refresh("");
  };

  const closeRideRecap = () => {
    setLastRideRecapVisible(false);
    setTab("home");
    refresh("");
  };

  const openCommunity = () => {
    setTab("community");
    refresh("");
  };

  const shareRide = (openClub = true) => {
    // A connected rider shares through the real composer: it opens with the
    // ride attached, and nothing is posted until they tap Post.
    if (accountMode === "connected") {
      setLastRideRecapVisible(false);
      setTab("community");
      if (equinaSession.capabilities.clubPublishing) setClubComposeRequest((count) => count + 1);
      refresh("");
      return;
    }
    if (!equinaFeatureFlags.clubPublishing) {
      if (openClub) setTab("community");
      setLastRideRecapVisible(!openClub);
      refresh(openClub ? "" : "Club posting opens after account connection and moderation are ready.");
      return;
    }
    setSharedRide(true);
    setLastRideRecapVisible(!openClub);
    if (openClub) setTab("community");
    refresh(openClub ? "" : "Ride shared to your club.");
  };

  const updateDailyMood = (mood: MoodOption) => {
    setDailyMood(mood);
    setLocalLastRide((current) => current ? { ...current, mood } : current);
    // The check-in is an edit to the stored ride, not a separate record. Without
    // this the recap would show one value and the journal another.
    if (ridePersistence && rideJournal.latestEntry) {
      void rideJournal
        .updateRide(rideJournal.latestEntry.id, { mood })
        .catch((saveError: unknown) => {
          refresh(saveError instanceof Error ? saveError.message : "The check-in could not be saved.");
        });
    }
    refresh(
      onboardingHasHorse
        ? `${primaryHorseName} check-in saved: ${mood.toLowerCase()}.`
        : `Ride check-in saved: ${mood.toLowerCase()}.`
    );
  };

  const startFocusPlan = () => {
    setFocusStarted(true);
    setFocusProgress((progress) => Math.min(100, progress + 8));
    refresh("Today's plan is live.");
  };

  const finishFocusPlan = () => {
    setFocusStarted(false);
    setLocalSessionCount((count) => count + 1);
    setFocusProgress((progress) => Math.min(100, progress + 14));
    // This completes a focus plan; it does not write a ride. Claiming the
    // journal here would be the same invented fact the ride count was.
    refresh("Focus plan complete. Log a ride to add it to your journal.");
  };

  const toggleNutritionMeal = (mealId: NutritionMealId) => {
    setNutritionState((current) => ({
      ...current,
      completedMeals: current.completedMeals.includes(mealId)
        ? current.completedMeals.filter((id) => id !== mealId)
        : [...current.completedMeals, mealId]
    }));
  };

  const logNutritionWater = () => {
    setNutritionState((current) => ({
      ...current,
      waterLiters: Math.min(stableWaterGoal, current.waterLiters + 4)
    }));
  };

  const toggleSavedListing = (listing: Listing) => {
    const wasSaved = savedListingIds.includes(listing.id);
    setSavedListingIds((current) =>
      wasSaved ? current.filter((id) => id !== listing.id) : [...current, listing.id]
    );
    void Haptics.selectionAsync().catch(() => undefined);
    refresh(wasSaved ? `${listing.brand} removed from saved.` : `${listing.brand} saved for later.`);
  };

  const buySelected = (listingOverride?: Listing) => {
    if (!equinaFeatureFlags.shopTransactions) {
      refresh("Checkout is a preview. No payment can be submitted yet.");
      return false;
    }
    const listingToBuy = listingOverride ?? selectedListing;
    if (!listingToBuy) {
      refresh("Pick an item first.");
      return false;
    }
    try {
      const order = api.orders.createOrder(listingToBuy.id, buyerSession.userId);
      setSelectedListingId(listingToBuy.id);
      setReservedListingId(listingToBuy.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      refresh(`${listingToBuy.brand} reserved. Payment is protected while the seller prepares shipping.`);
      return true;
    } catch (error) {
      refresh(error instanceof Error ? error.message : "Could not create order.");
      return false;
    }
  };

  const acceptOrder = (order: Order) => {
    if (!equinaFeatureFlags.shopTransactions) {
      refresh("Order actions are read-only in this preview.");
      return;
    }
    try {
      api.orders.acceptOrder(order.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      refresh("Item accepted. The protected payment was released to the seller.");
    } catch (error) {
      refresh(error instanceof Error ? error.message : "Could not accept this order.");
    }
  };

  const openDispute = (order?: Order) => {
    if (!equinaFeatureFlags.shopTransactions) {
      refresh("Dispute actions require the live protected-payment service.");
      return;
    }
    if (!order) {
      refresh("Open an order in its inspection window first.");
      return;
    }
    try {
      const orderListing = api.store.listings.find((listing) => listing.id === order.listingId);
      const evidence = orderListing?.photos.slice(0, 2).map((photo) => photo.url) ?? [];
      api.orders.openDispute(order.id, buyerSession.userId, "misrepresented", [
        evidence[0] ?? equinaImages.profile,
        evidence[1] ?? equinaImages.tack
      ]);
      refresh("Help request created.");
    } catch (error) {
      refresh(error instanceof Error ? error.message : "Could not open dispute.");
    }
  };

  const askRalfAboutListing = (listing: Listing) => {
    setSelectedListingId(listing.id);
    openRalf(`Screen the fit and buying risk for ${listing.brand} ${listing.model ?? listing.category}`);
  };

  const createConciergeListing = () => {
    if (!equinaFeatureFlags.shopListingCreation) {
      refresh("Listing creation opens after seller verification and uploads are connected.");
      return;
    }
    try {
      const listing = api.listings.createListing({
        sellerId: sellerSession.userId,
        category: "pad",
        title: "Kentucky velvet saddle pad navy full size",
        brand: "Kentucky",
        model: "Velvet",
        conditionGrade: "like_new",
        priceAmount: 290,
        currency: "USD",
        location: "Lexington, USA",
        photos: [
          { url: equinaImages.tack, requiredAngle: "top" },
          { url: equinaImages.dressage, requiredAngle: "underside" },
          { url: equinaImages.profile, requiredAngle: "binding" },
          { url: equinaImages.stable, requiredAngle: "wear_closeup" }
        ]
      });
      setSelectedListingId(listing.id);
      setShopMode("sell");
      refresh("Listed in your closet.");
    } catch (error) {
      refresh(error instanceof Error ? error.message : "Could not create listing.");
    }
  };

  const requestFitCheck = (listingOverride?: Listing) => {
    const listingToCheck = listingOverride ?? selectedListing;
    if (!listingToCheck) {
      refresh("Pick an item first.");
      return;
    }
    setSelectedListingId(listingToCheck.id);
    refresh("");
  };

  const updateOnboardingDiscipline = (value: OnboardingDiscipline) => {
    const currentPhotoIsSample =
      !onboardingHorsePhoto ||
      horsePhotoOptionsByDiscipline[onboardingDiscipline].some(
        (option) => option.value === onboardingHorsePhoto
      );
    setOnboardingDiscipline(value);
    if (currentPhotoIsSample) setOnboardingHorsePhoto("");
  };

  const advanceOnboarding = () => {
    setAuthError("");
    const stepIndex = onboardingSteps.indexOf(onboardingStep);
    const nextStep = onboardingSteps[Math.min(stepIndex + 1, onboardingSteps.length - 1)] ?? "preview";
    if (
      onboardingStep === "you" &&
      nextStep === "horse" &&
      onboardingHasHorse &&
      !onboardingHorsePhoto
    ) {
      setOnboardingHorsePhoto(horsePhotoOptionsByDiscipline[onboardingDiscipline][0].value);
    }
    setOnboardingStep(nextStep);
  };

  const goBackOnboarding = () => {
    setAuthError("");
    const stepIndex = onboardingSteps.indexOf(onboardingStep);
    // The first step used to have no way out. A signed-out rider who tapped
    // "Create an account" by mistake returns to sign-in from here.
    if (stepIndex <= 0 && equinaSession.phase === "signedOut") {
      setEntryRoute("signin");
      return;
    }
    const nextStep = onboardingSteps[Math.max(stepIndex - 1, 0)] ?? "you";
    setOnboardingStep(nextStep);
  };

  const applyOnboardingCompletion = () => {
    const loadFromFrequency =
      onboardingFrequency === "2 rides/week"
        ? "Light week"
        : onboardingFrequency === "5+ rides/week"
          ? "Heavy week"
          : defaultCoachLoad;
    const starterFocus = coachGoalsByDiscipline[onboardingDiscipline][0] ?? defaultCoachGoal;
    const starterLesson = recommendedLessonFor(academyLessons, riderContext, starterFocus);
    setAccountCreated(true);
    setTab("home");
    setLocalLastRide(null);
    setSharedRide(false);
    setCareLogged(false);
    setCoachDiscipline(onboardingDiscipline);
    setCoachGoal(starterFocus);
    setCoachLoad(loadFromFrequency);
    setCoachOnboarded(false);
    setAcademyProgress(0);
    setAcademyMode("home");
    setSelectedAcademyLessonId(starterLesson?.id ?? "");
    setCoachMessages([
      {
        id: `coach-onboarding-${Date.now()}`,
        role: "assistant",
        label: "Welcome",
        confidence: "medium",
        text: onboardingHasHorse
          ? `I have your ${onboardingLevel.toLowerCase()} ${onboardingDiscipline.toLowerCase()} profile and ${primaryHorseName}'s new training space. We can plan the first useful session.`
          : `I have your ${onboardingLevel.toLowerCase()} ${onboardingDiscipline.toLowerCase()} profile. We can plan useful sessions for lesson, lease, or shared horses.`
      }
    ]);
    refresh(
      onboardingHasHorse
        ? `Welcome, ${riderDisplayName}. ${primaryHorseName}'s plan is ready.`
        : `Welcome, ${riderDisplayName}. Your first plan is ready.`
    );
  };

  const animateIntoApp = () => {
    if (onboardingTransitioning) return;

    if (reducedMotion) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      applyOnboardingCompletion();
      return;
    }

    setOnboardingTransitioning(true);
    onboardingArrival.stopAnimation();
    onboardingArrival.setValue(0);
    applyOnboardingCompletion();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        Animated.timing(onboardingArrival, {
          toValue: 1,
          duration: equinaTheme.motion.completion,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: Platform.OS !== "web"
        }).start(() => setOnboardingTransitioning(false));
      });
    });
  };

  const saveCurrentOnboardingDraft = async () => {
    await saveOnboardingDraft({
      name: riderName,
      email: onboardingEmail.trim().toLowerCase(),
      discipline: onboardingDiscipline,
      level: onboardingLevel,
      hasHorse: onboardingHasHorse,
      horsePhoto: onboardingHorsePhoto,
      horseName: onboardingHorseName,
      horseBreed: onboardingHorseBreed
    });
  };

  // A failure here must not undo a successful sign-up: the rider keeps the
  // account and can add the photo again from the horse profile.
  const uploadOnboardingHorsePhoto = async (horseId: string, asset: OnboardingPhotoAsset) => {
    if (!equinaSession.backend) return;
    try {
      // Some pickers omit the size. The upload boundary compares the declared
      // size against the bytes it receives, so measure rather than guess.
      const byteSize = asset.byteSize > 0
        ? asset.byteSize
        : (await (await fetch(asset.uri)).blob()).size;
      await equinaSession.backend.records.uploadHorsePhoto(horseId, { ...asset, byteSize });
      await equinaSession.refreshAccount();
    } catch {
      refresh("Your horse was saved. The photo could not be uploaded — you can add it from the horse profile.");
    }
  };
  uploadHeldHorsePhoto.current = uploadOnboardingHorsePhoto;

  const persistOnboarding = async () => {
    // Onboarding cannot advance without a name, so an empty one here means the
    // form was skipped. Saving a placeholder would put it on a real account.
    if (!riderName) throw new Error("display_name_required");
    const snapshot = await equinaSession.completeOnboarding({
      displayName: riderName,
      locale: "en",
      discipline: toDomainDiscipline(onboardingDiscipline),
      skillLevel: toDomainLevel(onboardingLevel),
      horseName: onboardingHasHorse ? onboardingHorseName.trim() || undefined : undefined,
      horseBreed: onboardingHasHorse ? onboardingHorseBreed.trim() || undefined : undefined
    });

    // The horse has to exist before its photo can be uploaded, so this runs
    // after onboarding rather than as part of it. Outside the beta it waits
    // for the door (heldHorsePhoto, above).
    const horseId = snapshot?.primaryHorse?.id;
    const asset = onboardingHorsePhotoAsset;
    if (horseId && asset && snapshot) {
      if (equinaSession.capabilities.appAccess) await uploadOnboardingHorsePhoto(horseId, asset);
      else heldHorsePhoto.current = { userId: snapshot.userId, horseId, asset };
    }

    setOnboardingHorsePhotoAsset(null);
    await clearOnboardingDraft();
    // Only here does an account finish onboarding for the first time, which
    // is what makes it new enough for the plan offer.
    if (snapshot) {
      newAccountId.current = snapshot.userId;
      signUpPlanOffer.offerTo(snapshot.userId);
    }
  };

  const completeOnboarding = async () => {
    // Clear before the guard: a blocked attempt must not leave an unrelated
    // error from a previous action sitting on screen.
    setAuthError("");
    if (authBusy || onboardingTransitioning) return;

    if (equinaSession.phase === "demo") {
      animateIntoApp();
      return;
    }

    if (!equinaSession.configured) {
      if (equinaSession.demoAllowed) {
        equinaSession.enterDemo();
        animateIntoApp();
        return;
      }
      setAuthError("Secure account service is not connected in this build.");
      return;
    }

    setAuthBusy(true);
    try {
      if (equinaSession.phase === "onboarding" && equinaSession.session) {
        try {
          await persistOnboarding();
        } catch {
          setAuthError("Your setup could not be saved. Check your connection and try again.");
          return;
        }
        animateIntoApp();
        return;
      }
      await saveCurrentOnboardingDraft();
      await equinaSession.sendCode(onboardingEmail, riderName || undefined, true);
      setOtpPurpose("create");
      setOtpVisible(true);
    } catch {
      setAuthError("Your secure sign-in code could not be sent. Check the email and try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const completeOnboardingWithPassword = async (password: string) => {
    if (
      authBusy ||
      onboardingTransitioning ||
      !equinaSession.configured
    ) return;
    setAuthBusy(true);
    setAuthError("");
    setPendingAuthPassword("");
    try {
      await saveCurrentOnboardingDraft();
      const result = await equinaSession.createPasswordAccount(
        onboardingEmail,
        password,
        riderName || undefined
      );
      if (result.verificationRequired) {
        setOtpPurpose("create");
        setOtpVisible(true);
        return;
      }
      await persistOnboarding();
      animateIntoApp();
    } catch (error) {
      setAuthError(
        error instanceof Error && /already|registered|exists/i.test(error.message)
          ? "An account already exists for this email. Sign in instead."
          : "Your account could not be created. Check the details and try again."
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const signInOnboardingWithPassword = async (password: string) => {
    setAuthError("");
    if (authBusy || onboardingTransitioning || !equinaSession.configured) return;
    setAuthBusy(true);
    setPendingAuthPassword("");
    try {
      const result = await equinaSession.signInWithPassword(onboardingEmail, password);
      if (!result.snapshot.profile.onboardingCompletedAt) {
        // An unfinished account with no form filled in yet: the onboarding
        // phase takes it from the first step instead.
        if (!riderName) return;
        await persistOnboarding();
      }
      animateIntoApp();
    } catch {
      setAuthError("The email or password is incorrect, or the email is not verified.");
    } finally {
      setAuthBusy(false);
    }
  };

  const recoverOnboardingPassword = async () => {
    setAuthError("");
    if (authBusy || !equinaSession.configured) return;
    setAuthBusy(true);
    try {
      try {
        await equinaSession.requestPasswordRecovery(onboardingEmail);
      } catch (error) {
        // Same neutral answer as the sign-in screen: only a request that never
        // left the device is reported.
        if (emailRequestOutcome(error) === "unreachable") {
          setAuthError(signInCopy.errors.unreachable);
          return;
        }
      }
      setOtpPurpose("recovery");
      setOtpVisible(true);
    } finally {
      setAuthBusy(false);
    }
  };

  // The sign-in-screen handlers authenticate and nothing else.
  //
  // The onboarding handlers below also persist the onboarding draft, because
  // in that flow the rider filled it in before signing in. Here they have not:
  // the draft is empty, and persisting it would write an invented profile. So
  // these leave the decision to the session phase -- a rider who finished
  // onboarding goes straight in, one who never did lands on its first step.
  const startEntryAttempt = () => {
    setAuthError("");
    setSignInNotice("");
    equinaSession.clearSignedOutNotice();
    return !authBusy && equinaSession.configured;
  };

  const signInFromEntry = async (email: string, password: string) => {
    if (!startEntryAttempt()) return;
    setAuthBusy(true);
    try {
      const result = await equinaSession.signInWithPassword(email, password);
      setOnboardingEmail(result.snapshot.email);
    } catch (error) {
      setAuthError(signInErrorCopy(error, "password"));
    } finally {
      setAuthBusy(false);
    }
  };

  const providerFromEntry = async (provider: OnboardingAuthProvider) => {
    if (!startEntryAttempt()) return;
    setAuthBusy(true);
    try {
      const result = await equinaSession.continueWithProvider(provider);
      // Null means the rider cancelled inside Apple or Google. That is a
      // change of mind, not an error, and gets no message.
      if (!result) return;
      setOnboardingEmail(result.snapshot.email);
    } catch (error) {
      setAuthError(signInErrorCopy(error, provider));
    } finally {
      setAuthBusy(false);
    }
  };

  // Reset links and sign-in links answer the same way whether or not the
  // account exists; see emailRequestOutcome. Returns whether to move on.
  const requestEmailFromEntry = async (
    purpose: "signin" | "recovery",
    email: string
  ): Promise<boolean> => {
    if (!startEntryAttempt()) return false;
    setAuthBusy(true);
    try {
      setOnboardingEmail(email);
      try {
        if (purpose === "recovery") await equinaSession.requestPasswordRecovery(email);
        // shouldCreateUser: false. A typo in a returning rider's email must
        // not create an empty account.
        else await equinaSession.sendCode(email, undefined, false);
      } catch (error) {
        if (emailRequestOutcome(error) === "unreachable") {
          setAuthError(signInCopy.errors.unreachable);
          return false;
        }
      }
      if (equinaSession.emailAuthMode === "otp") {
        setOtpPurpose(purpose);
        setOtpVisible(true);
      } else {
        setSignInNotice(purpose === "recovery" ? signInCopy.notices.recoverySent : signInCopy.notices.signInLinkSent);
      }
      return true;
    } finally {
      setAuthBusy(false);
    }
  };

  const completeOnboardingWithProvider = async (provider: OnboardingAuthProvider) => {
    if (authBusy || onboardingTransitioning || !equinaSession.configured) return;
    if (!socialAuthAvailability[provider]) {
      setAuthError(
        `${provider === "apple" ? "Apple" : "Google"} sign-in is not available yet. Continue with email.`
      );
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setPendingAuthPassword("");
    try {
      await saveCurrentOnboardingDraft();
      const result = await equinaSession.continueWithProvider(provider);
      if (!result) return;
      setOnboardingEmail(result.snapshot.email);
      if (result.snapshot.profile.onboardingCompletedAt || !riderName) return;
      await persistOnboarding();
      animateIntoApp();
    } catch {
      setAuthError(
        provider === "apple"
          ? "Apple sign-in could not be completed. Try again or use email."
          : "Google sign-in could not be completed. Try again or use email."
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const verifyOnboardingCode = async (code: string) => {
    setAuthError("");
    if (authBusy) return;
    setAuthBusy(true);
    try {
      if (otpPurpose === "recovery") {
        // Leads to the new-password screen. Nothing about the profile changes.
        await equinaSession.verifyRecoveryCode(onboardingEmail, code);
        setOtpVisible(false);
        return;
      }
      const { snapshot } = await equinaSession.verifyCode(onboardingEmail, code);
      if (pendingAuthPassword) {
        await equinaSession.setPassword(pendingAuthPassword);
        setPendingAuthPassword("");
      }
      // Only a new account carries a filled-in onboarding form. A returning
      // rider who signed in by code keeps the profile they already have.
      if (otpPurpose === "create" && !snapshot.profile.onboardingCompletedAt) {
        await persistOnboarding();
        setOtpVisible(false);
        animateIntoApp();
        return;
      }
      setOtpVisible(false);
    } catch {
      setAuthError("That code is invalid or expired. Request a new code and try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const useDemoAccount = () => {
    equinaSession.enterDemo();
    setOnboardingName("Ilinca");
    setOnboardingEmail("ilinca.rider@example.com");
    setOnboardingDiscipline("Jumping");
    setOnboardingLevel("Intermediate");
    setOnboardingGoal("Daily training");
    setOnboardingHasHorse(true);
    setOnboardingHorsePhoto(equinaImages.jumpingHome);
    setOnboardingHorseName("Ralfy");
    setOnboardingHorseBreed("Warmblood");
    setOnboardingHorseSex("Gelding");
    setOnboardingHorseAge("9");
    setOnboardingHorseHeight("166");
    setOnboardingRideFeel("Extra energy");
    setOnboardingFrequency("3-4 rides/week");
    setOnboardingCarePriority("Training plan");
    setOnboardingAppPriority("Ride plan");
    setCoachDiscipline("Jumping");
    setCoachGoal("Rhythm");
    setCoachLoad(defaultCoachLoad);
    setCoachOnboarded(false);
    setAcademyProgress(38);
    setCoachMessages([
      {
        id: `coach-demo-${Date.now()}`,
        role: "assistant",
        label: "Welcome",
        confidence: "medium",
        text: "I have Ilinca's intermediate jumping profile and Ralfy's recent ride notes. We can plan the next useful session."
      }
    ]);
    setLocalLastRide(null);
    setSharedRide(false);
    setCareLogged(false);
    setLastRideRecapVisible(false);
    setAccountCreated(true);
    setTab("home");
    refresh("Welcome back. Ralfy's plan is ready.");
  };

  const contentKey = [
    ralfOpen ? "ralf" : tab,
    tab === "assistant" ? academyMode : "",
    tab === "gear" ? `${shopMode}-${shopBuyerView}-${shopSellerView}-${shopOpenedListingId}` : ""
  ].join("-");
  // A conversation fills the viewport and scrolls its own message list. The
  // page ScrollView only offers `flexGrow`, which sets a minimum height and no
  // maximum — so a growing conversation pushed the composer past the bottom
  // edge, and with page scrolling disabled there was no way to reach it.
  // Measuring the viewport gives the conversation a definite height to live in.
  const [contentViewportHeight, setContentViewportHeight] = useState(0);

  // The Shop tab can close under a rider who is on it (a demo ending in a
  // real account, a switch turned off); they land on Home, not on a tab the
  // dock no longer shows.
  useEffect(() => {
    if (!marketplaceOpen && tab === "gear") setTab("home");
  }, [marketplaceOpen, tab]);

  useEffect(() => {
    if (!ralfAvailable && ralfOpen) setRalfOpen(false);
  }, [ralfAvailable, ralfOpen]);

  const immersiveConversation =
    ralfOpen ||
    (tab === "gear" && (
      (shopMode === "browse" && shopBuyerView === "conversation") ||
      (shopMode === "sell" && shopSellerView === "conversation")
    ));
  const shopNestedTask =
    tab === "gear" && (
      (shopMode === "browse" && shopBuyerView !== "browse") ||
      (shopMode === "sell" && shopSellerView !== "dashboard")
    );
  const academyNestedTask = tab === "assistant" && academyMode === "video";
  // Account and Ralf each take the whole screen with their own way out, so
  // neither shows the dock or the tab header.
  const accountOpen = tab === "profile";
  const focusedTask = ralfOpen || accountOpen || shopNestedTask || academyNestedTask;
  const hideGlobalHeader = focusedTask;
  const headerTitle = tabTitles[tab];
  const coachContext: CoachConversationContext = {
    selectedHorseId: accountController.snapshot.primaryHorse?.id,
    hasHorse: horseState.hasHorse,
    horseName: horseState.name,
    focus: coachGoal,
    load: coachLoad,
    style: coachStyle
  };

  if (equinaSession.phase === "restoring") {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <SessionGateScreen state="restoring" />
      </SafeAreaView>
    );
  }

  if (equinaSession.phase === "recoverableError") {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <SessionGateScreen
          state="error"
          error={equinaSession.error}
          onRetry={() => void equinaSession.restore()}
          onSignOut={() => void accountController.signOut()}
        />
      </SafeAreaView>
    );
  }

  if (equinaSession.recoveryRequired) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <PasswordRecoveryScreen
          busy={authBusy}
          error={authError}
          onComplete={async (password) => {
            setAuthBusy(true);
            setAuthError("");
            try {
              // The phase already decides what comes next: the app for a
              // finished account, onboarding for one that never finished.
              await equinaSession.completePasswordRecovery(password);
            } catch {
              setAuthError("The recovery session expired. Request a new recovery link.");
            } finally {
              setAuthBusy(false);
            }
          }}
          onCancel={() => accountController.signOut()}
        />
      </SafeAreaView>
    );
  }

  if (betaDoor) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <BetaAccessScreen
          email={equinaSession.account?.email ?? equinaSession.session?.user.email ?? ""}
          deletion={equinaSession.account?.deletionRequest}
          busy={accountController.busy}
          error={accountController.error}
          onCheckAgain={equinaSession.refreshCapabilities}
          onSignOut={() => void accountController.signOut()}
          onScheduleDeletion={() => accountController.scheduleDeletion()}
          onCancelDeletion={accountController.cancelDeletion}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="light-content" />
      <View style={styles.phoneFrame}>
        {accountCreated && (
          <Animated.View
            style={[
              styles.appLayer,
              onboardingTransitioning && appArrivalStyle,
              { pointerEvents: onboardingTransitioning ? "none" : "auto" }
            ]}
          >
            {tab === "home" && rideActive ? (
              <RideModeScreen
                horseName={rideHorseName}
                discipline={onboardingDiscipline}
                image={onboardingHorsePhoto || disciplineVisuals[onboardingDiscipline].home}
                onFinish={finishRide}
                onExit={cancelRide}
              />
            ) : tab === "home" && lastRideRecapVisible && lastRide ? (
              <RideRecapScreen
                horseName={rideHorseName}
                image={disciplineVisuals[onboardingDiscipline].club}
                session={lastRide}
                saved={ridePersistence}
                recommendation={postRideRecommendation}
                ralfAvailable={ralfAvailable}
                shared={sharedRide}
                sharingEnabled={clubSharing}
                onMoodChange={updateDailyMood}
                onOpenAcademy={openPostRideLesson}
                onShare={() => clubSharing ? shareRide(true) : openCommunity()}
                onHome={closeRideRecap}
              />
            ) : (
              <>
        {tab !== "home" && !hideGlobalHeader && (
          <View style={styles.header}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.brand}>{headerTitle}</Text>
            <View style={styles.headerActions}>
              {ralfAvailable ? <RalfButton onPress={() => openRalf()} /> : null}
              <Pressable
                testID="profile-button"
                accessibilityRole="button"
                accessibilityLabel="Open account"
                hitSlop={6}
                style={({ pressed }) => [styles.profileDot, pressed && styles.tabItemPressed]}
                onPress={openAccount}
              >
                <Text style={styles.profileDotText}>{riderMonogram}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {message.length > 0 && tab !== "home" && !hideGlobalHeader && !message.startsWith("Welcome") && (
          <View testID="global-status" style={[styles.globalStatus, { pointerEvents: "none" }]}>
            <Sparkles size={15} color={equinaTheme.colors.brass} />
            <Text style={styles.statusText}>{message}</Text>
          </View>
        )}

        <Animated.View style={[styles.contentMotion, screenMotionStyle]}>
          <ScrollView
            key={contentKey}
            style={styles.content}
            onLayout={(event) => {
              const next = Math.round(event.nativeEvent.layout.height);
              setContentViewportHeight((current) => current === next ? current : next);
            }}
            contentContainerStyle={[
              styles.contentInner,
              focusedTask && !immersiveConversation && styles.contentInnerFocused,
              immersiveConversation && styles.contentInnerImmersive,
              immersiveConversation && contentViewportHeight > 0 && { height: contentViewportHeight }
            ]}
            scrollEnabled={!immersiveConversation}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {ralfOpen ? (
              <RalfScreen
                mode={accountMode}
                backend={equinaSession.backend}
                enabled={ralfAvailable}
                context={coachContext}
                queuedPrompt={pendingCoachPrompt}
                onQueuedPromptConsumed={() => setPendingCoachPrompt("")}
                suggestions={coachPromptsFor(riderContext, horseState)}
                focusOptions={coachGoalsByDiscipline[onboardingDiscipline]}
                onBack={closeRalf}
                onSeePlans={accountMode === "connected" ? openPlans : undefined}
                onContextChange={(next) => {
                  setCoachGoal(next.focus);
                  setCoachLoad(next.load);
                  setCoachStyle(next.style);
                }}
              />
            ) : null}
            {!ralfOpen && tab === "home" && (
              <HomeScreen
                horse={horseState}
                rideEntries={ridePersistence ? rideJournal.entries : []}
                riderName={riderDisplayName}
                arrivingFromOnboarding={onboardingTransitioning}
                sharedRide={sharedRide}
                showRecap={lastRideRecapVisible}
                mood={dailyMood}
                discipline={onboardingDiscipline}
                frequency={onboardingFrequency}
                carePriority={onboardingCarePriority}
                horsePhoto={onboardingHorsePhoto}
                onToggleRide={startRide}
                onLogCare={logCare}
                onOpenRalf={ralfAvailable ? openRalf : undefined}
                onOpenCommunity={openCommunity}
                onOpenProfile={openAccount}
                onShareRide={() => shareRide(false)}
              />
            )}
            {!ralfOpen && tab === "gear" && (
              <GearScreen
                backend={equinaSession.backend}
                accountMode={accountMode}
                messagingEnabled={accountMode === "connected" && equinaSession.capabilities.messaging}
                currentUserId={equinaSession.session?.user.id}
                initialConversationId={pendingShopConversationId}
                mode={shopMode}
                onModeChange={setShopMode}
                buyerView={shopBuyerView}
                onBuyerViewChange={setShopBuyerView}
                sellerView={shopSellerView}
                onSellerViewChange={setShopSellerView}
                openedListingId={shopOpenedListingId}
                onOpenedListingIdChange={setShopOpenedListingId}
                onCreate={createConciergeListing}
                catalogLoading={connectedCatalog.loading}
                catalogError={connectedCatalog.error}
                onCatalogRetry={connectedCatalog.refresh}
                listings={marketListings}
                allListings={effectiveListings}
                selectedListing={selectedListing}
                reservedListing={reservedListing}
                sellerName={seller?.displayName ?? "Verified seller"}
                horseFitContext={{
                  hasProfile: onboardingHasHorse,
                  name: onboardingHasHorse ? primaryHorseName : "No horse selected",
                  heightCm: onboardingHasHorse ? horse.heightCm : undefined,
                  backLengthCm: onboardingHasHorse ? horse.measurements?.backLengthCm : undefined,
                  shoulderAngle: onboardingHasHorse ? horse.measurements?.shoulderAngle : undefined
                }}
                search={marketSearch}
                filter={marketFilter}
                savedListingIds={savedListingIds}
                buyerOrders={buyerOrders}
                sellerOrders={sellerOrders}
                sellerRevenueLabel={sellerRevenueLabel}
                activeListingCount={activeSellerListings}
                onSearch={setMarketSearch}
                onFilter={setMarketFilter}
                onSelect={(listing) => {
                  setSelectedListingId(listing.id);
                  refresh("");
                }}
                onBuy={buySelected}
                onToggleSave={toggleSavedListing}
                onFitCheck={requestFitCheck}
                onAskCoach={ralfAvailable ? askRalfAboutListing : undefined}
                onAcceptOrder={acceptOrder}
                onDispute={openDispute}
              />
            )}
            {!ralfOpen && tab === "stable" && (
              <StableScreen
                connected={accountMode === "connected"}
                recordsController={horseRecords}
                hasHorse={onboardingHasHorse}
                horseName={primaryHorseName}
                horsePhoto={onboardingHorsePhoto}
                discipline={onboardingDiscipline}
                horseBreed={onboardingHorseBreed}
                horseSex={onboardingHorseSex}
                horseAge={onboardingHorseAge}
                horseHeight={onboardingHorseHeight}
                nutrition={nutritionState}
                lastRide={lastRide}
                // No horse has a real feeding plan yet; the sample plan stays
                // out of the tab rather than reading as advice.
                nutritionAvailable={false}
                onOpenRalf={ralfAvailable ? openRalf : undefined}
                onToggleNutritionMeal={toggleNutritionMeal}
                onLogNutritionWater={logNutritionWater}
              />
            )}
            {!ralfOpen && tab === "assistant" && (
              <AcademyScreen
                horse={horseState}
                rider={riderContext}
                academy={academyState}
                coachGoal={coachGoal}
                lessons={academyLessons}
                catalogReady={academyCatalogReady}
                playbackLink={academyLive.playbackLink}
                onLessonProgress={(lessonId, positionSeconds, completed) => {
                  void academyLive.recordProgress(lessonId, positionSeconds, completed);
                }}
                onLessonComplete={completeAcademyLesson}
                onAcademyModeChange={navigateAcademy}
                onAcademyLessonOpen={openAcademyLesson}
                onOpenRalf={ralfAvailable ? openRalf : undefined}
                plan={plan}
                onPickLesson={planController.pickLesson}
                onSeePlans={openPlans}
                onPlanStale={() => void planController.refresh()}
              />
            )}
            {!ralfOpen && tab === "community" && accountMode === "connected" && (
              <ClubScreen
                club={club}
                access={plan.clubAccess}
                upgradeName={planFor(plan, "club")?.name}
                onSeePlans={openPlans}
                canPost={equinaSession.capabilities.clubPublishing && plan.clubAccess === "post"}
                canInteract={equinaSession.capabilities.clubInteractions && plan.clubAccess === "post"}
                currentUserId={equinaSession.session?.user.id}
                riderName={riderDisplayName}
                defaultSpaceSlug={spaceSlugForDiscipline(onboardingDiscipline)}
                spaceImages={clubSpaceImages}
                rideToShare={clubRideShare}
                composeRequest={clubComposeRequest}
                onNotice={refresh}
              />
            )}
            {!ralfOpen && tab === "community" && accountMode !== "connected" && (
              <CommunityScreen
                // Seeded posts carry invented authors. A connected rider must
                // never be shown a community that does not exist.
                posts={accountMode === "demo" ? api.community.listVisiblePosts() : []}
                likes={communityLikes}
                sharedRide={sharedRide}
                rideShare={{
                  riderName: riderDisplayName,
                  horseName: rideHorseName,
                  discipline: onboardingDiscipline,
                  mood: dailyMood,
                  focus: lastRide?.focus ?? coachGoal,
                  duration: lastRide ? rideDurationLabel(lastRide.elapsedSeconds) : "30 min",
                  image: disciplineVisuals[onboardingDiscipline].club
                }}
                onClubAction={refresh}
                onLike={() => {
                  if (!equinaFeatureFlags.clubInteractions) {
                    refresh("Club reactions are read-only until accounts and moderation are connected.");
                    return;
                  }
                  setCommunityLikes((likes) => likes + 1);
                  refresh("Nice. Added your reaction.");
                }}
                onShareRide={shareRide}
              />
            )}
            {!ralfOpen && tab === "profile" && (
              <AccountScreen
                mode={accountMode}
                marketplaceOpen={marketplaceOpen}
                plan={plan}
                purchases={purchases}
                initialRoute={accountInitialRoute}
                snapshot={accountController.snapshot}
                horseName={(accountController.snapshot.primaryHorse?.name ?? primaryHorseName) || "No horse yet"}
                busy={accountController.busy}
                error={accountController.error}
                blocked={accountController.blocked}
                onOpenHorse={() => setTab("stable")}
                onSaveProfile={accountController.saveProfile}
                onUploadAvatar={accountController.uploadAvatar}
                onSavePreferences={accountController.savePreferences}
                onSaveTrainingProfile={accountController.saveTrainingProfile}
                onSaveNotifications={async (patch) => {
                  await accountController.saveNotifications(patch);
                  if (patch.humanMessages === true) await pushRegistration.register();
                  if (patch.humanMessages === false) await pushRegistration.revoke();
                }}
                onLoadBlocked={accountController.loadBlocked}
                onUnblock={accountController.unblock}
                onRequestExport={accountController.requestExport}
                onClearCoachHistory={accountController.clearCoachHistory}
                onScheduleDeletion={accountController.scheduleDeletion}
                onCancelDeletion={accountController.cancelDeletion}
                onSignOut={accountController.signOut}
                onClose={closeAccount}
              />
            )}
          </ScrollView>
        </Animated.View>

        {!focusedTask && (
          <TabDock
            tabs={dockTabs}
            activeTab={tab}
            onChange={setTab}
            // New Club activity shows on the tab from anywhere in the app.
            badges={{ community: club.unreadActivity > 0 }}
          />
        )}
              </>
            )}
          </Animated.View>
        )}

        {signUpPlanOffer.visible && purchases.available ? (
          <PlanOfferScreen plan={plan} purchases={purchases} onClose={signUpPlanOffer.dismiss} />
        ) : null}

        {(!accountCreated || onboardingTransitioning) && (
          <Animated.View
            accessibilityElementsHidden={onboardingTransitioning}
            importantForAccessibility={onboardingTransitioning ? "no-hide-descendants" : "auto"}
            style={[
              styles.onboardingLayer,
              onboardingTransitioning && onboardingExitStyle,
              { pointerEvents: onboardingTransitioning ? "none" : "auto" }
            ]}
          >
            {!otpVisible && equinaSession.phase === "signedOut" && entryRoute === "signin" ? (
              <SignInScreen
                configured={equinaSession.configured}
                emailAuthMode={equinaSession.emailAuthMode}
                busy={authBusy}
                error={authError}
                notice={
                  signInNotice ||
                  (equinaSession.signedOutNotice ? signInCopy.notices[equinaSession.signedOutNotice] : "")
                }
                showDemo={equinaSession.demoAllowed}
                initialEmail={onboardingEmail}
                onProvider={(provider) => void providerFromEntry(provider)}
                onPasswordSignIn={(email, password) => void signInFromEntry(email, password)}
                onPasswordRecovery={(email) => requestEmailFromEntry("recovery", email)}
                onEmailLinkSignIn={(email) => requestEmailFromEntry("signin", email)}
                onCreateAccount={() => setEntryRoute("create")}
                onUseDemo={useDemoAccount}
                onClearMessages={() => {
                  setAuthError("");
                  setSignInNotice("");
                  equinaSession.clearSignedOutNotice();
                }}
              />
            ) : otpVisible ? (
              <AuthVerificationScreen
                email={onboardingEmail}
                mode={equinaSession.emailAuthMode}
                purpose={otpPurpose}
                error={authError}
                verifying={authBusy}
                onVerify={(code) => void verifyOnboardingCode(code)}
                onResend={async () => {
                  setAuthError("");
                  try {
                    // A reset resends a reset, and a returning rider's sign-in
                    // never creates an account. Only the create flow may.
                    if (otpPurpose === "recovery") await equinaSession.requestPasswordRecovery(onboardingEmail);
                    else if (otpPurpose === "signin") await equinaSession.sendCode(onboardingEmail, undefined, false);
                    else await equinaSession.sendCode(onboardingEmail, riderName || undefined, true);
                  } catch (error) {
                    // Same neutral answer as the first request, so a resend
                    // cannot reveal what the first one hid.
                    if (otpPurpose !== "create" && emailRequestOutcome(error) === "sent") return;
                    setAuthError(
                      emailRequestOutcome(error) === "unreachable"
                        ? signInCopy.errors.unreachable
                        : "The email could not be sent. Wait a minute and try again."
                    );
                    throw error;
                  }
                }}
                onBack={() => {
                  setOtpVisible(false);
                  setAuthError("");
                  setPendingAuthPassword("");
                }}
                onSignInInstead={
                  otpPurpose === "create"
                    ? () => {
                        // Confirmed on a computer, the link cannot finish
                        // here. The account exists; signing in finishes it,
                        // and the onboarding draft is still on this device.
                        setOtpVisible(false);
                        setAuthError("");
                        setPendingAuthPassword("");
                        setEntryRoute("signin");
                      }
                    : undefined
                }
              />
            ) : (
              <OnboardingScreen
                step={onboardingStep}
                name={onboardingName}
                email={onboardingEmail}
                discipline={onboardingDiscipline}
                level={onboardingLevel}
                hasHorse={onboardingHasHorse}
                horsePhoto={onboardingHorsePhoto}
                horseName={onboardingHorseName}
                horseBreed={onboardingHorseBreed}
                disciplineImages={onboardingDisciplineImages}
                horsePhotoOptions={horsePhotoOptionsByDiscipline[onboardingDiscipline]}
                onNameChange={setOnboardingName}
                onEmailChange={setOnboardingEmail}
                onDisciplineChange={updateOnboardingDiscipline}
                onLevelChange={setOnboardingLevel}
                onHasHorseChange={setOnboardingHasHorse}
                onHorsePhotoChange={(value, asset) => {
                  setOnboardingHorsePhoto(value);
                  setOnboardingHorsePhotoAsset(asset ?? null);
                }}
                onHorseNameChange={setOnboardingHorseName}
                onHorseBreedChange={setOnboardingHorseBreed}
                onNext={advanceOnboarding}
                onBack={goBackOnboarding}
                onComplete={completeOnboarding}
                onSocialAuth={completeOnboardingWithProvider}
                onPasswordContinue={completeOnboardingWithPassword}
                onPasswordSignIn={signInOnboardingWithPassword}
                onPasswordRecovery={recoverOnboardingPassword}
                onUseDemo={useDemoAccount}
                // Signed in with an account that never finished onboarding --
                // possibly the wrong one. Offer the way out from the first step.
                onSwitchAccount={
                  equinaSession.phase === "onboarding" ? () => void accountController.signOut() : undefined
                }
                // Only while the form is still empty. Once the rider has typed a
                // name, the sheet's sign-in keeps the form and saves it to an
                // account that never finished onboarding.
                onSignInInstead={
                  equinaSession.phase === "signedOut" && !riderName
                    ? () => {
                        setAuthError("");
                        setEntryRoute("signin");
                      }
                    : undefined
                }
                completionMode={onboardingCompletionMode}
                signedIn={Boolean(equinaSession.session)}
                emailAuthMode={equinaSession.emailAuthMode}
                busy={authBusy}
                error={authError}
                showDemo={equinaSession.demoAllowed}
              />
            )}
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

// Ralf in a tab's header: a word, not just an icon, because riders look for
// him by name.
function RalfButton({ onPress }: { onPress: () => void }) {
  return (
    <MotionPressable
      testID="ralf-button"
      accessibilityRole="button"
      accessibilityLabel={`Ask ${equinaCoach.name}`}
      hitSlop={4}
      onPress={onPress}
      style={styles.ralfButton}
    >
      <Sparkles size={16} color={equinaTheme.colors.brass} strokeWidth={1.9} />
      <Text style={styles.ralfButtonText}>{equinaCoach.name}</Text>
    </MotionPressable>
  );
}

function TabDock({
  tabs,
  activeTab,
  onChange,
  badges = {}
}: {
  tabs: readonly DockTab[];
  activeTab: Tab;
  onChange: (tab: Tab) => void;
  /** Tabs with something new behind them get a dot. */
  badges?: Partial<Record<Tab, boolean>>;
}) {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const reduceDockMotion = useReducedMotion();
  const nativeLiquidGlass =
    Platform.OS === "ios" &&
    !reduceTransparency &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable();
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduceTransparency);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <View pointerEvents="box-none" style={styles.tabDockOuter}>
      <LinearGradient
        colors={["rgba(8,7,6,0)", "rgba(8,7,6,0.30)", "rgba(8,7,6,0.62)"]}
        locations={[0, 0.56, 1]}
        style={styles.tabDockFade}
      />
      <View
        style={[
          styles.tabBar,
          !nativeLiquidGlass && styles.tabBarFallback,
          Platform.OS === "web" && styles.tabBarWeb,
          reduceTransparency && styles.tabBarOpaque
        ]}
      >
        {Platform.OS === "web" ? (
          <View pointerEvents="none" style={styles.tabBarWebSurface} />
        ) : null}
        {nativeLiquidGlass ? (
          <GlassView
            colorScheme="dark"
            glassEffectStyle="clear"
            tintColor="rgba(14,13,11,0.18)"
            isInteractive
            style={StyleSheet.absoluteFillObject}
          />
        ) : !reduceTransparency && Platform.OS !== "web" ? (
          <BlurView
            intensity={72}
            tint="dark"
            blurMethod={Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined}
            pointerEvents="none"
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}

        {Platform.OS !== "web" ? (
          <LinearGradient
            colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.02)", "rgba(0,0,0,0.06)"]}
            locations={[0, 0.38, 1]}
            style={styles.tabGlassLight}
            pointerEvents="none"
          />
        ) : null}

        {tabs.map(({ id, label, Icon }) => {
          const active = id === activeTab;
          return (
            <DockTabItem
              key={id}
              id={id}
              label={label}
              Icon={Icon}
              active={active}
              badge={Boolean(badges[id])}
              reducedMotion={reduceDockMotion}
              onPress={() => {
                if (id !== activeTab) {
                  void Haptics.selectionAsync().catch(() => undefined);
                  onChange(id);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function ConversationGlassSurface({
  children,
  style,
  contentStyle
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const nativeLiquidGlass =
    Platform.OS === "ios" &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable();

  return (
    <View style={[styles.conversationGlassSurface, style]}>
      {nativeLiquidGlass ? (
        <GlassView
          colorScheme="dark"
          glassEffectStyle="clear"
          tintColor="rgba(18,17,14,0.28)"
          isInteractive={false}
          pointerEvents="none"
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <BlurView
          intensity={68}
          tint="dark"
          blurMethod={Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined}
          pointerEvents="none"
          style={StyleSheet.absoluteFillObject}
        />
      )}
      <LinearGradient
        colors={["rgba(255,255,255,0.09)", "rgba(255,255,255,0.025)", "rgba(0,0,0,0.10)"]}
        locations={[0, 0.38, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.conversationGlassContent, contentStyle]}>{children}</View>
    </View>
  );
}

function DockTabItem({
  id,
  label,
  Icon,
  active,
  badge = false,
  reducedMotion,
  onPress
}: {
  id: Tab;
  label: string;
  Icon: typeof Store | typeof HorseshoeIcon;
  active: boolean;
  badge?: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const pressMotion = useRef(new Animated.Value(0)).current;
  const selectionMotion = useRef(new Animated.Value(active ? 1 : 0)).current;
  const LucideIcon = Icon as typeof Store;

  useEffect(() => {
    if (reducedMotion) {
      selectionMotion.setValue(active ? 1 : 0);
      return;
    }

    Animated.timing(selectionMotion, {
      toValue: active ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [active, reducedMotion, selectionMotion]);

  const setPressed = (pressed: boolean) => {
    if (reducedMotion) return;
    Animated.timing(pressMotion, {
      toValue: pressed ? 1 : 0,
      duration: pressed ? 90 : 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.tabItemSlot,
        Platform.OS !== "web" && {
          transform: [
            {
              scale: pressMotion.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.96]
              })
            }
          ]
        }
      ]}
    >
      <Pressable
        testID={`tab-${id}`}
        accessibilityRole="tab"
        accessibilityLabel={badge ? `${label}, new activity` : label}
        accessibilityState={{ selected: active }}
        style={styles.tabItem}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
      >
        <Animated.View
          style={[
            styles.tabIconShell,
            Platform.OS !== "web" && {
              transform: [
                {
                  scale: selectionMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.05]
                  })
                },
                {
                  translateY: selectionMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -1.5]
                  })
                }
              ]
            }
          ]}
        >
          {id === "stable" ? (
            <HorseshoeIcon
              size={22}
              color={active ? nightTheme.accent : "rgba(247,243,234,0.58)"}
              strokeWidth={active ? 2.15 : 1.75}
            />
          ) : (
            <LucideIcon
              size={22}
              color={active ? nightTheme.accent : "rgba(247,243,234,0.58)"}
              fill="none"
              strokeWidth={active ? 2.15 : 1.75}
            />
          )}
          {badge ? <View testID={`tab-${id}-badge`} style={styles.tabBadge} /> : null}
        </Animated.View>
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            active && styles.tabLabelActive,
            {
              opacity: selectionMotion.interpolate({
                inputRange: [0, 1],
                outputRange: [0.84, 1]
              })
            }
          ]}
        >
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

function HomeScreen({
  horse,
  rideEntries,
  riderName,
  arrivingFromOnboarding,
  sharedRide,
  showRecap,
  mood,
  discipline,
  frequency,
  carePriority,
  horsePhoto,
  onToggleRide,
  onLogCare,
  onOpenRalf,
  onOpenCommunity,
  onOpenProfile,
  onShareRide
}: {
  horse: HorseState;
  rideEntries: readonly RideEntry[];
  riderName: string;
  arrivingFromOnboarding: boolean;
  sharedRide: boolean;
  showRecap: boolean;
  mood: MoodOption;
  discipline: CoachDiscipline;
  frequency: (typeof ridingFrequencies)[number];
  carePriority: (typeof carePriorities)[number];
  horsePhoto: string;
  onToggleRide: () => void;
  onLogCare: () => void;
  /** Absent while Ralf is switched off for this account. */
  onOpenRalf?: (prompt?: string) => void;
  onOpenCommunity: () => void;
  onOpenProfile: () => void;
  onShareRide: () => void;
}) {
  const { height: viewportHeight } = useWindowDimensions();
  const heroAnim = useRef(new Animated.Value(0)).current;
  const heroImageAnim = useRef(new Animated.Value(0)).current;
  const detailsAnim = useRef(new Animated.Value(0)).current;
  const ridePressAnim = useRef(new Animated.Value(1)).current;
  const skipEntryMotion = useRef(arrivingFromOnboarding).current;
  const reduceHomeMotion = useReducedMotion();

  useEffect(() => {
    if (skipEntryMotion || reduceHomeMotion) {
      heroAnim.setValue(1);
      heroImageAnim.setValue(1);
      detailsAnim.setValue(1);
      return;
    }

    Animated.stagger(70, [
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: equinaTheme.motion.completion,
        useNativeDriver: Platform.OS !== "web"
      }),
      Animated.timing(heroImageAnim, {
        toValue: 1,
        duration: equinaTheme.motion.completion,
        useNativeDriver: Platform.OS !== "web"
      }),
      Animated.timing(detailsAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: Platform.OS !== "web"
      })
    ]).start();
  }, [detailsAnim, heroAnim, heroImageAnim, reduceHomeMotion, skipEntryMotion]);

  const heroStyle = {
    opacity: heroAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.9, 1]
    }),
    transform: [
      {
        translateY: heroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0]
        })
      }
    ]
  };
  const heroImageStyle = {
    transform: [
      {
        scale: heroImageAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1.055, 1]
        })
      },
      {
        translateY: heroImageAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0]
        })
      }
    ]
  };
  const detailsStyle = {
    opacity: detailsAnim,
    transform: [
      {
        translateY: detailsAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0]
        })
      }
    ]
  };
  const ridePressStyle = {
    transform: [{ scale: ridePressAnim }]
  };
  const selectedMood = homeMoodOptions.find((option) => option.id === mood) ?? homeMoodOptions[1]!;
  const recapVisible = showRecap && !horse.rideActive;
  const disciplinePlan = {
    Dressage: {
      rideMeta: "35 min · contact & transitions",
      headline: "Find a softer contact.",
      live: "Keep contact soft. No chasing.",
      plan: selectedMood.planBody
    },
    Jumping: {
      rideMeta: "30 min · poles & rhythm",
      headline: "Build a calmer line.",
      live: "Keep canter steady. Let the line come.",
      plan: "Poles first, then one confident line."
    },
    Eventing: {
      rideMeta: "40 min · fitness & recovery",
      headline: "Train the engine.",
      live: "Stay balanced. Recovery matters today.",
      plan: "Short intervals, balanced turns, long cool-down."
    },
    Trail: {
      rideMeta: "45 min · calm miles",
      headline: "Make space to breathe.",
      live: "Keep it calm. Let the horse breathe forward.",
      plan: "Easy outside miles with a calm rhythm."
    }
  }[discipline];
  const loadNote = frequency === "5+ rides/week" ? "Keep today's load light." : frequency === "2 rides/week" ? "Make this one count, then recover." : "Keep today's plan simple.";
  const careLine = !horse.hasHorse
    ? horse.careLogged
      ? "Your ride note is saved. Nothing else is needed now."
      : horse.lastRide
        ? `${rideDurationLabel(horse.lastRide.elapsedSeconds)} ${horse.lastRide.focus.toLowerCase()} saved. Add one note about rhythm or confidence.`
        : "Save one useful feeling after the ride."
    : horse.careLogged
      ? `${horse.name} is up to date. Nothing else is needed now.`
    : horse.lastRide
      ? `${rideDurationLabel(horse.lastRide.elapsedSeconds)} ${horse.lastRide.focus.toLowerCase()} saved. Check legs, water, and saddle marks.`
    : carePriority === "Recovery"
      ? "Cool down longer and check legs."
      : carePriority === "Vet records"
        ? "Log anything unusual after cool-down."
        : carePriority === "Gear fit"
          ? "Check saddle marks and girth area."
          : "Save one feeling note after the ride.";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const riderFirstName = riderName.trim().split(/[\s-]+/)[0] || "Rider";
  const heroTitle = horse.rideActive ? "Stay in the rhythm." : recapVisible ? "Nice work." : disciplinePlan.headline;
  const heroBody = horse.rideActive
    ? disciplinePlan.live
    : recapVisible
      ? horse.hasHorse
        ? `${horse.name} felt ${mood.toLowerCase()}. ${horse.sessionCount} rides are now in the journal.`
        : `That ride felt ${mood.toLowerCase()}. ${horse.sessionCount} rides are now in your journal.`
      : `${disciplinePlan.plan} ${loadNote}`;
  const rideTitle = horse.rideActive ? "Finish ride" : recapVisible ? "Ride again" : "Start ride";
  const rideMeta = horse.rideActive ? `${discipline} · tap to save` : disciplinePlan.rideMeta;
  const nextKicker = recapVisible ? "Coach recap" : horse.careLogged ? "Care complete" : "Next";
  const nextTitle = recapVisible
    ? "Shape tomorrow from this ride"
    : horse.careLogged
      ? horse.hasHorse ? `${horse.name} is up to date` : "Ride note saved"
      : horse.hasHorse ? "Log post-ride care" : "Add a ride note";
  const nextBody = recapVisible ? `${horse.lastRide ? rideDurationLabel(horse.lastRide.elapsedSeconds) : "Ride"} saved · choose one useful next step` : careLine;
  const shareOpportunity = recapVisible && !sharedRide;
  const latestRideLabel = horse.lastRide
    ? `${rideDurationLabel(horse.lastRide.elapsedSeconds)} · ${horse.lastRide.focus}`
    : horse.sessionCount > 0
      ? "Recent sessions saved"
      : "No ride saved yet";

  // Derived on every render from the entries themselves, so a deleted ride
  // leaves the summary the moment it is deleted and there is no total to drift.
  const [summaryPeriod, setSummaryPeriod] = useState<RidePeriod>("week");
  const rideSummary = summarise(rideEntries, summaryPeriod, new Date().toISOString().slice(0, 10));
  const lastRideDay = rideEntries.length
    ? [...rideEntries].sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0]?.completedAt.slice(0, 10)
    : undefined;
  const usesPresetHorsePhoto = horsePhotoOptionsByDiscipline[discipline].some(
    (option) => option.value === horsePhoto
  );
  const homeHeroPhoto =
    horse.hasHorse && !usesPresetHorsePhoto && horsePhoto
      ? horsePhoto
      : disciplineVisuals[discipline].home;

  const animateRidePress = (toValue: number) => {
    Animated.spring(ridePressAnim, {
      toValue,
      damping: 18,
      stiffness: 320,
      mass: 0.45,
      useNativeDriver: Platform.OS !== "web"
    }).start();
  };

  const handleRidePress = () => {
    const feedback = horse.rideActive
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void feedback.catch(() => undefined);
    onToggleRide();
  };

  const handleNextPress = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (recapVisible && onOpenRalf) {
      onOpenRalf("Review last ride");
    } else {
      onLogCare();
    }
  };

  const handleSocialPress = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (shareOpportunity && equinaFeatureFlags.clubPublishing) {
      onShareRide();
    } else {
      onOpenCommunity();
    }
  };

  return (
    <View style={[styles.screen, styles.homeScreen]}>
      <View style={styles.homeTopBar}>
        <View style={styles.homeGreetingCopy}>
          <Text numberOfLines={2} style={styles.homeGreeting}>{greeting}, {riderFirstName}</Text>
          <Text style={styles.homeGreetingMeta}>
            {horse.hasHorse ? horse.name : discipline} · {frequency.toLowerCase()}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {onOpenRalf ? <RalfButton onPress={() => onOpenRalf()} /> : null}
          <Pressable
            testID="profile-button"
            accessibilityRole="button"
            accessibilityLabel="Open account"
            hitSlop={6}
            style={({ pressed }) => [styles.homeProfileButton, pressed && styles.tabItemPressed]}
            onPress={onOpenProfile}
          >
            <Text style={styles.homeProfileInitial}>{riderName.trim().slice(0, 2).toUpperCase()}</Text>
          </Pressable>
        </View>
      </View>

      <Animated.View style={[styles.homeStage, viewportHeight < 720 && styles.homeStageCompact, heroStyle]}>
        <Animated.Image source={{ uri: homeHeroPhoto }} style={[styles.homeStageImage, heroImageStyle]} />
        <LinearGradient
          colors={["rgba(5,6,5,0.26)", "rgba(5,6,5,0.06)", "rgba(5,6,5,0.92)"]}
          locations={[0, 0.42, 1]}
          style={styles.homeStageScrim}
        />
        <View style={styles.homeStageContent}>
          <View style={styles.homeStageTopline}>
            <View style={styles.homeStageContext}>
              <Text style={styles.homeStageContextLabel}>TODAY</Text>
              <View style={styles.homeStageContextDot} />
              <Text style={styles.homeStageContextValue}>{discipline}</Text>
            </View>
            {(horse.rideActive || recapVisible) && (
              <View style={styles.homeStageState}>
                {horse.rideActive ? (
                  <View style={styles.homeStageStateDot} />
                ) : (
                  <Check size={13} color={equinaTheme.colors.ivory} />
                )}
                <Text style={styles.homeStageStateText}>{horse.rideActive ? "Riding" : "Saved"}</Text>
              </View>
            )}
          </View>
          <View style={styles.homeStageMain}>
            <Text style={styles.homeStageTitle}>{heroTitle}</Text>
            <Text style={styles.homeStageBody}>{heroBody}</Text>
          </View>

          <Animated.View style={[styles.homeRidePressable, ridePressStyle]}>
            <BlurView intensity={46} tint="dark" style={[styles.homeRideGlass, horse.rideActive && styles.homeRideGlassLive]}>
              <Pressable
                testID="ride-toggle"
                accessibilityRole="button"
                accessibilityLabel={horse.rideActive ? "Finish ride" : recapVisible ? "Start another ride" : "Start ride"}
                style={styles.homeRideAction}
                onPressIn={() => animateRidePress(0.985)}
                onPressOut={() => animateRidePress(1)}
                onPress={handleRidePress}
              >
                <View style={[styles.homeRideIcon, horse.rideActive && styles.homeRideIconActive]}>
                  {horse.rideActive ? (
                    <Check size={20} color={equinaTheme.colors.ivory} strokeWidth={2.4} />
                  ) : (
                    <Play size={18} color={equinaTheme.colors.ink} fill={equinaTheme.colors.ink} strokeWidth={1.8} />
                  )}
                </View>
                <View style={styles.homeRideCopy}>
                  <Text style={styles.homeRideTitle}>{rideTitle}</Text>
                  <Text style={styles.homeRideMeta}>{rideMeta}</Text>
                </View>
                <ChevronRight size={18} color="rgba(255,247,230,0.72)" />
              </Pressable>
            </BlurView>
          </Animated.View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.homeDetails, detailsStyle]}>
        {/* An empty journal on day one only repeats what the ride button
            already says. It appears with the first saved ride. */}
        {rideEntries.length > 0 ? (
          <RideSummaryCard
            summary={rideSummary}
            period={summaryPeriod}
            onPeriodChange={setSummaryPeriod}
            lifetimeRides={horse.sessionCount}
            lastRideOn={lastRideDay}
          />
        ) : null}

        <View style={styles.homeSectionTopline}>
          <Text style={styles.homeSectionTitle}>Up next</Text>
          <Text style={styles.homeSectionMeta}>{horse.hasHorse ? `For ${horse.name}` : "For your riding"}</Text>
        </View>

        <View style={styles.homeAgenda}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nextTitle}
            style={({ pressed }) => [styles.homeBriefingRow, pressed && styles.homeAgendaRowPressed]}
            onPress={handleNextPress}
          >
            <View style={styles.homeBriefingIcon}>
              {recapVisible ? (
                <Bot size={21} strokeWidth={1.9} color={equinaTheme.colors.brass} />
              ) : (
                horse.careLogged
                  ? <Check size={21} strokeWidth={2.1} color={equinaTheme.text.secondary} />
                  : <Stethoscope size={21} strokeWidth={1.9} color={equinaTheme.colors.brass} />
              )}
            </View>
            <View style={styles.homeBriefingCopy}>
              <Text style={styles.homeBriefingKicker}>{nextKicker}</Text>
              <Text numberOfLines={1} style={styles.homeBriefingTitle}>{nextTitle}</Text>
              <Text numberOfLines={2} style={styles.homeBriefingBody}>{nextBody}</Text>
            </View>
            <ChevronRight size={17} color={nightTheme.faint} />
          </Pressable>

          <View style={styles.homeAgendaDivider} />

          <Pressable
            testID={recapVisible ? "home-share-ride" : undefined}
            accessibilityRole="button"
            accessibilityLabel={shareOpportunity && equinaFeatureFlags.clubPublishing ? "Share ride with Club" : "Open Club"}
            style={({ pressed }) => [styles.homeSocialRow, pressed && styles.homeAgendaRowPressed]}
            onPress={handleSocialPress}
          >
            <View style={styles.homeBriefingIcon}>
              <MessageCircle size={21} strokeWidth={1.9} color={equinaTheme.colors.brass} />
            </View>
            <View style={styles.homeSocialCopy}>
              <Text numberOfLines={1} style={styles.homeSocialTitle}>
                {shareOpportunity && equinaFeatureFlags.clubPublishing
                  ? horse.hasHorse ? `Share ${horse.name}'s ride` : "Share your ride"
                  : sharedRide ? "Your ride is in Club" : "See what riders share"}
              </Text>
              <Text numberOfLines={1} style={styles.homeSocialBody}>
                {shareOpportunity && equinaFeatureFlags.clubPublishing
                  ? "One tap, then back to your day"
                  : "Rides and tips from your Club"}
              </Text>
            </View>
            {shareOpportunity && equinaFeatureFlags.clubPublishing ? <SendHorizontal size={17} color={equinaTheme.colors.brass} /> : <ChevronRight size={17} color={nightTheme.faint} />}
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function RecapMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.homeRecapMetric}>
      <Text numberOfLines={1} style={styles.homeRecapValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.homeRecapLabel}>{label}</Text>
    </View>
  );
}

function GearScreen({
  backend,
  accountMode,
  messagingEnabled,
  currentUserId,
  initialConversationId,
  mode,
  onModeChange,
  buyerView,
  onBuyerViewChange,
  sellerView,
  onSellerViewChange,
  openedListingId,
  onOpenedListingIdChange,
  onCreate,
  catalogLoading,
  catalogError,
  onCatalogRetry,
  listings,
  allListings,
  selectedListing,
  reservedListing,
  sellerName,
  horseFitContext,
  search,
  filter,
  savedListingIds,
  buyerOrders,
  sellerOrders,
  sellerRevenueLabel,
  activeListingCount,
  onSearch,
  onFilter,
  onSelect,
  onBuy,
  onToggleSave,
  onFitCheck,
  onAskCoach,
  onAcceptOrder,
  onDispute,
}: {
  backend: EquinaBackend | null;
  accountMode: AccountMode;
  messagingEnabled: boolean;
  currentUserId?: string;
  initialConversationId?: string;
  mode: ShopMode;
  onModeChange: (mode: ShopMode) => void;
  buyerView: ShopBuyerView;
  onBuyerViewChange: (view: ShopBuyerView) => void;
  sellerView: ShopSellerView;
  onSellerViewChange: (view: ShopSellerView) => void;
  openedListingId: string;
  onOpenedListingIdChange: (id: string) => void;
  onCreate: () => void;
  catalogLoading: boolean;
  catalogError: string;
  onCatalogRetry: () => void;
  listings: Listing[];
  allListings: Listing[];
  selectedListing?: Listing;
  reservedListing?: Listing;
  sellerName: string;
  horseFitContext: HorseFitContext;
  search: string;
  filter: Filter;
  savedListingIds: string[];
  buyerOrders: Order[];
  sellerOrders: Order[];
  sellerRevenueLabel: string;
  activeListingCount: number;
  onSearch: (value: string) => void;
  onFilter: (value: Filter) => void;
  onSelect: (listing: Listing) => void;
  onBuy: (listing: Listing) => boolean;
  onToggleSave: (listing: Listing) => void;
  onFitCheck: (listing: Listing) => void;
  /** Absent while Ralf is switched off for this account. */
  onAskCoach?: (listing: Listing) => void;
  onAcceptOrder: (order: Order) => void;
  onDispute: (order: Order) => void;
}) {
  const shopConversation = useShopConversation({
    mode: accountMode,
    backend,
    enabled: messagingEnabled,
    userId: currentUserId
  });
  useEffect(() => {
    if (!initialConversationId || !messagingEnabled) return;
    void shopConversation.openConversationId(initialConversationId);
  }, [initialConversationId, messagingEnabled]);
  const featuredListing = listings.find((listing) => listing.id === selectedListing?.id) ?? listings[0];
  const featuredFit = getFitScreening(featuredListing, horseFitContext);
  const feedListings = listings;
  const openedListing = allListings.find((listing) => listing.id === openedListingId) ?? selectedListing ?? featuredListing;
  const savedListings = savedListingIds
    .map((id) => allListings.find((listing) => listing.id === id))
    .filter((listing): listing is Listing => Boolean(listing));

  const changeMode = (nextMode: ShopMode) => {
    onBuyerViewChange("browse");
    onSellerViewChange("dashboard");
    onModeChange(nextMode);
  };

  const openBuyerListing = (listing: Listing) => {
    onOpenedListingIdChange(listing.id);
    onSelect(listing);
    onBuyerViewChange("product");
  };

  const openSellerListing = (listing: Listing) => {
    onOpenedListingIdChange(listing.id);
    onSelect(listing);
    onSellerViewChange("listing");
  };

  const openConversation = (listing: Listing) => {
    onOpenedListingIdChange(listing.id);
    onSelect(listing);
    onBuyerViewChange("conversation");
    void shopConversation.openListing(listing.id);
  };

  const openSellerConversation = (listing: Listing) => {
    onOpenedListingIdChange(listing.id);
    onSelect(listing);
    onSellerViewChange("conversation");
    void shopConversation.openListing(listing.id);
  };

  const openPublicListing = (listing: Listing) => {
    onOpenedListingIdChange(listing.id);
    onSelect(listing);
    onModeChange("browse");
    onSellerViewChange("dashboard");
    onBuyerViewChange("product");
  };

  const showModeSwitch = (mode === "browse" && buyerView === "browse") || (mode === "sell" && sellerView === "dashboard");
  const conversationView =
    (mode === "browse" && buyerView === "conversation") ||
      (mode === "sell" && sellerView === "conversation");
  const liveMessageCount = shopConversation.connected
    ? shopConversation.threads.length
    : 0;

  return (
    <View style={[styles.screen, conversationView && styles.screenImmersive]}>
      {showModeSwitch && (
        <View style={styles.segmented}>
          <Pressable testID="shop-mode-browse" accessibilityRole="tab" accessibilityState={{ selected: mode === "browse" }} style={[styles.segment, mode === "browse" && styles.segmentActive]} onPress={() => changeMode("browse")}>
            <Text style={[styles.segmentText, mode === "browse" && styles.segmentTextActive]}>Buy</Text>
          </Pressable>
          <Pressable testID="shop-mode-sell" accessibilityRole="tab" accessibilityState={{ selected: mode === "sell" }} style={[styles.segment, mode === "sell" && styles.segmentActive]} onPress={() => changeMode("sell")}>
            <Text style={[styles.segmentText, mode === "sell" && styles.segmentTextActive]}>Seller</Text>
          </Pressable>
        </View>
      )}

      {mode === "sell" ? (
        sellerView === "dashboard" ? (
          <>
            <View style={styles.sellerDashboardIntro}>
              <View style={styles.sellerDashboardCopy}>
                <Text style={styles.sellerDashboardKicker}>Your closet</Text>
                <Text style={styles.sellerDashboardTitle}>Sell with confidence.</Text>
                <Text style={styles.sellerDashboardBody}>{equinaFeatureFlags.shopListingCreation ? `${activeListingCount} live · ${sellerOrders.length} sold · ${sellerRevenueLabel}` : `${activeListingCount} sample listings · seller tools in preview`}</Text>
              </View>
              {equinaFeatureFlags.shopListingCreation ? (
                <MotionPressable
                  testID="seller-create-listing"
                  accessibilityRole="button"
                  accessibilityLabel="List an item"
                  style={styles.sellerDashboardAdd}
                  onPress={onCreate}
                >
                  <Plus size={20} color={equinaTheme.colors.ink} />
                </MotionPressable>
              ) : (
                <View
                  testID="seller-create-listing"
                  accessibilityLabel="Listing creation preview"
                  style={styles.sellerDashboardPreview}
                >
                  <LockKeyhole size={14} color={equinaTheme.text.tertiary} />
                  <Text style={styles.sellerDashboardPreviewText}>Preview</Text>
                </View>
              )}
            </View>

            <CompactActionList
              items={[
                { Icon: PackageCheck, title: "Orders", body: `${sellerOrders.length} sold items`, onPress: () => onSellerViewChange("orders") },
                { Icon: WalletCards, title: "Revenue", body: `${sellerRevenueLabel} total`, onPress: () => onSellerViewChange("revenue") },
                { Icon: MessageSquareText, title: "Messages", body: shopConversation.connected ? `${liveMessageCount} conversations` : "Secure messaging unavailable", onPress: () => onSellerViewChange("messages") }
              ]}
            />

            <View style={styles.sellerSteps}>
              <SellerStep Icon={Camera} title="Photos" />
              <SellerStep Icon={FileText} title="Details" />
              <SellerStep Icon={ShieldCheck} title="Protected" />
            </View>

            <SectionTitle title="Closet" action={`${allListings.length} items`} />
            <View style={styles.sellerListingStack}>
              {allListings.map((listing, index) => (
                <SellerListingRow
                  key={listing.id}
                  listing={listing}
                  last={index === allListings.length - 1}
                  onPress={() => openSellerListing(listing)}
                />
              ))}
            </View>
          </>
        ) : sellerView === "orders" ? (
          <ShopOrdersPage
            title="Sold items"
            orders={sellerOrders}
            allListings={allListings}
            sellerView
            onBack={() => onSellerViewChange("dashboard")}
            onAcceptOrder={onAcceptOrder}
            onDispute={onDispute}
          />
        ) : sellerView === "revenue" ? (
          <SellerRevenuePage orders={sellerOrders} onBack={() => onSellerViewChange("dashboard")} />
        ) : sellerView === "messages" ? (
          <ShopThreadList
            title="Buyer messages"
            controller={shopConversation}
            onBack={() => onSellerViewChange("dashboard")}
            onOpen={() => onSellerViewChange("conversation")}
          />
        ) : sellerView === "conversation" ? (
          <ShopConversationScreen
            controller={shopConversation}
            currentUserId={currentUserId}
            fallbackListing={openedListing ? {
              id: openedListing.id,
              title: openedListing.title,
              subtitle: money(openedListing),
              photoUrl: openedListing.photos[0]?.url
            } : undefined}
            onBack={() => onSellerViewChange("messages")}
            onViewListing={() => {
              const threadListing = allListings.find((listing) => listing.id === shopConversation.activeThread?.listing.id);
              if (threadListing) openSellerListing(threadListing);
            }}
            onProtectionHelp={() => onSellerViewChange("orders")}
          />
        ) : openedListing ? (
          <SellerListingPage listing={openedListing} onBack={() => onSellerViewChange("dashboard")} onViewPublic={() => openPublicListing(openedListing)} />
        ) : null
      ) : (
        buyerView === "browse" ? (
          <>
            <View style={styles.shopTopBar}>
              <View style={[styles.searchBox, styles.shopSearchBox]}>
                <Search size={18} color={nightTheme.faint} />
                <TextInput
                  testID="shop-search"
                  value={search}
                  onChangeText={onSearch}
                  placeholder="Search brand, size..."
                  placeholderTextColor={nightTheme.faint}
                  style={[styles.searchInput, webTextInputReset]}
                />
              </View>
            </View>

            <View style={styles.shopAccountLinks}>
              <Pressable testID="shop-open-orders" accessibilityRole="button" accessibilityLabel={`Open ${buyerOrders.length} orders`} style={styles.shopAccountLink} onPress={() => onBuyerViewChange("orders")}>
                <Text style={styles.shopAccountLinkText}>{buyerOrders.length} {buyerOrders.length === 1 ? "order" : "orders"}</Text>
              </Pressable>
              <View style={styles.shopAccountDot} />
              <Pressable testID="shop-open-saved" accessibilityRole="button" accessibilityLabel={`Open ${savedListingIds.length} saved items`} style={styles.shopAccountLink} onPress={() => onBuyerViewChange("saved")}>
                <Text style={styles.shopAccountLinkText}>{savedListingIds.length} saved</Text>
              </Pressable>
              <View style={styles.shopAccountDot} />
              <Pressable testID="shop-open-messages" accessibilityRole="button" accessibilityLabel={`Open ${liveMessageCount} chats`} style={styles.shopAccountLink} onPress={() => onBuyerViewChange("messages")}>
                <Text style={styles.shopAccountLinkText}>{liveMessageCount} chats{shopConversation.unreadCount > 0 ? ` · ${shopConversation.unreadCount} new` : ""}</Text>
              </Pressable>
            </View>

            <View style={styles.chipRow}>
              {filters.map((item) => (
                <Pressable key={item} testID={`market-filter-${item.toLowerCase()}`} accessibilityRole="button" accessibilityState={{ selected: filter === item }} style={[styles.filterChip, filter === item && styles.filterChipActive]} onPress={() => onFilter(item)}>
                  <Text style={[styles.filterChipText, filter === item && styles.filterChipTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>

            {listings.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.panelTitle}>
                  {catalogLoading ? "Loading Shop..." : catalogError ? "Shop could not load" : "No items yet"}
                </Text>
                <Text style={styles.bodyText}>
                  {catalogLoading
                    ? "Fetching the latest verified listings."
                    : catalogError
                      ? catalogError
                      : accountMode === "connected" && !search && filter === "All"
                        ? "The live catalog is empty. New verified gear will appear here."
                        : "Try All, Dressage, or a broader brand search."}
                </Text>
                <Pressable testID="market-clear-filters" accessibilityRole="button" accessibilityLabel="Show all marketplace items" style={({ pressed }) => [styles.clearFilterButton, pressed && styles.pressed]} onPress={() => {
                  if (catalogError) onCatalogRetry();
                  else {
                    onSearch("");
                    onFilter("All");
                  }
                }}>
                  <Text style={styles.clearFilterButtonText}>{catalogError ? "Retry" : "Show all"}</Text>
                </Pressable>
              </View>
            )}

            {featuredListing && (
              <Pressable testID="shop-open-best-match" accessibilityRole="button" accessibilityLabel={`Review measurements for ${featuredListing.title}`} style={({ pressed }) => [styles.shopMatchRow, pressed && styles.homePressLift]} onPress={() => openBuyerListing(featuredListing)}>
                <View style={styles.shopMatchIcon}>
                  <Sparkles size={20} strokeWidth={1.9} color={equinaTheme.colors.brass} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shopMatchKicker}>
                    {horseFitContext.hasProfile === false ? "Add a horse for fit screening" : `Fit screening for ${horseFitContext.name}`}
                  </Text>
                  <Text numberOfLines={1} style={styles.shopMatchTitle}>{featuredListing.brand} {featuredListing.model ?? featuredListing.category} · {featuredFit.shortLabel}</Text>
                </View>
                <ChevronRight size={17} color={nightTheme.faint} />
              </Pressable>
            )}

            {feedListings.length > 0 && (
              <>
                <SectionTitle title="Browse" action={`${feedListings.length} ${accountMode === "demo" ? "sample " : ""}items`} />
                <View style={styles.shopFeedGrid}>
                  {feedListings.map((listing) => (
                    <ShopProductCard key={listing.id} listing={listing} saved={savedListingIds.includes(listing.id)} onPress={() => openBuyerListing(listing)} />
                  ))}
                </View>
              </>
            )}
          </>
        ) : buyerView === "product" && openedListing ? (
          <ShopProductPage
            listing={openedListing}
            sellerName={sellerName}
            horse={horseFitContext}
            saved={savedListingIds.includes(openedListing.id)}
            reserved={reservedListing?.id === openedListing.id}
            onBack={() => onBuyerViewChange("browse")}
            onToggleSave={() => onToggleSave(openedListing)}
            onCheckout={() => onBuyerViewChange("checkout")}
            onMessage={() => openConversation(openedListing)}
            onFit={() => {
              onFitCheck(openedListing);
              onBuyerViewChange("fit");
            }}
            onProtection={() => onBuyerViewChange("protection")}
            onOrders={() => onBuyerViewChange("orders")}
          />
        ) : buyerView === "checkout" && openedListing ? (
          <ShopCheckoutPage
            listing={openedListing}
            onBack={() => onBuyerViewChange("product")}
            onConfirm={() => {
              if (onBuy(openedListing)) onBuyerViewChange("orders");
            }}
          />
        ) : buyerView === "orders" ? (
          <ShopOrdersPage
            title="Your orders"
            orders={buyerOrders}
            allListings={allListings}
            onBack={() => onBuyerViewChange("browse")}
            onAcceptOrder={onAcceptOrder}
            onDispute={onDispute}
          />
        ) : buyerView === "saved" ? (
          <ShopSavedPage listings={savedListings} onBack={() => onBuyerViewChange("browse")} onOpen={openBuyerListing} />
        ) : buyerView === "messages" ? (
          <ShopThreadList
            title="Messages"
            controller={shopConversation}
            onBack={() => onBuyerViewChange("browse")}
            onOpen={() => onBuyerViewChange("conversation")}
          />
        ) : buyerView === "conversation" ? (
          <ShopConversationScreen
            controller={shopConversation}
            currentUserId={currentUserId}
            fallbackListing={openedListing ? {
              id: openedListing.id,
              title: openedListing.title,
              subtitle: `${money(openedListing)} · ${conditionLabel(openedListing.conditionGrade)}`,
              photoUrl: openedListing.photos[0]?.url
            } : undefined}
            onBack={() => onBuyerViewChange("product")}
            onViewListing={() => {
              const threadListing = allListings.find((listing) => listing.id === shopConversation.activeThread?.listing.id) ?? openedListing;
              if (threadListing) openBuyerListing(threadListing);
            }}
            onProtectionHelp={() => onBuyerViewChange("protection")}
          />
        ) : buyerView === "fit" && openedListing ? (
          <ShopFitPage
            listing={openedListing}
            horse={horseFitContext}
            onBack={() => onBuyerViewChange("product")}
            onAskCoach={onAskCoach ? () => onAskCoach(openedListing) : undefined}
          />
        ) : buyerView === "protection" ? (
          <ShopProtectionPage onBack={() => onBuyerViewChange("product")} />
        ) : null
      )}
    </View>
  );
}

function ShopRouteHeader({ title, meta, onBack }: { title: string; meta?: string; onBack: () => void }) {
  return (
    <View style={styles.shopRouteHeader}>
      <MotionPressable testID="shop-route-back" accessibilityRole="button" accessibilityLabel={`Back from ${title}`} style={styles.shopRouteBack} onPress={onBack}>
        <ChevronLeft size={20} color={nightTheme.text} />
      </MotionPressable>
      <View style={styles.shopRouteTitleBlock}>
        <Text numberOfLines={1} style={styles.shopRouteTitle}>{title}</Text>
        {meta ? <Text numberOfLines={1} style={styles.shopRouteMeta}>{meta}</Text> : null}
      </View>
      <View style={styles.shopRouteSpacer} />
    </View>
  );
}

function ShopProductPage({
  listing,
  sellerName,
  horse,
  saved,
  reserved,
  onBack,
  onToggleSave,
  onCheckout,
  onMessage,
  onFit,
  onProtection,
  onOrders
}: {
  listing: Listing;
  sellerName: string;
  horse: HorseFitContext;
  saved: boolean;
  reserved: boolean;
  onBack: () => void;
  onToggleSave: () => void;
  onCheckout: () => void;
  onMessage: () => void;
  onFit: () => void;
  onProtection: () => void;
  onOrders: () => void;
}) {
  const { width } = useWindowDimensions();
  const mediaWidth = Math.min(394, width - 36);
  const fitScreening = getFitScreening(listing, horse);
  const available = listing.status === "active";
  const details: Array<[string, string]> = [
    ["Condition", conditionLabel(listing.conditionGrade)],
    ["Location", listing.location],
    ["Seat", listing.metadata?.seatSize ?? "Ask seller"],
    ["Tree", listing.metadata?.treeSize ?? "Not applicable"],
    ["Flap", listing.metadata?.flapSize ?? "Not listed"],
    ["Serial", listing.metadata?.serialNumber ? "Provided" : "Not required"]
  ];

  return (
    <View style={styles.shopDetailPage}>
      <View style={styles.shopDetailTopRow}>
        <MotionPressable testID="shop-product-back" accessibilityRole="button" accessibilityLabel="Back to Shop" style={styles.shopDetailIconButton} onPress={onBack}>
          <ChevronLeft size={21} color={nightTheme.text} />
        </MotionPressable>
        <Text style={styles.shopDetailTopTitle}>Product</Text>
        <MotionPressable testID="shop-product-save" accessibilityRole="button" accessibilityLabel={saved ? "Remove from saved" : "Save item"} style={styles.shopDetailIconButton} onPress={onToggleSave}>
          <Heart size={20} color={saved ? equinaTheme.colors.brass : nightTheme.text} fill={saved ? equinaTheme.colors.brass : "none"} />
        </MotionPressable>
      </View>

      <ScrollView
        horizontal
        nestedScrollEnabled
        decelerationRate="fast"
        snapToInterval={mediaWidth + 8}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shopDetailGallery}
      >
        {listing.photos.slice(0, 6).map((photo, index) => (
          <View key={photo.id} style={[styles.shopDetailMedia, { width: mediaWidth }]}>
            <Image source={{ uri: photo.url }} resizeMode="cover" style={styles.shopDetailImage} />
            <LinearGradient colors={["transparent", "rgba(8,7,6,0.62)"]} style={StyleSheet.absoluteFillObject} />
            <Text style={styles.shopDetailPhotoLabel}>{index + 1} / {Math.min(listing.photos.length, 6)} · {photo.requiredAngle.replace(/_/g, " ")}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.shopDetailHeading}>
        <Text style={styles.shopDetailKicker}>{conditionLabel(listing.conditionGrade)} · {listing.category.replace(/_/g, " ")}</Text>
        <Text style={styles.shopDetailTitle}>{listing.title}</Text>
        <Text style={styles.shopDetailPrice}>{money(listing)}</Text>
      </View>

      {reserved ? <ReservedOrderCard listing={listing} /> : null}

      <Pressable
        testID="shop-product-fit"
        accessibilityRole="button"
        accessibilityLabel={horse.hasProfile === false ? "Open fit screening" : `Open fit screen for ${horse.name}`}
        style={({ pressed }) => [styles.shopDetailFit, pressed && styles.homePressLift]}
        onPress={onFit}
      >
        <View style={styles.shopDetailFitScore}>
          <Search size={23} color={equinaTheme.colors.brass} />
          <Text style={styles.shopDetailFitLabel}>screen</Text>
        </View>
        <View style={styles.shopDetailFitCopy}>
          <Text style={styles.shopDetailFitTitle}>
            {horse.hasProfile === false ? fitScreening.title : `${fitScreening.title} for ${horse.name}`}
          </Text>
          <Text style={styles.shopDetailFitBody}>{fitScreening.detail}</Text>
        </View>
        <ChevronRight size={17} color={nightTheme.faint} />
      </Pressable>

      <View style={styles.shopDetailActions}>
        <MotionPressable
          testID="shop-product-buy"
          accessibilityRole="button"
          accessibilityLabel={reserved ? "View order preview" : available ? (equinaFeatureFlags.shopTransactions ? "Buy with protection" : "Preview checkout") : "Item unavailable"}
          disabled={!available && !reserved}
          style={[styles.shopDetailPrimary, !available && !reserved && styles.shopDetailActionDisabled]}
          onPress={reserved ? onOrders : onCheckout}
        >
          <LockKeyhole size={18} color={equinaTheme.colors.ink} />
          <Text style={styles.shopDetailPrimaryText}>{reserved ? "View order" : available ? (equinaFeatureFlags.shopTransactions ? "Buy with protection" : "Preview checkout") : "Unavailable"}</Text>
        </MotionPressable>
        <MotionPressable testID="shop-product-message" accessibilityRole="button" accessibilityLabel={equinaFeatureFlags.shopMessaging ? `Message ${sellerName}` : "Open read-only seller conversation"} style={styles.shopDetailSecondary} onPress={onMessage}>
          <MessageCircle size={18} color={nightTheme.text} />
        </MotionPressable>
      </View>

      <View style={styles.shopDetailSection}>
        <Text style={styles.shopDetailSectionTitle}>Item details</Text>
        {details.map(([label, value], index) => (
          <ShopFactRow key={label} label={label} value={value} last={index === details.length - 1} />
        ))}
      </View>

      <View style={styles.shopSellerRow}>
        <View style={styles.shopSellerMonogram}><Text style={styles.shopSellerMonogramText}>{sellerName.slice(0, 1)}</Text></View>
        <View style={styles.shopSellerCopy}>
          <View style={styles.shopSellerNameRow}>
            <Text style={styles.shopSellerName}>{sellerName}</Text>
            <BadgeCheck size={15} color={equinaTheme.colors.brass} />
          </View>
          <Text style={styles.shopSellerMeta}>{equinaFeatureFlags.shopTransactions ? "Identity and payout verified" : "Sample verified seller profile"}</Text>
        </View>
      </View>

      <Pressable testID="shop-product-protection" accessibilityRole="button" accessibilityLabel={equinaFeatureFlags.shopTransactions ? "Open Equina buyer protection" : "Open protection preview"} style={({ pressed }) => [styles.shopProtectionEntry, pressed && styles.homePressLift]} onPress={onProtection}>
        <ShieldCheck size={21} color={equinaTheme.colors.brass} />
        <View style={styles.shopDetailFitCopy}>
          <Text style={styles.shopDetailFitTitle}>{equinaFeatureFlags.shopTransactions ? "Equina buyer protection" : "Protection preview"}</Text>
          <Text style={styles.shopDetailFitBody}>{equinaFeatureFlags.shopTransactions ? "Protected payment, tracked shipping, and a 5-day inspection" : "Planned protected payment, tracked shipping, and inspection flow"}</Text>
        </View>
        <ChevronRight size={17} color={nightTheme.faint} />
      </Pressable>
    </View>
  );
}

function ShopFactRow({ label, value, last }: { label: string; value: string; last: boolean }) {
  return (
    <View style={[styles.shopFactRow, !last && styles.shopFactRowBorder]}>
      <Text style={styles.shopFactLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.shopFactValue}>{value}</Text>
    </View>
  );
}

function ShopCheckoutPage({ listing, onBack, onConfirm }: { listing: Listing; onBack: () => void; onConfirm: () => void }) {
  const checkoutEnabled = equinaFeatureFlags.shopTransactions;
  return (
    <View style={styles.shopCheckoutPage}>
      <ShopRouteHeader title={checkoutEnabled ? "Protected checkout" : "Checkout preview"} meta={checkoutEnabled ? "Review before reserving" : "No payment is connected"} onBack={onBack} />
      <View style={styles.shopCheckoutItem}>
        <Image source={{ uri: listing.photos[0]?.url }} style={styles.shopCheckoutImage} />
        <View style={styles.shopCheckoutCopy}>
          <Text numberOfLines={2} style={styles.shopCheckoutTitle}>{listing.brand} {listing.model ?? listing.category}</Text>
          <Text style={styles.shopCheckoutMeta}>{conditionLabel(listing.conditionGrade)} · {listing.location}</Text>
        </View>
        <Text style={styles.shopCheckoutPrice}>{money(listing)}</Text>
      </View>

      <View style={styles.shopCheckoutLines}>
        <ShopFactRow label="Item" value={money(listing)} last={false} />
        <ShopFactRow label="Tracked shipping" value={checkoutEnabled ? "Confirmed with seller" : "Calculated in live checkout"} last={false} />
        <ShopFactRow label="Buyer protection" value={checkoutEnabled ? "Included" : "Preview only"} last />
      </View>

      <View style={styles.shopCheckoutProtection}>
        <LockKeyhole size={19} color={equinaTheme.colors.brass} />
        <View style={styles.shopDetailFitCopy}>
          <Text style={styles.shopDetailFitTitle}>{checkoutEnabled ? "Funds stay protected" : "How protection will work"}</Text>
          <Text style={styles.shopDetailFitBody}>{checkoutEnabled ? "The seller is paid only after your inspection window closes." : "A live release will require payment, shipping, and inspection confirmation."}</Text>
        </View>
      </View>

      <View style={styles.shopCheckoutBottom}>
        <View>
          <Text style={styles.shopCheckoutDueLabel}>{checkoutEnabled ? "Due now" : "Sample total"}</Text>
          <Text style={styles.shopCheckoutDue}>{money(listing)}</Text>
        </View>
        <Text style={styles.shopCheckoutPreviewNote}>{checkoutEnabled ? "Payment is submitted securely." : "No card can be charged in this preview."}</Text>
      </View>

      {checkoutEnabled ? (
        <MotionPressable
          testID="shop-checkout-confirm"
          accessibilityRole="button"
          accessibilityLabel={`Confirm protected purchase of ${listing.title}`}
          style={styles.shopCheckoutConfirm}
          onPress={onConfirm}
        >
          <Text style={styles.shopCheckoutConfirmText}>Confirm purchase</Text>
          <ChevronRight size={18} color={equinaTheme.colors.ink} />
        </MotionPressable>
      ) : (
        <View
          testID="shop-checkout-confirm"
          accessibilityLabel="Payments are not connected in this preview"
          style={styles.shopCheckoutUnavailable}
        >
          <LockKeyhole size={17} color={equinaTheme.colors.brass} />
          <View style={{ flex: 1 }}>
            <Text style={styles.shopCheckoutUnavailableTitle}>Payments not connected</Text>
            <Text style={styles.shopCheckoutUnavailableBody}>Browse and inspect the flow without placing an order.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function ShopOrdersPage({
  title,
  orders,
  allListings,
  sellerView = false,
  onBack,
  onAcceptOrder,
  onDispute
}: {
  title: string;
  orders: Order[];
  allListings: Listing[];
  sellerView?: boolean;
  onBack: () => void;
  onAcceptOrder: (order: Order) => void;
  onDispute: (order: Order) => void;
}) {
  const [confirmingOrderId, setConfirmingOrderId] = useState("");
  const [helpingOrderId, setHelpingOrderId] = useState("");

  return (
    <View style={styles.shopOrdersPage}>
      <ShopRouteHeader title={title} meta={equinaFeatureFlags.shopTransactions ? `${orders.length} protected ${orders.length === 1 ? "order" : "orders"}` : `${orders.length} sample ${orders.length === 1 ? "order" : "orders"} · read-only`} onBack={onBack} />
      {orders.length === 0 ? (
        <ShopEmptyPage Icon={PackageCheck} title="No orders yet" body={equinaFeatureFlags.shopTransactions ? "Completed purchases will appear here with shipping and inspection status." : "Live orders will appear after protected checkout is connected."} />
      ) : orders.map((order) => {
        const listing = allListings.find((candidate) => candidate.id === order.listingId);
        if (!listing) return null;
        const confirming = confirmingOrderId === order.id;
        const helping = helpingOrderId === order.id;
        return (
          <View key={order.id} testID={`shop-order-${order.id}`} style={styles.shopOrderCard}>
            <View style={styles.shopOrderTop}>
              <Image source={{ uri: listing.photos[0]?.url }} style={styles.shopOrderImage} />
              <View style={styles.shopOrderCopy}>
                <Text style={styles.shopOrderStatus}>{orderStatusLabel[order.status]}</Text>
                <Text numberOfLines={2} style={styles.shopOrderTitle}>{listing.brand} {listing.model ?? listing.category}</Text>
                <Text style={styles.shopOrderMeta}>{orderMoney(order.amount, order.currency)} · #{order.id.slice(-6)}</Text>
              </View>
            </View>

            <View style={styles.shopOrderProgress}>
              <View style={[styles.shopOrderProgressStep, styles.shopOrderProgressDone]} />
              <View style={[styles.shopOrderProgressStep, order.status !== "paid" && order.status !== "payment_pending" && styles.shopOrderProgressDone]} />
              <View style={[styles.shopOrderProgressStep, ["inspection", "released", "disputed"].includes(order.status) && styles.shopOrderProgressDone]} />
            </View>

            {!equinaFeatureFlags.shopTransactions && (
              <Text style={styles.shopCheckoutPreviewNote}>Order actions are read-only in this preview.</Text>
            )}

            {equinaFeatureFlags.shopTransactions && !sellerView && order.status === "inspection" && (
              helping ? (
                <View style={styles.shopOrderConfirm}>
                  <Text style={styles.shopOrderConfirmText}>Open a misrepresentation case using the listing photos as initial evidence?</Text>
                  <View style={styles.shopOrderActions}>
                    <Pressable testID={`shop-order-help-cancel-${order.id}`} accessibilityRole="button" accessibilityLabel="Cancel help request" style={styles.shopOrderQuietAction} onPress={() => setHelpingOrderId("")}>
                      <Text style={styles.shopOrderQuietText}>Cancel</Text>
                    </Pressable>
                    <Pressable testID={`shop-order-help-confirm-${order.id}`} accessibilityRole="button" accessibilityLabel="Open misrepresentation case" style={styles.shopOrderReleaseAction} onPress={() => {
                      onDispute(order);
                      setHelpingOrderId("");
                    }}>
                      <Text style={styles.shopOrderReleaseText}>Open case</Text>
                    </Pressable>
                  </View>
                </View>
              ) : confirming ? (
                <View style={styles.shopOrderConfirm}>
                  <Text style={styles.shopOrderConfirmText}>Release funds only when the item matches the listing.</Text>
                  <View style={styles.shopOrderActions}>
                    <Pressable testID={`shop-order-cancel-${order.id}`} accessibilityRole="button" accessibilityLabel="Keep inspecting item" style={styles.shopOrderQuietAction} onPress={() => setConfirmingOrderId("")}>
                      <Text style={styles.shopOrderQuietText}>Keep inspecting</Text>
                    </Pressable>
                    <Pressable testID={`shop-order-release-${order.id}`} accessibilityRole="button" accessibilityLabel="Release protected payment" style={styles.shopOrderReleaseAction} onPress={() => {
                      onAcceptOrder(order);
                      setConfirmingOrderId("");
                    }}>
                      <Text style={styles.shopOrderReleaseText}>Release funds</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.shopOrderActions}>
                  <Pressable testID={`shop-order-help-${order.id}`} accessibilityRole="button" accessibilityLabel="Get help with this order" style={styles.shopOrderQuietAction} onPress={() => setHelpingOrderId(order.id)}>
                    <Text style={styles.shopOrderQuietText}>Get help</Text>
                  </Pressable>
                  <Pressable testID={`shop-order-accept-${order.id}`} accessibilityRole="button" accessibilityLabel="Accept item" style={styles.shopOrderReleaseAction} onPress={() => setConfirmingOrderId(order.id)}>
                    <Text style={styles.shopOrderReleaseText}>Accept item</Text>
                  </Pressable>
                </View>
              )
            )}
          </View>
        );
      })}
    </View>
  );
}

function ShopSavedPage({ listings, onBack, onOpen }: { listings: Listing[]; onBack: () => void; onOpen: (listing: Listing) => void }) {
  return (
    <View style={styles.shopSavedPage}>
      <ShopRouteHeader title="Saved" meta={`${listings.length} items for later`} onBack={onBack} />
      {listings.length === 0
        ? <ShopEmptyPage Icon={Heart} title="Nothing saved yet" body="Tap the heart on a product to keep it here." />
        : listings.map((listing) => <MarketplaceRow key={listing.id} listing={listing} selected={false} onPress={() => onOpen(listing)} />)}
    </View>
  );
}

function ShopMessagesPage({
  title,
  perspective,
  messages,
  allListings,
  onBack,
  onOpen
}: {
  title: string;
  perspective: "buyer" | "seller";
  messages: ShopMessage[];
  allListings: Listing[];
  onBack: () => void;
  onOpen: (listing: Listing) => void;
}) {
  const threadIds = [...new Set(messages.map((message) => message.listingId))];
  return (
    <View style={styles.shopMessagesPage}>
      <ShopRouteHeader title={title} meta={equinaFeatureFlags.shopMessaging ? `${threadIds.length} active ${threadIds.length === 1 ? "chat" : "chats"}` : `${threadIds.length} sample ${threadIds.length === 1 ? "chat" : "chats"} · read-only`} onBack={onBack} />
      {threadIds.length === 0 ? (
        <ShopEmptyPage Icon={MessageCircle} title="No messages yet" body="Questions to sellers will stay grouped by product." />
      ) : threadIds.map((listingId) => {
        const listing = allListings.find((candidate) => candidate.id === listingId);
        const thread = messages.filter((message) => message.listingId === listingId);
        const latest = thread[thread.length - 1];
        if (!listing || !latest) return null;
        const prefix = latest.author === perspective ? "You" : perspective === "seller" ? "Buyer" : "Seller";
        return (
          <Pressable key={listingId} testID={`shop-thread-${listingId}`} accessibilityRole="button" accessibilityLabel={`Open messages about ${listing.title}`} style={({ pressed }) => [styles.shopThreadRow, pressed && styles.homePressLift]} onPress={() => onOpen(listing)}>
            <Image source={{ uri: listing.photos[0]?.url }} style={styles.shopThreadImage} />
            <View style={styles.shopThreadCopy}>
              <Text numberOfLines={1} style={styles.shopThreadTitle}>{listing.brand} {listing.model ?? listing.category}</Text>
              <Text numberOfLines={2} style={styles.shopThreadBody}>{prefix}: {latest.text}</Text>
            </View>
            <ChevronRight size={17} color={nightTheme.faint} />
          </Pressable>
        );
      })}
    </View>
  );
}

function ShopConversationPage({
  listing,
  counterpartName,
  perspective,
  messages,
  onBack,
  onSend
}: {
  listing: Listing;
  counterpartName: string;
  perspective: "buyer" | "seller";
  messages: ShopMessage[];
  onBack: () => void;
  onSend: (body: string) => boolean;
}) {
  const [draft, setDraft] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const messageScrollRef = useRef<ScrollView>(null);
  const counterpartInitial = counterpartName.trim().charAt(0).toUpperCase() || "E";
  const canSend = equinaFeatureFlags.shopMessaging && draft.trim().length > 0;
  const submit = () => {
    if (onSend(draft)) setDraft("");
  };

  return (
    <KeyboardAvoidingView
      style={styles.shopConversationPage}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.shopConversationHeader}>
        <MotionPressable
          testID="shop-route-back"
          accessibilityRole="button"
          accessibilityLabel={`Back from ${counterpartName}`}
          style={styles.shopConversationBack}
          onPress={onBack}
        >
          <ChevronLeft size={21} color={nightTheme.text} />
        </MotionPressable>
        <View style={styles.shopConversationAvatar}>
          <Text style={styles.shopConversationAvatarText}>{counterpartInitial}</Text>
        </View>
        <View style={styles.shopConversationIdentity}>
          <View style={styles.shopConversationNameRow}>
            <Text numberOfLines={1} style={styles.shopConversationName}>{counterpartName}</Text>
            <BadgeCheck size={14} color={equinaTheme.colors.brass} />
          </View>
          <Text style={styles.shopConversationPresence}>{equinaFeatureFlags.shopMessaging ? "Active today" : "Sample conversation"}</Text>
        </View>
      </View>

      <View style={styles.shopConversationProduct}>
        <Image source={{ uri: listing.photos[0]?.url }} style={styles.shopConversationProductImage} />
        <View style={styles.shopConversationProductCopy}>
          <Text numberOfLines={1} style={styles.shopConversationProductTitle}>{listing.brand} {listing.model ?? listing.category}</Text>
          <Text numberOfLines={1} style={styles.shopConversationProductMeta}>{money(listing)} · {conditionLabel(listing.conditionGrade)}</Text>
        </View>
        <ShieldCheck size={17} color={equinaTheme.colors.brass} />
      </View>

      <ScrollView
        ref={messageScrollRef}
        style={styles.shopConversationScroller}
        contentContainerStyle={styles.shopConversationMessages}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => messageScrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length > 0 && <Text style={styles.shopConversationDay}>Today</Text>}
        {messages.length === 0 ? (
          <Text style={styles.shopConversationHint}>Ask about measurements, condition, shipping, or another photo.</Text>
        ) : messages.map((entry) => {
          const isOwnMessage = entry.author === perspective;
          return (
            <View key={entry.id} style={[styles.shopConversationMessageRow, isOwnMessage && styles.shopConversationMessageRowOwn]}>
              {!isOwnMessage && (
                <View style={styles.shopConversationMessageAvatar}>
                  <Text style={styles.shopConversationMessageAvatarText}>{counterpartInitial}</Text>
                </View>
              )}
              <View style={[styles.shopConversationBubble, isOwnMessage ? styles.shopConversationBubbleBuyer : styles.shopConversationBubbleSeller]}>
                <Text style={[styles.shopConversationText, isOwnMessage && styles.shopConversationTextBuyer]}>{entry.text}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.shopConversationComposerDock}>
        <ConversationGlassSurface
          style={[styles.shopConversationComposer, inputFocused && styles.shopConversationComposerFocused]}
          contentStyle={styles.shopConversationComposerContent}
        >
          <TextInput
            testID="shop-message-input"
            accessibilityLabel={equinaFeatureFlags.shopMessaging ? (perspective === "seller" ? "Reply to buyer" : "Ask the seller") : "Messaging is read-only in this preview"}
            value={draft}
            editable={equinaFeatureFlags.shopMessaging}
            onChangeText={setDraft}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onSubmitEditing={submit}
            placeholder={equinaFeatureFlags.shopMessaging ? (perspective === "seller" ? "Reply to buyer" : "Message seller") : "Messaging opens in the connected beta"}
            placeholderTextColor={nightTheme.faint}
            returnKeyType="send"
            multiline
            style={[styles.shopConversationInput, webTextInputReset]}
          />
          <MotionPressable
            testID="shop-message-send"
            accessibilityRole="button"
            accessibilityLabel={equinaFeatureFlags.shopMessaging ? "Send message" : "Messaging is not available in this preview"}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            pressedScale={0.94}
            style={[styles.shopConversationSend, canSend && styles.shopConversationSendReady]}
            onPress={submit}
          >
            <SendHorizontal size={18} color={canSend ? equinaTheme.colors.ink : nightTheme.faint} />
          </MotionPressable>
        </ConversationGlassSurface>
      </View>
    </KeyboardAvoidingView>
  );
}

function ShopFitPage({
  listing,
  horse,
  onBack,
  onAskCoach
}: {
  listing: Listing;
  horse: HorseFitContext;
  onBack: () => void;
  onAskCoach?: () => void;
}) {
  const fitScreening = getFitScreening(listing, horse);
  return (
    <View style={styles.shopFitPage}>
      <ShopRouteHeader
        title={horse.hasProfile === false ? "Fit screening" : `Fit for ${horse.name}`}
        meta="Profile screening, not a fitting"
        onBack={onBack}
      />
      <View style={styles.shopFitHero}>
        <Text style={styles.shopFitHeroValue}>{fitScreening.title}</Text>
        <Text style={styles.shopFitHeroLabel}>{fitScreening.confidenceLabel}</Text>
        <Text style={styles.shopFitHeroBody}>{fitScreening.detail}</Text>
      </View>

      <View style={styles.shopDetailSection}>
        <Text style={styles.shopDetailSectionTitle}>What Equina used</Text>
        <ShopFactRow label="Horse height" value={horse.heightCm ? `${horse.heightCm} cm` : "Not logged"} last={false} />
        <ShopFactRow label="Back length" value={horse.backLengthCm ? `${horse.backLengthCm} cm` : "Not logged"} last={false} />
        <ShopFactRow label="Shoulder" value={horse.shoulderAngle ?? "Not logged"} last={false} />
        <ShopFactRow label="Listing tree" value={listing.metadata?.treeSize ?? "Ask seller"} last />
      </View>

      <View style={styles.shopFitChecks}>
        <MarketTrustPill Icon={FileText} title="Verify first" body="Panel photos, tree width, and serial" />
        <MarketTrustPill Icon={ShieldCheck} title="Escalate" body="Final check with a qualified saddler" last />
      </View>

      {/* A quiet row like every other "Ask Ralf": the page's one decision is
          whether to buy, not whether to talk to Ralf. */}
      {onAskCoach ? (
        <Pressable
          testID="shop-fit-ask-ralf"
          accessibilityRole="button"
          accessibilityLabel={`Ask ${equinaCoach.name} about this item`}
          style={({ pressed }) => [styles.academyPersonalAction, pressed && styles.pressed]}
          onPress={onAskCoach}
        >
          <Sparkles size={18} color={equinaTheme.colors.brass} />
          <View style={styles.academyPersonalActionCopy}>
            <Text style={styles.academyPersonalActionTitle}>Ask {equinaCoach.name}</Text>
            <Text numberOfLines={1} style={styles.academyPersonalActionBody}>Turn these details into questions for the seller</Text>
          </View>
          <ChevronRight size={16} color={nightTheme.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ShopProtectionPage({ onBack }: { onBack: () => void }) {
  const protectionLive = equinaFeatureFlags.shopTransactions;
  return (
    <View style={styles.shopProtectionPage}>
      <ShopRouteHeader title={protectionLive ? "Buyer protection" : "Protection preview"} meta={protectionLive ? "What happens after purchase" : "Planned transaction flow"} onBack={onBack} />
      <View style={styles.shopProtectionHero}>
        <ShieldCheck size={34} color={equinaTheme.colors.brass} />
        <Text style={styles.shopProtectionHeroTitle}>{protectionLive ? "You stay in control." : "Designed for protected exchange."}</Text>
        <Text style={styles.shopProtectionHeroBody}>{protectionLive ? "Payment is held while the item travels and during your inspection window." : "Payment, shipping, and inspection require a live provider before this flow can transact."}</Text>
      </View>
      <View style={styles.shopProtectionSteps}>
        <TimelineStep title="Reserve" body={protectionLive ? "Payment is collected by the provider and the seller transfer waits." : "Connect the protected-payment provider."} done={protectionLive} />
        <TimelineStep title="Track" body="Tracked shipping and insurance are required." done={false} />
        <TimelineStep title="Inspect" body="Inspection and evidence rules apply before release." done={false} />
      </View>
      <Text style={styles.shopProtectionFootnote}>Returns apply when an item is materially misrepresented, damaged, counterfeit, or not received. Evidence is required.</Text>
    </View>
  );
}

function SellerRevenuePage({ orders, onBack }: { orders: Order[]; onBack: () => void }) {
  const releasedOrders = orders.filter((order) => order.status === "released");
  const heldOrders = orders.filter((order) => !["released", "refunded"].includes(order.status));
  return (
    <View style={styles.sellerRevenuePage}>
      <ShopRouteHeader title="Revenue" meta={equinaFeatureFlags.shopTransactions ? "Protected payouts" : "Sample data · read-only"} onBack={onBack} />
      <View style={styles.sellerRevenueHero}>
        <Text style={styles.sellerRevenueLabel}>Total sold</Text>
        <Text numberOfLines={2} adjustsFontSizeToFit style={styles.sellerRevenueValue}>{orderTotalsLabel(orders)}</Text>
      </View>
      <View style={styles.shopDetailSection}>
        <ShopFactRow label="Available" value={orderTotalsLabel(releasedOrders)} last={false} />
        <ShopFactRow label={equinaFeatureFlags.shopTransactions ? "Pending release" : "Would await release"} value={orderTotalsLabel(heldOrders)} last={false} />
        <ShopFactRow label="Payout method" value={equinaFeatureFlags.shopTransactions ? "Verified" : "Not connected"} last />
      </View>
    </View>
  );
}

function SellerListingPage({ listing, onBack, onViewPublic }: { listing: Listing; onBack: () => void; onViewPublic: () => void }) {
  return (
    <View style={styles.sellerListingPage}>
      <ShopRouteHeader title="Listing" meta={listing.status.replace(/_/g, " ")} onBack={onBack} />
      <Image source={{ uri: listing.photos[0]?.url }} style={styles.sellerListingHeroImage} />
      <Text style={styles.shopDetailKicker}>{listing.status} · {conditionLabel(listing.conditionGrade)}</Text>
      <Text style={styles.shopDetailTitle}>{listing.title}</Text>
      <Text style={styles.shopDetailPrice}>{money(listing)}</Text>
      <View style={styles.shopDetailSection}>
        <ShopFactRow label="Photos" value={`${listing.photos.length} uploaded`} last={false} />
        <ShopFactRow label="Ownership" value={listing.metadata?.proofOfOwnership ? "Verified" : "Standard check"} last={false} />
        <ShopFactRow label="Status" value={listing.status.replace(/_/g, " ")} last />
      </View>
      {listing.status === "active" ? (
        <MotionPressable testID="seller-view-public-listing" accessibilityRole="button" accessibilityLabel="View public product page" style={styles.shopCheckoutConfirm} onPress={onViewPublic}>
          <Text style={styles.shopCheckoutConfirmText}>View public page</Text>
          <ChevronRight size={18} color={equinaTheme.colors.ink} />
        </MotionPressable>
      ) : null}
    </View>
  );
}

function ShopEmptyPage({ Icon, title, body }: { Icon: typeof Store; title: string; body: string }) {
  return (
    <View style={styles.shopEmptyPage}>
      <Icon size={24} color={equinaTheme.colors.brass} />
      <Text style={styles.shopEmptyTitle}>{title}</Text>
      <Text style={styles.shopEmptyBody}>{body}</Text>
    </View>
  );
}

function StableScreen({
  connected,
  recordsController,
  hasHorse,
  horseName,
  horsePhoto,
  discipline,
  horseBreed,
  horseSex,
  horseAge,
  horseHeight,
  nutrition,
  lastRide,
  nutritionAvailable,
  onOpenRalf,
  onToggleNutritionMeal,
  onLogNutritionWater
}: {
  connected: boolean;
  recordsController: HorseRecordsController;
  hasHorse: boolean;
  horseName: string;
  horsePhoto: string;
  discipline: CoachDiscipline;
  horseBreed: string;
  horseSex: (typeof horseSexes)[number];
  horseAge: string;
  horseHeight: string;
  nutrition: NutritionState;
  lastRide: RideSession | null;
  /** Only a horse with a real feeding plan gets a Nutrition view. */
  nutritionAvailable: boolean;
  /** Absent while Ralf is switched off for this account. */
  onOpenRalf?: (prompt?: string) => void;
  onToggleNutritionMeal: (mealId: NutritionMealId) => void;
  onLogNutritionWater: () => void;
}) {
  const [view, setView] = useState<StableView>("overview");
  const [horseEditorVisible, setHorseEditorVisible] = useState(false);
  const [recordEditorVisible, setRecordEditorVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HorseTimelineRecord | null>(null);
  const [recordPreset, setRecordPreset] = useState<HorseTimelineRecord["recordType"]>("note");
  const reduceMotion = useReducedMotion();
  const viewAnim = useRef(new Animated.Value(1)).current;
  const {
    horses,
    selectedHorse,
    records,
    filesByRecord,
    loading,
    loaded,
    refreshing,
    saving,
    error,
    offline,
    canManageHorse,
    canMutateRecords
  } = recordsController;
  const resolvedHasHorse = connected ? Boolean(selectedHorse) : hasHorse;
  const resolvedName = connected ? selectedHorse?.name ?? "" : horseName;
  const resolvedPhoto = connected ? selectedHorse?.photoUrl ?? "" : horsePhoto;
  const resolvedDiscipline = connected
    ? toCoachDiscipline(selectedHorse?.discipline)
    : discipline;
  const resolvedBreed = connected ? selectedHorse?.breed ?? "" : horseBreed;
  const resolvedSex = connected && selectedHorse?.sex
    ? `${selectedHorse.sex.charAt(0).toUpperCase()}${selectedHorse.sex.slice(1)}`
    : horseSex;
  const resolvedHeight = connected
    ? selectedHorse?.heightCm ? String(selectedHorse.heightCm) : ""
    : horseHeight;
  const resolvedAge = connected && selectedHorse?.birthDate
    ? String(Math.max(0, new Date().getFullYear() - Number(selectedHorse.birthDate.slice(0, 4))))
    : horseAge;
  const savedRecordCount = connected ? records.length : 0;
  const healthRecords = records.filter((record) =>
    ["vet", "lab", "vaccination", "dental", "farrier", "care"].includes(record.recordType)
  );
  const { completedMeals, waterLiters } = nutrition;
  const waterGoal = stableWaterGoal;
  const hydrationComplete = waterLiters >= waterGoal;
  const hydrationProgress = Math.min(100, Math.round((waterLiters / waterGoal) * 100));
  const dueRecord = records
    .filter((record) => record.dueOn && record.status !== "archived")
    .sort((left, right) => String(left.dueOn).localeCompare(String(right.dueOn)))[0];

  // Derived from the due dates on every render, so a vaccination that lapsed
  // in March reports itself as lapsed. The stored status column never moves.
  const todayIso = new Date().toISOString().slice(0, 10);
  const careSchedule = buildCareSchedule(records, todayIso);
  const horseNames = Object.fromEntries(horses.map((horse) => [horse.id, horse.name]));

  const logCareDone = async (item: CareItem) => {
    if (!canMutateRecords) return;
    const completion = completionFor(item, todayIso);
    if (!completion) return;
    recordsController.clearError();
    await recordsController.createRecord({
      recordType: item.careType,
      status: "current",
      title: item.record.title,
      occurredOn: completion.occurredOn,
      dueOn: completion.dueOn,
      providerName: item.record.providerName,
      source: item.record.source,
      details: { ...item.record.details, cadenceDays: completion.cadenceDays }
    });
  };

  const openHorseEditor = () => {
    recordsController.clearError();
    setHorseEditorVisible(true);
  };

  const openRecordEditor = (
    type: HorseTimelineRecord["recordType"],
    record: HorseTimelineRecord | null = null
  ) => {
    if (!canMutateRecords) return;
    recordsController.clearError();
    setEditingRecord(record);
    setRecordPreset(type);
    setRecordEditorVisible(true);
  };

  const closeHorseEditor = () => {
    if (saving) return;
    setHorseEditorVisible(false);
    recordsController.clearError();
  };

  const closeRecordEditor = () => {
    if (saving) return;
    setRecordEditorVisible(false);
    setEditingRecord(null);
    recordsController.clearError();
  };

  const saveHorse = async (
    input: Parameters<HorseRecordsController["createHorse"]>[0],
    photo?: Parameters<HorseRecordsController["createHorse"]>[1]
  ) => {
    if (selectedHorse) await recordsController.updateHorse(selectedHorse.id, input, photo);
    else await recordsController.createHorse(input, photo);
    setHorseEditorVisible(false);
  };

  const saveRecord = async (
    input: TimelineRecordInput,
    asset?: Parameters<HorseRecordsController["createRecord"]>[1]
  ) => {
    if (editingRecord) {
      const { recordType: _recordType, ...patch } = input;
      await recordsController.updateRecord(editingRecord.id, patch, asset);
    } else {
      await recordsController.createRecord(input, asset);
    }
    setRecordEditorVisible(false);
    setEditingRecord(null);
  };

  const confirmArchiveHorse = () => {
    if (!selectedHorse) return;
    Alert.alert(
      `Archive ${selectedHorse.name}?`,
      "Its records stay private and can be restored by support.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => void recordsController.archiveHorse(selectedHorse.id).then(() => {
            setHorseEditorVisible(false);
          })
        }
      ]
    );
  };

  const confirmDeleteRecord = () => {
    if (!editingRecord) return;
    Alert.alert(
      `Delete ${editingRecord.title}?`,
      "The private files will be queued for secure cleanup.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void recordsController.deleteRecord(editingRecord.id).then(() => {
            setRecordEditorVisible(false);
            setEditingRecord(null);
          })
        }
      ]
    );
  };

  const openPrivateFile = async (recordFile: NonNullable<(typeof filesByRecord)[string]>[number]) => {
    if (!recordFile.signedUrl) return;
    const supported = await Linking.canOpenURL(recordFile.signedUrl);
    if (supported) await Linking.openURL(recordFile.signedUrl);
  };

  const openView = (nextView: StableView) => {
    if (nextView === view) return;
    void Haptics.selectionAsync();
    if (reduceMotion) {
      setView(nextView);
      viewAnim.setValue(1);
      return;
    }
    viewAnim.setValue(0);
    setView(nextView);
    Animated.spring(viewAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 210,
      mass: 0.62,
      useNativeDriver: Platform.OS !== "web"
    }).start();
  };

  const toggleMeal = (mealId: NutritionMealId) => {
    void Haptics.selectionAsync();
    onToggleNutritionMeal(mealId);
  };

  const logWater = () => {
    if (hydrationComplete) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLogNutritionWater();
  };

  const viewMotion = {
    opacity: viewAnim,
    transform: [
      {
        translateY: viewAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0]
        })
      }
    ]
  };

  const recordSheets = (
    <>
      <HorseEditorSheet
        visible={horseEditorVisible}
        horse={selectedHorse}
        saving={saving.startsWith("horse:")}
        error={error}
        onDismiss={closeHorseEditor}
        onSave={saveHorse}
        onSetPrimary={selectedHorse && !selectedHorse.isPrimary
          ? async () => {
              await recordsController.setPrimaryHorse(selectedHorse.id);
              setHorseEditorVisible(false);
            }
          : undefined}
        onArchive={selectedHorse ? async () => confirmArchiveHorse() : undefined}
      />
      <RecordEditorSheet
        visible={recordEditorVisible}
        record={editingRecord}
        initialType={recordPreset}
        files={editingRecord ? filesByRecord[editingRecord.id] ?? [] : []}
        saving={saving.startsWith("record:") || saving.startsWith("file:")}
        error={error}
        onDismiss={closeRecordEditor}
        onSave={saveRecord}
        onDelete={editingRecord ? async () => confirmDeleteRecord() : undefined}
        onOpenFile={openPrivateFile}
        onRemoveFile={editingRecord
          ? async (file) => {
              await recordsController.removeRecordFile(editingRecord.id, file.id);
            }
          : undefined}
      />
    </>
  );

  if (connected && loading && !loaded) {
    return (
      <View style={[styles.screen, styles.stableSystemState]}>
        <Text style={styles.stableSystemEyebrow}>HORSE</Text>
        <Text style={styles.stableSystemTitle}>Loading your records...</Text>
        <Text style={styles.stableSystemBody}>Private horse data is being restored from Equina.</Text>
      </View>
    );
  }

  if (!resolvedHasHorse) {
    return (
      <>
        <View style={[styles.screen, styles.stableEmptyScreen]}>
          <View style={styles.stableEmptyHero}>
            <Image source={{ uri: disciplineVisuals[discipline].home }} style={styles.stableEmptyImage} />
            <LinearGradient
              colors={["rgba(5,6,5,0.08)", "rgba(5,6,5,0.20)", "rgba(5,6,5,0.94)"]}
              locations={[0, 0.38, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.stableEmptyTopline}>
              <Text style={styles.stableEmptyEyebrow}>YOUR RIDING</Text>
              <Text style={styles.stableEmptyMeta}>{discipline}</Text>
            </View>
            <View style={styles.stableEmptyCopy}>
              <Text style={styles.stableEmptyTitle}>No horse profile yet.</Text>
              <Text style={styles.stableEmptyBody}>
                Add a horse you manage to keep its care history and private documents together.
              </Text>
            </View>
          </View>
          {connected && error ? (
            <View style={styles.stableConnectionState}>
              <Text accessibilityRole="alert" style={styles.stableConnectionText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void recordsController.refresh()}>
                <Text style={styles.stableConnectionAction}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.stableEmptyNote}>
            <Text style={styles.stableEmptyNoteTitle}>
              {connected ? "Start with one profile." : "Nothing is missing."}
            </Text>
            <Text style={styles.stableEmptyNoteBody}>
              {connected
                ? "Records and private uploads will stay linked to this horse across devices."
                : "Records become available with a connected account."}
            </Text>
            {connected && canManageHorse ? (
              <MotionPressable
                testID="stable-add-horse"
                accessibilityRole="button"
                accessibilityLabel="Add a horse"
                style={styles.stablePrimaryAction}
                onPress={openHorseEditor}
              >
                <Text style={styles.stablePrimaryActionText}>Add a horse</Text>
                <Plus size={18} color={equinaTheme.colors.ink} />
              </MotionPressable>
            ) : null}
          </View>
        </View>
        {recordSheets}
      </>
    );
  }

  return (
    <>
      <View style={styles.screen}>
        {connected && (offline || error) ? (
          <View style={styles.stableConnectionState}>
            <Text accessibilityRole="alert" numberOfLines={2} style={styles.stableConnectionText}>
              {offline ? "Offline. Saved records stay visible; changes wait for a connection." : error}
            </Text>
            {!offline ? (
              <Pressable accessibilityRole="button" onPress={() => void recordsController.refresh()}>
                <Text style={styles.stableConnectionAction}>{refreshing ? "Refreshing..." : "Retry"}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {connected && horses.length > 1 ? (
          <ScrollView
            horizontal
            style={styles.stableHorseSwitcher}
            contentContainerStyle={styles.stableHorseSwitcherContent}
            showsHorizontalScrollIndicator={false}
          >
            {horses.map((horseOption) => (
              <Pressable
                key={horseOption.id}
                testID={`stable-horse-${horseOption.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: horseOption.id === selectedHorse?.id }}
                style={[
                  styles.stableHorseOption,
                  horseOption.id === selectedHorse?.id && styles.stableHorseOptionActive
                ]}
                onPress={() => recordsController.selectHorse(horseOption.id)}
              >
                <Text style={[
                  styles.stableHorseOptionText,
                  horseOption.id === selectedHorse?.id && styles.stableHorseOptionTextActive
                ]}>{horseOption.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.stableProfileHeader}>
          <View style={styles.stablePortraitWrap}>
            <Image source={{ uri: resolvedPhoto || equinaImages.stable }} style={styles.stablePortrait} />
            <View style={styles.stablePortraitMark}>
              <HeartPulse size={13} color={equinaTheme.colors.ivory} />
            </View>
          </View>
          <View style={styles.stableProfileCopy}>
            <Text style={styles.stableKicker}>{resolvedDiscipline} horse</Text>
            <Text style={styles.stableTitle}>{resolvedName}</Text>
            <Text style={styles.stableMeta}>
              {[resolvedBreed, resolvedSex, resolvedAge ? `${resolvedAge} years` : "", resolvedHeight ? `${resolvedHeight} cm` : ""]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          {connected && canManageHorse ? (
            <EquinaIconButton
              Icon={Ellipsis}
              testID="stable-manage-horse"
              label={`Manage ${resolvedName}`}
              tone="glass"
              onPress={openHorseEditor}
            />
          ) : null}
        </View>

        <EquinaSegmentedTabs<StableView>
          testIDPrefix="stable-view"
          value={view}
          onChange={openView}
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "care", label: "Care" },
            ...(nutritionAvailable ? [{ value: "nutrition" as const, label: "Nutrition" }] : []),
            { value: "docs", label: "Documents" }
          ]}
        />

        <Animated.View style={[styles.stableViewBody, viewMotion]}>
          {view === "overview" && (
            <>
              {lastRide && (
                <View testID="stable-latest-ride" style={styles.stableLatestRide}>
                  <View style={styles.stableLatestRideIcon}>
                    <Clock3 size={20} color={equinaTheme.colors.brass} strokeWidth={1.9} />
                  </View>
                  <View style={styles.stableLatestRideCopy}>
                    <Text style={styles.stableLatestRideKicker}>Latest ride · {rideDurationLabel(lastRide.elapsedSeconds)}</Text>
                    <Text style={styles.stableLatestRideTitle}>{lastRide.focus}</Text>
                    <Text style={styles.stableLatestRideBody}>{lastRide.discipline} · {lastRide.mood.toLowerCase()} · {lastRide.completedPhases}/{lastRide.totalPhases} phases</Text>
                  </View>
                </View>
              )}

              <View style={styles.stableNextCare}>
                <View style={styles.stableNextCareIcon}>
                  <CalendarCheck size={21} color={equinaTheme.colors.brass} strokeWidth={1.9} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stableNextCareKicker}>Next care</Text>
                  <Text style={styles.stableNextCareTitle}>{dueRecord?.title ?? "No care due"}</Text>
                  <Text style={styles.stableNextCareBody}>
                    {dueRecord?.dueOn ? `Due ${dueRecord.dueOn}` : "Add due dates to records to keep this briefing useful."}
                  </Text>
                </View>
              </View>

              <View style={styles.documentStack}>
                <DocumentRow
                  Icon={Stethoscope}
                  title="Care"
                  body={careSchedule.length
                    ? `${careSchedule.length} tracked · ${healthRecords.length} health ${healthRecords.length === 1 ? "record" : "records"}`
                    : healthRecords.length
                      ? `${healthRecords.length} health ${healthRecords.length === 1 ? "record" : "records"}`
                      : "Farrier, vaccinations, vet and dental"}
                  status=""
                  onPress={() => openView("care")}
                />
                <DocumentRow
                  Icon={FileText}
                  title="Documents"
                  body={savedRecordCount ? `${savedRecordCount} private ${savedRecordCount === 1 ? "record" : "records"}` : "Passport, vet notes and lab results"}
                  status=""
                  last
                  onPress={() => openView("docs")}
                />
              </View>

              {records.length > 0 ? (
                <>
                  <SectionTitle title="Recent" action="private timeline" />
                  <View style={styles.documentStack}>
                    {records.slice(0, 4).map((record, index, recent) => {
                      const attachmentCount = filesByRecord[record.id]?.length ?? 0;
                      return (
                        <DocumentRow
                          key={record.id}
                          Icon={record.recordType === "lab" ? Activity : record.recordType === "passport" ? FileText : Stethoscope}
                          title={record.title}
                          body={`${record.occurredOn}${record.providerName ? ` · ${record.providerName}` : ""}${attachmentCount ? ` · ${attachmentCount} private file` : ""}`}
                          status={record.status}
                          last={index === recent.length - 1}
                          onPress={() => openRecordEditor(record.recordType, record)}
                        />
                      );
                    })}
                  </View>
                </>
              ) : null}
            </>
          )}

          {view === "care" && (
            <>
              {careSchedule.length === 0 && healthRecords.length === 0 ? (
                <View style={styles.stableCareEmpty}>
                  <Text style={styles.stableCareEmptyTitle}>Nothing tracked yet</Text>
                  <Text style={styles.stableCareEmptyBody}>
                    Farrier, vaccination, dental and vet records appear here, and the next visit is scheduled from the day the last one happened.
                  </Text>
                  {canMutateRecords ? (
                    <MotionPressable
                      testID="stable-add-care"
                      accessibilityRole="button"
                      accessibilityLabel="Add a care record"
                      style={styles.stablePrimaryAction}
                      onPress={() => openRecordEditor("farrier")}
                    >
                      <Text style={styles.stablePrimaryActionText}>Add a care record</Text>
                      <Plus size={18} color={equinaTheme.colors.ink} />
                    </MotionPressable>
                  ) : null}
                </View>
              ) : (
                <>
                  {careSchedule.length > 0 ? (
                    <>
                      <SectionTitle title="Coming up" action={`${careSchedule.length} tracked`} />
                      <CareSchedule
                        schedule={careSchedule}
                        horseNames={horseNames}
                        showHorse={horses.length > 1}
                        onLogDone={canMutateRecords ? (item) => void logCareDone(item) : undefined}
                        onAddDueDate={canMutateRecords ? () => openRecordEditor("farrier") : undefined}
                        busy={Boolean(saving)}
                      />
                    </>
                  ) : null}

                  <SectionTitle title="Health records" action={`${healthRecords.length}`} />
                  <View style={styles.documentStack}>
                    {healthRecords.map((record, index) => (
                      <DocumentRow
                        key={record.id}
                        Icon={record.recordType === "lab" ? Activity : record.recordType === "care" ? HeartPulse : Stethoscope}
                        title={record.title}
                        body={`${record.occurredOn}${record.notes ? ` · ${record.notes}` : ""}`}
                        status={record.status}
                        last={index === healthRecords.length - 1 && !canMutateRecords}
                        onPress={() => openRecordEditor(record.recordType, record)}
                      />
                    ))}
                    {canMutateRecords ? (
                      <DocumentRow
                        Icon={Plus}
                        title="Add a health record"
                        body="Vet check, lab result, vaccination, dental or farrier"
                        status="Add"
                        last
                        onPress={() => openRecordEditor("vet")}
                      />
                    ) : null}
                  </View>
                </>
              )}

              {onOpenRalf ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.stableCoachLink}
                  onPress={() => onOpenRalf(`Help me write down a health observation about ${resolvedName}`)}
                >
                  <Sparkles size={17} color={equinaTheme.colors.brass} />
                  <Text style={styles.stableCoachLinkText}>Ask {equinaCoach.name} how to write down an observation</Text>
                  <ChevronRight size={16} color={equinaTheme.text.tertiary} />
                </Pressable>
              ) : null}
            </>
          )}

          {view === "nutrition" && (
            <>
              <View style={styles.nutritionBrief}>
                <View style={styles.nutritionBriefTop}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nutritionEyebrow}>
                      <Wheat size={14} color={equinaTheme.colors.brass} />
                      <Text style={styles.nutritionEyebrowText}>TODAY'S PLAN</Text>
                    </View>
                    <Text style={styles.nutritionBriefTitle}>{resolvedName}'s sample stable plan.</Text>
                    <Text style={styles.nutritionBriefBody}>Demo ration for previewing logs, not a feeding recommendation.</Text>
                  </View>
                </View>

                <View style={styles.nutritionDivider} />

                <View style={styles.nutritionHydrationTop}>
                  <View style={styles.nutritionHydrationLabel}>
                    <Droplets size={17} color={equinaTheme.colors.brass} />
                    <View>
                      <Text style={styles.nutritionHydrationTitle}>Hydration</Text>
                      <Text style={styles.nutritionHydrationBody}>{waterLiters} of {waterGoal} L logged</Text>
                    </View>
                  </View>
                  <Pressable
                    testID="stable-nutrition-water"
                    accessibilityRole="button"
                    accessibilityLabel={hydrationComplete ? "Hydration goal met" : "Log four liters of water"}
                    disabled={hydrationComplete}
                    style={({ pressed }) => [
                      styles.nutritionWaterButton,
                      hydrationComplete && styles.nutritionWaterButtonComplete,
                      pressed && styles.pressed
                    ]}
                    onPress={logWater}
                  >
                    {hydrationComplete ? <Check size={14} color={nightTheme.text} /> : <Plus size={14} color={nightTheme.frame} />}
                    <Text style={[styles.nutritionWaterButtonText, hydrationComplete && styles.nutritionWaterButtonTextComplete]}>
                      {hydrationComplete ? "Goal met" : "4 L"}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.nutritionHydrationTrack}>
                  <View style={[styles.nutritionHydrationFill, { width: `${hydrationProgress}%` }]} />
                </View>

                <View style={styles.nutritionBaseline}>
                  <Scale size={16} color={nightTheme.muted} />
                  <Text style={styles.nutritionBaselineTitle}>Body condition 5/9</Text>
                  <Text style={styles.nutritionBaselineMeta}>Source · demo stable plan</Text>
                </View>
              </View>

              <SectionTitle title="Today's feed" action={`${completedMeals.length} of ${stableNutritionMeals.length} logged`} />
              <View style={styles.nutritionMealList}>
                {stableNutritionMeals.map((meal, index) => (
                  <NutritionMealRow
                    key={meal.id}
                    meal={meal}
                    complete={completedMeals.includes(meal.id)}
                    last={index === stableNutritionMeals.length - 1}
                    onPress={() => toggleMeal(meal.id)}
                  />
                ))}
              </View>

              <View style={styles.nutritionWorkloadNote}>
                <Activity size={18} color={equinaTheme.colors.brass} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.nutritionWorkloadTitle}>After today's ride</Text>
                  <Text style={styles.nutritionWorkloadBody}>If {resolvedName} sweats, log water first and follow the electrolyte amount already agreed with your vet or nutritionist.</Text>
                </View>
              </View>

              <SectionTitle title="Daily support" action="demo stable plan" />
              <View style={styles.nutritionSupportList}>
                <NutritionSupportRow Icon={Wheat} title="Mineral balancer" body="With morning forage" status="Daily" />
                <NutritionSupportRow Icon={Droplets} title="Electrolytes" body="Only after sweaty work" status="As needed" last />
              </View>

              <View style={styles.nutritionSafetyNote}>
                <Info size={15} color={nightTheme.faint} />
                <Text style={styles.nutritionSafetyText}>Review feed changes with your vet or equine nutritionist and transition gradually.</Text>
              </View>
            </>
          )}

          {view === "docs" && (
            <>
              <View style={styles.stableDocsIntro}>
                <View style={styles.stableDocsIcon}>
                  <FileText size={20} color={equinaTheme.colors.brass} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stableDocsTitle}>Documents</Text>
                  <Text style={styles.stableDocsBody}>
                    {savedRecordCount
                      ? `${savedRecordCount} private ${savedRecordCount === 1 ? "record" : "records"} for care, travel, and review.`
                      : "Private records for care, travel, and review."}
                  </Text>
                </View>
                {canMutateRecords ? (
                  <EquinaIconButton
                    Icon={Plus}
                    testID="stable-add-record"
                    label="Add record"
                    tone="glass"
                    onPress={() => openRecordEditor("note")}
                  />
                ) : null}
              </View>

              <View style={styles.documentStack}>
                {records.map((record, index) => {
                  const attachmentCount = filesByRecord[record.id]?.length ?? 0;
                  return (
                    <DocumentRow
                      key={record.id}
                      Icon={record.recordType === "lab" ? Activity : record.recordType === "passport" ? FileText : HeartPulse}
                      title={record.title}
                      body={`${record.occurredOn}${attachmentCount ? ` · ${attachmentCount} private attachment${attachmentCount === 1 ? "" : "s"}` : " · no attachment"}`}
                      status={record.status}
                      last={index === records.length - 1}
                      onPress={() => openRecordEditor(record.recordType, record)}
                    />
                  );
                })}
                {records.length === 0 ? (
                  <DocumentRow
                    Icon={FileText}
                    title="No documents yet"
                    body={canMutateRecords
                      ? "Add a passport, vet note, lab result or care record."
                      : "Passports, vet notes and lab results you save will appear here."}
                    status={canMutateRecords ? "Add" : ""}
                    last
                    disabled={!canMutateRecords}
                    onPress={() => openRecordEditor("passport")}
                  />
                ) : null}
              </View>
            </>
          )}
        </Animated.View>
      </View>
      {recordSheets}
    </>
  );
}

function NutritionMealRow({
  meal,
  complete,
  last,
  onPress
}: {
  meal: (typeof stableNutritionMeals)[number];
  complete: boolean;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`stable-nutrition-meal-${meal.id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: complete }}
      accessibilityLabel={`${meal.title}, ${meal.time}, ${meal.amount}`}
      style={({ pressed }) => [
        styles.nutritionMealRow,
        !last && styles.nutritionMealRowBorder,
        pressed && styles.nutritionMealRowPressed
      ]}
      onPress={onPress}
    >
      <View style={[styles.nutritionMealCheck, complete && styles.nutritionMealCheckComplete]}>
        {complete ? <Check size={15} color={nightTheme.frame} /> : <View style={styles.nutritionMealCheckDot} />}
      </View>
      <View style={styles.nutritionMealCopy}>
        <Text style={styles.nutritionMealTitle}>{meal.title}</Text>
        <Text style={styles.nutritionMealBody}>{meal.body}</Text>
      </View>
      <View style={styles.nutritionMealMeta}>
        <Text style={styles.nutritionMealAmount}>{meal.amount}</Text>
        <Text style={styles.nutritionMealTime}>{meal.time}</Text>
      </View>
    </Pressable>
  );
}

function NutritionSupportRow({
  Icon,
  title,
  body,
  status,
  last = false
}: {
  Icon: typeof Store;
  title: string;
  body: string;
  status: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.nutritionSupportRow, !last && styles.nutritionSupportRowBorder]}>
      <Icon size={17} color={equinaTheme.colors.brass} />
      <View style={{ flex: 1 }}>
        <Text style={styles.nutritionSupportTitle}>{title}</Text>
        <Text style={styles.nutritionSupportBody}>{body}</Text>
      </View>
      <Text style={styles.nutritionSupportStatus}>{status}</Text>
    </View>
  );
}

function StableMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stableMetric}>
      <Text numberOfLines={1} style={styles.stableMetricValue}>{value}</Text>
      <Text style={styles.stableMetricLabel}>{label}</Text>
    </View>
  );
}

function AcademyScreen({
  horse,
  rider,
  academy,
  coachGoal,
  lessons,
  catalogReady,
  playbackLink,
  onLessonProgress,
  onLessonComplete,
  onAcademyModeChange,
  onAcademyLessonOpen,
  onOpenRalf,
  plan,
  onPickLesson,
  onSeePlans,
  onPlanStale
}: {
  horse: HorseState;
  rider: RiderContext;
  academy: AcademyState;
  coachGoal: string;
  lessons: AcademyLessonView[];
  /** False only while a connected account's catalogue is still loading. */
  catalogReady: boolean;
  playbackLink: (lessonId: string) => Promise<AcademyPlaybackLink>;
  onLessonProgress: (lessonId: string, positionSeconds: number, completed: boolean) => void;
  onLessonComplete: (lessonId: string, positionSeconds: number) => void;
  onAcademyModeChange: (mode: AcademyMode) => void;
  onAcademyLessonOpen: (lessonId: string) => void;
  /** Absent while Ralf is switched off for this account. */
  onOpenRalf?: (prompt?: string) => void;
  /** Which paid lessons this rider's plan opens; everything, until plans are enforced. */
  plan: PlanState;
  /** Spends a pick on a paid lesson; answers whether it is now open. */
  onPickLesson: (lessonId: string) => Promise<boolean>;
  onSeePlans: () => void;
  /** The server and the app disagree about a lesson: ask for the plan again. */
  onPlanStale: () => void;
}) {
  const reduceAcademyMotion = useReducedMotion();
  // Preview lessons are the demo's own and always open.
  const locked = (lesson: AcademyLessonView) => lesson.video === "live" && !lessonOpen(plan, lesson);
  const academyMotion = useRef(new Animated.Value(1)).current;
  const guidance = levelGuidance[rider.level];
  const academyFocus = horse.lastRide?.mood === "Tender" ? "Recovery" : coachGoal;
  const learningPath = useMemo(
    () => academyPathFor(lessons, rider, academyFocus),
    [academyFocus, lessons, rider.discipline, rider.goal, rider.level]
  );
  const currentLesson = learningPath[0];
  const laterLessons = learningPath.slice(1);
  const selectedLesson = lessons.find((lesson) => lesson.id === academy.selectedLessonId) ?? currentLesson;
  // No published lesson is a normal state, not a broken one. While the
  // catalogue is still loading, nothing is shown rather than a lesson that
  // may not exist.
  const catalogEmpty = catalogReady && lessons.length === 0;
  const catalogPending = !catalogReady && lessons.length === 0;
  const rideLabel = `${horse.sessionCount} ${horse.sessionCount === 1 ? "ride" : "rides"}`;
  const recommendationReason = horse.sessionCount > 0
    ? `After ${rideLabel}, your next focus is ${academyFocus.toLowerCase()}. Use this lesson before your next session.`
    : `Start with ${academyFocus.toLowerCase()}. This lesson gives you one clear idea for your first session.`;
  const lessonQuestion = (lesson: AcademyLessonView) =>
    `Explain how ${lesson.title} should shape ${horse.hasHorse ? `${horse.name}'s` : "my"} next ride`;

  useEffect(() => {
    if (reduceAcademyMotion) {
      academyMotion.setValue(1);
      return;
    }
    academyMotion.setValue(0);
    Animated.timing(academyMotion, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [academy.mode, academyMotion, reduceAcademyMotion]);

  const openLesson = (lesson: AcademyLessonView) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onAcademyLessonOpen(lesson.id);
  };

  const motionStyle = [
    styles.academyModeContent,
    { opacity: academyMotion },
    Platform.OS !== "web" && !reduceAcademyMotion && {
      transform: [
        {
          translateY: academyMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [6, 0]
          })
        }
      ]
    }
  ];

  if (catalogPending) {
    return (
      <View testID="academy-loading" style={styles.academyCatalogLoading}>
        <ActivityIndicator color={nightTheme.muted} />
      </View>
    );
  }

  if (academy.mode === "video" && selectedLesson) {
    return (
      <Animated.View style={motionStyle}>
        <AcademyVideoPage
          lessons={lessons}
          lesson={selectedLesson}
          progress={academy.progress}
          rider={rider}
          focus={academyFocus}
          playbackLink={playbackLink}
          onProgress={onLessonProgress}
          onBack={() => onAcademyModeChange("home")}
          onComplete={onLessonComplete}
          onOpenLesson={openLesson}
          onOpenGuide={onOpenRalf ? () => onOpenRalf(lessonQuestion(selectedLesson)) : undefined}
          locked={locked(selectedLesson)}
          picksLeft={picksLeft(plan)}
          picksLimit={plan.academy.picksLimit}
          upgradeName={planFor(plan, "lessons")?.name}
          onPick={() => onPickLesson(selectedLesson.id)}
          onSeePlans={onSeePlans}
          onPlanStale={onPlanStale}
        />
      </Animated.View>
    );
  }

  if (catalogEmpty || !currentLesson) {
    return (
      <View testID="academy-empty" style={styles.academyEmptyCatalog}>
        <Text style={styles.academyPersonalTitle}>The first lessons are on their way.</Text>
        <Text style={styles.academyPersonalBody}>
          Lessons from Equina coaches appear here as soon as they are published.
          {onOpenRalf ? " Until then, Ralf can plan your next ride." : ""}
        </Text>
        {onOpenRalf ? (
          <MotionPressable
            testID="academy-empty-ralf"
            accessibilityRole="button"
            accessibilityLabel={`Ask ${equinaCoach.name} to plan your next ride`}
            style={styles.academyEmptyAction}
            onPress={() => onOpenRalf(levelGuidance[rider.level].quickPlan)}
          >
            <Sparkles size={17} color={equinaTheme.colors.ink} />
            <Text style={styles.academyEmptyActionText}>Plan my next ride with Ralf</Text>
          </MotionPressable>
        ) : null}
      </View>
    );
  }

  return (
    <Animated.View style={motionStyle}>
      <View style={styles.personalAcademyHome}>
        <View style={styles.academyPersonalIntro}>
          <Text style={styles.academyPersonalEyebrow}>
            {horse.hasHorse ? `${rider.name} + ${horse.name}` : rider.name} · {rider.level} {rider.discipline.toLowerCase()}
          </Text>
          <Text style={styles.academyPersonalTitle}>{guidance.headline}</Text>
          <Text style={styles.academyPersonalBody}>{recommendationReason}</Text>
        </View>

        <Pressable
          testID="academy-open-recommended"
          accessibilityRole="button"
          accessibilityLabel={`Open lesson ${currentLesson.title}${locked(currentLesson) ? ", part of a plan" : ""}`}
          style={({ pressed }) => [styles.academyRecommendation, pressed && styles.pressed]}
          onPress={() => openLesson(currentLesson)}
        >
          <Image source={{ uri: currentLesson.image }} style={styles.academyRecommendationImage} resizeMode="cover" />
          <LinearGradient
            colors={["rgba(8,7,6,0.30)", "rgba(8,7,6,0.90)"]}
            locations={[0.15, 1]}
            style={styles.academyRecommendationScrim}
          />
          <View style={styles.academyRecommendationTop}>
            <Text style={styles.academyRecommendationKicker}>
              {academy.progress > 0 ? "Continue learning" : "Start here"}
            </Text>
            {currentLesson.duration ? (
              <Text style={styles.academyRecommendationDuration}>{currentLesson.duration}</Text>
            ) : null}
          </View>
          <View style={styles.academyRecommendationContent}>
            <Text style={styles.academyRecommendationReason}>Lesson 1 of {learningPath.length} · {academyFocus}</Text>
            <Text style={styles.academyRecommendationTitle}>{currentLesson.title}</Text>
            <View style={styles.academyRecommendationFooter}>
              <Text style={styles.academyRecommendationCoach}>{currentLesson.coach}</Text>
              <View style={styles.academyRecommendationPlay}>
                {locked(currentLesson)
                  ? <LockKeyhole size={16} color={equinaTheme.colors.ink} strokeWidth={2} />
                  : <Play size={16} color={equinaTheme.colors.ink} fill={equinaTheme.colors.ink} strokeWidth={1.8} />}
              </View>
            </View>
          </View>
        </Pressable>

        <View style={styles.academyPathSection}>
          <View style={styles.academyPathSectionHeader}>
            <View style={styles.academyPathSectionCopy}>
              <Text style={styles.academyPathSectionTitle}>Your path</Text>
              <Text style={styles.academyPathSectionMeta}>
                {learningPath.length} {learningPath.length === 1 ? "lesson" : "lessons"} for your level · {academy.progress}% done
              </Text>
            </View>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Path progress"
            accessibilityValue={{ min: 0, max: 100, now: academy.progress }}
            style={styles.academyPathTrack}
          >
            <View style={[styles.academyPathFill, { width: `${academy.progress}%` }]} />
          </View>
          {laterLessons.length > 0 ? (
            <View style={styles.academyPathList}>
              {laterLessons.map((lesson, index) => (
                <Pressable
                  key={lesson.id}
                  testID={`academy-path-lesson-${index + 2}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open lesson ${index + 2} of ${learningPath.length}, ${lesson.title}${locked(lesson) ? ", part of a plan" : ""}`}
                  style={({ pressed }) => [styles.academyPathRow, pressed && styles.pressed]}
                  onPress={() => openLesson(lesson)}
                >
                  <Text style={styles.academyPathIndex}>{String(index + 2).padStart(2, "0")}</Text>
                  <View style={styles.academyPathRowCopy}>
                    <Text numberOfLines={1} style={styles.academyPathRowTitle}>{lesson.title}</Text>
                    <Text style={styles.academyPathRowMeta}>{metaLine(lesson.coach, lesson.duration)}</Text>
                  </View>
                  {locked(lesson)
                    ? <LockKeyhole size={15} color={nightTheme.faint} />
                    : <ChevronRight size={16} color={nightTheme.faint} />}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {onOpenRalf ? (
          <Pressable
            testID="academy-open-ai"
            accessibilityRole="button"
            accessibilityLabel={`Ask ${equinaCoach.name} about ${currentLesson.title}`}
            style={({ pressed }) => [styles.academyPersonalAction, pressed && styles.pressed]}
            onPress={() => onOpenRalf(lessonQuestion(currentLesson))}
          >
            <Sparkles size={18} color={equinaTheme.colors.brass} />
            <View style={styles.academyPersonalActionCopy}>
              <Text style={styles.academyPersonalActionTitle}>Ask {equinaCoach.name} about {currentLesson.title}</Text>
              <Text numberOfLines={1} style={styles.academyPersonalActionBody}>
                Apply it to {horse.hasHorse ? `${horse.name}'s` : "your"} next ride
              </Text>
            </View>
            <ChevronRight size={16} color={nightTheme.faint} />
          </Pressable>
        ) : null}

        <AcademyLessonList lessons={lessons} rider={rider} focus={academyFocus} locked={locked} onOpenLesson={openLesson} />
      </View>
    </Animated.View>
  );
}

function AcademyPathCard({
  path,
  active
}: {
  path: (typeof academyPaths)[number];
  active: boolean;
}) {
  return (
    <View style={[styles.academyPathCard, active && styles.academyPathCardActive]}>
      <View style={styles.academyPathCardTop}>
        <View style={[styles.academyPathAccent, { backgroundColor: path.accent }]} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.academyPathTitle}>{path.title}</Text>
          <Text numberOfLines={1} style={styles.academyPathBody}>{path.body}</Text>
        </View>
        <View style={styles.academyPathFooter}>
          <Text style={styles.academyPathMeta}>{path.lessons}</Text>
          <Text style={styles.academyPathPercent}>{path.progress}%</Text>
        </View>
      </View>
      <View style={styles.academyPathMiniTrack}>
        <View style={[styles.academyPathMiniFill, { width: `${path.progress}%`, backgroundColor: path.accent }]} />
      </View>
    </View>
  );
}

// Every published lesson, searchable. The page above already features the
// rider's next lesson, so nothing here is featured again.
function AcademyLessonList({
  lessons,
  rider,
  focus,
  locked,
  onOpenLesson
}: {
  lessons: AcademyLessonView[];
  rider: RiderContext;
  focus: string;
  locked: (lesson: AcademyLessonView) => boolean;
  onOpenLesson: (lesson: AcademyLessonView) => void;
}) {
  const [topic, setTopic] = useState<AcademyTopic>("All");
  const [query, setQuery] = useState("");
  const rankedLessons = useMemo(
    () => personalizedLessons(lessons, rider, focus),
    [focus, lessons, rider.discipline, rider.goal, rider.level]
  );
  const visibleLessons = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase();
      return rankedLessons.filter((lesson) => {
        const matchesTopic = topic === "All" || lesson.topic === topic;
        const searchable = `${lesson.title} ${lesson.coach} ${lesson.summary} ${lesson.level} ${lesson.topic}`.toLowerCase();
        return matchesTopic && (!normalizedQuery || searchable.includes(normalizedQuery));
      });
    },
    [query, rankedLessons, topic]
  );

  return (
    <View style={styles.academyDirectoryScreen}>
      <View style={styles.academyDirectoryHeader}>
        <Text style={styles.academyPathSectionTitle}>All lessons</Text>
        <Text style={styles.academyDirectoryCountText}>
          {visibleLessons.length} of {lessons.length}
        </Text>
      </View>

      <View style={styles.academySearchShell}>
        <Search size={17} color={equinaTheme.text.tertiary} />
        <TextInput
          testID="academy-search-input"
          accessibilityLabel="Search lessons and coaches"
          value={query}
          onChangeText={setQuery}
          placeholder="Search lessons and coaches"
          placeholderTextColor={equinaTheme.text.tertiary}
          returnKeyType="search"
          style={[styles.academySearchInput, webTextInputReset]}
        />
        {query.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear lesson search"
            hitSlop={8}
            style={({ pressed }) => [styles.academySearchClear, pressed && styles.pressed]}
            onPress={() => setQuery("")}
          >
            <X size={15} color={nightTheme.muted} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.academyTopicRow}>
        {academyTopics.map((item) => (
          <Pressable
            key={item}
            testID={`academy-topic-${item.toLowerCase()}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: topic === item }}
            style={({ pressed }) => [styles.academyTopicChip, topic === item && styles.academyTopicChipActive, pressed && styles.pressed]}
            onPress={() => setTopic(item)}
          >
            <Text style={[styles.academyTopicText, topic === item && styles.academyTopicTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {visibleLessons.length > 0 ? (
        <View style={styles.academyLessonStack}>
          {visibleLessons.map((lesson) => (
            <AcademyLessonCard
              key={lesson.id}
              lesson={lesson}
              featured={false}
              locked={locked(lesson)}
              onPress={() => onOpenLesson(lesson)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.academyEmptyState}>
          <Search size={20} color={nightTheme.faint} />
          <Text style={styles.academyEmptyTitle}>No lesson found</Text>
          <Text style={styles.academyEmptyBody}>Try another coach, topic, or level.</Text>
        </View>
      )}
    </View>
  );
}

function AcademyVideoPage({
  lessons,
  lesson,
  progress,
  rider,
  focus,
  playbackLink,
  onProgress,
  onBack,
  onComplete,
  onOpenLesson,
  onOpenGuide,
  locked,
  picksLeft: picksRemaining,
  picksLimit,
  upgradeName,
  onPick,
  onSeePlans,
  onPlanStale
}: {
  lessons: AcademyLessonView[];
  lesson: AcademyLessonView;
  progress: number;
  rider: RiderContext;
  focus: string;
  playbackLink: (lessonId: string) => Promise<AcademyPlaybackLink>;
  onProgress: (lessonId: string, positionSeconds: number, completed: boolean) => void;
  onBack: () => void;
  onComplete: (lessonId: string, positionSeconds: number) => void;
  onOpenLesson: (lesson: AcademyLessonView) => void;
  /** Absent while Ralf is switched off for this account. */
  onOpenGuide?: () => void;
  /** A paid lesson the rider's plan does not open yet. */
  locked: boolean;
  /** Picks the rider can still make; null on a plan that opens every lesson. */
  picksLeft: number | null;
  picksLimit: number | null;
  /** The plan that opens more lessons, if there is one above the rider's. */
  upgradeName?: string;
  onPick: () => Promise<boolean>;
  onSeePlans: () => void;
  onPlanStale: () => void;
}) {
  const [videoReady, setVideoReady] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  // A pick is permanent, so it takes a second tap that says so.
  const [confirmingPick, setConfirmingPick] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState("");
  const video = useLessonVideo({ lesson, locked, previewSource: academyDemoVideo, playbackLink, onProgress });
  const canPick = (picksRemaining ?? 0) > 0;
  const allowance = picksLimit ?? 0;
  const lessonsWord = (count: number) => (count === 1 ? "lesson" : "lessons");
  const picksWord = (count: number) => (count === 1 ? "pick" : "picks");

  useEffect(() => {
    setConfirmingPick(false);
    setPickError("");
  }, [lesson.id]);

  // The app thought this lesson was open and the server disagreed: the plan
  // it holds is stale (a downgrade, or plans just switched on).
  const lockedByServer = video.state.phase === "error" && video.state.code === "lesson_locked";
  useEffect(() => {
    if (lockedByServer) onPlanStale();
  }, [lockedByServer]);

  const pick = async () => {
    setPicking(true);
    setPickError("");
    try {
      await onPick();
      setConfirmingPick(false);
    } catch (cause) {
      const code = cause && typeof cause === "object" ? (cause as { code?: unknown }).code : undefined;
      setPickError(code === noPicksLeft
        ? "You have already used every pick your plan includes."
        : "This lesson could not be added. Try again.");
      if (code === noPicksLeft) onPlanStale();
    } finally {
      setPicking(false);
    }
  };
  const videoPlayer = video.player;
  const videoPhase = video.state.phase;
  const learningPath = academyPathFor(lessons, rider, focus);
  const pathPosition = learningPath.findIndex((item) => item.id === lesson.id);
  const lessonPosition = Math.max(0, pathPosition);
  const nextLesson = pathPosition >= 0 ? learningPath[pathPosition + 1] : undefined;

  useEffect(() => {
    setVideoStarted(false);
    setVideoReady(false);
  }, [lesson.id]);

  // A tap on play before the signed link arrives is remembered, and playback
  // starts the moment the video can.
  useEffect(() => {
    if (videoStarted && videoPhase === "ready") videoPlayer.play();
  }, [videoPhase, videoPlayer, videoStarted]);

  // A chapter starts playback at its mark. A mark past the end of what the
  // player holds (the short preview clip) just starts the video.
  const playChapter = (seconds: number) => {
    void Haptics.selectionAsync().catch(() => undefined);
    const length = videoPlayer.duration;
    if (!length || seconds < length) videoPlayer.currentTime = seconds;
    setVideoStarted(true);
    if (videoPhase === "ready") videoPlayer.play();
  };

  return (
    <View style={styles.academyVideoPage}>
      <View style={styles.academyVideoTopRow}>
        <Pressable
          testID="academy-video-back"
          accessibilityRole="button"
          accessibilityLabel="Back to Academy"
          style={({ pressed }) => [styles.academyBackButton, pressed && styles.pressed]}
          onPress={onBack}
        >
          <ChevronLeft size={17} color={nightTheme.text} />
          <Text style={styles.academyBackText}>Academy</Text>
        </Pressable>
        <Text style={styles.academyVideoPosition}>{pathPosition >= 0 ? `Lesson ${lessonPosition + 1} of ${learningPath.length}` : "Outside your path"}</Text>
      </View>

      <View style={styles.academyVideoFrame}>
        <VideoView
          accessible
          accessibilityLabel={`Video lesson ${lesson.title}`}
          player={videoPlayer}
          nativeControls={videoStarted && videoPhase === "ready"}
          playsInline
          contentFit="cover"
          style={styles.academyVideoImage}
          onFirstFrameRender={() => setVideoReady(true)}
        />
        {(locked || !videoStarted || !videoReady || videoPhase !== "ready") && (
          <Image source={{ uri: lesson.image }} style={styles.academyVideoPoster} resizeMode="cover" />
        )}
        {locked ? (
          <>
            <LinearGradient
              colors={["rgba(8,7,6,0.30)", "rgba(8,7,6,0.72)"]}
              style={styles.academyVideoScrim}
            />
            <View accessible accessibilityLabel="Locked lesson" style={styles.academyVideoCenter}>
              <View style={styles.academyVideoPlay}>
                <LockKeyhole size={22} color={equinaTheme.colors.ink} strokeWidth={2} />
              </View>
            </View>
          </>
        ) : video.state.phase === "error" ? (
          <>
            <LinearGradient
              colors={["rgba(8,7,6,0.40)", "rgba(8,7,6,0.82)"]}
              style={styles.academyVideoScrim}
            />
            <View testID="academy-video-error" style={styles.academyVideoMessage}>
              <Text style={styles.academyVideoMessageText}>{video.state.message}</Text>
              <Pressable
                testID="academy-video-retry"
                accessibilityRole="button"
                accessibilityLabel="Try loading the video again"
                style={({ pressed }) => [styles.academyVideoRetry, pressed && styles.pressed]}
                onPress={() => {
                  setVideoStarted(false);
                  video.retry();
                }}
              >
                <Text style={styles.academyVideoRetryText}>Try again</Text>
              </Pressable>
            </View>
          </>
        ) : !videoStarted ? (
          <>
            <LinearGradient
              colors={["rgba(8,7,6,0.10)", "rgba(8,7,6,0.48)"]}
              style={styles.academyVideoScrim}
            />
            {lesson.duration ? (
              <View style={styles.academyVideoDuration}>
                <Text style={styles.academyVideoDurationText}>{lesson.duration}</Text>
              </View>
            ) : null}
            <Pressable
              testID="academy-video-start"
              accessibilityRole="button"
              accessibilityLabel={`Play ${lesson.title}`}
              style={({ pressed }) => [styles.academyVideoCenter, pressed && styles.pressed]}
              onPress={() => setVideoStarted(true)}
            >
              <View style={styles.academyVideoPlay}>
                <Play size={22} color={equinaTheme.colors.ink} fill={equinaTheme.colors.ink} strokeWidth={1.8} />
              </View>
            </Pressable>
          </>
        ) : videoPhase === "loading" ? (
          <View testID="academy-video-loading" style={styles.academyVideoCenter}>
            <ActivityIndicator color={equinaTheme.colors.ivory} />
          </View>
        ) : null}
      </View>

      {locked ? (
        <View testID="academy-lesson-locked" style={styles.academyLockCard}>
          <Text style={styles.academyLockTitle}>
            {!canPick
              ? "You have used your lesson picks"
              : confirmingPick ? "Use one of your picks?" : "Choose this lesson to watch it"}
          </Text>
          <Text style={styles.academyLockBody}>
            {!canPick
              ? `Your plan includes ${allowance} paid ${lessonsWord(allowance)} of your choice.${upgradeName ? ` ${upgradeName} opens more.` : ""} Free lessons are always open.`
              : confirmingPick
                ? (picksRemaining ?? 1) - 1 === 0
                  ? "A pick can't be changed later, and this is your last one."
                  : `A pick can't be changed later. You will have ${(picksRemaining ?? 1) - 1} ${picksWord((picksRemaining ?? 1) - 1)} left.`
                : `Your plan includes ${allowance} paid ${lessonsWord(allowance)} of your choice, and ${picksRemaining} ${(picksRemaining ?? 0) === 1 ? "is" : "are"} left. Free lessons are always open.`}
          </Text>
          {pickError ? <Text accessibilityRole="alert" style={styles.academyLockError}>{pickError}</Text> : null}
          <View style={styles.academyLockActions}>
            {canPick && confirmingPick ? (
              <>
                <MotionPressable
                  testID="academy-pick-confirm"
                  accessibilityRole="button"
                  accessibilityLabel="Use a pick on this lesson"
                  accessibilityState={{ disabled: picking, busy: picking }}
                  disabled={picking}
                  style={styles.academyLockPrimary}
                  onPress={() => void pick()}
                >
                  {picking
                    ? <ActivityIndicator size="small" color={equinaTheme.colors.ink} />
                    : <Text style={styles.academyLockPrimaryText}>Use a pick</Text>}
                </MotionPressable>
                <Pressable
                  testID="academy-pick-cancel"
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.academyLockSecondary, pressed && styles.pressed]}
                  onPress={() => setConfirmingPick(false)}
                >
                  <Text style={styles.academyLockSecondaryText}>Not now</Text>
                </Pressable>
              </>
            ) : canPick ? (
              <>
                <MotionPressable
                  testID="academy-pick"
                  accessibilityRole="button"
                  style={styles.academyLockPrimary}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => undefined);
                    setConfirmingPick(true);
                  }}
                >
                  <Text style={styles.academyLockPrimaryText}>Choose this lesson</Text>
                </MotionPressable>
                <Pressable
                  testID="academy-lock-plans"
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.academyLockSecondary, pressed && styles.pressed]}
                  onPress={onSeePlans}
                >
                  <Text style={styles.academyLockSecondaryText}>See plans</Text>
                </Pressable>
              </>
            ) : (
              <MotionPressable
                testID="academy-lock-plans"
                accessibilityRole="button"
                style={styles.academyLockPrimary}
                onPress={onSeePlans}
              >
                <Text style={styles.academyLockPrimaryText}>See plans</Text>
              </MotionPressable>
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.academyVideoDetails}>
        <Text style={styles.academyVideoKicker}>{metaLine(lesson.level, lesson.topic, lesson.duration)}</Text>
        <Text style={styles.academyVideoTitle}>{lesson.title}</Text>
        <Text style={styles.academyVideoCoach}>{metaLine(lesson.coach, lesson.coachTitle)}</Text>
        <Text style={styles.academyVideoSummary}>{lesson.summary}</Text>

        {lesson.chapters.length > 0 ? (
          <View style={styles.academyChapterList}>
            <Text style={styles.academyChapterHeading}>Chapters</Text>
            {lesson.chapters.map((chapter, index) => (
              <AcademyChapterRow
                key={`${chapter.seconds}-${chapter.title}`}
                chapter={chapter}
                last={index === lesson.chapters.length - 1}
                disabled={locked}
                onPress={() => playChapter(chapter.seconds)}
              />
            ))}
          </View>
        ) : null}

        {pathPosition >= 0 ? (
          <View style={styles.academyVideoProgressBlock}>
            <View style={styles.academyVideoProgressTop}>
              <Text style={styles.academyVideoProgressLabel}>Your path</Text>
              <Text style={styles.academyVideoProgressValue}>{progress}% done</Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Path progress"
              accessibilityValue={{ min: 0, max: 100, now: progress }}
              style={styles.academyPathTrack}
            >
              <View style={[styles.academyPathFill, { width: `${progress}%` }]} />
            </View>
          </View>
        ) : null}

        {onOpenGuide ? (
          <Pressable
            testID="academy-video-guide"
            accessibilityRole="button"
            accessibilityLabel={`Ask ${equinaCoach.name} about ${lesson.title}`}
            style={({ pressed }) => [styles.academyVideoGuideAction, pressed && styles.pressed]}
            onPress={onOpenGuide}
          >
            <Sparkles size={17} color={equinaTheme.colors.brass} />
            <View style={styles.academyVideoGuideCopy}>
              <Text style={styles.academyVideoGuideTitle}>Ask {equinaCoach.name} about this lesson</Text>
              <Text numberOfLines={1} style={styles.academyVideoGuideBody}>Turn it into one exercise for your next ride</Text>
            </View>
            <ChevronRight size={16} color={nightTheme.faint} />
          </Pressable>
        ) : null}

        {locked ? null : <MotionPressable
          testID="academy-video-complete"
          accessibilityRole="button"
          accessibilityLabel={nextLesson ? `Complete lesson and open ${nextLesson.title}` : "Complete lesson"}
          pressedScale={0.975}
          style={styles.academyLessonCompleteButton}
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            onComplete(lesson.id, video.currentPosition());
            if (nextLesson) {
              onOpenLesson(nextLesson);
            } else {
              onBack();
            }
          }}
        >
          <Check size={19} color={equinaTheme.colors.ink} strokeWidth={2.4} />
          <View style={styles.academyLessonCompleteCopy}>
            <Text style={styles.academyLessonCompleteTitle}>Complete lesson</Text>
            <Text numberOfLines={1} style={styles.academyLessonCompleteMeta}>{nextLesson ? `Next: ${nextLesson.title}` : "Back to the Academy"}</Text>
          </View>
          <ChevronRight size={17} color={equinaTheme.colors.ink} />
        </MotionPressable>}
      </View>
    </View>
  );
}

function AcademyChapterRow({
  chapter,
  last,
  disabled = false,
  onPress
}: {
  chapter: { time: string; title: string };
  last: boolean;
  /** A locked lesson lists its chapters but cannot play them. */
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play from ${chapter.time}, ${chapter.title}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => [styles.academyChapterRow, !last && styles.academyChapterRowDivider, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.academyChapterTime}>{chapter.time}</Text>
      <Text numberOfLines={2} style={styles.academyChapterTitle}>{chapter.title}</Text>
      <PlayCircle size={18} color={disabled ? nightTheme.faint : equinaTheme.colors.brass} />
    </Pressable>
  );
}

function VideoNote({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.videoNote}>
      <View style={styles.videoNoteIcon}>
        <CheckCircle2 size={14} color={equinaTheme.colors.pine} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.videoNoteTitle}>{title}</Text>
        <Text style={styles.videoNoteBody}>{body}</Text>
      </View>
    </View>
  );
}

function AcademyCoachCard({
  coach
}: {
  coach: { name: string; discipline: string; badge: string; initials: string; accent: string };
}) {
  return (
    <View style={styles.academyCoachCard}>
      <View style={[styles.academyCoachAvatar, { backgroundColor: coach.accent }]}>
        <Text style={styles.academyCoachInitials}>{coach.initials}</Text>
      </View>
      <Text numberOfLines={1} style={styles.academyCoachName}>{coach.name}</Text>
      <Text numberOfLines={1} style={styles.academyCoachMeta}>{coach.discipline}</Text>
    </View>
  );
}

function AcademyLessonCard({
  lesson,
  featured,
  featuredLabel,
  matchReason,
  locked = false,
  onPress
}: {
  lesson: AcademyLessonView;
  featured: boolean;
  featuredLabel?: string;
  matchReason?: string;
  /** A paid lesson the rider's plan does not open yet. */
  locked?: boolean;
  onPress: () => void;
}) {
  const lessonTestId = `academy-lesson-${lesson.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  if (featured) {
    return (
      <Pressable
        testID={lessonTestId}
        accessibilityRole="button"
        accessibilityLabel={`Open lesson ${lesson.title}`}
        style={({ pressed }) => [styles.academyFeaturedLesson, pressed && styles.pressed]}
        onPress={onPress}
      >
        <Image source={{ uri: lesson.image }} style={styles.academyFeaturedLessonImage} resizeMode="cover" />
        <LinearGradient
          colors={["rgba(8,7,6,0.08)", "rgba(8,7,6,0.88)"]}
          locations={[0.12, 1]}
          style={styles.academyFeaturedLessonScrim}
        />
        <View style={styles.academyFeaturedLessonTop}>
          <Text style={styles.academyFeaturedLessonBadge}>{featuredLabel ?? "Best match"}</Text>
          {lesson.duration ? <Text style={styles.academyFeaturedLessonDuration}>{lesson.duration}</Text> : null}
        </View>
        <View style={styles.academyFeaturedLessonContent}>
          <Text style={styles.academyFeaturedLessonReason}>{matchReason ?? lesson.level}</Text>
          <Text style={styles.academyFeaturedLessonTitle}>{lesson.title}</Text>
          <View style={styles.academyFeaturedLessonFooter}>
            <Text style={styles.academyFeaturedLessonCoach}>{lesson.coach}</Text>
            <View style={styles.academyFeaturedLessonPlay}>
              <Play size={15} color={equinaTheme.colors.ink} fill={equinaTheme.colors.ink} strokeWidth={1.8} />
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={lessonTestId}
      accessibilityRole="button"
      accessibilityLabel={`Open lesson ${lesson.title}${locked ? ", part of a plan" : ""}`}
      style={({ pressed }) => [styles.academyLessonCard, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Image source={{ uri: lesson.image }} style={styles.academyLessonImage} />
      <View style={styles.academyLessonBody}>
        <View style={styles.academyLessonTop}>
          <Text style={styles.academyLessonLevel}>{lesson.level}</Text>
        </View>
        <Text numberOfLines={1} style={styles.academyLessonTitle}>{lesson.title}</Text>
        <Text numberOfLines={1} style={styles.academyLessonMeta}>{metaLine(lesson.coach, lesson.duration)}</Text>
        <Text numberOfLines={1} style={styles.academyLessonSummary}>{lesson.summary}</Text>
      </View>
      {locked ? <LockKeyhole size={16} color={nightTheme.faint} /> : <ChevronRight size={17} color={nightTheme.faint} />}
    </Pressable>
  );
}

function CoachPicker({
  title,
  options,
  value,
  onChange
}: {
  title: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.coachPicker}>
      <Text style={styles.coachPickerTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coachOptionRow}>
        {options.map((option) => (
          <Pressable key={option} style={[styles.coachOption, value === option && styles.coachOptionActive]} onPress={() => onChange(option)}>
            <Text style={[styles.coachOptionText, value === option && styles.coachOptionTextActive]}>{option}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CoachSignal({ Icon, label, value }: { Icon: typeof Store; label: string; value: string }) {
  return (
    <View style={styles.coachSignal}>
      <Icon size={14} color={equinaTheme.colors.brass} />
      <View>
        <Text style={styles.coachSignalValue}>{value}</Text>
        <Text style={styles.coachSignalLabel}>{label}</Text>
      </View>
    </View>
  );
}

function CommunityScreen({
  posts,
  likes,
  sharedRide,
  rideShare,
  onClubAction,
  onLike,
  onShareRide
}: {
  posts: Array<{ id: string; title: string; body: string; postType: string; space: string }>;
  likes: number;
  sharedRide: boolean;
  rideShare: { riderName: string; horseName: string; discipline: CoachDiscipline; mood: MoodOption; focus: string; duration: string; image: string };
  onClubAction: (label: string) => void;
  onLike: () => void;
  onShareRide: () => void;
}) {
  const feedAnim = useRef(new Animated.Value(0)).current;
  const reduceCommunityMotion = useReducedMotion();

  useEffect(() => {
    if (reduceCommunityMotion) {
      feedAnim.setValue(1);
      return;
    }

    Animated.timing(feedAnim, {
      toValue: 1,
      duration: equinaTheme.motion.transition,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [feedAnim, reduceCommunityMotion]);

  const feedMotion = {
    opacity: feedAnim,
    transform: [
      {
        translateY: feedAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0]
        })
      }
    ]
  };

  return (
    <Animated.View style={[styles.screen, feedMotion]}>
      {/* One way to post, and no row of sample riders: the tab header
          already names the Club. */}
      {equinaFeatureFlags.clubPublishing ? (
        <View style={styles.communityComposer}>
          <View style={styles.communityComposerMonogram}>
            <Text style={styles.communityComposerMonogramText}>{rideShare.riderName.trim().slice(0, 1).toUpperCase() || "R"}</Text>
          </View>
          <Pressable
            testID="share-ride"
            accessibilityRole="button"
            accessibilityLabel={sharedRide ? "Add a thought to your shared ride" : "Write a Club post"}
            style={({ pressed }) => [styles.communityComposerInput, pressed && styles.pressed]}
            onPress={onShareRide}
          >
            <Text style={styles.communityComposerText}>{sharedRide ? "Ride shared. Add a thought?" : "How did today's ride go?"}</Text>
          </Pressable>
          <EquinaIconButton
            Icon={Camera}
            label="Add a photo"
            iconColor={equinaTheme.colors.brass}
            style={styles.communityComposerIcon}
            onPress={() => onClubAction("Photo uploads require connected accounts and moderation.")}
          />
        </View>
      ) : null}

      {sharedRide && (
        <CommunityFeedCard
          author={rideShare.riderName}
          meta={`Just now · ${rideShare.horseName}`}
          title={`${rideShare.horseName} finished today's ${rideShare.discipline.toLowerCase()} work`}
          body={`${rideShare.duration} · ${rideShare.focus} · rider marked ${rideShare.mood.toLowerCase()}.`}
          image={rideShare.image}
          // A ride the rider just shared has no likes and no comments yet, and
          // it carries no verification. Inventing either taught them the number
          // below every other post is invented too.
          likes={likes}
          comments={0}
          interactionsEnabled={equinaFeatureFlags.clubInteractions}
          onLike={onLike}
          onComment={() => onClubAction("Comments")}
        />
      )}

      <View style={styles.communityFeedHeader}>
        <Text style={styles.communityFeedTitle}>Latest from your Club</Text>
      </View>

      {posts.length === 0 && !sharedRide && (
        <View style={styles.communityEmpty}>
          <Text style={styles.communityEmptyTitle}>Nothing here yet.</Text>
          <Text style={styles.communityEmptyBody}>
            Club opens once moderation is in place. Your rides and records stay private until then.
          </Text>
        </View>
      )}

      {posts.slice(0, 1).map((post, index) => (
        <CommunityFeedCard
          key={post.id}
          author={index % 2 === 0 ? "Mara" : "Elena"}
          meta={`${post.space.replace("_", " ")} · ${index + 1}h`}
          title={post.title}
          body={post.body}
          image={communityFeedMedia[index % communityFeedMedia.length] ?? equinaImages.stable}
          // The same rule as the shared ride above: the demo counter is the
          // only number this screen may show.
          likes={likes}
          comments={0}
          verified={post.space.includes("coach")}
          interactionsEnabled={equinaFeatureFlags.clubInteractions}
          onLike={onLike}
          onComment={() => onClubAction("Comments")}
        />
      ))}
    </Animated.View>
  );
}

function SocialActionPill({ Icon, label, onPress }: { Icon: typeof Store; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.socialActionPill, pressed && styles.homePressLift]} onPress={onPress}>
      <Icon size={15} color={equinaTheme.colors.brass} />
      <Text style={styles.socialActionText}>{label}</Text>
    </Pressable>
  );
}

function CommunityFeedCard({
  author,
  meta,
  title,
  body,
  image,
  likes,
  comments,
  verified,
  interactionsEnabled,
  onLike,
  onComment
}: {
  author: string;
  meta: string;
  title: string;
  body: string;
  image: string;
  likes: number;
  comments: number;
  verified?: boolean;
  interactionsEnabled: boolean;
  onLike: () => void;
  onComment: () => void;
}) {
  return (
    <View style={styles.communityPostCard}>
      <View style={styles.communityPostHeader}>
        <View style={styles.communityPostAuthor}>
          <Image source={{ uri: image }} style={styles.communityPostAvatar} />
          <View>
            <View style={styles.communityPostNameRow}>
              <Text style={styles.communityPostAuthorText}>{author}</Text>
              {verified && <BadgeCheck size={13} color={equinaTheme.colors.brass} />}
            </View>
            <Text style={styles.communityPostMeta}>{meta}</Text>
          </View>
        </View>
        {interactionsEnabled && (
          <EquinaIconButton Icon={Ellipsis} label="Post options" iconColor={nightTheme.muted} iconSize={18} style={styles.communityPostMore} onPress={onComment} />
        )}
      </View>
      <Text style={styles.communityPostTitle}>{title}</Text>
      <Text style={styles.communityPostBody}>{body}</Text>
      <Image source={{ uri: image }} style={styles.communityPostImage} />
      <View style={styles.communityPostActions}>
        <CommunityPostAction Icon={Heart} label={`${likes}`} enabled={interactionsEnabled} accent onPress={onLike} />
        <CommunityPostAction Icon={MessageSquareText} label={`${comments}`} enabled={interactionsEnabled} onPress={onComment} />
        <CommunityPostAction Icon={SendHorizontal} label="Share" enabled={interactionsEnabled} onPress={onComment} />
      </View>
    </View>
  );
}

function CommunityPostAction({
  Icon,
  label,
  enabled,
  accent = false,
  onPress
}: {
  Icon: typeof Store;
  label: string;
  enabled: boolean;
  accent?: boolean;
  onPress: () => void;
}) {
  const content = (
    <>
      <Icon size={18} strokeWidth={1.9} color={accent ? equinaTheme.colors.brass : nightTheme.muted} />
      <Text style={styles.communityPostActionText}>{label}</Text>
    </>
  );

  if (!enabled) {
    return <View style={styles.communityPostAction}>{content}</View>;
  }

  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label === "Share" ? "Share post" : `${label} reactions`}
      style={styles.communityPostAction}
      onPress={onPress}
    >
      {content}
    </MotionPressable>
  );
}

function ProfileScreen({
  horseName,
  horsePhoto,
  discipline,
  level,
  goal,
  frequency,
  horseBreed,
  horseSex,
  horseAge,
  horseHeight,
  rideFeel,
  horseCount,
  passportUploaded,
  medCheckCount,
  labReportCount,
  onAddHorse,
  onUploadPassport,
  onAddMedCheck,
  onAddLabReport
}: {
  horseName: string;
  horsePhoto: string;
  discipline: CoachDiscipline;
  level: (typeof riderLevels)[number];
  goal: (typeof onboardingGoals)[number];
  frequency: (typeof ridingFrequencies)[number];
  horseBreed: string;
  horseSex: (typeof horseSexes)[number];
  horseAge: string;
  horseHeight: string;
  rideFeel: (typeof horseRideFeels)[number];
  horseCount: number;
  passportUploaded: boolean;
  medCheckCount: number;
  labReportCount: number;
  onAddHorse: () => void;
  onUploadPassport: () => void;
  onAddMedCheck: () => void;
  onAddLabReport: () => void;
}) {
  const fileCount = (passportUploaded ? 1 : 0) + labReportCount;
  const profilePhoto = horsePhoto || disciplineVisuals[discipline].home;

  return (
    <View style={[styles.screen, styles.profileScreen]}>
      <View style={styles.profileHorseFeature}>
        <Image source={{ uri: profilePhoto }} resizeMode="cover" style={styles.profileHorseFeatureImage} />
        <LinearGradient
          colors={["rgba(8,7,6,0.04)", "rgba(8,7,6,0.18)", "rgba(8,7,6,0.94)"]}
          locations={[0, 0.48, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.profileHorseFeatureContent}>
          <View style={styles.profileHorseFeatureTop}>
            <Text style={styles.profileHorseFeatureKicker}>{horseCount > 1 ? `PRIMARY HORSE · 1 OF ${horseCount}` : "PRIMARY HORSE"}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={equinaFeatureFlags.horseManagement ? "Add another horse" : "Horse management is not available in this preview"}
              accessibilityState={{ disabled: !equinaFeatureFlags.horseManagement }}
              disabled={!equinaFeatureFlags.horseManagement}
              hitSlop={6}
              style={({ pressed }) => [styles.profileAddHorseButton, !equinaFeatureFlags.horseManagement && styles.prototypeActionDisabled, pressed && styles.homePressLift]}
              onPress={onAddHorse}
            >
              <Plus size={18} color={equinaTheme.colors.ivory} />
            </Pressable>
          </View>
          <View>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.profileHorseFeatureTitle}>{horseName}</Text>
            <Text style={styles.profileHorseFeatureMeta}>{discipline} · {horseBreed || "Breed"} · {horseSex}</Text>
            <Text style={styles.profileHorseFeatureDetail}>
              {[level, frequency, horseAge ? `${horseAge} years` : "", horseHeight ? `${horseHeight} cm` : ""]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.profileTrainingLine}>
        <Sparkles size={17} color={equinaTheme.colors.brass} />
        <View style={styles.profileTrainingCopy}>
          <Text style={styles.profileTrainingLabel}>Training profile</Text>
          <Text numberOfLines={2} style={styles.profileTrainingValue}>{goal} · {rideFeel}</Text>
        </View>
      </View>

      <SectionTitle title="Records" action={`${medCheckCount + fileCount} saved`} />
      <CompactActionList
        items={[
          { Icon: Upload, title: "Passport", body: passportUploaded ? "Sample file" : "Secure uploads not connected", onPress: onUploadPassport, disabled: !equinaFeatureFlags.recordMutations },
          { Icon: Stethoscope, title: "Vet", body: `${medCheckCount} sample checks · read-only`, onPress: onAddMedCheck, disabled: !equinaFeatureFlags.recordMutations },
          { Icon: Activity, title: "Labs", body: `${labReportCount} sample file · read-only`, onPress: onAddLabReport, disabled: !equinaFeatureFlags.recordMutations }
        ]}
      />
    </View>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.screenTitle}>{title}</Text>
    </View>
  );
}

function SectionTitle({ title, action }: { title: string; action: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionAction}>{action}</Text>
    </View>
  );
}

function Metric({ Icon, label, value }: { Icon: typeof Store; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIconLine}>
        <Icon size={14} color={equinaTheme.colors.brass} />
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function MarketTrustPill({ Icon, title, body, last = false }: { Icon: typeof Store; title: string; body: string; last?: boolean }) {
  return (
    <View style={[styles.marketTrustPill, !last && styles.marketTrustPillDivider]}>
      <Icon size={16} color={equinaTheme.colors.brass} />
      <View style={{ flex: 1 }}>
        <Text style={styles.marketTrustPillTitle}>{title}</Text>
        <Text style={styles.marketTrustPillBody}>{body}</Text>
      </View>
    </View>
  );
}

function ReservedOrderCard({ listing }: { listing: Listing }) {
  return (
    <View testID="reserved-order-card" style={styles.reservedOrderCard}>
      <View style={styles.reservedOrderTop}>
        <View style={styles.reservedOrderIcon}>
          <CheckCircle2 size={20} color={equinaTheme.colors.ivory} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reservedOrderKicker}>Reserved</Text>
          <Text style={styles.reservedOrderTitle}>{listing.brand} {listing.model ?? listing.category}</Text>
        </View>
        <Text style={styles.reservedOrderPrice}>{money(listing)}</Text>
      </View>
      <View style={styles.reservedOrderSteps}>
        <Text style={styles.reservedOrderStep}>Payment protected</Text>
        <Text style={styles.reservedOrderStep}>Shipping next</Text>
        <Text style={styles.reservedOrderStep}>5-day inspection</Text>
      </View>
    </View>
  );
}

function MarketDossier({ listing, sellerName }: { listing: Listing; sellerName: string }) {
  const requiredPhotoCount = listing.category === "saddle" ? 6 : 4;
  const approvedPhotoCount = Math.min(listing.photos.length, requiredPhotoCount);

  return (
    <View style={styles.marketDossier}>
      <View style={styles.marketDossierHeader}>
        <View>
          <Text style={styles.marketDossierKicker}>Listing dossier</Text>
          <Text style={styles.marketDossierTitle}>{listing.title}</Text>
        </View>
        <View style={styles.marketDossierGrade}>
          <Text style={styles.marketDossierGradeText}>{conditionLabel(listing.conditionGrade)}</Text>
        </View>
      </View>

      <View style={styles.dossierGrid}>
        <DossierFact Icon={BadgeCheck} label="Seller" value={sellerName} />
        <DossierFact Icon={FileText} label="Serial" value={listing.metadata?.serialNumber ? "captured" : "not required"} />
        <DossierFact Icon={PackageCheck} label="Photos" value={`${approvedPhotoCount}/${requiredPhotoCount}`} />
        <DossierFact Icon={Clock3} label="Inspect" value={equinaFeatureFlags.shopTransactions ? "5 days" : "planned"} />
      </View>

      <View style={styles.dossierTimeline}>
        <TimelineStep title="Reserve" body={equinaFeatureFlags.shopTransactions ? "Seller transfer waits through inspection" : "Payment connection required"} done={equinaFeatureFlags.shopTransactions} />
        <TimelineStep title="Ship" body="Tracked shipping planned" done={false} />
        <TimelineStep title="Inspect" body="Inspection workflow planned" done={false} />
      </View>
    </View>
  );
}

function DossierFact({ Icon, label, value }: { Icon: typeof Store; label: string; value: string }) {
  return (
    <View style={styles.dossierFact}>
      <Icon size={15} color={equinaTheme.colors.brass} />
      <Text style={styles.dossierFactLabel}>{label}</Text>
      <Text style={styles.dossierFactValue}>{value}</Text>
    </View>
  );
}

function TimelineStep({ title, body, done }: { title: string; body: string; done: boolean }) {
  return (
    <View style={styles.timelineStep}>
      <View style={[styles.timelineStepDot, done && styles.timelineStepDotDone]}>
        {done && <CheckCircle2 size={12} color={equinaTheme.colors.ivory} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.timelineStepTitle}>{title}</Text>
        <Text style={styles.timelineStepBody}>{body}</Text>
      </View>
    </View>
  );
}

function MarketplaceRow({ listing, selected, onPress }: { listing: Listing; selected: boolean; onPress: () => void }) {
  const fitScreening = getFitScreening(listing);

  return (
    <Pressable
      testID={`market-row-${listing.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Open ${listing.title}, ${money(listing)}`}
      style={({ pressed }) => [styles.marketRow, selected && styles.marketRowSelected, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Image source={{ uri: listing.photos[0]?.url }} style={styles.marketThumb} />
      <View style={styles.marketBody}>
        <View style={styles.marketTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.marketBrand}>{listing.brand} {listing.model ?? listing.category}</Text>
            <Text style={styles.marketMeta}>{conditionLabel(listing.conditionGrade)} · {listing.location}</Text>
          </View>
          <View style={styles.marketPriceBlock}>
            <Text style={styles.marketPrice}>{money(listing)}</Text>
            <Text style={styles.marketFit}>{fitScreening.shortLabel}</Text>
          </View>
        </View>
        <View style={styles.marketTrust}>
          <BadgeCheck size={14} color={equinaTheme.colors.brass} />
          <Text style={styles.marketTrustText}>
            {listing.metadata?.serialNumber ? "Serial captured" : "Photos checked"} · {listing.metadata?.proofOfOwnership ? "owner proof" : "seller verified"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ShopMenuPanel({
  title,
  subtitle,
  items
}: {
  title: string;
  subtitle: string;
  items: Array<{
    Icon: typeof Store;
    label: string;
    value: string;
    body: string;
    onPress: () => void;
  }>;
}) {
  return (
    <View style={styles.shopMenu}>
      <View style={styles.shopMenuHeader}>
        <View>
          <Text style={styles.shopMenuTitle}>{title}</Text>
          <Text style={styles.shopMenuSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.shopMenuBadge}>
          <Text style={styles.shopMenuBadgeText}>Menu</Text>
        </View>
      </View>
      <View style={styles.shopMenuGrid}>
        {items.map((item) => {
          const Icon = item.Icon;
          return (
            <Pressable key={item.label} style={({ pressed }) => [styles.shopMenuTile, pressed && styles.pressed]} onPress={item.onPress}>
              <View style={styles.shopMenuTileTop}>
                <View style={styles.shopMenuIcon}>
                  <Icon size={14} color={equinaTheme.colors.brass} />
                </View>
                <Text numberOfLines={1} style={styles.shopMenuValue}>{item.value}</Text>
              </View>
              <Text style={styles.shopMenuLabel}>{item.label}</Text>
              <Text numberOfLines={1} style={styles.shopMenuBody}>{item.body}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ShopProductCard({ listing, saved, onPress }: { listing: Listing; saved: boolean; onPress: () => void }) {
  const fitScreening = getFitScreening(listing);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = listing.photos[0]?.url;

  return (
    <Pressable testID={`shop-card-${listing.id}`} accessibilityRole="button" accessibilityLabel={`Open ${listing.title}, ${money(listing)}`} style={({ pressed }) => [styles.shopProductCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.shopProductImageWrap}>
        {imageUrl && !imageFailed ? (
          <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.shopProductImage} onError={() => setImageFailed(true)} />
        ) : (
          <LinearGradient
            colors={[equinaTheme.surfaces.elevated, equinaTheme.surfaces.raised]}
            style={styles.shopProductImageFallback}
          >
            <PackageCheck size={24} color={equinaTheme.colors.brass} strokeWidth={1.7} />
            <Text style={styles.shopProductImageFallbackText}>{listing.category}</Text>
          </LinearGradient>
        )}
        <View style={styles.shopProductFit}>
          <Text style={styles.shopProductFitText}>{fitScreening.shortLabel}</Text>
        </View>
        {saved && (
          <View style={styles.shopProductSaved}>
            <Heart size={14} color={equinaTheme.colors.ivory} fill={equinaTheme.colors.ivory} />
          </View>
        )}
      </View>
      <View style={styles.shopProductBody}>
        <Text numberOfLines={1} style={styles.shopProductBrand}>{listing.brand} {listing.model ?? listing.category}</Text>
        <Text numberOfLines={1} style={styles.shopProductMeta}>{conditionLabel(listing.conditionGrade)} · {listing.location}</Text>
        <View style={styles.shopProductBottom}>
          <Text style={styles.shopProductPrice}>{money(listing)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ShopProtectionPill({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.shopProtectionPill}>
      <View style={styles.shopProtectionIcon}>
        <ShieldCheck size={17} color={equinaTheme.colors.brass} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.shopProtectionTitle}>{equinaFeatureFlags.shopTransactions ? "Protected checkout" : "Protection preview"}</Text>
        <Text style={styles.shopProtectionBody}>{equinaFeatureFlags.shopTransactions ? "Protected payment · 5-day check" : "Payments not connected"}</Text>
      </View>
      <Pressable testID="marketplace-help" style={({ pressed }) => [styles.shopProtectionHelp, pressed && styles.pressed]} onPress={onPress}>
        <Text style={styles.shopProtectionHelpText}>Help</Text>
      </Pressable>
    </View>
  );
}

function SellerStep({ Icon, title }: { Icon: typeof Store; title: string }) {
  return (
    <View style={styles.sellerStep}>
      <Icon size={14} color={equinaTheme.colors.brass} />
      <Text style={styles.sellerStepTitle}>{title}</Text>
    </View>
  );
}

function SellerListingRow({ listing, last, onPress }: { listing: Listing; last: boolean; onPress: () => void }) {
  return (
    <Pressable testID={`seller-listing-${listing.id}`} accessibilityRole="button" accessibilityLabel={`Open seller listing ${listing.title}`} style={({ pressed }) => [styles.sellerListingRow, !last && styles.sellerListingRowDivider, pressed && styles.homeAgendaRowPressed]} onPress={onPress}>
      <Image source={{ uri: listing.photos[0]?.url }} style={styles.sellerListingImage} />
      <View style={styles.sellerListingBody}>
        <Text numberOfLines={1} style={styles.sellerListingTitle}>{listing.brand} {listing.model ?? listing.category}</Text>
        <Text numberOfLines={1} style={styles.sellerListingMeta}>{conditionLabel(listing.conditionGrade)} · {listing.status}</Text>
      </View>
      <View style={styles.sellerListingPriceBlock}>
        <Text style={styles.sellerListingPrice}>{money(listing)}</Text>
        <ChevronRight size={16} color={equinaTheme.colors.graphite} />
      </View>
    </Pressable>
  );
}

function HeroStat({ Icon, value, label }: { Icon: typeof Store; value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <View style={styles.heroStatIcon}>
        <Icon size={14} color={equinaTheme.colors.ivory} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function HomeActionPill({
  Icon,
  label,
  onPress,
  active = false
}: {
  Icon: typeof Store;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      damping: 14,
      stiffness: 280,
      mass: 0.5,
      useNativeDriver: Platform.OS !== "web"
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 14,
      stiffness: 260,
      mass: 0.5,
      useNativeDriver: Platform.OS !== "web"
    }).start();
  };

  return (
    <Animated.View style={[styles.homeActionPillWrap, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.homeActionPill, active && styles.homeActionPillActive]}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
      >
        <View style={[styles.homeActionPillIcon, active && styles.homeActionPillIconActive]}>
          <Icon size={17} color={active ? equinaTheme.colors.ivory : equinaTheme.colors.brass} />
        </View>
        <Text numberOfLines={1} style={[styles.homeActionPillText, active && styles.homeActionPillTextActive]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function MoodChip({
  option,
  active,
  onPress
}: {
  option: (typeof homeMoodOptions)[number];
  active: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const MoodIcon = option.Icon;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      damping: 16,
      stiffness: 260,
      mass: 0.5,
      useNativeDriver: Platform.OS !== "web"
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 16,
      stiffness: 260,
      mass: 0.5,
      useNativeDriver: Platform.OS !== "web"
    }).start();
  };

  return (
    <Animated.View style={[styles.moodChipWrap, { transform: [{ scale }] }]}>
      <Pressable
        testID={`home-mood-${option.id.toLowerCase()}`}
        style={[styles.moodChip, active && styles.moodChipActive]}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
      >
        <View style={[styles.moodChipIcon, active && styles.moodChipIconActive]}>
          <MoodIcon size={15} color={active ? equinaTheme.colors.ivory : equinaTheme.colors.brass} />
        </View>
        <View style={styles.moodChipCopy}>
          <Text style={[styles.moodChipLabel, active && styles.moodChipLabelActive]}>{option.label}</Text>
          <Text style={[styles.moodChipBody, active && styles.moodChipBodyActive]}>{option.body}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function MomentumStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.momentumStat}>
      <Text style={styles.momentumValue}>{value}</Text>
      <Text style={styles.momentumLabel}>{label}</Text>
    </View>
  );
}

function FriendStory({
  initials,
  name,
  horse,
  status,
  accent,
  onPress
}: {
  initials: string;
  name: string;
  horse: string;
  status: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable testID={`home-friend-${name.toLowerCase()}`} style={({ pressed }) => [styles.friendStory, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.friendAvatar, { backgroundColor: accent }]}>
        <Text style={styles.friendAvatarText}>{initials}</Text>
        <View style={styles.friendLiveDot} />
      </View>
    </Pressable>
  );
}

function HomeFeedCard({
  item,
  kudos,
  onReact,
  onOpen
}: {
  item: { rider: string; horse: string; title: string; body: string; tag: string };
  kudos: number;
  onReact: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.homeFeedCard}>
      <View style={styles.homeFeedTop}>
        <View style={styles.feedAvatar}>
          <Text style={styles.feedAvatarText}>{item.rider.slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.feedRider}>{item.rider} & {item.horse}</Text>
          <Text style={styles.feedTime}>{item.tag}</Text>
        </View>
        <Pressable testID={`home-kudos-${item.rider.toLowerCase()}`} style={({ pressed }) => [styles.kudosButton, pressed && styles.pressed]} onPress={onReact}>
          <Heart size={14} color={equinaTheme.colors.brass} />
          <Text style={styles.kudosText}>{kudos}</Text>
        </Pressable>
      </View>
      <Text style={styles.feedTitle}>{item.title}</Text>
      <Text style={styles.feedBody}>{item.body}</Text>
      <Pressable style={({ pressed }) => [styles.feedOpenButton, pressed && styles.pressed]} onPress={onOpen}>
        <Text style={styles.feedOpenText}>Open thread</Text>
        <ChevronRight size={14} color={nightTheme.text} />
      </Pressable>
    </View>
  );
}

function TrainingPulseCard({
  active,
  progress,
  onPrimary,
  onOpenAssistant
}: {
  active: boolean;
  progress: number;
  onPrimary: () => void;
  onOpenAssistant: () => void;
}) {
  return (
    <View style={styles.trainingCard}>
      <View style={styles.trainingTop}>
        <View style={styles.trainingIcon}>
          <PlayCircle size={20} color={equinaTheme.colors.brass} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.trainingKicker}>Plan</Text>
          <Text style={styles.trainingTitle}>Transitions</Text>
        </View>
        <View style={styles.trainingBadge}>
          <Medal size={13} color={equinaTheme.colors.ink} />
          <Text style={styles.trainingBadgeText}>+120 XP</Text>
        </View>
      </View>
      <Text style={styles.trainingBody}>35 min · soft contact · stretch.</Text>
      <View style={styles.trainingProgressRow}>
        <Text style={styles.trainingProgressLabel}>Rhythm</Text>
        <Text style={styles.trainingProgressValue}>{progress}%</Text>
      </View>
      <View style={styles.trainingTrack}>
        <View style={[styles.trainingFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.trainingActions}>
        <Pressable testID="training-primary" style={({ pressed }) => [styles.trainingPrimary, pressed && styles.pressed]} onPress={onPrimary}>
          <Text style={styles.trainingPrimaryText}>{active ? "Log done" : "Start plan"}</Text>
        </Pressable>
        <Pressable testID="training-adjust" style={({ pressed }) => [styles.trainingGhost, pressed && styles.pressed]} onPress={onOpenAssistant}>
          <Bot size={17} color={equinaTheme.colors.ink} />
          <Text style={styles.trainingGhostText}>Adjust</Text>
        </Pressable>
      </View>
    </View>
  );
}

// CHANGED: Replaced 2x2 action grids with CompactActionList.
function CompactActionList({
  items
}: {
  items: Array<{
    Icon: any;
    title: string;
    body: string;
    onPress: () => void;
    active?: boolean;
    disabled?: boolean;
  }>;
}) {
  return (
    <View style={styles.compactActionList}>
      {items.map(({ Icon, title, body, onPress, active, disabled = false }, index) => (
        <View key={title}>
          <MotionPressable accessibilityRole="button" accessibilityLabel={`${title}, ${body}`} accessibilityState={{ disabled }} disabled={disabled} style={[styles.compactActionRow, disabled && styles.prototypeActionDisabled]} onPress={onPress}>
            <View style={styles.compactActionIcon}>
              <Icon size={20} strokeWidth={1.9} color={active ? equinaTheme.text.primary : equinaTheme.colors.brass} />
            </View>
            <View style={styles.compactActionCopy}>
              <Text style={styles.compactActionTitle}>{title}</Text>
              <Text style={styles.compactActionBody}>{body}</Text>
            </View>
            <ChevronRight size={15} color={nightTheme.faint} />
          </MotionPressable>
          {index < items.length - 1 && <View style={styles.compactActionDivider} />}
        </View>
      ))}
    </View>
  );
}

function DocPill({ Icon, label, done }: { Icon: typeof Store; label: string; done: boolean }) {
  return (
    <View style={[styles.docPill, done && styles.docPillDone]}>
      <Icon size={13} color={done ? equinaTheme.colors.brass : nightTheme.faint} />
      <Text style={[styles.docPillText, done && styles.docPillTextDone]}>{label}</Text>
    </View>
  );
}

function VaultAction({
  Icon,
  title,
  body,
  onPress
}: {
  Icon: typeof Store;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.vaultAction, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.vaultActionIcon}>
        <Icon size={18} color={equinaTheme.colors.brass} />
      </View>
      <Text style={styles.vaultActionTitle}>{title}</Text>
      <Text style={styles.vaultActionBody}>{body}</Text>
    </Pressable>
  );
}

function TimelineItem({ Icon, title, body }: { Icon: typeof Store; title: string; body: string }) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineIcon}>
        <Icon size={16} color={equinaTheme.colors.brass} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.timelineTitle}>{title}</Text>
        <Text style={styles.timelineBody}>{body}</Text>
      </View>
    </View>
  );
}

function MiniAction({
  Icon,
  label,
  onPress,
  active = false
}: {
  Icon: typeof Store;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable testID={`stable-action-${label.toLowerCase().replaceAll(" ", "-")}`} style={({ pressed }) => [styles.miniAction, active && styles.miniActionDone, pressed && styles.pressed]} onPress={onPress}>
      <Icon size={18} color={active ? equinaTheme.colors.pine : equinaTheme.colors.brass} />
      <Text style={[styles.miniActionText, active && styles.miniActionTextDone]}>{label}</Text>
    </Pressable>
  );
}

function DocumentRow({
  Icon,
  title,
  body,
  status,
  disabled = false,
  last = false,
  onPress
}: {
  Icon: typeof Store;
  title: string;
  body: string;
  status: string;
  disabled?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  const content = (
    <>
      <View style={styles.documentIcon}>
        <Icon size={18} color={equinaTheme.colors.brass} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.documentTitle}>{title}</Text>
        <Text style={styles.documentBody}>{body}</Text>
      </View>
      <View style={styles.documentStatus}>
        <Text style={styles.documentStatusText}>{status}</Text>
        {!disabled && <ChevronRight size={15} color={nightTheme.faint} />}
      </View>
    </>
  );

  if (disabled) {
    return (
      <View
        accessibilityLabel={`${title}, ${status}`}
        style={[styles.documentRow, !last && styles.documentRowDivider]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status}`}
      style={({ pressed }) => [
        styles.documentRow,
        !last && styles.documentRowDivider,
        pressed && styles.homeAgendaRowPressed
      ]}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <View style={styles.checklist}>
      {items.map((item) => (
        <View key={item} style={styles.checkItem}>
          <ShieldCheck size={17} color={equinaTheme.colors.pine} />
          <Text style={styles.checkText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionRow({
  Icon,
  title,
  body,
  onPress
}: {
  Icon: typeof Store;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.actionRowCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.actionIcon}>
        <Icon size={18} color={equinaTheme.colors.brass} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionBody}>{body}</Text>
      </View>
      <ChevronRight size={18} color={nightTheme.faint} />
    </Pressable>
  );
}

function ModuleCard({ Icon, title, body }: { Icon: typeof Store; title: string; body: string }) {
  return (
    <View style={styles.moduleCard}>
      <Icon size={20} color={equinaTheme.colors.brass} />
      <Text style={styles.moduleTitle}>{title}</Text>
      <Text style={styles.moduleBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: nightTheme.bg,
    alignItems: "center"
  },
  phoneFrame: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    overflow: "hidden",
    backgroundColor: nightTheme.frame
  },
  appLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    backgroundColor: nightTheme.frame
  },
  onboardingLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    backgroundColor: nightTheme.frame
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  headerMonogram: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.06)",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }
  },
  headerMonogramText: {
    color: equinaTheme.colors.brass,
    fontSize: 13,
    fontWeight: "600"
  },
  brand: {
    color: nightTheme.text,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: 0,
  },
  subBrand: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 1
  },
  verifiedPill: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: nightTheme.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  verifiedPillText: {
    color: equinaTheme.colors.pine,
    fontSize: 12,
    fontWeight: "400"
  },
  profileDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(247,243,234,0.055)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    overflow: "hidden"
  },
  profileDotText: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  ralfButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: equinaTheme.material.quiet
  },
  ralfButtonText: {
    color: equinaTheme.text.primary,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  headerStatusPill: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.055)",
    borderWidth: 0
  },
  headerStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  headerStatusText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  notice: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  noticeText: {
    flex: 1,
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17
  },
  content: {
    flex: 1
  },
  contentMotion: {
    flex: 1
  },
  contentInner: {
    paddingHorizontal: floatingDockMetrics.horizontal,
    paddingTop: 6,
    paddingBottom: floatingDockContentInset
  },
  contentInnerFocused: {
    paddingBottom: equinaTheme.spacing.lg
  },
  contentInnerImmersive: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0
  },
  screen: {
    gap: 16
  },
  screenImmersive: {
    flex: 1,
    gap: 0
  },
  conversationGlassSurface: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "rgba(26,24,20,0.72)",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  },
  conversationGlassContent: {
    position: "relative",
    zIndex: 1
  },
  homeScreen: {
    gap: 0
  },
  homeTopBar: {
    minHeight: 70,
    paddingTop: 2,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  homeGreetingCopy: {
    flex: 1,
    minWidth: 0
  },
  homeGreeting: {
    color: equinaTheme.text.primary,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "600"
  },
  homeGreetingMeta: {
    color: equinaTheme.text.secondary,
    ...equinaTheme.typography.meta,
    marginTop: 1
  },
  homeProfileButton: {
    width: 44,
    height: 44,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.selected
  },
  homeProfileInitial: {
    color: equinaTheme.colors.brass,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  marketHeader: {
    marginTop: 2
  },
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 2,
    marginBottom: -4
  },
  globalStatus: {
    position: "absolute",
    bottom: 96,
    left: 18,
    right: 18,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: equinaTheme.surfaces.glassStrong,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  prototypeActionDisabled: {
    opacity: 0.48
  },
  homePressLift: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }]
  },
  homeStage: {
    height: 372,
    marginHorizontal: -18,
    borderBottomLeftRadius: equinaTheme.radius.hero,
    borderBottomRightRadius: equinaTheme.radius.hero,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    position: "relative"
  },
  homeStageCompact: {
    height: 308
  },
  homeStageImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  homeStageScrim: {
    ...StyleSheet.absoluteFillObject
  },
  homeStageContent: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    justifyContent: "flex-end",
    gap: 18
  },
  homeStageTopline: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  homeStageContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  homeStageContextLabel: {
    color: "rgba(255,247,230,0.62)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  homeStageContextDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: equinaTheme.colors.brass
  },
  homeStageContextValue: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400"
  },
  homeStageState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    position: "relative"
  },
  homeStageStateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.colors.brass
  },
  homeStageStateText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "600"
  },
  homeStageTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  homeStagePill: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.16)",
    borderWidth: 0
  },
  homeStagePillText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "600"
  },
  homeStageMetric: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(14,13,11,0.62)",
    borderWidth: 0
  },
  homeStageMetricText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  homeStageMain: {
    gap: 7
  },
  homeStageTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: equinaTheme.typography.display.fontSize,
    lineHeight: equinaTheme.typography.display.lineHeight,
    fontWeight: "600",
    maxWidth: 330
  },
  homeStageBody: {
    color: "rgba(255,247,230,0.76)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    maxWidth: 315
  },
  homeStagePlan: {
    minHeight: 62,
    borderRadius: 20,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,247,230,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,247,230,0.34)"
  },
  homeStagePlanIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  homeStagePlanTitle: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  homeStagePlanBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  homeStageLiveTrack: {
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,247,230,0.2)"
  },
  homeStageLiveFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.brass
  },
  homeRidePressable: {
    borderRadius: 14,
    zIndex: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5
  },
  homeRideGlass: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(10,9,8,0.38)"
  },
  homeRideGlassLive: {
    backgroundColor: "rgba(24,59,50,0.46)"
  },
  homeRideAction: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    backgroundColor: "transparent"
  },
  homeRideIcon: {
    width: 42,
    height: 42,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass
  },
  homeRideIconActive: {
    backgroundColor: "rgba(247,243,234,0.14)"
  },
  homeRideCopy: {
    flex: 1,
    minWidth: 0
  },
  homeRideTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600"
  },
  homeRideMeta: {
    color: "rgba(255,247,230,0.62)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 2
  },
  homeDetails: {
    gap: 20,
    marginTop: 20
  },
  homeRhythm: {
    paddingHorizontal: 2
  },
  homeRhythmTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  homeRhythmTitle: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  homeRhythmValue: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600"
  },
  homeRhythmTrack: {
    height: 4,
    marginTop: 10,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(247,243,234,0.1)"
  },
  homeRhythmFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: equinaTheme.colors.brass
  },
  homeRhythmMetaRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  homeRhythmMeta: {
    color: equinaTheme.text.tertiary,
    ...equinaTheme.typography.meta
  },
  homeSectionTopline: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between"
  },
  homeSectionTitle: {
    color: equinaTheme.text.primary,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600"
  },
  homeSectionMeta: {
    color: equinaTheme.text.tertiary,
    ...equinaTheme.typography.meta
  },
  homeAgenda: {
    marginTop: -10,
    borderRadius: equinaTheme.radius.control,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  homeAgendaDivider: {
    height: 1,
    marginLeft: 58,
    marginRight: 14,
    backgroundColor: "rgba(247,243,234,0.07)"
  },
  homeAgendaRowPressed: {
    backgroundColor: equinaTheme.surfaces.elevated
  },
  homeBriefingRow: {
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  homeBriefingIcon: {
    width: 32,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  homeBriefingIconDone: {
    backgroundColor: "transparent"
  },
  homeBriefingCopy: {
    flex: 1,
    minWidth: 0
  },
  homeBriefingKicker: {
    color: equinaTheme.colors.brass,
    ...equinaTheme.typography.label
  },
  homeBriefingTitle: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: 1
  },
  homeBriefingBody: {
    color: equinaTheme.text.tertiary,
    ...equinaTheme.typography.meta,
    marginTop: 1
  },
  homeSocialRow: {
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  homeSocialAvatars: {
    width: 66,
    flexDirection: "row",
    alignItems: "center"
  },
  homeSocialAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: equinaTheme.surfaces.raised,
    backgroundColor: equinaTheme.surfaces.raised
  },
  homeSocialAvatarOverlap: {
    marginLeft: -14
  },
  homeSocialCopy: {
    flex: 1,
    minWidth: 0
  },
  homeSocialTitle: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  homeSocialBody: {
    color: equinaTheme.text.tertiary,
    ...equinaTheme.typography.meta,
    marginTop: 1
  },
  homeRideCommand: {
    minHeight: 74,
    marginTop: -54,
    marginHorizontal: 2,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: equinaTheme.colors.ivory,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 }
  },
  homeRideCommandActive: {
    backgroundColor: equinaTheme.colors.pine
  },
  homeRideCommandIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.accent
  },
  homeRideCommandIconActive: {
    backgroundColor: "rgba(247,243,234,0.14)"
  },
  homeRideCommandCopy: {
    flex: 1,
    gap: 2
  },
  homeRideCommandKicker: {
    color: "rgba(22,21,18,0.55)",
    fontSize: 11,
    fontWeight: "600"
  },
  homeRideCommandKickerActive: {
    color: "rgba(247,243,234,0.62)"
  },
  homeRideCommandTitle: {
    color: equinaTheme.colors.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  homeRideCommandTitleActive: {
    color: equinaTheme.colors.ivory
  },
  homeRideCommandArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.ink
  },
  homeRideCommandArrowActive: {
    backgroundColor: "rgba(247,243,234,0.16)"
  },
  homeStageActions: {
    flexDirection: "row",
    gap: 9
  },
  homeActionDock: {
    flexDirection: "row",
    gap: 8
  },
  homeStageRideButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(8,9,7,0.76)",
    borderWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }
  },
  homeStageRideButtonActive: {
    backgroundColor: "rgba(24,59,50,0.9)",
    borderColor: "transparent"
  },
  homeStageRideTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600"
  },
  homeStageRideTitleActive: {
    color: equinaTheme.colors.ivory
  },
  homeStageRideSub: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  homeStageRideSubActive: {
    color: "rgba(255,247,230,0.64)"
  },
  homeStageRideCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.accent,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  homeStageRideCircleActive: {
    backgroundColor: "rgba(255,247,230,0.14)"
  },
  homeStageMiniButton: {
    width: 62,
    minHeight: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "rgba(255,247,230,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,247,230,0.18)"
  },
  homeStageMiniButtonDone: {
    backgroundColor: "rgba(49,91,77,0.34)",
    borderColor: "rgba(98,141,126,0.42)"
  },
  homeStageMiniText: {
    color: "rgba(255,247,230,0.74)",
    fontSize: 10,
    fontWeight: "600"
  },
  homeStageMiniTextDone: {
    color: equinaTheme.colors.ivory
  },
  homeDockMiniButton: {
    width: 58,
    minHeight: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "rgba(247,243,234,0.12)",
    borderWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 }
  },
  homeDockMiniButtonDone: {
    backgroundColor: "rgba(49,91,77,0.34)",
    borderColor: "rgba(98,141,126,0.42)"
  },
  homeDockMiniText: {
    color: nightTheme.muted,
    fontSize: 10,
    fontWeight: "600"
  },
  homeDockMiniTextDone: {
    color: equinaTheme.colors.ivory
  },
  homeLoopCard: {
    minHeight: 50,
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: 4,
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 }
  },
  homeLoopStepWrap: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  homeLoopIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  homeLoopIconActive: {
    backgroundColor: nightTheme.accentFillStrong
  },
  homeLoopIconDone: {
    backgroundColor: equinaTheme.colors.pine
  },
  homeLoopLine: {
    position: "absolute",
    top: 14,
    left: "64%",
    right: "-36%",
    height: 1,
    backgroundColor: nightTheme.borderStrong
  },
  homeLoopLineDone: {
    backgroundColor: "rgba(216,169,74,0.55)"
  },
  homeLoopLabel: {
    color: nightTheme.faint,
    fontSize: 11,
    fontWeight: "600"
  },
  homeLoopLabelActive: {
    color: nightTheme.text
  },
  homePlanPanel: {
    paddingHorizontal: 2,
    paddingVertical: 12,
    backgroundColor: "transparent",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(247,243,234,0.08)"
  },
  homeFocusLine: {
    minHeight: 62,
    paddingHorizontal: 2,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(247,243,234,0.08)"
  },
  homeFocusLineTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  homeFocusLineBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  homePlanSteps: {
    gap: 2
  },
  homePlanStep: {
    minHeight: 48,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(247,243,234,0.055)"
  },
  homePlanStepAction: {
    borderBottomWidth: 0
  },
  homePlanStepIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.16)"
  },
  homePlanStepIconDone: {
    backgroundColor: equinaTheme.colors.pine
  },
  homePlanStepTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600"
  },
  homePlanStepBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2
  },
  homeRecapCard: {
    borderRadius: 24,
    padding: 16,
    gap: 13,
    backgroundColor: nightTheme.surface,
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 }
  },
  homeRecapTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11
  },
  homeRecapBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.pine
  },
  homeRecapTitle: {
    color: nightTheme.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "600",
    marginTop: 2
  },
  homeRecapBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  homeRecapMetrics: {
    flexDirection: "row",
    gap: 8
  },
  homeRecapMetric: {
    flex: 1,
    minHeight: 62,
    borderRadius: 17,
    padding: 10,
    justifyContent: "center",
    backgroundColor: "rgba(8,7,6,0.34)"
  },
  homeRecapValue: {
    color: nightTheme.text,
    fontSize: 20,
    lineHeight: 23,
    fontWeight: "600"
  },
  homeRecapLabel: {
    color: nightTheme.faint,
    fontSize: 11,
    marginTop: 2
  },
  homeRecapInsight: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(216,169,74,0.1)"
  },
  homeRecapInsightText: {
    flex: 1,
    color: nightTheme.text,
    fontSize: 12,
    lineHeight: 16
  },
  homeRecapActions: {
    flexDirection: "row",
    gap: 7
  },
  homeRecapButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(247,243,234,0.07)"
  },
  homeRecapButtonPrimary: {
    flex: 1.5,
    backgroundColor: nightTheme.accentFillStrong
  },
  homeRecapButtonSecondary: {
    backgroundColor: "rgba(247,243,234,0.055)"
  },
  homeRecapButtonDone: {
    backgroundColor: equinaTheme.colors.pine
  },
  homeRecapButtonText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  homeRecapButtonTextDone: {
    color: equinaTheme.colors.ivory
  },
  homeRitualPanel: {
    borderRadius: 20,
    padding: 13,
    gap: 11,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 }
  },
  homeRitualTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  homeRitualTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 1
  },
  homeRitualIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  homePersonalPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  homePersonalPill: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "600",
    backgroundColor: "rgba(8,7,6,0.28)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden"
  },
  homePlanLine: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: nightTheme.surfaceSoft
  },
  homePlanLineText: {
    flex: 1,
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  homePlanLineMeta: {
    color: nightTheme.faint,
    fontSize: 12
  },
  horseHeroPanel: {
    height: 210,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 }
  },
  horseHeroImage: {
    width: "100%",
    height: "100%"
  },
  horseHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,6,5,0.28)"
  },
  horseHeroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
    justifyContent: "space-between",
    gap: 14
  },
  statusText: {
    flex: 1,
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16
  },
  todayPanel: {
    backgroundColor: equinaTheme.colors.ink,
    borderRadius: 8,
    padding: 16,
    gap: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 }
  },
  todayTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  todayTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 4
  },
  heroEyebrow: {
    color: "rgba(255,247,230,0.76)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginBottom: 1
  },
  todayBody: {
    color: "#E8DDC8",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400"
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: equinaTheme.text.tertiary,
    marginTop: 5
  },
  liveDotActive: {
    backgroundColor: equinaTheme.colors.brass
  },
  liveDotWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
    borderRadius: 17,
    backgroundColor: "rgba(255,247,230,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,247,230,0.16)"
  },
  livePulse: {
    position: "absolute",
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: equinaTheme.colors.brass
  },
  todayStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.14)",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,247,230,0.08)"
  },
  energyTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,247,230,0.18)",
    overflow: "hidden",
    marginTop: -3
  },
  energyFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.brass
  },
  heroStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  heroStatIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.14)"
  },
  statValue: {
    color: equinaTheme.colors.ivory,
    fontSize: 18,
    fontWeight: "600"
  },
  statLabel: {
    color: equinaTheme.text.secondary,
    fontSize: 11,
    marginTop: 2
  },
  rideBtnOuter: {
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 0,
    marginHorizontal: 0,
    borderWidth: 1,
    borderColor: "rgba(255,247,230,0.18)",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  rideBtnInactive: {
    backgroundColor: "#161512"
  },
  rideBtnActive: {
    backgroundColor: "#315B4D"
  },
  rideBtnLeft: {
    gap: 2
  },
  rideBtnTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: equinaTheme.colors.ivory
  },
  rideBtnSub: {
    fontSize: 12,
    color: "rgba(255,247,230,0.6)"
  },
  rideBtnCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center"
  },
  rideBtnCircleInactive: {
    backgroundColor: equinaTheme.colors.brass
  },
  rideBtnCircleActive: {
    backgroundColor: "rgba(255,247,230,0.15)"
  },
  homeMomentumCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }
  },
  homeMomentumTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  homeHeroStatusPill: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,247,230,0.16)"
  },
  homeHeroStatusText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "600"
  },
  homeSnapshotRow: {
    flexDirection: "row",
    gap: 10
  },
  homeSnapshotCard: {
    flex: 1,
    minHeight: 76,
    borderRadius: 18,
    padding: 11,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 }
  },
  homeSnapshotTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  homeSnapshotValue: {
    color: nightTheme.text,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "600",
    marginTop: 5
  },
  homeSnapshotMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    marginTop: 1
  },
  homeBriefCard: {
    borderRadius: 20,
    padding: 14,
    gap: 12,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 }
  },
  homeBriefTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  homeBriefTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 2
  },
  homeBriefMeta: {
    color: equinaTheme.colors.pine,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "600"
  },
  homeBriefChips: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  homeBriefChip: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  homeBriefChipText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  homeEngagementCard: {
    borderRadius: 22,
    padding: 14,
    gap: 12,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.055,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 }
  },
  homeEngagementTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  homeEngagementTitle: {
    color: nightTheme.text,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "600",
    marginTop: 2
  },
  homeStreakPill: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  homeStreakText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  homeMoodRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 0
  },
  moodChipWrap: {
    flex: 1
  },
  moodChip: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "rgba(8,7,6,0.28)",
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  moodChipActive: {
    backgroundColor: "rgba(216,169,74,0.18)"
  },
  moodChipIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.08)"
  },
  moodChipIconActive: {
    backgroundColor: "rgba(216,169,74,0.28)",
    borderWidth: 0
  },
  moodChipCopy: {
    flex: 1
  },
  moodChipLabel: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "600"
  },
  moodChipLabelActive: {
    color: nightTheme.text
  },
  moodChipBody: {
    color: nightTheme.faint,
    fontSize: 9,
    marginTop: 0
  },
  moodChipBodyActive: {
    color: nightTheme.muted
  },
  homeNextMove: {
    minHeight: 58,
    borderRadius: 18,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  homeNextIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  homeNextTitle: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  homeNextBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  homeEngagementActions: {
    flexDirection: "row",
    gap: 8
  },
  homeSoftAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  homeSoftActionDone: {
    backgroundColor: nightTheme.surfaceSoft,
    borderColor: equinaTheme.material.separator
  },
  homeSoftActionText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  homeSoftActionTextDone: {
    color: equinaTheme.colors.pine
  },
  homePlanCard: {
    borderRadius: 20,
    padding: 14,
    gap: 12,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 }
  },
  homePlanTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  homePlanTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 2
  },
  homePlanBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  homePlanAsk: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(216,169,74,0.12)",
    borderWidth: 0
  },
  homePlanAskText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  homeMicroActions: {
    flexDirection: "row",
    gap: 8
  },
  homeMicroAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  homeMicroActionDone: {
    backgroundColor: nightTheme.surfaceSoft,
    borderColor: equinaTheme.material.separator
  },
  homeMicroActionText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  homeMicroActionTextDone: {
    color: equinaTheme.colors.pine
  },
  homeLiveRideCard: {
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: 4,
    gap: 9,
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowOpacity: 0
  },
  homeLiveRideTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  homeLiveRideBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  homeLiveRidePulse: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: equinaTheme.colors.brass
  },
  homeLiveRideDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: equinaTheme.colors.brass
  },
  homeLiveRideTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 1
  },
  homeLiveRideFinish: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(49,91,77,0.7)"
  },
  homeLiveRideFinishText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "600"
  },
  homeLiveRideTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(247,243,234,0.09)",
    overflow: "hidden"
  },
  homeLiveRideFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.pine
  },
  homeKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  homeMomentumTitle: {
    color: nightTheme.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "600",
    marginTop: 2
  },
  xpPill: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  xpText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  homeProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: equinaTheme.material.quietPressed,
    overflow: "hidden"
  },
  homeProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.brass
  },
  homeMomentumStats: {
    flexDirection: "row",
    gap: 8
  },
  momentumStat: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    padding: 10,
    backgroundColor: nightTheme.surfaceSoft,
    justifyContent: "center"
  },
  momentumValue: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "600"
  },
  momentumLabel: {
    color: nightTheme.muted,
    fontSize: 11,
    marginTop: 2
  },
  friendPanel: {
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: 4,
    gap: 10,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000000",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 }
  },
  friendPanelTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  friendPanelTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 1
  },
  friendPanelAction: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(247,243,234,0.06)",
    borderWidth: 0
  },
  friendPanelActionText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  homeClubMiddle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  friendStoryScroller: {
    flex: 1
  },
  friendStoryRow: {
    flexDirection: "row",
    gap: 9
  },
  homeClubShare: {
    width: 96,
    minHeight: 46,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(247,243,234,0.06)",
    borderWidth: 0
  },
  homeClubShareActive: {
    backgroundColor: equinaTheme.colorRole.positive,
    borderColor: "rgba(54,194,117,0.24)"
  },
  homeClubShareTitle: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  homeClubShareBody: {
    color: nightTheme.faint,
    fontSize: 11,
    marginTop: 1
  },
  friendStory: {
    width: 48,
    height: 48,
    minHeight: 48,
    borderRadius: 16,
    padding: 0,
    backgroundColor: "rgba(8,7,6,0.28)",
    borderWidth: 0,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0
  },
  friendAvatarText: {
    color: equinaTheme.colors.ivory,
    fontSize: 15,
    fontWeight: "600"
  },
  friendLiveDot: {
    position: "absolute",
    right: -2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: equinaTheme.colors.brass,
    borderWidth: 2,
    borderColor: equinaTheme.colors.ivory
  },
  friendName: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  friendMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    marginTop: 2
  },
  compactActionList: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    borderWidth: 0,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 }
  },
  homeActionRail: {
    flexDirection: "row",
    gap: 9
  },
  homeActionPillWrap: {
    flex: 1
  },
  homeActionPill: {
    minHeight: 76,
    borderRadius: 20,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 }
  },
  homeActionPillActive: {
    backgroundColor: equinaTheme.colors.pine,
    borderColor: equinaTheme.colors.pine
  },
  homeActionPillIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  homeActionPillIconActive: {
    backgroundColor: "rgba(255,247,230,0.14)"
  },
  homeActionPillText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  homeActionPillTextActive: {
    color: equinaTheme.colors.ivory
  },
  compactActionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14
  },
  compactActionDivider: {
    height: 1,
    backgroundColor: nightTheme.borderStrong,
    marginLeft: 50
  },
  compactActionIcon: {
    width: 28,
    height: 36,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  compactActionCopy: {
    flex: 1
  },
  compactActionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: nightTheme.text
  },
  compactActionBody: {
    fontSize: 12,
    color: nightTheme.faint,
    marginTop: 2
  },
  actionRowCard: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    borderRadius: 14,
    padding: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.025,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  actionTitle: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "600"
  },
  actionBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 15,
    marginTop: 3
  },
  trainingCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }
  },
  trainingTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  trainingIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  trainingKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
  },
  trainingTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 1
  },
  trainingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: nightTheme.surfaceSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  trainingBadgeText: {
    color: equinaTheme.colors.pine,
    fontSize: 12,
    fontWeight: "400"
  },
  trainingBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18
  },
  trainingProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  trainingProgressLabel: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    fontWeight: "400"
  },
  trainingProgressValue: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  trainingTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: equinaTheme.material.quietPressed,
    overflow: "hidden"
  },
  trainingFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.pine
  },
  trainingActions: {
    flexDirection: "row",
    gap: 8
  },
  trainingPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: equinaTheme.colors.ink,
    alignItems: "center",
    justifyContent: "center"
  },
  trainingPrimaryText: {
    color: equinaTheme.colors.ivory,
    fontSize: 14,
    fontWeight: "600"
  },
  trainingGhost: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: nightTheme.surfaceSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  trainingGhostText: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  homeFeedStack: {
    gap: 9
  },
  homeFeedCard: {
    backgroundColor: "rgba(247,243,234,0.045)",
    borderRadius: 18,
    padding: 11,
    gap: 8,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  homeFeedTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  feedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.ivory
  },
  feedAvatarText: {
    color: equinaTheme.colors.ink,
    fontSize: 14,
    fontWeight: "600"
  },
  feedRider: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  feedTime: {
    color: nightTheme.faint,
    fontSize: 11,
    marginTop: 2
  },
  kudosButton: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  kudosText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  feedTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600"
  },
  feedBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18
  },
  feedOpenButton: {
    alignSelf: "flex-start",
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: nightTheme.surface
  },
  feedOpenText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  shareRideCard: {
    minHeight: 72,
    borderRadius: 18,
    padding: 12,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.025,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  shareRideCardActive: {
    backgroundColor: nightTheme.surfaceSoft,
    borderColor: equinaTheme.material.separator
  },
  shareRideIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  shareRideTitle: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "600"
  },
  shareRideBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  homeTackTeaser: {
    minHeight: 72,
    borderRadius: 18,
    padding: 12,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.025,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 }
  },
  homeTackIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  homeTackKicker: {
    color: equinaTheme.text.secondary,
    fontSize: 11,
    fontWeight: "400"
  },
  homeTackTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 2
  },
  homeTackMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  homeTackAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: nightTheme.surfaceSoft,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 14,
    borderWidth: 0,
    shadowOpacity: 0
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    color: nightTheme.text,
    paddingVertical: 0,
    fontSize: 15
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 3,
    padding: 3,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet
  },
  filterChip: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: equinaTheme.radius.compact,
    backgroundColor: "transparent"
  },
  filterChipActive: {
    backgroundColor: equinaTheme.material.selected
  },
  filterChipText: {
    color: nightTheme.muted,
    fontSize: 13,
    fontWeight: "400"
  },
  filterChipTextActive: {
    color: nightTheme.text,
    fontWeight: "600"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 9
  },
  metric: {
    flex: 1,
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: nightTheme.border,
    minHeight: 50
  },
  metricIconLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  metricValue: {
    color: nightTheme.text,
    fontSize: 16,
    fontWeight: "600"
  },
  metricLabel: {
    marginTop: 1,
    color: nightTheme.muted,
    fontSize: 10
  },
  heroListing: {
    height: 282,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 }
  },
  gearFeature: {
    height: 220,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  heroImage: {
    width: "100%",
    height: "100%"
  },
  imageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)"
  },
  heroOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    gap: 8
  },
  heroTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  trustChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(22,21,18,0.74)"
  },
  trustChipText: {
    color: equinaTheme.colors.ivory,
    fontWeight: "400",
    fontSize: 12
  },
  heroPrice: {
    color: equinaTheme.colors.ivory,
    fontSize: 14,
    fontWeight: "400",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(22,21,18,0.58)",
    overflow: "hidden"
  },
  heroTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "600",
    letterSpacing: 0,
  },
  heroMeta: {
    color: "#F7F3EA",
    fontSize: 15,
    fontWeight: "400"
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sectionTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  sectionAction: {
    color: equinaTheme.colors.brass,
    fontSize: 13,
    fontWeight: "400"
  },
  horizontalList: {
    gap: 12,
    paddingRight: 18
  },
  listingCard: {
    width: 174,
    backgroundColor: nightTheme.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  listingImage: {
    width: "100%",
    height: 126,
    backgroundColor: equinaTheme.surfaces.raised
  },
  listingCardBody: {
    padding: 11,
    gap: 4
  },
  cardTitle: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  cardMeta: {
    color: equinaTheme.colors.brass,
    fontSize: 15,
    fontWeight: "600"
  },
  cardFine: {
    color: nightTheme.muted,
    fontSize: 12
  },
  detailPanel: {
    backgroundColor: nightTheme.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  panelTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: 0,
  },
  inverseTitle: {
    color: equinaTheme.colors.ivory
  },
  bodyText: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 19
  },
  inverseBody: {
    color: "#E8DDC8"
  },
  factGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  fact: {
    width: "47%",
    backgroundColor: equinaTheme.colors.mist,
    padding: 10,
    borderRadius: 8
  },
  factLabel: {
    color: equinaTheme.text.secondary,
    fontSize: 11,
    fontWeight: "400",
  },
  factValue: {
    marginTop: 4,
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  actionRow: {
    flexDirection: "row",
    gap: 10
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: "rgba(247,243,234,0.08)",
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: "rgba(247,243,234,0.045)",
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  primaryButtonWide: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: "rgba(247,243,234,0.08)",
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  primaryButtonText: {
    color: equinaTheme.colors.ivory,
    fontSize: 14,
    fontWeight: "600"
  },
  secondaryButtonText: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  sectionHeader: {
    gap: 5,
    paddingTop: 2
  },
  eyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    fontWeight: "400",
  },
  screenTitle: {
    color: nightTheme.text,
    fontSize: 25,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 30
  },
  captureCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  captureIcon: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: nightTheme.surfaceSoft
  },
  checklist: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  checkText: {
    flex: 1,
    color: nightTheme.muted,
    fontSize: 14,
    lineHeight: 19
  },
  horseCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  horseImage: {
    height: 190,
    width: "100%"
  },
  horseInfo: {
    padding: 16,
    gap: 8
  },
  stableHero: {
    height: 236,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 }
  },
  stableEmptyScreen: {
    gap: 18
  },
  stableEmptyHero: {
    minHeight: 430,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: nightTheme.surface
  },
  stableEmptyImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  stableEmptyTopline: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  stableEmptyEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600"
  },
  stableEmptyMeta: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400"
  },
  stableEmptyCopy: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 20,
    gap: 7
  },
  stableEmptyTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "600"
  },
  stableEmptyBody: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    maxWidth: 330
  },
  stableEmptyNote: {
    paddingVertical: 4,
    gap: 3
  },
  stableCareEmpty: {
    gap: 6,
    padding: 16,
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised
  },
  stableCareEmptyTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  stableCareEmptyBody: {
    color: nightTheme.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400"
  },
  stableEmptyNoteTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  stableEmptyNoteBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
    maxWidth: 340
  },
  stableSystemState: {
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28
  },
  stableSystemEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600"
  },
  stableSystemTitle: {
    color: equinaTheme.text.primary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 10
  },
  stableSystemBody: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 6
  },
  stableConnectionState: {
    minHeight: 48,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: equinaTheme.material.quiet
  },
  stableConnectionText: {
    flex: 1,
    minWidth: 0,
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400"
  },
  stableConnectionAction: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600"
  },
  stablePrimaryAction: {
    minHeight: 52,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 16,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: equinaTheme.colors.brass
  },
  stablePrimaryActionText: {
    color: equinaTheme.colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  stableHorseSwitcher: {
    flexGrow: 0,
    marginHorizontal: -16
  },
  stableHorseSwitcherContent: {
    paddingHorizontal: 16,
    gap: 8
  },
  stableHorseOption: {
    minHeight: 40,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quiet
  },
  stableHorseOptionActive: {
    backgroundColor: equinaTheme.material.selected
  },
  stableHorseOptionText: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  stableHorseOptionTextActive: {
    color: equinaTheme.colors.brass
  },
  stableCoachLink: {
    minHeight: 52,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: equinaTheme.material.quiet
  },
  stableCoachLinkText: {
    flex: 1,
    minWidth: 0,
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400"
  },
  stableProfileHeader: {
    minHeight: 98,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8
  },
  stablePortraitWrap: {
    width: 74,
    height: 74,
    borderRadius: equinaTheme.radius.card,
    overflow: "visible"
  },
  stablePortrait: {
    width: "100%",
    height: "100%",
    borderRadius: equinaTheme.radius.card,
    backgroundColor: nightTheme.surfaceSoft
  },
  stablePortraitMark: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.pine,
    borderWidth: 2,
    borderColor: nightTheme.frame
  },
  stableProfileCopy: {
    flex: 1,
    minWidth: 0
  },
  stableProfilePill: {
    alignSelf: "flex-start",
    minHeight: 26,
    paddingHorizontal: 9,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(49,91,77,0.55)"
  },
  stableProfilePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.colors.brass
  },
  stableProfilePillText: {
    color: equinaTheme.colors.ivory,
    fontSize: 10,
    fontWeight: "600"
  },
  stableHeroImage: {
    width: "100%",
    height: "100%"
  },
  stableHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)"
  },
  stableHeroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: "flex-end",
    gap: 12
  },
  stableHeroStatus: {
    alignSelf: "flex-start",
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(8,7,6,0.36)"
  },
  stableHeroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  stableHeroStatusText: {
    color: equinaTheme.colors.ivory,
    fontSize: 11,
    fontWeight: "600"
  },
  stableHeroTop: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12
  },
  stableKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  stableTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 1
  },
  stableMeta: {
    color: "#E8DDC8",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 4
  },
  stableViewBody: {
    gap: 12
  },
  nutritionBrief: {
    borderRadius: 18,
    padding: 16,
    gap: 13,
    backgroundColor: "rgba(49,91,77,0.28)"
  },
  nutritionBriefTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  nutritionEyebrow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  nutritionEyebrowText: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600"
  },
  nutritionBriefTitle: {
    color: nightTheme.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "600",
    marginTop: 6
  },
  nutritionBriefBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    marginTop: 5
  },
  nutritionDivider: {
    height: 1,
    backgroundColor: "rgba(247,243,234,0.1)"
  },
  nutritionHydrationTop: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  nutritionHydrationLabel: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  nutritionHydrationTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  nutritionHydrationBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    marginTop: 1
  },
  nutritionWaterButton: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: equinaTheme.colors.brass
  },
  nutritionWaterButtonComplete: {
    backgroundColor: "rgba(247,243,234,0.1)"
  },
  nutritionWaterButtonText: {
    color: nightTheme.frame,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  nutritionWaterButtonTextComplete: {
    color: nightTheme.text
  },
  nutritionHydrationTrack: {
    height: 6,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(247,243,234,0.1)"
  },
  nutritionHydrationFill: {
    height: "100%",
    borderRadius: 8,
    backgroundColor: equinaTheme.colors.brass
  },
  nutritionBaseline: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  nutritionBaselineTitle: {
    color: nightTheme.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  nutritionBaselineMeta: {
    flex: 1,
    color: nightTheme.faint,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    textAlign: "right"
  },
  nutritionMealList: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: nightTheme.surface
  },
  nutritionMealRow: {
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "transparent"
  },
  nutritionMealRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(247,243,234,0.08)"
  },
  nutritionMealRowPressed: {
    backgroundColor: "rgba(247,243,234,0.045)"
  },
  nutritionMealCheck: {
    width: 32,
    height: 32,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.08)"
  },
  nutritionMealCheckComplete: {
    backgroundColor: equinaTheme.colors.brass
  },
  nutritionMealCheckDot: {
    width: 7,
    height: 7,
    borderRadius: 8,
    backgroundColor: nightTheme.faint
  },
  nutritionMealCopy: {
    flex: 1,
    minWidth: 0
  },
  nutritionMealTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  nutritionMealBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    marginTop: 2
  },
  nutritionMealMeta: {
    minWidth: 46,
    alignItems: "flex-end"
  },
  nutritionMealAmount: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600"
  },
  nutritionMealTime: {
    color: nightTheme.faint,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400",
    marginTop: 2
  },
  nutritionWorkloadNote: {
    minHeight: 82,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    backgroundColor: "rgba(49,91,77,0.2)"
  },
  nutritionWorkloadTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  nutritionWorkloadBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    marginTop: 3
  },
  nutritionSupportList: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: nightTheme.surface
  },
  nutritionSupportRow: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  nutritionSupportRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(247,243,234,0.08)"
  },
  nutritionSupportTitle: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600"
  },
  nutritionSupportBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    marginTop: 2
  },
  nutritionSupportStatus: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  nutritionSafetyNote: {
    minHeight: 44,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  nutritionSafetyText: {
    flex: 1,
    color: nightTheme.faint,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "400"
  },
  stableMetricRow: {
    flexDirection: "row",
    gap: 8
  },
  stableMetric: {
    flex: 1,
    minHeight: 66,
    borderRadius: 18,
    padding: 11,
    justifyContent: "space-between",
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  stableMetricValue: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "600"
  },
  stableMetricLabel: {
    color: nightTheme.faint,
    fontSize: 11,
    fontWeight: "400"
  },
  stableLatestRide: {
    minHeight: 78,
    paddingHorizontal: 2,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(247,243,234,0.09)"
  },
  stableLatestRideIcon: {
    width: 30,
    height: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  stableLatestRideCopy: {
    flex: 1,
    minWidth: 0
  },
  stableLatestRideKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  stableLatestRideTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 2
  },
  stableLatestRideBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 2
  },
  stableLatestRideStatus: {
    alignItems: "flex-end",
    gap: 5
  },
  stableLatestRideDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.colors.brass
  },
  stableLatestRideDotDone: {
    backgroundColor: equinaTheme.text.secondary
  },
  stableLatestRideStatusText: {
    color: nightTheme.faint,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600"
  },
  stableNextCare: {
    minHeight: 76,
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderColor: "rgba(247,243,234,0.09)"
  },
  stableNextCareIcon: {
    width: 30,
    height: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  stableNextCareKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  stableNextCareTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 2
  },
  stableNextCareBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3
  },
  stableQuickRecordRow: {
    flexDirection: "row",
    gap: 8
  },
  stableRecordList: {
    backgroundColor: nightTheme.surface,
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden"
  },
  stableQuickRecord: {
    minHeight: 66,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "transparent",
    borderWidth: 0
  },
  stableQuickRecordActive: {
    backgroundColor: "transparent"
  },
  stableQuickRecordIcon: {
    width: 28,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  stableQuickRecordIconActive: {
    backgroundColor: "transparent"
  },
  stableQuickRecordBody: {
    flex: 1,
    gap: 1
  },
  stableQuickRecordLabel: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600"
  },
  stableQuickRecordMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  stableQuickRecordReadOnly: {
    color: equinaTheme.text.tertiary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600"
  },
  stableAssistantCard: {
    minHeight: 68,
    borderRadius: 20,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  stableAssistantIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  stableAssistantKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    fontWeight: "600",
  },
  stableAssistantTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 3
  },
  stableHealthCard: {
    minHeight: 112,
    borderRadius: equinaTheme.radius.card,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(49,91,77,0.72)"
  },
  stableHealthIcon: {
    width: 46,
    height: 46,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.12)"
  },
  stableHealthKicker: {
    color: "rgba(255,247,230,0.7)",
    fontSize: 10,
    fontWeight: "600",
  },
  stableHealthTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "600",
    marginTop: 3
  },
  stableHealthBody: {
    color: "rgba(255,247,230,0.7)",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4
  },
  stableDocsIntro: {
    minHeight: 76,
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: equinaTheme.material.separator
  },
  stableDocsIcon: {
    width: 32,
    height: 44,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  stableDocsTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600"
  },
  stableDocsBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3
  },
  stableScore: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.9)"
  },
  stableScoreValue: {
    color: nightTheme.text,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 24
  },
  stableScoreLabel: {
    color: nightTheme.muted,
    fontSize: 10,
    fontWeight: "400",
  },
  stableTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,247,230,0.2)",
    overflow: "hidden"
  },
  stableFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.brass
  },
  stableActionRail: {
    flexDirection: "row",
    gap: 9,
    paddingRight: 18
  },
  miniAction: {
    width: 136,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  miniActionDone: {
    backgroundColor: nightTheme.surfaceSoft,
    borderColor: equinaTheme.material.separator
  },
  miniActionText: {
    flex: 1,
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "400"
  },
  miniActionTextDone: {
    color: equinaTheme.colors.pine
  },
  documentStack: {
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden",
    backgroundColor: nightTheme.surface
  },
  documentRow: {
    minHeight: 72,
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  documentRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: equinaTheme.material.separator
  },
  documentIcon: {
    width: 28,
    height: 44,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  documentTitle: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "600"
  },
  documentBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3
  },
  documentStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 82
  },
  documentStatusText: {
    color: equinaTheme.text.tertiary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400",
    textTransform: "capitalize",
    textAlign: "right"
  },
  careBoard: {
    flexDirection: "row",
    gap: 9
  },
  careBoardMain: {
    flex: 1,
    minHeight: 108,
    borderRadius: 18,
    padding: 14,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong,
    justifyContent: "space-between"
  },
  careBoardTitle: {
    color: nightTheme.text,
    fontSize: 18,
    fontWeight: "600"
  },
  careBoardBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16
  },
  careBoardSide: {
    width: 102,
    minHeight: 108,
    borderRadius: 18,
    padding: 14,
    backgroundColor: equinaTheme.colors.pine,
    alignItems: "center",
    justifyContent: "center",
    gap: 9
  },
  careBoardSideText: {
    color: equinaTheme.colors.ivory,
    fontSize: 13,
    fontWeight: "600"
  },
  moduleGrid: {
    gap: 10
  },
  dailyRail: {
    flexDirection: "row",
    gap: 10
  },
  dailyCardDark: {
    flex: 1.15,
    backgroundColor: equinaTheme.colors.ink,
    borderRadius: 8,
    padding: 14,
    minHeight: 108,
    justifyContent: "space-between"
  },
  dailyCardLight: {
    flex: 0.85,
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 14,
    minHeight: 108,
    borderWidth: 1,
    borderColor: nightTheme.border,
    justifyContent: "space-between"
  },
  dailyKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
  },
  dailyTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 18,
    fontWeight: "600"
  },
  dailyBody: {
    color: "#E8DDC8",
    fontSize: 12,
    lineHeight: 16
  },
  dailyKickerLight: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
  },
  dailyTitleLight: {
    color: nightTheme.text,
    fontSize: 18,
    fontWeight: "600"
  },
  dailyBodyLight: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16
  },
  emptyState: {
    paddingHorizontal: 4,
    paddingVertical: 24,
    gap: 8
  },
  clearFilterButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.ink
  },
  clearFilterButtonText: {
    color: equinaTheme.colors.ivory,
    fontSize: 13,
    fontWeight: "600"
  },
  gearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  gearThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: equinaTheme.surfaces.raised
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: equinaTheme.material.quiet,
    borderRadius: equinaTheme.radius.control,
    padding: 3,
    gap: 3
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center",
    outlineWidth: 0
  },
  segmentActive: {
    backgroundColor: equinaTheme.material.selected,
    shadowOpacity: 0
  },
  segmentText: {
    color: nightTheme.muted,
    fontSize: 13,
    fontWeight: "400"
  },
  segmentTextActive: {
    color: nightTheme.text,
    fontWeight: "600"
  },
  shopHero: {
    backgroundColor: equinaTheme.colors.ink,
    borderRadius: 18,
    padding: 16,
    gap: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 }
  },
  shopKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    fontWeight: "400",
  },
  shopTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "600"
  },
  shopBody: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    fontWeight: "400"
  },
  shopStats: {
    flexDirection: "row",
    gap: 9
  },
  shopMenu: {
    gap: 10
  },
  shopMenuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  shopMenuTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600"
  },
  shopMenuSubtitle: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 2
  },
  shopMenuBadge: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.07)",
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.09)"
  },
  shopMenuBadgeText: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "600"
  },
  shopMenuGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 9
  },
  shopMenuTile: {
    width: "48.5%",
    minHeight: 86,
    borderRadius: 8,
    padding: 11,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    gap: 5,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 }
  },
  shopMenuTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  shopMenuIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  shopMenuValue: {
    flex: 1,
    textAlign: "right",
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600"
  },
  shopMenuLabel: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600"
  },
  shopMenuBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400"
  },
  sellerDashboardIntro: {
    minHeight: 112,
    borderRadius: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 2,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: equinaTheme.material.separator
  },
  sellerDashboardCopy: {
    flex: 1,
    gap: 5
  },
  sellerDashboardKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  sellerDashboardTitle: {
    color: nightTheme.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "600"
  },
  sellerDashboardBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400"
  },
  sellerDashboardAdd: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: equinaTheme.colors.brass,
    alignItems: "center",
    justifyContent: "center"
  },
  sellerDashboardPreview: {
    minHeight: 44,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  sellerDashboardPreviewText: {
    color: equinaTheme.text.tertiary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  shopAccountLinks: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -10
  },
  shopAccountLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  shopAccountLinkText: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400"
  },
  shopAccountDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: nightTheme.faint
  },
  shopRouteHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  shopRouteBack: {
    width: 44,
    height: 44,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center"
  },
  shopRouteTitleBlock: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  shopRouteTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600"
  },
  shopRouteMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400"
  },
  shopRouteSpacer: {
    width: 44,
    height: 44
  },
  shopDetailPage: {
    gap: 24
  },
  shopDetailTopRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  shopDetailIconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: nightTheme.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  shopDetailTopTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600"
  },
  shopDetailGallery: {
    gap: 8
  },
  shopDetailMedia: {
    aspectRatio: 0.92,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: nightTheme.surface,
    justifyContent: "flex-end"
  },
  shopDetailImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  shopDetailPhotoLabel: {
    color: equinaTheme.colors.ivory,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    padding: 14
  },
  shopDetailHeading: {
    gap: 6
  },
  shopDetailKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopDetailTitle: {
    color: nightTheme.text,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "600"
  },
  shopDetailPrice: {
    color: nightTheme.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "600"
  },
  shopDetailFit: {
    minHeight: 82,
    borderRadius: 14,
    backgroundColor: nightTheme.surface,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  shopDetailFitScore: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: nightTheme.accentFill,
    alignItems: "center",
    justifyContent: "center"
  },
  shopDetailFitValue: {
    color: equinaTheme.colors.brass,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "600"
  },
  shopDetailFitLabel: {
    color: nightTheme.muted,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "400"
  },
  shopDetailFitCopy: {
    flex: 1,
    gap: 3
  },
  shopDetailFitTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  shopDetailFitBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopDetailActions: {
    minHeight: 56,
    flexDirection: "row",
    gap: 10
  },
  shopDetailPrimary: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: equinaTheme.colors.brass,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9
  },
  shopDetailActionDisabled: {
    opacity: 0.44
  },
  shopDetailPrimaryText: {
    color: equinaTheme.colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  shopDetailSecondary: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: nightTheme.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  shopDetailSection: {
    gap: 0
  },
  shopDetailSectionTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    marginBottom: 8
  },
  shopFactRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 10
  },
  shopFactRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: nightTheme.border
  },
  shopFactLabel: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400"
  },
  shopFactValue: {
    flex: 1,
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "right"
  },
  shopSellerRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  shopSellerMonogram: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: nightTheme.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  shopSellerMonogramText: {
    color: equinaTheme.colors.brass,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600"
  },
  shopSellerCopy: {
    flex: 1,
    gap: 3
  },
  shopSellerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  shopSellerName: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  shopSellerMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopProtectionEntry: {
    minHeight: 76,
    borderRadius: 14,
    backgroundColor: nightTheme.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  shopCheckoutPage: {
    gap: 24
  },
  shopCheckoutItem: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  shopCheckoutImage: {
    width: 72,
    height: 82,
    borderRadius: 14,
    backgroundColor: nightTheme.surface
  },
  shopCheckoutCopy: {
    flex: 1,
    gap: 5
  },
  shopCheckoutTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  shopCheckoutMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopCheckoutPrice: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  shopCheckoutLines: {
    gap: 0
  },
  shopCheckoutProtection: {
    minHeight: 78,
    borderRadius: 14,
    backgroundColor: nightTheme.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  shopCheckoutBottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16
  },
  shopCheckoutDueLabel: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400"
  },
  shopCheckoutDue: {
    color: nightTheme.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "600",
    marginTop: 2
  },
  shopCheckoutPreviewNote: {
    flex: 1,
    color: nightTheme.faint,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400",
    textAlign: "right"
  },
  shopCheckoutConfirm: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: equinaTheme.colors.brass,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  shopCheckoutConfirmText: {
    color: equinaTheme.colors.ink,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  shopCheckoutUnavailable: {
    minHeight: 72,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: equinaTheme.material.quiet
  },
  shopCheckoutUnavailableTitle: {
    color: equinaTheme.text.primary,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600"
  },
  shopCheckoutUnavailableBody: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 2
  },
  shopOrdersPage: {
    gap: 16
  },
  shopOrderCard: {
    borderRadius: 18,
    backgroundColor: nightTheme.surface,
    padding: 14,
    gap: 14
  },
  shopOrderTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  shopOrderImage: {
    width: 70,
    height: 76,
    borderRadius: 14,
    backgroundColor: nightTheme.surfaceSoft
  },
  shopOrderCopy: {
    flex: 1,
    gap: 4
  },
  shopOrderStatus: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600"
  },
  shopOrderTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  shopOrderMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400"
  },
  shopOrderProgress: {
    height: 4,
    flexDirection: "row",
    gap: 5
  },
  shopOrderProgressStep: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: nightTheme.surfaceSoft
  },
  shopOrderProgressDone: {
    backgroundColor: equinaTheme.colors.brass
  },
  shopOrderConfirm: {
    gap: 12
  },
  shopOrderConfirmText: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400"
  },
  shopOrderActions: {
    minHeight: 44,
    flexDirection: "row",
    gap: 8
  },
  shopOrderQuietAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: nightTheme.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  shopOrderQuietText: {
    color: nightTheme.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  shopOrderReleaseAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: equinaTheme.colors.brass,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  shopOrderReleaseText: {
    color: equinaTheme.colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  shopSavedPage: {
    gap: 12
  },
  shopMessagesPage: {
    gap: 4
  },
  shopThreadRow: {
    minHeight: 82,
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: nightTheme.border
  },
  shopThreadImage: {
    width: 52,
    height: 58,
    borderRadius: 14,
    backgroundColor: nightTheme.surfaceSoft
  },
  shopThreadCopy: {
    flex: 1,
    gap: 4
  },
  shopThreadTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  shopThreadBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopConversationPage: {
    flex: 1,
    backgroundColor: nightTheme.frame
  },
  shopConversationHeader: {
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  shopConversationBack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  shopConversationAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  shopConversationAvatarText: {
    color: equinaTheme.colors.brass,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  shopConversationIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  shopConversationNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  shopConversationName: {
    flexShrink: 1,
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  shopConversationPresence: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopConversationProduct: {
    minHeight: 64,
    marginHorizontal: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(247,243,234,0.045)"
  },
  shopConversationProductImage: {
    width: 42,
    height: 46,
    borderRadius: 8,
    backgroundColor: nightTheme.surface
  },
  shopConversationProductCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  shopConversationProductTitle: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600"
  },
  shopConversationProductMeta: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopConversationScroller: {
    flex: 1,
    minHeight: 0
  },
  shopConversationMessages: {
    flexGrow: 1,
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 12
  },
  shopConversationDay: {
    alignSelf: "center",
    color: nightTheme.faint,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400",
    marginBottom: 4
  },
  shopConversationHint: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
    textAlign: "center",
    paddingHorizontal: 28,
    marginVertical: 40
  },
  shopConversationMessageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  shopConversationMessageRowOwn: {
    justifyContent: "flex-end"
  },
  shopConversationMessageAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  shopConversationMessageAvatarText: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600"
  },
  shopConversationBubble: {
    maxWidth: "80%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  shopConversationBubbleBuyer: {
    backgroundColor: "rgba(49,91,77,0.82)",
    borderBottomRightRadius: 8
  },
  shopConversationBubbleSeller: {
    backgroundColor: "rgba(247,243,234,0.065)",
    borderBottomLeftRadius: 8
  },
  shopConversationText: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400"
  },
  shopConversationTextBuyer: {
    color: equinaTheme.colors.ivory
  },
  shopConversationComposerDock: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12
  },
  shopConversationComposer: {
    minHeight: 58,
    backgroundColor: "rgba(20,18,15,0.60)"
  },
  shopConversationComposerFocused: {
    backgroundColor: "rgba(28,25,21,0.76)",
    shadowOpacity: 0.26
  },
  shopConversationComposerContent: {
    minHeight: 58,
    paddingLeft: 14,
    paddingRight: 7,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  shopConversationInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "400",
    paddingVertical: 11,
    borderWidth: 0,
    outlineWidth: 0,
    outlineColor: "transparent"
  },
  shopConversationSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(247,243,234,0.07)",
    alignItems: "center",
    justifyContent: "center"
  },
  shopConversationSendReady: {
    backgroundColor: equinaTheme.colors.brass
  },
  shopFitPage: {
    gap: 24
  },
  shopFitHero: {
    minHeight: 212,
    borderRadius: 18,
    backgroundColor: equinaTheme.colors.pine,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  shopFitHeroValue: {
    color: equinaTheme.colors.ivory,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
    textAlign: "center"
  },
  shopFitHeroLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  shopFitHeroBody: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 12,
    maxWidth: 280
  },
  shopFitChecks: {
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.raised
  },
  shopFitCoachButton: {
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: equinaTheme.colors.brass,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  coachMiniMark: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: equinaTheme.colors.ink,
    alignItems: "center",
    justifyContent: "center"
  },
  coachMiniMarkText: {
    color: equinaTheme.colors.brass,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600"
  },
  shopFitCoachTitle: {
    color: equinaTheme.colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  shopFitCoachBody: {
    color: "rgba(22,21,18,0.68)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopProtectionPage: {
    gap: 24
  },
  shopProtectionHero: {
    minHeight: 190,
    borderRadius: 18,
    backgroundColor: nightTheme.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 9
  },
  shopProtectionHeroTitle: {
    color: nightTheme.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "600"
  },
  shopProtectionHeroBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
    textAlign: "center",
    maxWidth: 290
  },
  shopProtectionSteps: {
    gap: 18
  },
  shopProtectionFootnote: {
    color: nightTheme.faint,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "400"
  },
  sellerRevenuePage: {
    gap: 24
  },
  sellerRevenueHero: {
    minHeight: 176,
    borderRadius: 18,
    backgroundColor: equinaTheme.colors.pine,
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  sellerRevenueLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  sellerRevenueValue: {
    color: equinaTheme.colors.ivory,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "600"
  },
  sellerListingPage: {
    gap: 20
  },
  sellerListingHeroImage: {
    width: "100%",
    aspectRatio: 1.12,
    borderRadius: 18,
    backgroundColor: nightTheme.surface
  },
  shopEmptyPage: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    gap: 8
  },
  shopEmptyTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "600"
  },
  shopEmptyBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    textAlign: "center"
  },
  shopTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  shopMatchRow: {
    minHeight: 64,
    borderRadius: equinaTheme.radius.card,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  shopMatchIcon: {
    width: 28,
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  shopMatchKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "600"
  },
  shopMatchTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 2
  },
  shopSearchBox: {
    flex: 1,
    minHeight: 50
  },
  sellMiniButton: {
    minWidth: 68,
    minHeight: 50,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: nightTheme.accentFillStrong,
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    outlineWidth: 0
  },
  sellMiniText: {
    color: equinaTheme.colors.ivory,
    fontSize: 13,
    fontWeight: "600"
  },
  shopTrustStrip: {
    flexDirection: "row",
    gap: 8
  },
  shopFeedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 18
  },
  shopProductCard: {
    width: "48.4%",
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "transparent",
    padding: 0,
    gap: 8,
    shadowOpacity: 0
  },
  shopProductCardSelected: {
    borderColor: "transparent",
    backgroundColor: "transparent"
  },
  shopProductImageWrap: {
    width: "100%",
    aspectRatio: 0.86,
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  shopProductImage: {
    width: "100%",
    height: "100%"
  },
  shopProductImageFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  shopProductImageFallbackText: {
    color: equinaTheme.text.secondary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    textTransform: "capitalize"
  },
  shopProductFit: {
    position: "absolute",
    left: 8,
    top: 8,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(22,21,18,0.72)"
  },
  shopProductFitText: {
    color: equinaTheme.colors.ivory,
    fontSize: 10,
    fontWeight: "600"
  },
  shopProductSaved: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 32,
    height: 32,
    borderRadius: 14,
    backgroundColor: "rgba(8,7,6,0.62)",
    alignItems: "center",
    justifyContent: "center"
  },
  shopProductBody: {
    paddingHorizontal: 1,
    paddingBottom: 2,
    gap: 4
  },
  shopProductBrand: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  shopProductMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400"
  },
  shopProductBottom: {
    minHeight: 19,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  shopProductPrice: {
    color: equinaTheme.colors.brass,
    fontSize: 15,
    fontWeight: "600"
  },
  shopProductSelectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  shopFeatureCard: {
    height: 228,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }
  },
  shopFeatureImage: {
    width: "100%",
    height: "100%"
  },
  shopFeatureShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(22,21,18,0.42)"
  },
  shopFeatureContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: "space-between"
  },
  shopFeatureTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  shopFeatureFit: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(22,21,18,0.62)",
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.1)"
  },
  shopFeatureFitText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "600"
  },
  shopFeatureVerified: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(22,21,18,0.58)"
  },
  shopFeatureVerifiedText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "600"
  },
  shopFeatureBottom: {
    gap: 5
  },
  shopFeatureKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  shopFeatureTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "600"
  },
  shopFeatureMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexWrap: "wrap"
  },
  shopFeaturePrice: {
    color: equinaTheme.colors.ivory,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600"
  },
  shopFeatureMeta: {
    color: equinaTheme.colors.parchment,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400"
  },
  shopSelectedPanel: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  shopSelectedImage: {
    width: 86,
    height: 112,
    borderRadius: 8,
    backgroundColor: equinaTheme.surfaces.raised
  },
  shopSelectedBody: {
    flex: 1,
    justifyContent: "space-between",
    gap: 10
  },
  shopSelectedTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  shopSelectedKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    fontWeight: "400",
  },
  shopSelectedTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    marginTop: 3
  },
  shopSelectedMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 3
  },
  shopFitBadge: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(247,243,234,0.07)",
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.1)",
    alignItems: "center",
    justifyContent: "center"
  },
  shopFitValue: {
    color: equinaTheme.colors.brass,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "600"
  },
  shopFitLabel: {
    color: nightTheme.muted,
    fontSize: 9,
    fontWeight: "400",
  },
  shopSelectedActions: {
    flexDirection: "row",
    gap: 8
  },
  shopReserveButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: nightTheme.accentFillStrong,
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    outlineWidth: 0
  },
  shopFitButton: {
    minWidth: 78,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "rgba(247,243,234,0.045)",
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    outlineWidth: 0
  },
  shopProtectionPill: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  shopProtectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.ivory
  },
  shopProtectionTitle: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  shopProtectionBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "400",
    marginTop: 2
  },
  shopProtectionHelp: {
    minWidth: 52,
    minHeight: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.ink,
    outlineWidth: 0
  },
  shopProtectionHelpText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "600"
  },
  sellerHero: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  sellerHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14
  },
  sellerHeroTitle: {
    color: nightTheme.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "600",
    marginTop: 3
  },
  sellerHeroBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    marginTop: 5
  },
  sellerHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: equinaTheme.colors.ivory,
    alignItems: "center",
    justifyContent: "center"
  },
  sellerHeroButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: nightTheme.accentFillStrong,
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    outlineWidth: 0
  },
  sellerHeroButtonText: {
    color: equinaTheme.colors.ivory,
    fontSize: 14,
    fontWeight: "600"
  },
  sellerStatsRow: {
    flexDirection: "row",
    gap: 9
  },
  sellerSteps: {
    backgroundColor: equinaTheme.material.quiet,
    borderRadius: equinaTheme.radius.control,
    padding: 4,
    flexDirection: "row",
    gap: 4
  },
  sellerStep: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "transparent"
  },
  sellerStepIndex: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.ivory
  },
  sellerStepIndexText: {
    color: equinaTheme.colors.ink,
    fontSize: 12,
    fontWeight: "600"
  },
  sellerStepTitle: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  sellerStepBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 2
  },
  sellerListingStack: {
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden",
    backgroundColor: nightTheme.surface
  },
  sellerListingRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  sellerListingRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: equinaTheme.material.separator
  },
  sellerListingImage: {
    width: 58,
    height: 58,
    borderRadius: 8,
    backgroundColor: equinaTheme.surfaces.raised
  },
  sellerListingBody: {
    flex: 1,
    gap: 3
  },
  sellerListingTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  sellerListingMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "400"
  },
  sellerListingPriceBlock: {
    alignItems: "flex-end",
    gap: 4
  },
  sellerListingPrice: {
    color: equinaTheme.colors.brass,
    fontSize: 13,
    fontWeight: "600"
  },
  marketplaceHero: {
    height: 276,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 }
  },
  marketplaceHeroImage: {
    width: "100%",
    height: "100%"
  },
  marketplaceHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)"
  },
  marketplaceHeroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 15,
    justifyContent: "space-between"
  },
  marketplaceTopLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  fitScoreBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: equinaTheme.colors.ivory,
    alignItems: "center",
    justifyContent: "center"
  },
  fitScoreValue: {
    color: equinaTheme.colors.ink,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 24
  },
  fitScoreLabel: {
    color: equinaTheme.colors.graphite,
    fontSize: 10,
    fontWeight: "400",
  },
  marketplaceTrustChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(22,21,18,0.72)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  marketplaceTrustChipText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "400"
  },
  marketplaceTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 3
  },
  marketplaceSubtitle: {
    color: "#F7F3EA",
    fontSize: 14,
    fontWeight: "400",
    marginTop: 6
  },
  marketplaceActions: {
    flexDirection: "row",
    gap: 9
  },
  marketplacePrimary: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: equinaTheme.colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  marketplaceSecondary: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: equinaTheme.colors.ivory,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  marketTrustRail: {
    flexDirection: "row",
    gap: 8
  },
  marketTrustPill: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  marketTrustPillDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: equinaTheme.material.separator
  },
  marketTrustPillTitle: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  marketTrustPillBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  reservedOrderCard: {
    backgroundColor: equinaTheme.colors.pine,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  reservedOrderTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  reservedOrderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.16)"
  },
  reservedOrderKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
  },
  reservedOrderTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: 2
  },
  reservedOrderPrice: {
    color: equinaTheme.colors.ivory,
    fontSize: 16,
    fontWeight: "600"
  },
  reservedOrderSteps: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap"
  },
  reservedOrderStep: {
    color: equinaTheme.colors.ivory,
    fontSize: 11,
    fontWeight: "400",
    backgroundColor: "rgba(255,247,230,0.12)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    overflow: "hidden"
  },
  marketDossier: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: nightTheme.border,
    padding: 14,
    gap: 13,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  marketDossierHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  marketDossierKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
  },
  marketDossierTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: 3
  },
  marketDossierGrade: {
    backgroundColor: nightTheme.surfaceSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  marketDossierGradeText: {
    color: equinaTheme.colors.pine,
    fontSize: 11,
    fontWeight: "400"
  },
  dossierGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  dossierFact: {
    width: "48.6%",
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: nightTheme.surfaceSoft,
    padding: 10,
    justifyContent: "space-between"
  },
  dossierFactLabel: {
    color: nightTheme.muted,
    fontSize: 10,
    fontWeight: "400",
    marginTop: 5
  },
  dossierFactValue: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  dossierTimeline: {
    borderTopWidth: 1,
    borderTopColor: equinaTheme.material.separator,
    paddingTop: 12,
    gap: 10
  },
  timelineStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  timelineStepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surface
  },
  timelineStepDotDone: {
    backgroundColor: equinaTheme.colors.pine,
    borderColor: equinaTheme.colors.pine
  },
  timelineStepTitle: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  timelineStepBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 15,
    marginTop: 2
  },
  marketRow: {
    backgroundColor: equinaTheme.surfaces.raised,
    borderRadius: 18,
    padding: 12,
    flexDirection: "row",
    gap: 12
  },
  marketRowSelected: {
    backgroundColor: equinaTheme.material.selected
  },
  marketThumb: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  marketBody: {
    flex: 1,
    justifyContent: "space-between"
  },
  marketTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8
  },
  marketBrand: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  marketPriceBlock: {
    alignItems: "flex-end",
    gap: 3
  },
  marketPrice: {
    color: equinaTheme.colors.brass,
    fontSize: 16,
    fontWeight: "600"
  },
  marketFit: {
    color: equinaTheme.text.secondary,
    fontSize: 11,
    fontWeight: "400"
  },
  marketMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4
  },
  marketTrust: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  marketTrustText: {
    color: equinaTheme.text.secondary,
    fontSize: 11,
    fontWeight: "400"
  },
  marketSafetyCard: {
    backgroundColor: equinaTheme.colors.ink,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  marketSafetyIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.12)"
  },
  marketSafetyTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 15,
    fontWeight: "600"
  },
  marketSafetyBody: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3
  },
  marketSafetyButton: {
    minWidth: 58,
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.accentFillStrong,
    borderWidth: 0
  },
  marketSafetyButtonText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  moduleCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: nightTheme.border,
    gap: 7
  },
  moduleTitle: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "600"
  },
  moduleBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18
  },
  assistantCard: {
    backgroundColor: equinaTheme.colors.ink,
    borderRadius: 8,
    padding: 18,
    gap: 12
  },
  confidence: {
    borderRadius: 8,
    backgroundColor: "rgba(247,243,234,0.12)",
    padding: 10
  },
  confidenceText: {
    color: equinaTheme.colors.ivory,
    fontSize: 13,
    fontWeight: "400"
  },
  academyScreen: {
    gap: 16
  },
  academyScreenImmersive: {
    flex: 1,
    gap: 0
  },
  academyModeContent: {
    width: "100%"
  },
  academyModeContentImmersive: {
    flex: 1
  },
  personalAcademyHome: {
    gap: 18
  },
  academyPersonalIntro: {
    gap: 8,
    paddingHorizontal: 2,
    paddingTop: 4
  },
  academyPersonalMetaRow: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyPersonalEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyPersonalProgress: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyPersonalTitle: {
    color: nightTheme.text,
    fontSize: equinaTheme.typography.title.fontSize,
    lineHeight: equinaTheme.typography.title.lineHeight,
    fontWeight: "600"
  },
  academyPersonalBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
    maxWidth: 356
  },
  academyRecommendation: {
    height: 252,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: nightTheme.surface,
    position: "relative"
  },
  academyRecommendationImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  academyRecommendationScrim: {
    ...StyleSheet.absoluteFillObject
  },
  academyRecommendationTop: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyRecommendationKicker: {
    color: equinaTheme.colors.ivory,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyRecommendationDuration: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyRecommendationContent: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
    gap: 5
  },
  academyRecommendationReason: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyRecommendationTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "600"
  },
  academyRecommendationSummary: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    maxWidth: 306
  },
  academyRecommendationFooter: {
    minHeight: 34,
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyRecommendationCoach: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  academyRecommendationPlay: {
    width: 34,
    height: 34,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass
  },
  academyRecommendationProgress: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255,247,230,0.22)",
    overflow: "hidden"
  },
  academyRecommendationProgressFill: {
    height: "100%",
    backgroundColor: equinaTheme.colors.brass
  },
  academyPathSection: {
    gap: 8
  },
  academyPathSectionHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyPathSectionTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600"
  },
  academyPathSectionMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  academyPathSectionCopy: {
    flex: 1,
    minWidth: 0
  },
  // Done reads brighter than what is left: brass on a quiet track.
  academyPathTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: equinaTheme.material.quietPressed,
    overflow: "hidden"
  },
  academyPathFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  academyEmptyCatalog: {
    gap: 10,
    paddingTop: 24
  },
  academyEmptyAction: {
    minHeight: 52,
    marginTop: 12,
    borderRadius: equinaTheme.radius.control,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: equinaTheme.colors.brass
  },
  academyEmptyActionText: {
    color: equinaTheme.colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  academyChapterList: {
    gap: 4,
    marginTop: 12
  },
  academyChapterHeading: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    marginBottom: 4
  },
  academyChapterRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: equinaTheme.material.separator
  },
  academyPathViewAll: {
    minWidth: 74,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3
  },
  academyPathViewAllText: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  academyPathList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: nightTheme.border
  },
  academyPathRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: nightTheme.border
  },
  academyPathIndex: {
    width: 24,
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyPathRowCopy: {
    flex: 1,
    gap: 2
  },
  academyPathRowTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  academyPathRowMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyPersonalActions: {
    gap: 8
  },
  academyPersonalAction: {
    minHeight: 60,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderColor: nightTheme.border,
    backgroundColor: "transparent"
  },
  academyPersonalActionCopy: {
    flex: 1,
    gap: 2
  },
  academyPersonalActionTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  academyPersonalActionBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400"
  },
  learnHome: {
    flex: 1,
    gap: 16
  },
  learnEntryRow: {
    gap: 14
  },
  learnEntryTile: {
    flex: 1,
    minHeight: 226,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: nightTheme.surface
  },
  learnCoachTile: {
    minHeight: 328,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 }
  },
  learnCoachTileTop: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  learnCoachPill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(7,8,6,0.46)"
  },
  learnCoachPillText: {
    color: equinaTheme.colors.ivory,
    fontSize: 11,
    fontWeight: "600"
  },
  learnCoachArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.12)"
  },
  learnCoachTileContent: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 20
  },
  learnCoachTileTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "600",
    maxWidth: 262
  },
  learnCoachTileBody: {
    color: "rgba(255,247,230,0.74)",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    maxWidth: 286
  },
  learnLibraryTile: {
    minHeight: 148,
    borderRadius: 24,
    overflow: "hidden",
    padding: 16,
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.ivory
  },
  learnLibraryImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "44%",
    opacity: 0.72
  },
  learnLibraryCopy: {
    maxWidth: "63%"
  },
  learnLibraryTitle: {
    color: equinaTheme.colors.ink,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
    marginTop: 4
  },
  learnLibraryBody: {
    color: "rgba(22,21,18,0.62)",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4
  },
  learnLibraryArrow: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.accent
  },
  learnEntryImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  learnEntryScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16,20,14,0.46)"
  },
  learnEntryScrimStrong: {
    backgroundColor: "rgba(16,20,14,0.58)"
  },
  learnEntryContent: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18
  },
  learnEntryLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    letterSpacing: 0,
    marginBottom: 7
  },
  learnEntryTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "600"
  },
  learnEntryBody: {
    color: "rgba(255,247,230,0.68)",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5
  },
  learnEntryIcon: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.12)"
  },
  learnSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2
  },
  learnSectionTitle: {
    color: nightTheme.text,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "600",
    marginTop: 2
  },
  learnAllButton: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: nightTheme.accentFill,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  learnAllButtonText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  academySwitch: {
    minHeight: 50,
    flexDirection: "row",
    gap: 3,
    padding: 3,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet
  },
  academySwitchItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center",
    outlineWidth: 0,
    outlineColor: "transparent"
  },
  academySwitchItemActive: {
    backgroundColor: equinaTheme.material.selected
  },
  academySwitchText: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "400"
  },
  academySwitchTextActive: {
    color: nightTheme.text,
    fontWeight: "600"
  },
  academyLibrary: {
    gap: 10
  },
  academyHero: {
    height: 236,
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }
  },
  academyHeroImage: {
    width: "100%",
    height: "100%"
  },
  academyHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18,17,14,0.30)"
  },
  academyHeroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 14,
    justifyContent: "space-between"
  },
  academyHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  masterclassPill: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(247,243,234,0.07)",
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.09)"
  },
  masterclassPillText: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "600"
  },
  academyPlayLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  academyPlayButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)"
  },
  academyProgressBadge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.92)"
  },
  academyProgressValue: {
    color: equinaTheme.colors.ink,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 21
  },
  academyProgressLabel: {
    color: nightTheme.muted,
    fontSize: 10,
    fontWeight: "400",
  },
  academyHeroKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    fontWeight: "400",
  },
  academyHeroTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "600",
    marginTop: 4
  },
  academyHeroBody: {
    color: "#E8DDC8",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5
  },
  academyHeroActions: {
    flexDirection: "row",
    gap: 8
  },
  academyPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: nightTheme.accentFillStrong,
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  academyPrimaryText: {
    color: equinaTheme.colors.ivory,
    fontSize: 14,
    fontWeight: "600"
  },
  academyGhostButton: {
    minWidth: 92,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7
  },
  academyGhostText: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  academyProgressCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }
  },
  academyProgressTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  academyProgressTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: 2
  },
  academyProgressPercent: {
    color: equinaTheme.colors.pine,
    fontSize: 18,
    fontWeight: "600"
  },
  academyMetricRow: {
    flexDirection: "row",
    gap: 8
  },
  academyProgressMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16
  },
  academyPathCards: {
    gap: 7
  },
  academyPathCard: {
    minHeight: 58,
    borderRadius: 14,
    padding: 9,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.border,
    gap: 7
  },
  academyPathCardActive: {
    backgroundColor: nightTheme.surfaceSoft,
    borderColor: nightTheme.borderStrong
  },
  academyPathCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  academyPathAccent: {
    width: 5,
    height: 30,
    borderRadius: 999,
  },
  academyPathTitle: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600"
  },
  academyPathBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2
  },
  academyPathFooter: {
    alignItems: "flex-end",
    gap: 1
  },
  academyPathMeta: {
    color: equinaTheme.text.secondary,
    fontSize: 10,
    lineHeight: 12
  },
  academyPathPercent: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600"
  },
  academyPathMiniTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: equinaTheme.material.quietPressed,
    overflow: "hidden"
  },
  academyPathMiniFill: {
    height: "100%",
    borderRadius: 999
  },
  academyUtilityRow: {
    flexDirection: "row",
    gap: 8
  },
  academyUtilityCard: {
    flex: 1,
    minHeight: 64,
    borderRadius: 16,
    padding: 10,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  academyUtilityIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  academyUtilityTitle: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600"
  },
  academyUtilityBody: {
    color: equinaTheme.text.secondary,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2
  },
  academyDirectoryTeaser: {
    minHeight: 76,
    borderRadius: 16,
    padding: 12,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyDirectoryTitle: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "600"
  },
  academyDirectoryBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  academyDirectoryButton: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  academyDirectoryButtonText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  academyDirectoryScreen: {
    gap: 14
  },
  academyDirectoryHeader: {
    minHeight: 40,
    paddingHorizontal: 2,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  academyDirectoryHeading: {
    color: nightTheme.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "600",
    marginTop: 2
  },
  academyDirectorySubhead: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4
  },
  academyDirectoryCount: {
    minWidth: 30,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  academyDirectoryCountText: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    paddingBottom: 4
  },
  academySearchShell: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: nightTheme.surface,
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    gap: 9
  },
  academySearchInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    outlineWidth: 0,
    outlineColor: "transparent"
  },
  academySearchClear: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  academySearchText: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 17
  },
  academyTopicRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 14
  },
  academyTopicChip: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quiet
  },
  academyTopicChipActive: {
    backgroundColor: equinaTheme.material.selected
  },
  academyTopicText: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "400"
  },
  academyTopicTextActive: {
    color: nightTheme.text,
    fontWeight: "600"
  },
  academyDirectoryResults: {
    gap: 18
  },
  academyMoreLessons: {
    gap: 8
  },
  academyMoreLessonsHeader: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyMoreLessonsTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600"
  },
  academyMoreLessonsCount: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyEmptyState: {
    minHeight: 210,
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  academyCatalogLoading: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center"
  },
  academyEmptyTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: 5
  },
  academyEmptyBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400"
  },
  academyVideoPage: {
    gap: 16
  },
  academyVideoTopRow: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  academyBackButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  academyBackText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  academyVideoPosition: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyVideoFrame: {
    width: "100%",
    aspectRatio: 1.78,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink
  },
  academyVideoImage: {
    width: "100%",
    height: "100%"
  },
  academyVideoPoster: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    pointerEvents: "none"
  },
  academyVideoScrim: {
    ...StyleSheet.absoluteFillObject
  },
  academyVideoDuration: {
    position: "absolute",
    top: 12,
    right: 12,
    minHeight: 30,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(8,7,6,0.58)"
  },
  academyVideoDurationText: {
    color: equinaTheme.colors.ivory,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyVideoCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  academyVideoPlay: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.94)"
  },
  academyLockCard: {
    gap: 8,
    padding: 16,
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised
  },
  academyLockTitle: {
    color: equinaTheme.text.primary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600"
  },
  academyLockBody: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400"
  },
  academyLockError: {
    color: equinaTheme.colorRole.criticalOnDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400"
  },
  academyLockActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
    marginTop: 6
  },
  academyLockPrimary: {
    minHeight: 44,
    minWidth: 120,
    borderRadius: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass
  },
  academyLockPrimaryText: {
    color: equinaTheme.colors.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  academyLockSecondary: {
    minHeight: 44,
    justifyContent: "center"
  },
  academyLockSecondaryText: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    fontWeight: "600"
  },
  academyVideoMessage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 28
  },
  academyVideoMessageText: {
    color: equinaTheme.colors.ivory,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center"
  },
  academyVideoRetry: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.94)"
  },
  academyVideoRetryText: {
    color: equinaTheme.colors.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  academyVideoMeta: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 13
  },
  academyVideoKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyVideoTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "600",
    marginTop: 1
  },
  academyVideoCoach: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1
  },
  academyVideoDetails: {
    gap: 7,
    paddingHorizontal: 2
  },
  academyVideoSummary: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
    marginTop: 3
  },
  academyVideoProgressBlock: {
    gap: 7,
    marginTop: 8,
    marginBottom: 5
  },
  academyVideoProgressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyVideoProgressLabel: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyVideoProgressValue: {
    color: nightTheme.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyVideoGuideAction: {
    minHeight: 58,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: nightTheme.border
  },
  academyVideoGuideCopy: {
    flex: 1,
    gap: 2
  },
  academyVideoGuideTitle: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600"
  },
  academyVideoGuideBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyLessonCompleteButton: {
    minHeight: 64,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: equinaTheme.colors.brass,
    marginTop: 4,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5
  },
  academyLessonCompleteCopy: {
    flex: 1,
    gap: 2
  },
  academyLessonCompleteTitle: {
    color: equinaTheme.colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  academyLessonCompleteMeta: {
    color: "rgba(22,21,18,0.66)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyVideoInfoCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }
  },
  academyVideoInfoTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  academyVideoInfoTitle: {
    color: nightTheme.text,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "600",
    marginTop: 2
  },
  academyVideoPercentBadge: {
    minWidth: 58,
    minHeight: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  academyVideoTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  academyVideoTag: {
    color: nightTheme.text,
    fontSize: 11,
    lineHeight: 14,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.border,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: "hidden"
  },
  academyVideoActions: {
    flexDirection: "row",
    gap: 8
  },
  academyVideoProgress: {
    backgroundColor: nightTheme.surface,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  academyVideoNotes: {
    backgroundColor: nightTheme.surface,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  academyVideoNotesTitle: {
    color: nightTheme.text,
    fontSize: 16,
    fontWeight: "600"
  },
  academyChapterRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 2
  },
  academyChapterTime: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    minWidth: 38
  },
  academyChapterTitle: {
    flex: 1,
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "400"
  },
  academyNextCard: {
    minHeight: 82,
    borderRadius: 16,
    padding: 9,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  academyNextImage: {
    width: 66,
    height: 64,
    borderRadius: 13,
    backgroundColor: equinaTheme.surfaces.raised
  },
  academyNextTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: 2
  },
  academyNextMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 15,
    marginTop: 2
  },
  videoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9
  },
  videoNoteIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  videoNoteTitle: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  videoNoteBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1
  },
  academyCoachRow: {
    flexDirection: "row",
    gap: 9
  },
  academyCoachCard: {
    flex: 1,
    minHeight: 84,
    borderRadius: 15,
    padding: 8,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.025,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  academyCoachAvatar: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8
  },
  academyCoachInitials: {
    color: equinaTheme.colors.ivory,
    fontSize: 14,
    fontWeight: "600"
  },
  academyCoachName: {
    color: nightTheme.text,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center"
  },
  academyCoachMeta: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    marginTop: 3
  },
  academyCoachBadge: {
    color: nightTheme.muted,
    fontSize: 10,
    marginTop: 3,
    textAlign: "center"
  },
  academyLessonStack: {
    borderTopWidth: 1,
    borderTopColor: nightTheme.border
  },
  academyLessonCard: {
    minHeight: 96,
    paddingVertical: 11,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  academyLessonImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: nightTheme.surfaceSoft
  },
  academyLessonBody: {
    flex: 1,
    gap: 4
  },
  academyLessonTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  academyLessonLevel: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    fontWeight: "400",
  },
  academyLessonNow: {
    color: equinaTheme.colors.pine,
    fontSize: 10,
    fontWeight: "600",
    backgroundColor: nightTheme.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden"
  },
  academyLessonTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600"
  },
  academyLessonMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 15
  },
  academyLessonSummary: {
    color: nightTheme.faint,
    fontSize: 11,
    lineHeight: 14
  },
  academyFeaturedLesson: {
    height: 206,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: nightTheme.surface,
    position: "relative"
  },
  academyFeaturedLessonImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  academyFeaturedLessonScrim: {
    ...StyleSheet.absoluteFillObject
  },
  academyFeaturedLessonTop: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyFeaturedLessonBadge: {
    color: equinaTheme.colors.ivory,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  academyFeaturedLessonDuration: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyFeaturedLessonContent: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 13,
    gap: 4
  },
  academyFeaturedLessonReason: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600"
  },
  academyFeaturedLessonTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "600"
  },
  academyFeaturedLessonFooter: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  academyFeaturedLessonCoach: {
    color: "rgba(255,247,230,0.76)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  academyFeaturedLessonPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass
  },
  academyLessonTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: equinaTheme.material.quietPressed,
    overflow: "hidden",
    marginTop: 3
  },
  academyLessonFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.brass
  },
  coachScreen: {
    gap: 12
  },
  coachRoom: {
    height: 188,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }
  },
  coachRoomImage: {
    width: "100%",
    height: "100%"
  },
  coachRoomScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18,17,14,0.32)"
  },
  coachRoomContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 14,
    justifyContent: "space-between"
  },
  coachRoomTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  ralfAvatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,247,230,0.18)"
  },
  coachRoomKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
  },
  coachRoomTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "600",
    marginTop: 2
  },
  coachReadiness: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,247,230,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,247,230,0.14)"
  },
  coachReadinessText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "600"
  },
  coachSignalRow: {
    flexDirection: "row",
    gap: 8
  },
  coachSignal: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    padding: 9,
    backgroundColor: "rgba(255,247,230,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,247,230,0.16)",
    justifyContent: "space-between"
  },
  coachSignalValue: {
    color: equinaTheme.colors.ivory,
    fontSize: 15,
    fontWeight: "600"
  },
  coachSignalLabel: {
    color: equinaTheme.text.secondary,
    fontSize: 10,
    marginTop: 1
  },
  coachIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  coachAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: equinaTheme.colors.pine,
    alignItems: "center",
    justifyContent: "center"
  },
  ralfAvatarCompact: {
    width: 48,
    height: 48,
    borderRadius: 18
  },
  ralfAvatarText: {
    color: equinaTheme.colors.brass,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "600"
  },
  ralfAvatarTextCompact: {
    fontSize: 17,
    lineHeight: 21
  },
  coachVerifiedBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 8,
    backgroundColor: equinaTheme.colors.brass,
    alignItems: "center",
    justifyContent: "center"
  },
  coachIdentityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  coachIdentityNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  coachIdentityName: {
    color: nightTheme.text,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600"
  },
  coachIdentityRole: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  guideSetup: {
    gap: 16,
    paddingTop: 4
  },
  guideSetupIntro: {
    gap: 7,
    paddingHorizontal: 2
  },
  guideEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  guideSetupTitle: {
    color: nightTheme.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "600",
    maxWidth: 330
  },
  guideSetupBody: {
    color: nightTheme.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    maxWidth: 340
  },
  guideProfileBand: {
    minHeight: 74,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    backgroundColor: nightTheme.surface
  },
  guideContextEditor: {
    gap: 16
  },
  guideStarterList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: nightTheme.border
  },
  guideStarterRow: {
    minHeight: 66,
    paddingVertical: 10,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  guideStarterRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: nightTheme.border
  },
  guideStarterCopy: {
    flex: 1,
    gap: 2
  },
  guideStarterTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  guideStarterBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  guideProfileColumn: {
    flex: 1,
    justifyContent: "center",
    gap: 3
  },
  guideProfileDivider: {
    width: 1,
    backgroundColor: nightTheme.border
  },
  guideProfileLabel: {
    color: nightTheme.muted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400"
  },
  guideProfileValue: {
    color: nightTheme.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600"
  },
  guideSegmentBlock: {
    gap: 8
  },
  guideSegmentTitle: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600"
  },
  guideSegmentControl: {
    minHeight: 52,
    borderRadius: 14,
    padding: 4,
    flexDirection: "row",
    gap: 4,
    backgroundColor: nightTheme.surface
  },
  guideSegmentOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center"
  },
  guideSegmentOptionActive: {
    backgroundColor: nightTheme.accentFillStrong
  },
  guideSegmentText: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    textAlign: "center"
  },
  guideSegmentTextActive: {
    color: nightTheme.text,
    fontWeight: "600"
  },
  guideSetupNote: {
    color: nightTheme.faint,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "400"
  },
  guideStartButton: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: equinaTheme.colors.brass,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5
  },
  guideStartText: {
    color: equinaTheme.colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  guideChat: {
    flex: 1,
    backgroundColor: nightTheme.frame
  },
  guideChatHeader: {
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  guideChatBack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  guideChatHeading: {
    flex: 1,
    gap: 4
  },
  guideTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  guideLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.colors.brass
  },
  guideChatTitle: {
    color: nightTheme.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "600"
  },
  guideChatContext: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400"
  },
  guideAdjustButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  guidePromptList: {
    gap: 8,
    paddingRight: 14
  },
  guidePrompt: {
    minHeight: 38,
    maxWidth: 210,
    borderRadius: 18,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.065)"
  },
  guidePromptBorder: {
    borderBottomWidth: 1,
    borderBottomColor: nightTheme.border
  },
  guidePromptText: {
    color: nightTheme.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    textAlign: "center"
  },
  guideMessageStack: {
    flexGrow: 1,
    justifyContent: "flex-end",
    gap: 16,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 12
  },
  guideMessageScroller: {
    flex: 1,
    minHeight: 0
  },
  guideMessageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 9
  },
  guideMessageRowUser: {
    justifyContent: "flex-end"
  },
  guideMessageBubble: {
    maxWidth: "84%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 7
  },
  guideMessageAssistant: {
    flex: 1,
    maxWidth: "88%",
    paddingHorizontal: 0,
    paddingVertical: 1,
    backgroundColor: "transparent"
  },
  guideMessageUser: {
    maxWidth: "82%",
    backgroundColor: "rgba(49,91,77,0.82)",
    borderBottomRightRadius: 8
  },
  guideMessageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  guideMessageAvatarText: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600"
  },
  guideMessageText: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400"
  },
  guideMessageTextUser: {
    color: equinaTheme.colors.ivory
  },
  guideComposerDock: {
    gap: 9,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12
  },
  guideSuggestions: {
    gap: 6
  },
  guideSuggestionsLabel: {
    color: nightTheme.faint,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400",
    paddingHorizontal: 2
  },
  guideComposer: {
    minHeight: 56,
    backgroundColor: "rgba(20,18,15,0.60)"
  },
  guideComposerFocused: {
    backgroundColor: "rgba(28,25,21,0.76)",
    shadowOpacity: 0.26
  },
  guideComposerContent: {
    minHeight: 56,
    paddingLeft: 14,
    paddingRight: 7,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  guideInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    paddingVertical: 9,
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "400",
    borderWidth: 0,
    outlineWidth: 0,
    outlineColor: "transparent"
  },
  guideSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.07)"
  },
  guideSendButtonReady: {
    backgroundColor: equinaTheme.colors.brass
  },
  coachSetupSheet: {
    backgroundColor: nightTheme.surface,
    borderRadius: 20,
    padding: 14,
    gap: 11,
    borderWidth: 0,
    shadowOpacity: 0
  },
  coachSetupTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  setupEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
  },
  coachSetupTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: 2
  },
  setupDots: {
    flexDirection: "row",
    gap: 5,
    paddingTop: 4
  },
  setupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.material.quietPressed
  },
  setupDotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.colors.brass
  },
  coachPicker: {
    gap: 7
  },
  coachPickerTitle: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "400"
  },
  coachOptionRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 12
  },
  coachOption: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 0
  },
  coachOptionActive: {
    backgroundColor: nightTheme.accentFill
  },
  coachOptionText: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "400"
  },
  coachOptionTextActive: {
    color: nightTheme.text,
    fontWeight: "600"
  },
  coachStartButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: nightTheme.accentFillStrong,
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  coachStartText: {
    color: equinaTheme.colors.ivory,
    fontSize: 14,
    fontWeight: "600"
  },
  chatPanel: {
    backgroundColor: nightTheme.surface,
    borderRadius: 22,
    padding: 14,
    gap: 12,
    borderWidth: 0,
    shadowOpacity: 0
  },
  chatPanelReady: {
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingTop: 2
  },
  coachContextBar: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(247,243,234,0.045)"
  },
  coachContextIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.14)"
  },
  coachContextTitle: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  coachContextMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    marginTop: 2
  },
  coachContextLive: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  chatTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600"
  },
  chatSubtle: {
    color: nightTheme.muted,
    fontSize: 12,
    marginTop: 2
  },
  chatContextPill: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: nightTheme.surfaceSoft
  },
  chatContextText: {
    color: nightTheme.muted,
    fontSize: 11,
    fontWeight: "400"
  },
  quickPromptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8
  },
  quickPrompt: {
    width: "48.5%",
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  quickPromptText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "400"
  },
  messageStack: {
    gap: 10
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  messageRowUser: {
    justifyContent: "flex-end"
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  messageBubble: {
    maxWidth: "82%",
    borderRadius: 18,
    padding: 12,
    gap: 7
  },
  messageAssistant: {
    backgroundColor: nightTheme.surfaceSoft,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  messageUser: {
    backgroundColor: nightTheme.accentFill,
    borderTopRightRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.1)"
  },
  messageMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  messageLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  messageConfidence: {
    color: nightTheme.muted,
    fontSize: 11
  },
  messageText: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 20
  },
  messageTextUser: {
    color: equinaTheme.colors.ivory
  },
  chatComposer: {
    minHeight: 54,
    borderRadius: 20,
    paddingLeft: 13,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  chatInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 88,
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 19,
    paddingVertical: 8,
    outlineWidth: 0,
    outlineColor: "transparent"
  },
  chatSendButton: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.accentFillStrong,
    borderWidth: 0
  },
  communityTopBar: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  communityEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    letterSpacing: 0,
  },
  communityTitle: {
    color: nightTheme.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "600",
    marginTop: 2
  },
  communityShareMini: {
    minHeight: 44,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: nightTheme.accentFillStrong
  },
  communityShareMiniDone: {
    backgroundColor: "rgba(49,91,77,0.72)"
  },
  communityShareMiniText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  communityPreviewStatus: {
    minHeight: 44,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  communityPreviewStatusText: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  communityComposer: {
    minHeight: 54,
    borderRadius: 18,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(247,243,234,0.045)",
    borderWidth: 0
  },
  communityComposerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: nightTheme.surfaceSoft
  },
  communityComposerMonogram: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.elevated
  },
  communityComposerMonogramText: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  communityComposerInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  communityComposerText: {
    color: nightTheme.muted,
    fontSize: 14,
    fontWeight: "400"
  },
  communityComposerIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  communityStoryRail: {
    gap: 14,
    paddingRight: 16
  },
  communityStory: {
    width: 62,
    alignItems: "center",
    gap: 5
  },
  communityStoryRing: {
    width: 58,
    height: 58,
    borderRadius: equinaTheme.radius.card,
    padding: 2,
    borderWidth: 1,
    borderColor: "rgba(216,169,74,0.6)"
  },
  communityStoryImage: {
    width: "100%",
    height: "100%",
    borderRadius: equinaTheme.radius.control,
    backgroundColor: nightTheme.surfaceSoft
  },
  communityLiveBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.frame
  },
  communityLivePulse: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: equinaTheme.colors.brass
  },
  communityLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  communityStoryName: {
    color: nightTheme.text,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    maxWidth: 72
  },
  communityStoryLabel: {
    color: nightTheme.faint,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    maxWidth: 72
  },
  communityLiveRoom: {
    height: 232,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.26,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 }
  },
  communityLiveImage: {
    width: "100%",
    height: "100%"
  },
  communityLiveScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,6,5,0.5)"
  },
  communityLiveContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
    justifyContent: "space-between"
  },
  communityLiveTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  communityLivePill: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(247,243,234,0.12)"
  },
  communityLiveDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  communityLivePillText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  communityLiveCount: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 12,
    fontWeight: "600"
  },
  communityLiveTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "600"
  },
  communityLiveBody: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 286
  },
  communityJoinButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(216,169,74,0.26)"
  },
  communityJoinText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  communityQuickActions: {
    flexDirection: "row",
    gap: 8
  },
  socialActionPill: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  socialActionText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600"
  },
  communityFeedHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 6
  },
  communityFeedTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600"
  },
  communityEmpty: {
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 8
  },
  communityEmptyTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600"
  },
  communityEmptyBody: {
    color: nightTheme.muted,
    fontSize: 15,
    lineHeight: 21
  },
  communityFeedMeta: {
    color: nightTheme.faint,
    fontSize: 11,
    fontWeight: "400"
  },
  communityPostCard: {
    borderRadius: 0,
    padding: 0,
    gap: 10,
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowOpacity: 0
  },
  communityPostHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  communityPostAuthor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  communityPostAvatar: {
    width: 42,
    height: 42,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: nightTheme.surfaceSoft
  },
  communityPostNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  communityPostAuthorText: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  communityPostMeta: {
    color: nightTheme.faint,
    fontSize: 11,
    marginTop: 2
  },
  communityPostMore: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  communityPostMoreText: {
    color: nightTheme.muted,
    fontSize: 14,
    fontWeight: "600",
    marginTop: -5
  },
  communityPostTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "600"
  },
  communityPostBody: {
    color: nightTheme.muted,
    fontSize: 14,
    lineHeight: 20
  },
  communityPostImage: {
    height: 226,
    width: "100%",
    borderRadius: equinaTheme.radius.card,
    backgroundColor: nightTheme.surfaceSoft
  },
  communityPostActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18
  },
  communityPostAction: {
    minHeight: 44,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "transparent"
  },
  communityPostActionText: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  postCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 16,
    gap: 9,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  clubHero: {
    minHeight: 126,
    borderRadius: 18,
    backgroundColor: equinaTheme.colors.ink,
    padding: 16,
    justifyContent: "space-between",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 }
  },
  clubTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "600",
    letterSpacing: 0,
  },
  clubBody: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    marginTop: 5,
    fontWeight: "400"
  },
  clubButton: {
    alignSelf: "flex-start",
    backgroundColor: nightTheme.accentFillStrong,
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  clubButtonText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "600"
  },
  sharedCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 16,
    padding: 15,
    gap: 8,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  promptCard: {
    backgroundColor: nightTheme.surfaceSoft,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  promptTitle: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "600"
  },
  promptBody: {
    color: nightTheme.muted,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 5
  },
  reactionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2
  },
  reactionText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "400",
    backgroundColor: nightTheme.surfaceSoft,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: "hidden"
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  postSpace: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    fontWeight: "400",
  },
  postType: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "400"
  },
  profileScreen: {
    gap: 18
  },
  profileHorseFeature: {
    height: 244,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: nightTheme.surface
  },
  profileHorseFeatureImage: {
    width: "100%",
    height: "100%"
  },
  profileHorseFeatureContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: "space-between"
  },
  profileHorseFeatureTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  profileHorseFeatureKicker: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.8
  },
  profileHorseFeatureTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "600"
  },
  profileHorseFeatureMeta: {
    color: "rgba(255,247,230,0.82)",
    fontSize: 14,
    lineHeight: 19,
    marginTop: 4
  },
  profileHorseFeatureDetail: {
    color: "rgba(255,247,230,0.56)",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  profileAddHorseButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,7,6,0.42)"
  },
  profileTrainingLine: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 2,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: nightTheme.border
  },
  profileTrainingCopy: {
    flex: 1,
    minWidth: 0
  },
  profileTrainingLabel: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  profileTrainingValue: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  vaultHero: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 }
  },
  vaultTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  vaultTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "600"
  },
  vaultBody: {
    color: nightTheme.muted,
    fontSize: 13,
    marginTop: 3
  },
  profileQuickStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  profileQuickStat: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "600",
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    overflow: "hidden"
  },
  vaultProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  vaultProgressLabel: {
    color: equinaTheme.text.secondary,
    fontSize: 13
  },
  vaultProgressValue: {
    color: equinaTheme.colors.ivory,
    fontSize: 18,
    fontWeight: "600"
  },
  vaultTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,247,230,0.16)"
  },
  vaultFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.brass
  },
  vaultHint: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16
  },
  horseRecordCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  horseRecordImage: {
    width: "100%",
    height: 118,
    backgroundColor: equinaTheme.surfaces.raised
  },
  horseRecordBody: {
    padding: 14,
    gap: 12
  },
  horseRecordTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  levelBadgeText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "400"
  },
  docPillRow: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap"
  },
  docPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.border,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  docPillDone: {
    borderColor: "rgba(247,243,234,0.1)"
  },
  docPillText: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "400"
  },
  docPillTextDone: {
    color: nightTheme.text
  },
  vaultActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  vaultAction: {
    width: "48.5%",
    minHeight: 100,
    backgroundColor: nightTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: nightTheme.border,
    padding: 12,
    justifyContent: "space-between"
  },
  vaultActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  vaultActionTitle: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "600"
  },
  vaultActionBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16
  },
  timelineCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: nightTheme.border,
    padding: 12,
    gap: 10
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 4
  },
  timelineIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  timelineTitle: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "600"
  },
  timelineBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  profileCard: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: equinaTheme.colors.pine,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: equinaTheme.colors.ivory,
    fontWeight: "600"
  },
  tabDockOuter: {
    position: "absolute",
    left: floatingDockMetrics.horizontal,
    right: floatingDockMetrics.horizontal,
    bottom: floatingDockMetrics.bottom,
    zIndex: 50,
    backgroundColor: "transparent"
  },
  tabDockFade: {
    position: "absolute",
    top: -32,
    left: -floatingDockMetrics.horizontal,
    right: -floatingDockMetrics.horizontal,
    bottom: -floatingDockMetrics.bottom,
    pointerEvents: "none"
  },
  tabBar: {
    minHeight: floatingDockMetrics.height,
    borderRadius: equinaTheme.radius.card,
    paddingHorizontal: 6,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.17,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10
  },
  tabBarFallback: {
    backgroundColor: "rgba(11,10,9,0.26)",
    borderWidth: 0
  },
  tabBarWeb: {
    backgroundColor: "transparent"
  },
  tabBarWebSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: equinaTheme.material.dockFallback
  },
  tabBarOpaque: {
    backgroundColor: "rgba(20,18,15,0.98)"
  },
  tabGlassLight: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none"
  },
  tabItemSlot: {
    flex: 1,
    minWidth: 0,
    zIndex: 2
  },
  tabItem: {
    width: "100%",
    minHeight: 56,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    position: "relative",
    outlineWidth: 0,
    outlineColor: "transparent",
    outlineStyle: "solid",
    boxShadow: "none"
  },
  tabItemPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }]
  },
  tabIconShell: {
    width: 30,
    height: 26,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 1
  },
  tabBadge: {
    position: "absolute",
    top: 0,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: equinaTheme.colors.brass,
    borderWidth: 1.5,
    borderColor: equinaTheme.colors.ink
  },
  tabLabel: {
    color: "rgba(247,243,234,0.52)",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    zIndex: 1
  },
  tabLabelActive: {
    color: equinaTheme.colors.ivory,
    fontWeight: "600"
  },
  tabLiveDot: {
    position: "absolute",
    right: 2,
    top: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.colors.brass,
    borderWidth: 1,
    borderColor: nightTheme.surface
  },
  tabLiveDotActive: {
    borderColor: "rgba(216,169,74,0.18)"
  },
  tabActiveLabelWrap: {
    maxWidth: 74
  },
  tabTextActive: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "600"
  }
});
