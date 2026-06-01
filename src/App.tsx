import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  BadgeCheck,
  Bot,
  Camera,
  Activity,
  Award,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileText,
  Flame,
  Heart,
  HeartPulse,
  Home,
  LockKeyhole,
  Medal,
  MessageSquareText,
  PackageCheck,
  PlayCircle,
  Plus,
  Search,
  SendHorizontal,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Store,
  Trophy,
  Upload,
  Zap,
  WalletCards
} from "lucide-react-native";
import type { Listing } from "./domain/types";
import { createSeededEquinaApi } from "./seed/seed-data";
import { equinaTheme } from "./ui/theme/theme";

type Tab = "home" | "gear" | "stable" | "assistant" | "community" | "profile";
type Filter = "All" | "Saddles" | "Dressage" | "Jumping";
type ShopMode = "browse" | "sell";
type AcademyMode = "home" | "directory" | "video" | "ai";
const academyTopics = ["All", "Dressage", "Jumping", "Care", "Mindset"] as const;
type AcademyTopic = (typeof academyTopics)[number];
type CoachDiscipline = "Dressage" | "Jumping" | "Eventing" | "Trail";
type MoodOption = "Fresh" | "Focused" | "Tender";
type OnboardingStep = "account" | "rider" | "horse" | "routine";
type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  confidence?: "high" | "medium" | "low";
  label?: string;
};
type HorseState = {
  name: string;
  sessionCount: number;
  careLogged: boolean;
  rideActive: boolean;
};
type AcademyState = {
  progress: number;
  mode: AcademyMode;
  selectedTitle: string;
};
type CoachState = {
  discipline: CoachDiscipline;
  goal: string;
  load: string;
  style: string;
  onboarded: boolean;
  messages: ChatMessage[];
};

const tabs: Array<{ id: Tab; label: string; Icon: typeof Store }> = [
  { id: "home", label: "Home", Icon: Home },
  { id: "stable", label: "Horse", Icon: ShieldCheck },
  { id: "community", label: "Club", Icon: MessageSquareText },
  { id: "assistant", label: "Learn", Icon: Award },
  { id: "gear", label: "Shop", Icon: Store }
];

const nightTheme = {
  bg: "#080706",
  frame: "#0E0D0B",
  surface: "#171511",
  surfaceSoft: "#201D17",
  accent: "#D8A94A",
  accentFill: "rgba(216,169,74,0.16)",
  accentFillStrong: "rgba(216,169,74,0.24)",
  accentGlow: "rgba(216,169,74,0.28)",
  border: "rgba(247,243,234,0.11)",
  borderStrong: "rgba(247,243,234,0.18)",
  text: "#F7F3EA",
  muted: "rgba(247,243,234,0.64)",
  faint: "rgba(247,243,234,0.42)"
} as const;

const filters: Filter[] = ["All", "Saddles", "Dressage", "Jumping"];
const equinaImages = {
  home: "https://images.pexels.com/photos/1996333/pexels-photo-1996333.jpeg?auto=compress&cs=tinysrgb&w=1200",
  stable: "https://images.pexels.com/photos/30010796/pexels-photo-30010796.jpeg?auto=compress&cs=tinysrgb&w=1200",
  profile: "https://images.pexels.com/photos/1996333/pexels-photo-1996333.jpeg?auto=compress&cs=tinysrgb&w=1200",
  tack: "https://images.pexels.com/photos/635499/pexels-photo-635499.jpeg?auto=compress&cs=tinysrgb&w=1200",
  dressage: "https://images.pexels.com/photos/10263545/pexels-photo-10263545.jpeg?auto=compress&cs=tinysrgb&w=1200",
  jumping: "https://images.pexels.com/photos/27110989/pexels-photo-27110989.jpeg?auto=compress&cs=tinysrgb&w=1200",
  eventing: "https://images.pexels.com/photos/27669462/pexels-photo-27669462.jpeg?auto=compress&cs=tinysrgb&w=1200",
  trail: "https://images.pexels.com/photos/35105157/pexels-photo-35105157.jpeg?auto=compress&cs=tinysrgb&w=1200"
};
const coachImageByDiscipline: Record<CoachDiscipline, string> = {
  Dressage: equinaImages.dressage,
  Jumping: equinaImages.jumping,
  Eventing: equinaImages.eventing,
  Trail: equinaImages.trail
};
const defaultCoachDiscipline: CoachDiscipline = "Dressage";
const defaultCoachGoal = "Transitions";
const defaultCoachLoad = "Normal week";
const defaultCoachStyle = "Calm";
const coachDisciplines: CoachDiscipline[] = ["Dressage", "Jumping", "Eventing", "Trail"];
const coachGoalsByDiscipline: Record<CoachDiscipline, string[]> = {
  Dressage: [defaultCoachGoal, "Contact", "Suppleness"],
  Jumping: ["Rhythm", "Lines", "Confidence"],
  Eventing: ["Balance", "Fitness", "Recovery"],
  Trail: ["Relaxation", "Fitness", "Confidence"]
};
const coachLoads = ["Light week", defaultCoachLoad, "Heavy week"];
const coachStyles = [defaultCoachStyle, "Direct", "Detailed"];
const coachQuickPrompts = [
  "Plan today",
  "Recap ride",
  "Fit check",
  "Track after?"
];
const onboardingSteps: OnboardingStep[] = ["account", "rider", "horse", "routine"];
const riderLevels = ["Beginner", "Intermediate", "Advanced", "Pro"] as const;
const onboardingGoals = ["Daily training", "Competition", "Horse care", "Learn faster"] as const;
const ridingFrequencies = ["2 rides/week", "3-4 rides/week", "5+ rides/week"] as const;
const horsePhotoOptions = [
  { label: "Portrait", image: equinaImages.profile },
  { label: "Stable", image: equinaImages.stable },
  { label: "Action", image: equinaImages.home }
] as const;
const horseSexes = ["Mare", "Gelding", "Stallion"] as const;
const horseRideFeels = ["Calm warm-up", "Extra energy", "Needs quiet aids"] as const;
const carePriorities = ["Training plan", "Recovery", "Vet records", "Gear fit"] as const;
const appPriorities = ["Ride plan", "Health records", "Lessons", "Club", "Shop"] as const;
const homeFriendStories = [
  { initials: "M", name: "Mara", horse: "Atlas", status: "Riding", accent: "#D8A94A" },
  { initials: "S", name: "Sofia", horse: "Nero", status: "Streak", accent: "#315B4D" },
  { initials: "N", name: "Noor", horse: "Vega", status: "Lesson", accent: "#8C6A3E" }
];
const homeFeedItems = [
  { rider: "Mara", horse: "Atlas", title: "Clean changes", body: "42 min dressage · rhythm up 9%.", tag: "12m" },
  { rider: "Sofia", horse: "Nero", title: "New streak", body: "3 days in a row · gymnastic line done.", tag: "1h" }
];
const communityStories = [
  { name: "Ilinca", initials: "I", image: equinaImages.profile, label: "Your ride", live: false },
  { name: "Mara", initials: "M", image: equinaImages.dressage, label: "Flatwork", live: true },
  { name: "Sofia", initials: "S", image: equinaImages.jumping, label: "Jump line", live: false },
  { name: "Elena", initials: "E", image: equinaImages.stable, label: "Coach", live: true }
];
const communityFeedMedia = [equinaImages.dressage, equinaImages.jumping, equinaImages.stable];
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
const academyCoaches = [
  { name: "Elena Marquez", discipline: "Dressage", badge: "Olympic trainer", initials: "EM", accent: "#315B4D" },
  { name: "James Whitaker", discipline: "Jumping", badge: "Grand Prix coach", initials: "JW", accent: "#8C6A3E" },
  { name: "Amelie Laurent", discipline: "Care", badge: "Sport horse physio", initials: "AL", accent: "#D8A94A" }
];
const academyLessons = [
  {
    title: "Elastic Contact",
    coach: "Elena Marquez",
    coachTitle: "Olympic trainer",
    duration: "18 min",
    level: "Intermediate",
    topic: "Dressage",
    summary: "Create a softer hand while keeping Ralfy forward and relaxed.",
    progress: 64,
    image: equinaImages.dressage,
    chapters: [
      { time: "0:00", title: "Warm-up feel" },
      { time: "4:20", title: "Soft rein connection" },
      { time: "12:10", title: "Finish on stretch" }
    ]
  },
  {
    title: "Confident Lines",
    coach: "James Whitaker",
    coachTitle: "Grand Prix coach",
    duration: "14 min",
    level: "Jumping",
    topic: "Jumping",
    summary: "Build rhythm through small lines without rushing the last stride.",
    progress: 22,
    image: equinaImages.jumping,
    chapters: [
      { time: "0:00", title: "Canter rhythm" },
      { time: "3:30", title: "Two-pole line" },
      { time: "9:40", title: "Confidence repeat" }
    ]
  },
  {
    title: "Recovery Check",
    coach: "Amelie Laurent",
    coachTitle: "Sport horse physio",
    duration: "11 min",
    level: "Care",
    topic: "Care",
    summary: "A clean post-ride check for legs, back, mood, and hydration.",
    progress: 0,
    image: equinaImages.stable,
    chapters: [
      { time: "0:00", title: "Leg scan" },
      { time: "3:15", title: "Back and saddle marks" },
      { time: "7:50", title: "What to log" }
    ]
  },
  {
    title: "Better Transitions",
    coach: "Elena Marquez",
    coachTitle: "Olympic trainer",
    duration: "16 min",
    level: "Beginner",
    topic: "Dressage",
    summary: "Make walk-trot transitions cleaner with a simple three-cue routine.",
    progress: 48,
    image: "https://images.pexels.com/photos/17077905/pexels-photo-17077905.jpeg?auto=compress&cs=tinysrgb&w=1200",
    chapters: [
      { time: "0:00", title: "Seat first" },
      { time: "5:05", title: "Leg timing" },
      { time: "11:30", title: "Reward the try" }
    ]
  },
  {
    title: "Brave Oxer Mindset",
    coach: "James Whitaker",
    coachTitle: "Grand Prix coach",
    duration: "13 min",
    level: "Mindset",
    topic: "Mindset",
    summary: "A calm mental reset for riders who overthink the bigger fence.",
    progress: 8,
    image: "https://images.pexels.com/photos/14440674/pexels-photo-14440674.jpeg?auto=compress&cs=tinysrgb&w=1200",
    chapters: [
      { time: "0:00", title: "Breathe before turn" },
      { time: "4:00", title: "Eyes and line" },
      { time: "9:15", title: "Debrief without drama" }
    ]
  },
  {
    title: "Saddle Marks 101",
    coach: "Amelie Laurent",
    coachTitle: "Sport horse physio",
    duration: "9 min",
    level: "Care",
    topic: "Care",
    summary: "Spot pressure signs early and know when to ask a saddler.",
    progress: 0,
    image: equinaImages.tack,
    chapters: [
      { time: "0:00", title: "Normal marks" },
      { time: "2:45", title: "Pressure warning signs" },
      { time: "6:30", title: "Saddler notes" }
    ]
  }
] satisfies Array<{
  title: string;
  coach: string;
  coachTitle: string;
  duration: string;
  level: string;
  topic: Exclude<AcademyTopic, "All">;
  summary: string;
  progress: number;
  image: string;
  chapters: Array<{ time: string; title: string }>;
}>;

const academyPaths = [
  { title: "Dressage base", body: "Contact, rhythm, transitions", progress: 38, lessons: "4 lessons", accent: "#183B32" },
  { title: "Jumping calm", body: "Lines, rhythm, confidence", progress: 22, lessons: "3 lessons", accent: "#8C6A3E" },
  { title: "Care basics", body: "Recovery, saddle marks, checks", progress: 12, lessons: "3 lessons", accent: "#A7813D" }
];

const conditionLabel = (condition: Listing["conditionGrade"]) => condition.replace("_", " ");

const fitScore = (listing?: Listing) => {
  if (!listing) return 0;
  let score = listing.category === "saddle" ? 76 : 82;
  if (listing.metadata?.saddleType === "dressage") score += 12;
  if (listing.metadata?.saddleType === "jumping") score += 8;
  if (listing.metadata?.treeSize?.toLowerCase() === "medium") score += 6;
  if (listing.metadata?.proofOfOwnership) score += 4;
  if (listing.conditionGrade === "new" || listing.conditionGrade === "like_new") score += 3;
  return Math.min(score, 96);
};

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

const createCoachReply = ({
  prompt,
  horseName,
  discipline,
  goal,
  load,
  style,
  listing
}: {
  prompt: string;
  horseName: string;
  discipline: CoachDiscipline;
  goal: string;
  load: string;
  style: string;
  listing?: Listing;
}): Omit<ChatMessage, "id" | "role"> => {
  const text = prompt.toLowerCase();
  const voice = style === "Direct" ? "Simple:" : style === "Detailed" ? "Plan:" : "Steady:";
  const planByDiscipline: Record<CoachDiscipline, string> = {
    Dressage: "8 walk · 12 rhythm · 8 transitions · stretch.",
    Jumping: "10 walk · poles only · 4 calm lines · stretch.",
    Eventing: "10 walk · balance work · short canter · recovery.",
    Trail: "long walk · hills if calm · loose rein · legs check."
  };

  if (text.includes("saddle") || text.includes("tack") || text.includes("fit")) {
    return {
      label: "Fit",
      confidence: listing?.metadata?.treeSize ? "medium" : "low",
      text: listing
        ? `${voice} ${listing.brand} ${listing.model ?? "item"} is worth a fit screen. Ask for panel photos, tree width, serial, and a no-pad placement video.`
        : `${voice} add photos, tree size, panel shape, and ${horseName}'s back measurements first.`
    };
  }

  if (text.includes("lame") || text.includes("swollen") || text.includes("colic") || text.includes("pain")) {
    return {
      label: "Safety",
      confidence: "medium",
      text: `${voice} pause work. Log time, appetite, legs, temperature if available, and photos. Coach or vet review before training.`
    };
  }

  if (text.includes("summarize") || text.includes("recap") || text.includes("last ride")) {
    return {
      label: "Recap",
      confidence: "high",
      text: `${voice} ${horseName} is on a ${load.toLowerCase()}. Main focus: ${goal.toLowerCase()} in ${discipline.toLowerCase()}. Save one video and one feeling note.`
    };
  }

  if (text.includes("track") || text.includes("after")) {
    return {
      label: "Journal",
      confidence: "high",
      text: `${voice} track energy, warm-up feel, best moment, sticky moment, legs after cool-down, and tomorrow's load.`
    };
  }

  return {
    label: discipline,
    confidence: "medium",
    text: `${voice} ${horseName} today: ${planByDiscipline[discipline]} If it gets heavy, finish early on one good repeat.`
  };
};

export default function App() {
  const seeded = useMemo(() => createSeededEquinaApi(), []);
  const { api, buyerSession, sellerSession, horse } = seeded;
  const [accountCreated, setAccountCreated] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("account");
  const [onboardingName, setOnboardingName] = useState("Ilinca");
  const [onboardingEmail, setOnboardingEmail] = useState("ilinca.rider@example.com");
  const [onboardingDiscipline, setOnboardingDiscipline] = useState<CoachDiscipline>("Dressage");
  const [onboardingLevel, setOnboardingLevel] = useState<(typeof riderLevels)[number]>("Intermediate");
  const [onboardingGoal, setOnboardingGoal] = useState<(typeof onboardingGoals)[number]>("Daily training");
  const [onboardingHorsePhoto, setOnboardingHorsePhoto] = useState(equinaImages.profile);
  const [onboardingHorseName, setOnboardingHorseName] = useState(horse.name);
  const [onboardingHorseBreed, setOnboardingHorseBreed] = useState("Warmblood");
  const [onboardingHorseSex, setOnboardingHorseSex] = useState<(typeof horseSexes)[number]>("Gelding");
  const [onboardingHorseAge, setOnboardingHorseAge] = useState("9");
  const [onboardingHorseHeight, setOnboardingHorseHeight] = useState("166");
  const [onboardingRideFeel, setOnboardingRideFeel] = useState<(typeof horseRideFeels)[number]>("Extra energy");
  const [onboardingFrequency, setOnboardingFrequency] = useState<(typeof ridingFrequencies)[number]>("3-4 rides/week");
  const [onboardingCarePriority, setOnboardingCarePriority] = useState<(typeof carePriorities)[number]>("Training plan");
  const [onboardingAppPriority, setOnboardingAppPriority] = useState<(typeof appPriorities)[number]>("Ride plan");
  const [tab, setTab] = useState<Tab>("home");
  const [selectedListingId, setSelectedListingId] = useState(api.store.listings[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [marketSearch, setMarketSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<Filter>("All");
  const [shopMode, setShopMode] = useState<ShopMode>("browse");
  const [rideActive, setRideActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(4);
  const [careLogged, setCareLogged] = useState(false);
  const [communityLikes, setCommunityLikes] = useState(18);
  const [sharedRide, setSharedRide] = useState(false);
  const [lastRideRecapVisible, setLastRideRecapVisible] = useState(false);
  const [dailyMood, setDailyMood] = useState<MoodOption>("Focused");
  const [focusStarted, setFocusStarted] = useState(false);
  const [focusProgress, setFocusProgress] = useState(64);
  const [coachDiscipline, setCoachDiscipline] = useState<CoachDiscipline>(defaultCoachDiscipline);
  const [coachGoal, setCoachGoal] = useState(defaultCoachGoal);
  const [coachLoad, setCoachLoad] = useState(defaultCoachLoad);
  const [coachStyle, setCoachStyle] = useState(defaultCoachStyle);
  const [coachOnboarded, setCoachOnboarded] = useState(false);
  const [academyProgress, setAcademyProgress] = useState(38);
  const [academyMode, setAcademyMode] = useState<AcademyMode>("home");
  const [selectedAcademyTitle, setSelectedAcademyTitle] = useState(academyLessons[0]?.title ?? "");
  const riderDisplayName = onboardingName.trim() || "Ilinca";
  const primaryHorseName = onboardingHorseName.trim() || horse.name;
  const [coachMessages, setCoachMessages] = useState<ChatMessage[]>([
    {
      id: "coach-welcome",
      role: "assistant",
      label: "Coach AI",
      confidence: "medium",
      text: `Choose ${primaryHorseName}'s discipline and focus. Then ask for a plan, recap, or fit check.`
    }
  ]);
  const [horseCount, setHorseCount] = useState(1);
  const [passportUploaded, setPassportUploaded] = useState(false);
  const [medCheckCount, setMedCheckCount] = useState(2);
  const [labReportCount, setLabReportCount] = useState(1);
  const [savedTackCount, setSavedTackCount] = useState(8);
  const [reservedListingId, setReservedListingId] = useState("");
  const [renderKey, setRenderKey] = useState(0);
  const screenAnim = useRef(new Animated.Value(1)).current;

  const selectedListing = api.store.listings.find((listing) => listing.id === selectedListingId) ?? api.store.listings[0];
  const marketListings = filterLiveListings(api.store.listings, marketSearch, marketFilter);
  const seller = api.store.profiles.find((profile) => profile.userId === sellerSession.userId);
  const buyer = api.store.profiles.find((profile) => profile.userId === buyerSession.userId);
  const visibleMarketListing = marketListings.find((listing) => listing.id === selectedListing?.id) ?? marketListings[0];
  const reservedListing = api.store.listings.find((listing) => listing.id === reservedListingId);
  const buyerOrders = api.store.orders.filter((order) => order.buyerId === buyerSession.userId);
  const sellerOrders = api.store.orders.filter((order) => order.sellerId === sellerSession.userId);
  const sellerRevenue = sellerOrders.reduce((total, order) => total + order.amount, 0);
  const sellerRevenueLabel =
    sellerOrders.length > 0
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: sellerOrders[0]?.currency ?? "EUR",
          maximumFractionDigits: 0
        }).format(sellerRevenue)
      : "$0";
  const activeSellerListings = api.store.listings.filter((listing) => listing.sellerId === sellerSession.userId && listing.status === "active").length;
  const horseState: HorseState = {
    name: primaryHorseName,
    sessionCount,
    careLogged,
    rideActive
  };
  const academyState: AcademyState = {
    progress: academyProgress,
    mode: academyMode,
    selectedTitle: selectedAcademyTitle
  };
  const coachState: CoachState = {
    discipline: coachDiscipline,
    goal: coachGoal,
    load: coachLoad,
    style: coachStyle,
    onboarded: coachOnboarded,
    messages: coachMessages
  };

  useEffect(() => {
    screenAnim.setValue(0);
    Animated.spring(screenAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 190,
      mass: 0.7,
      useNativeDriver: false
    }).start();
  }, [screenAnim, tab]);

  const screenMotionStyle = {
    opacity: screenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 1]
    }),
    transform: [
      {
        translateY: screenAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0]
        })
      },
      {
        scale: screenAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.992, 1]
        })
      }
    ]
  };

  const refresh = (nextMessage: string) => {
    setMessage(nextMessage);
    setRenderKey((key) => key + 1);
  };

  const toggleRide = () => {
    setRideActive((active) => {
      const next = !active;
      if (next) {
        setLastRideRecapVisible(false);
        setCareLogged(false);
        refresh("Ride started. Keep the rhythm easy.");
      } else {
        setSessionCount((count) => count + 1);
        setFocusProgress((progress) => Math.min(100, progress + 10));
        setLastRideRecapVisible(true);
        refresh("Ride recap saved. Add care or share it.");
      }
      return next;
    });
  };

  const logCare = () => {
    setCareLogged(true);
    refresh("Care logged. Ralfy is up to date.");
  };

  const openAssistant = () => {
    setTab("assistant");
    refresh("Learn is ready.");
  };

  const continueAcademy = () => {
    setAcademyProgress((progress) => Math.min(100, progress + 8));
    refresh("Lesson progress saved.");
  };

  const navigateAcademy = (mode: AcademyMode) => {
    setAcademyMode(mode);
    setRenderKey((key) => key + 1);
  };

  const openAcademyLesson = (title: string) => {
    setSelectedAcademyTitle(title);
    navigateAcademy("video");
  };

  const updateCoachDiscipline = (value: CoachDiscipline) => {
    setCoachDiscipline(value);
    setCoachGoal(coachGoalsByDiscipline[value][0] ?? defaultCoachGoal);
  };

  const openCommunity = () => {
    setTab("community");
    refresh("");
  };

  const shareRide = (openClub = true) => {
    setSharedRide(true);
    setLastRideRecapVisible(true);
    if (openClub) setTab("community");
    refresh(openClub ? "Shared with your club." : "Ride shared to your club.");
  };

  const updateDailyMood = (mood: MoodOption) => {
    setDailyMood(mood);
    refresh(`Ralfy check-in saved: ${mood.toLowerCase()}.`);
  };

  const startFocusPlan = () => {
    setFocusStarted(true);
    setFocusProgress((progress) => Math.min(100, progress + 8));
    refresh("Today's plan is live.");
  };

  const finishFocusPlan = () => {
    setFocusStarted(false);
    setSessionCount((count) => count + 1);
    setFocusProgress((progress) => Math.min(100, progress + 14));
    refresh("Plan saved to Ralfy's log.");
  };

  const addHorse = () => {
    setHorseCount((count) => Math.min(count + 1, 4));
    refresh("Horse profile added to records.");
  };

  const uploadPassport = () => {
    setPassportUploaded(true);
    refresh("Ralfy's passport is safely stored.");
  };

  const addMedCheck = () => {
    setMedCheckCount((count) => count + 1);
    refresh("Med check added to Ralfy's timeline.");
  };

  const addLabReport = () => {
    setLabReportCount((count) => count + 1);
    refresh("Lab report added.");
  };

  const buySelected = (listingOverride?: Listing) => {
    const listingToBuy = listingOverride ?? selectedListing;
    if (!listingToBuy) {
      refresh("Pick an item first.");
      return;
    }
    try {
      const order = api.orders.createOrder(listingToBuy.id, buyerSession.userId);
      api.orders.startInspection(order.id);
      setSavedTackCount((count) => count + 1);
      setSelectedListingId(listingToBuy.id);
      setReservedListingId(listingToBuy.id);
      refresh(`${listingToBuy.brand} reserved in escrow. Inspection started.`);
    } catch (error) {
      refresh(error instanceof Error ? error.message : "Could not create order.");
    }
  };

  const openDispute = () => {
    const order = api.store.orders.at(-1);
    if (!order) {
      refresh("Save an item first.");
      return;
    }
    try {
      api.orders.openDispute(order.id, buyerSession.userId, "misrepresented", [
        equinaImages.profile,
        equinaImages.tack
      ]);
      refresh("Help request created.");
    } catch (error) {
      refresh(error instanceof Error ? error.message : "Could not open dispute.");
    }
  };

  const createConciergeListing = () => {
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
          { url: equinaImages.jumping, requiredAngle: "underside" },
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
    refresh(`${fitScore(listingToCheck)}% fit check queued for ${listingToCheck.brand}.`);
  };

  const advanceOnboarding = () => {
    const stepIndex = onboardingSteps.indexOf(onboardingStep);
    const nextStep = onboardingSteps[Math.min(stepIndex + 1, onboardingSteps.length - 1)] ?? "routine";
    setOnboardingStep(nextStep);
  };

  const goBackOnboarding = () => {
    const stepIndex = onboardingSteps.indexOf(onboardingStep);
    const nextStep = onboardingSteps[Math.max(stepIndex - 1, 0)] ?? "account";
    setOnboardingStep(nextStep);
  };

  const completeOnboarding = () => {
    const loadFromFrequency =
      onboardingFrequency === "2 rides/week"
        ? "Light week"
        : onboardingFrequency === "5+ rides/week"
          ? "Heavy week"
          : defaultCoachLoad;
    setAccountCreated(true);
    setTab("home");
    setCoachDiscipline(onboardingDiscipline);
    setCoachGoal(coachGoalsByDiscipline[onboardingDiscipline][0] ?? defaultCoachGoal);
    setCoachLoad(loadFromFrequency);
    setCoachOnboarded(false);
    setCoachMessages([
      {
        id: `coach-onboarding-${Date.now()}`,
        role: "assistant",
        label: "Ready",
        confidence: "high",
        text: `${primaryHorseName} is set up for ${onboardingDiscipline.toLowerCase()}, ${onboardingFrequency.toLowerCase()}, with ${onboardingCarePriority.toLowerCase()} as the main priority. I can plan the first session.`
      }
    ]);
    refresh(`Welcome, ${riderDisplayName}. ${primaryHorseName}'s plan is ready.`);
  };

  const useDemoAccount = () => {
    setOnboardingName("Ilinca");
    setOnboardingEmail("ilinca.rider@example.com");
    setOnboardingDiscipline("Dressage");
    setOnboardingLevel("Intermediate");
    setOnboardingGoal("Daily training");
    setOnboardingHorsePhoto(equinaImages.profile);
    setOnboardingHorseName("Ralfy");
    setOnboardingHorseBreed("Warmblood");
    setOnboardingHorseSex("Gelding");
    setOnboardingHorseAge("9");
    setOnboardingHorseHeight("166");
    setOnboardingRideFeel("Extra energy");
    setOnboardingFrequency("3-4 rides/week");
    setOnboardingCarePriority("Training plan");
    setOnboardingAppPriority("Ride plan");
    setAccountCreated(true);
    setTab("home");
    refresh("Welcome back. Ralfy's plan is ready.");
  };

  const contentKey = [
    tab,
    renderKey,
    tab === "assistant" ? (coachOnboarded ? "chat" : "setup") : "",
    tab === "gear" ? shopMode : ""
  ].join("-");
  const headerTitle =
    tab === "home"
      ? `${riderDisplayName} & ${primaryHorseName}`
      : tab === "profile"
        ? riderDisplayName
        : tabs.find((item) => item.id === tab)?.label ?? "Equina";

  if (!accountCreated) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.phoneFrame}>
          <OnboardingScreen
            step={onboardingStep}
            name={onboardingName}
            email={onboardingEmail}
            discipline={onboardingDiscipline}
            level={onboardingLevel}
            goal={onboardingGoal}
            horsePhoto={onboardingHorsePhoto}
            horseName={onboardingHorseName}
            horseBreed={onboardingHorseBreed}
            horseSex={onboardingHorseSex}
            horseAge={onboardingHorseAge}
            horseHeight={onboardingHorseHeight}
            rideFeel={onboardingRideFeel}
            frequency={onboardingFrequency}
            carePriority={onboardingCarePriority}
            appPriority={onboardingAppPriority}
            onNameChange={setOnboardingName}
            onEmailChange={setOnboardingEmail}
            onDisciplineChange={setOnboardingDiscipline}
            onLevelChange={setOnboardingLevel}
            onGoalChange={setOnboardingGoal}
            onHorsePhotoChange={setOnboardingHorsePhoto}
            onHorseNameChange={setOnboardingHorseName}
            onHorseBreedChange={setOnboardingHorseBreed}
            onHorseSexChange={setOnboardingHorseSex}
            onHorseAgeChange={setOnboardingHorseAge}
            onHorseHeightChange={setOnboardingHorseHeight}
            onRideFeelChange={setOnboardingRideFeel}
            onFrequencyChange={setOnboardingFrequency}
            onCarePriorityChange={setOnboardingCarePriority}
            onAppPriorityChange={setOnboardingAppPriority}
            onNext={advanceOnboarding}
            onBack={goBackOnboarding}
            onComplete={completeOnboarding}
            onUseDemo={useDemoAccount}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="light-content" />
      <View style={styles.phoneFrame}>
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <View style={styles.headerMonogram}>
              <Text style={styles.headerMonogramText}>E</Text>
            </View>
            <View>
              <Text style={styles.subBrand}>Equina</Text>
              <Text style={styles.brand}>{headerTitle}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.headerStatusPill}>
              <View style={styles.headerStatusDot} />
              <Text style={styles.headerStatusText}>{tab === "home" ? dailyMood : "Live"}</Text>
            </View>
            <Pressable testID="profile-button" style={styles.profileDot} onPress={() => setTab("profile")}>
              <CircleUserRound size={18} color={nightTheme.text} />
            </Pressable>
          </View>
        </View>

        {message.length > 0 && tab !== "home" && (
          <View testID="global-status" style={styles.globalStatus}>
            <Sparkles size={15} color={equinaTheme.colors.brass} />
            <Text style={styles.statusText}>{message}</Text>
          </View>
        )}

        <Animated.View style={[styles.contentMotion, screenMotionStyle]}>
          <ScrollView key={contentKey} style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
            {tab === "home" && (
              <HomeScreen
                horse={horseState}
                status={message}
                likes={communityLikes}
                sharedRide={sharedRide}
                showRecap={lastRideRecapVisible}
                mood={dailyMood}
                discipline={onboardingDiscipline}
                goal={onboardingGoal}
                frequency={onboardingFrequency}
                carePriority={onboardingCarePriority}
                horsePhoto={onboardingHorsePhoto}
                horseBreed={onboardingHorseBreed}
                rideFeel={onboardingRideFeel}
                progress={focusProgress}
                onToggleRide={toggleRide}
                onLogCare={logCare}
                onMoodSelect={updateDailyMood}
                onOpenAssistant={openAssistant}
                onOpenCommunity={openCommunity}
                onReactToFriend={() => {
                  setCommunityLikes((likes) => likes + 1);
                  refresh("Kudos sent.");
                }}
                onShareRide={() => shareRide(false)}
              />
            )}
            {tab === "gear" && (
              <GearScreen
                mode={shopMode}
                onModeChange={setShopMode}
                onCreate={createConciergeListing}
                listings={marketListings}
                allListings={api.store.listings}
                selectedListing={visibleMarketListing}
                reservedListing={reservedListing}
                sellerName={seller?.displayName ?? "Verified seller"}
                search={marketSearch}
                filter={marketFilter}
                savedCount={savedTackCount}
                buyerOrderCount={buyerOrders.length}
                sellerOrderCount={sellerOrders.length}
                sellerRevenueLabel={sellerRevenueLabel}
                activeListingCount={activeSellerListings}
                interestCount={savedTackCount + (marketFilter === "All" ? 2 : 3)}
                messageCount={3 + api.store.orders.length}
                onSearch={setMarketSearch}
                onFilter={setMarketFilter}
                onSelect={(listing) => {
                  setSelectedListingId(listing.id);
                  refresh(`${listing.brand} ${listing.model ?? listing.category} selected.`);
                }}
                onBuy={() => (visibleMarketListing ? buySelected(visibleMarketListing) : refresh("No live item selected."))}
                onFitCheck={() => (visibleMarketListing ? requestFitCheck(visibleMarketListing) : refresh("No live item selected."))}
                onDispute={openDispute}
                onShopAction={(label) => refresh(`${label} opened.`)}
              />
            )}
            {tab === "stable" && (
              <StableScreen
                horseName={primaryHorseName}
                horsePhoto={onboardingHorsePhoto}
                discipline={onboardingDiscipline}
                level={onboardingLevel}
                horseBreed={onboardingHorseBreed}
                horseSex={onboardingHorseSex}
                horseAge={onboardingHorseAge}
                horseHeight={onboardingHorseHeight}
                passportUploaded={passportUploaded}
                medCheckCount={medCheckCount}
                labReportCount={labReportCount}
                onUploadPassport={uploadPassport}
                onAddMedCheck={addMedCheck}
                onAddLabReport={addLabReport}
                onOpenAssistant={openAssistant}
              />
            )}
            {tab === "assistant" && (
              <AssistantScreen
                listing={selectedListing}
                horse={horseState}
                academy={academyState}
                coach={coachState}
                onAcademyProgress={continueAcademy}
                onAcademyModeChange={navigateAcademy}
                onAcademyLessonOpen={openAcademyLesson}
                onDisciplineChange={updateCoachDiscipline}
                onGoalChange={setCoachGoal}
                onLoadChange={setCoachLoad}
                onCoachStyleChange={setCoachStyle}
                onOnboardedChange={setCoachOnboarded}
                onMessagesChange={setCoachMessages}
              />
            )}
            {tab === "community" && (
              <CommunityScreen
                posts={api.community.listVisiblePosts()}
                likes={communityLikes}
                sharedRide={sharedRide}
                onClubAction={(label) => refresh(`${label} opened.`)}
                onLike={() => {
                  setCommunityLikes((likes) => likes + 1);
                  refresh("Nice. Added your reaction.");
                }}
                onShareRide={shareRide}
              />
            )}
            {tab === "profile" && (
              <ProfileScreen
                buyerName={riderDisplayName}
                horseName={primaryHorseName}
                horsePhoto={onboardingHorsePhoto}
                discipline={onboardingDiscipline}
                level={onboardingLevel}
                goal={onboardingGoal}
                frequency={onboardingFrequency}
                horseBreed={onboardingHorseBreed}
                horseSex={onboardingHorseSex}
                horseAge={onboardingHorseAge}
                horseHeight={onboardingHorseHeight}
                rideFeel={onboardingRideFeel}
                horseCount={horseCount}
                passportUploaded={passportUploaded}
                medCheckCount={medCheckCount}
                labReportCount={labReportCount}
                onAddHorse={addHorse}
                onUploadPassport={uploadPassport}
                onAddMedCheck={addMedCheck}
                onAddLabReport={addLabReport}
                listingCount={api.store.listings.length}
                orderCount={api.store.orders.length}
                disputeCount={api.store.disputes.length}
              />
            )}
          </ScrollView>
        </Animated.View>

        <TabDock activeTab={tab} onChange={setTab} />
      </View>
    </SafeAreaView>
  );
}

function OnboardingScreen({
  step,
  name,
  email,
  discipline,
  level,
  goal,
  horsePhoto,
  horseName,
  horseBreed,
  horseSex,
  horseAge,
  horseHeight,
  rideFeel,
  frequency,
  carePriority,
  appPriority,
  onNameChange,
  onEmailChange,
  onDisciplineChange,
  onLevelChange,
  onGoalChange,
  onHorsePhotoChange,
  onHorseNameChange,
  onHorseBreedChange,
  onHorseSexChange,
  onHorseAgeChange,
  onHorseHeightChange,
  onRideFeelChange,
  onFrequencyChange,
  onCarePriorityChange,
  onAppPriorityChange,
  onNext,
  onBack,
  onComplete,
  onUseDemo
}: {
  step: OnboardingStep;
  name: string;
  email: string;
  discipline: CoachDiscipline;
  level: (typeof riderLevels)[number];
  goal: (typeof onboardingGoals)[number];
  horsePhoto: string;
  horseName: string;
  horseBreed: string;
  horseSex: (typeof horseSexes)[number];
  horseAge: string;
  horseHeight: string;
  rideFeel: (typeof horseRideFeels)[number];
  frequency: (typeof ridingFrequencies)[number];
  carePriority: (typeof carePriorities)[number];
  appPriority: (typeof appPriorities)[number];
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onDisciplineChange: (value: CoachDiscipline) => void;
  onLevelChange: (value: (typeof riderLevels)[number]) => void;
  onGoalChange: (value: (typeof onboardingGoals)[number]) => void;
  onHorsePhotoChange: (value: string) => void;
  onHorseNameChange: (value: string) => void;
  onHorseBreedChange: (value: string) => void;
  onHorseSexChange: (value: (typeof horseSexes)[number]) => void;
  onHorseAgeChange: (value: string) => void;
  onHorseHeightChange: (value: string) => void;
  onRideFeelChange: (value: (typeof horseRideFeels)[number]) => void;
  onFrequencyChange: (value: (typeof ridingFrequencies)[number]) => void;
  onCarePriorityChange: (value: (typeof carePriorities)[number]) => void;
  onAppPriorityChange: (value: (typeof appPriorities)[number]) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
  onUseDemo: () => void;
}) {
  const stepIndex = onboardingSteps.indexOf(step);
  const progress = ((stepIndex + 1) / onboardingSteps.length) * 100;
  const progressAnim = useRef(new Animated.Value(progress)).current;
  const stepAnim = useRef(new Animated.Value(1)).current;
  const heroDrift = useRef(new Animated.Value(0)).current;
  const accountReady = name.trim().length > 1 && email.includes("@");
  const horseReady = horseName.trim().length > 1;
  const canContinue = step === "account" ? accountReady : step === "horse" ? horseReady : true;
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"]
  });
  const stepMotionStyle = {
    opacity: stepAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1]
    }),
    transform: [
      {
        translateY: stepAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0]
        })
      }
    ]
  };
  const heroImageMotion = {
    transform: [
      {
        scale: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [1.02, 1.08]
        })
      },
      {
        translateY: heroDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -10]
        })
      }
    ]
  };
  const spotlightImage =
    step === "account"
      ? equinaImages.home
      : step === "rider"
        ? coachImageByDiscipline[discipline]
        : step === "routine"
          ? equinaImages.stable
          : horsePhoto;
  const spotlightLabel =
    step === "account"
      ? "Private by design"
      : step === "rider"
        ? `${discipline} setup`
        : step === "horse"
          ? `${horseName || "Your horse"} profile`
          : "Your first Home";
  const spotlightMeta =
    step === "account"
      ? "Training, records, Learn, Club and Shop"
      : step === "rider"
        ? `${level} · ${goal}`
        : step === "horse"
          ? `${horseBreed || "Breed"} · ${horseSex}`
          : `${frequency} · ${carePriority}`;
  const title =
    step === "account"
      ? "Your riding life,\nin one place."
      : step === "rider"
        ? "Built around\nyour riding."
        : step === "horse"
          ? "Meet your horse."
          : "Make every ride count.";
  const body =
    step === "account"
      ? "A private space for your rides, horses, records, and progress."
      : step === "rider"
        ? "Tell us what matters. Equina will shape your Home, lessons, and Coach AI."
        : step === "horse"
          ? "Create a simple profile now. You can add records and details later."
          : "Choose what you want to see first. You can change this at any time.";
  const primaryLabel = step === "routine" ? "Create account" : "Continue";

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 460,
      useNativeDriver: false
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    stepAnim.setValue(0);
    Animated.spring(stepAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 190,
      mass: 0.65,
      useNativeDriver: true
    }).start();
  }, [step, stepAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroDrift, {
          toValue: 1,
          duration: 4200,
          useNativeDriver: true
        }),
        Animated.timing(heroDrift, {
          toValue: 0,
          duration: 4200,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [heroDrift]);

  const handlePrimary = () => {
    if (!canContinue) return;
    if (step === "routine") {
      onComplete();
      return;
    }
    onNext();
  };

  return (
    <View style={styles.onboardingRoot}>
      <ScrollView style={styles.onboardingScroll} contentContainerStyle={styles.onboardingContent} showsVerticalScrollIndicator={false}>
        <View style={styles.onboardingTopBar}>
          <View style={styles.onboardingBrand}>
            <View style={styles.headerMonogram}>
              <Text style={styles.headerMonogramText}>E</Text>
            </View>
            <View>
              <Text style={styles.onboardingBrandName}>Equina</Text>
              <Text style={styles.onboardingBrandMeta}>Personal setup</Text>
            </View>
          </View>
          <Pressable testID="onboarding-use-demo" style={({ pressed }) => [styles.onboardingDemoButton, pressed && styles.pressed]} onPress={onUseDemo}>
            <Text style={styles.onboardingDemoText}>Use demo</Text>
          </Pressable>
        </View>

        <View style={styles.onboardingProgressHeader}>
          <Text style={styles.onboardingProgressStep}>{String(stepIndex + 1).padStart(2, "0")} / {String(onboardingSteps.length).padStart(2, "0")}</Text>
          <View style={styles.onboardingProgressShell}>
            <Animated.View style={[styles.onboardingProgressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.onboardingProgressName}>{step}</Text>
        </View>

        <Animated.View style={stepMotionStyle}>
          <Text style={styles.onboardingTitle}>{title}</Text>
          <Text style={styles.onboardingBody}>{body}</Text>
        </Animated.View>

        {step !== "horse" && (
          <View style={styles.onboardingSpotlight}>
            <Animated.Image source={{ uri: spotlightImage }} style={[styles.onboardingSpotlightImage, heroImageMotion]} />
            <View style={styles.onboardingSpotlightScrim} />
            <View style={styles.onboardingSpotlightContent}>
              <View style={styles.onboardingSpotlightBadge}>
                <Sparkles size={13} color={equinaTheme.colors.brass} />
                <Text style={styles.onboardingSpotlightBadgeText}>{spotlightLabel}</Text>
              </View>
              <Text style={styles.onboardingSpotlightMeta}>{spotlightMeta}</Text>
            </View>
          </View>
        )}

        <Animated.View style={stepMotionStyle}>
        {step === "account" && (
          <View style={styles.onboardingPanel}>
            <Text style={styles.onboardingPanelTitle}>Create your profile</Text>
            <View style={styles.onboardingField}>
              <Text style={styles.onboardingLabel}>Name</Text>
              <TextInput
                testID="onboarding-name"
                value={name}
                onChangeText={onNameChange}
                placeholder="Your name"
                placeholderTextColor={nightTheme.faint}
                style={styles.onboardingInput}
              />
            </View>
            <View style={styles.onboardingField}>
              <Text style={styles.onboardingLabel}>Email</Text>
              <TextInput
                testID="onboarding-email"
                value={email}
                onChangeText={onEmailChange}
                placeholder="you@example.com"
                placeholderTextColor={nightTheme.faint}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.onboardingInput}
              />
            </View>
            <View style={styles.onboardingTrustRow}>
              <ShieldCheck size={15} color={equinaTheme.colors.brass} />
              <Text style={styles.onboardingTrustText}>No card. Your profile stays private by default.</Text>
            </View>
          </View>
        )}

        {step === "rider" && (
          <View style={styles.onboardingPanel}>
            <Text style={styles.onboardingPanelTitle}>Your riding profile</Text>
            <OnboardingChoiceGroup
              title="Discipline"
              options={coachDisciplines}
              value={discipline}
              onChange={(value) => onDisciplineChange(value as CoachDiscipline)}
              testPrefix="onboarding-discipline"
            />
            <OnboardingChoiceGroup
              title="Level"
              options={[...riderLevels]}
              value={level}
              onChange={(value) => onLevelChange(value as (typeof riderLevels)[number])}
              testPrefix="onboarding-level"
            />
            <OnboardingChoiceGroup
              title="Main goal"
              options={[...onboardingGoals]}
              value={goal}
              onChange={(value) => onGoalChange(value as (typeof onboardingGoals)[number])}
              testPrefix="onboarding-goal"
            />
          </View>
        )}

        {step === "horse" && (
          <View style={styles.onboardingPanel}>
            <Text style={styles.onboardingPanelTitle}>Horse profile</Text>
            <HorsePhotoPicker value={horsePhoto} onChange={onHorsePhotoChange} />
            <View style={styles.onboardingField}>
              <Text style={styles.onboardingLabel}>Horse name</Text>
              <TextInput
                testID="onboarding-horse-name"
                value={horseName}
                onChangeText={onHorseNameChange}
                placeholder="Horse name"
                placeholderTextColor={nightTheme.faint}
                style={styles.onboardingInput}
              />
            </View>
            <View style={styles.onboardingField}>
              <Text style={styles.onboardingLabel}>Breed</Text>
              <TextInput
                testID="onboarding-horse-breed"
                value={horseBreed}
                onChangeText={onHorseBreedChange}
                placeholder="Warmblood, Arabian, Pony..."
                placeholderTextColor={nightTheme.faint}
                style={styles.onboardingInput}
              />
            </View>
            <View style={styles.onboardingFieldRow}>
              <View style={[styles.onboardingField, styles.onboardingMiniField]}>
                <Text style={styles.onboardingLabel}>Age</Text>
                <TextInput
                  testID="onboarding-horse-age"
                  value={horseAge}
                  onChangeText={onHorseAgeChange}
                  placeholder="9"
                  placeholderTextColor={nightTheme.faint}
                  keyboardType="number-pad"
                  style={styles.onboardingInput}
                />
              </View>
              <View style={[styles.onboardingField, styles.onboardingMiniField]}>
                <Text style={styles.onboardingLabel}>Height</Text>
                <TextInput
                  testID="onboarding-horse-height"
                  value={horseHeight}
                  onChangeText={onHorseHeightChange}
                  placeholder="166 cm"
                  placeholderTextColor={nightTheme.faint}
                  keyboardType="number-pad"
                  style={styles.onboardingInput}
                />
              </View>
            </View>
            <OnboardingChoiceGroup
              title="Sex"
              options={[...horseSexes]}
              value={horseSex}
              onChange={(value) => onHorseSexChange(value as (typeof horseSexes)[number])}
              testPrefix="onboarding-horse-sex"
            />
            <OnboardingChoiceGroup
              title="Riding feel (optional)"
              options={[...horseRideFeels]}
              value={rideFeel}
              onChange={(value) => onRideFeelChange(value as (typeof horseRideFeels)[number])}
              testPrefix="onboarding-ride-feel"
            />
            <View style={styles.onboardingSummaryCard}>
              <View style={styles.onboardingSummaryIcon}>
                <BadgeCheck size={18} color={equinaTheme.colors.brass} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.onboardingSummaryTitle}>{horseName || "Your horse"} profile</Text>
                <Text style={styles.onboardingSummaryBody}>{horseBreed || "Breed"} · {horseSex} · {horseAge || "?"} years · {horseHeight || "?"} cm</Text>
              </View>
            </View>
            <View style={styles.onboardingRecordPreview}>
              <Text style={styles.onboardingRecordText}>Passport</Text>
              <Text style={styles.onboardingRecordText}>Vet checks</Text>
              <Text style={styles.onboardingRecordText}>Ride history</Text>
            </View>
          </View>
        )}

        {step === "routine" && (
          <View style={styles.onboardingPanel}>
            <Text style={styles.onboardingPanelTitle}>Personalize your Home</Text>
            <OnboardingChoiceGroup
              title="Weekly rhythm"
              options={[...ridingFrequencies]}
              value={frequency}
              onChange={(value) => onFrequencyChange(value as (typeof ridingFrequencies)[number])}
              testPrefix="onboarding-frequency"
            />
            <OnboardingChoiceGroup
              title="Care priority"
              options={[...carePriorities]}
              value={carePriority}
              onChange={(value) => onCarePriorityChange(value as (typeof carePriorities)[number])}
              testPrefix="onboarding-care-priority"
            />
            <OnboardingChoiceGroup
              title="Show me first"
              options={[...appPriorities]}
              value={appPriority}
              onChange={(value) => onAppPriorityChange(value as (typeof appPriorities)[number])}
              testPrefix="onboarding-app-priority"
            />
            <View style={styles.onboardingPlanPreview}>
              <Text style={styles.onboardingPreviewKicker}>Your first Home</Text>
              <Text style={styles.onboardingPreviewTitle}>{discipline} day for {horseName || "your horse"}</Text>
              <Text style={styles.onboardingPreviewBody}>{frequency} · {goal} · {carePriority.toLowerCase()} priority</Text>
              <View style={styles.onboardingPreviewFlow}>
                {["Plan", appPriority, carePriority].map((item, index) => (
                  <View key={`${item}-${index}`} style={styles.onboardingPreviewNode}>
                    <Text numberOfLines={1} style={styles.onboardingPreviewNodeText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
        </Animated.View>
      </ScrollView>

      <View style={styles.onboardingFooter}>
        {stepIndex > 0 ? (
          <Pressable testID="onboarding-back" style={({ pressed }) => [styles.onboardingBackButton, pressed && styles.pressed]} onPress={onBack}>
            <Text style={styles.onboardingBackText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.onboardingBackSpacer} />
        )}
        <Pressable
          testID={step === "routine" ? "onboarding-create-account" : "onboarding-continue"}
          disabled={!canContinue}
          style={({ pressed }) => [styles.onboardingPrimaryButton, !canContinue && styles.onboardingPrimaryButtonDisabled, pressed && canContinue && styles.homePressLift]}
          onPress={handlePrimary}
        >
          <Text style={[styles.onboardingPrimaryText, !canContinue && styles.onboardingPrimaryTextDisabled]}>{primaryLabel}</Text>
          <ChevronRight size={17} color={canContinue ? nightTheme.text : nightTheme.faint} />
        </Pressable>
      </View>
    </View>
  );
}

function OnboardingChoiceGroup({
  title,
  options,
  value,
  onChange,
  testPrefix
}: {
  title: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  testPrefix: string;
}) {
  return (
    <View style={styles.onboardingChoiceBlock}>
      <Text style={styles.onboardingLabel}>{title}</Text>
      <View style={styles.onboardingChoiceGrid}>
        {options.map((option) => {
          const active = option === value;
          return (
            <OnboardingChoice
              key={option}
              option={option}
              active={active}
              testID={`${testPrefix}-${option.toLowerCase().replaceAll(" ", "-")}`}
              onPress={() => onChange(option)}
            />
          );
        })}
      </View>
    </View>
  );
}

function HorsePhotoPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.horsePhotoSection}>
      <View style={styles.horsePhotoPicker}>
        <Image source={{ uri: value }} style={styles.horsePhotoPreview} />
        <View style={styles.horsePhotoScrim} />
        <View style={styles.horsePhotoContent}>
          <View style={styles.horsePhotoIcon}>
            <Camera size={17} color={nightTheme.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.horsePhotoTitle}>Choose a cover photo</Text>
            <Text style={styles.horsePhotoBody}>This becomes the face of your horse profile.</Text>
          </View>
        </View>
      </View>
      <View style={styles.horsePhotoThumbRow}>
        {horsePhotoOptions.map((option) => {
          const active = option.image === value;
          return (
            <Pressable
              key={option.label}
              testID={`onboarding-horse-photo-${option.label.toLowerCase()}`}
              style={({ pressed }) => [styles.horsePhotoThumb, active && styles.horsePhotoThumbActive, pressed && styles.pressed]}
              onPress={() => onChange(option.image)}
            >
              <Image source={{ uri: option.image }} style={styles.horsePhotoThumbImage} />
              <View style={styles.horsePhotoThumbFooter}>
                <Text style={[styles.horsePhotoThumbText, active && styles.horsePhotoThumbTextActive]}>{option.label}</Text>
                {active && <CheckCircle2 size={13} color={equinaTheme.colors.brass} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function OnboardingChoice({
  option,
  active,
  testID,
  onPress
}: {
  option: string;
  active: boolean;
  testID: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(active ? 1.03 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: active ? 1.03 : 1,
      damping: 16,
      stiffness: 240,
      mass: 0.55,
      useNativeDriver: true
    }).start();
  }, [active, scale]);

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      damping: 14,
      stiffness: 280,
      mass: 0.45,
      useNativeDriver: true
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: active ? 1.03 : 1,
      damping: 16,
      stiffness: 240,
      mass: 0.55,
      useNativeDriver: true
    }).start();
  };

  return (
    <Animated.View style={[styles.onboardingChoiceMotion, { transform: [{ scale }] }]}>
      <Pressable testID={testID} style={[styles.onboardingChoice, active && styles.onboardingChoiceActive]} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
        <Text style={[styles.onboardingChoiceText, active && styles.onboardingChoiceTextActive]}>{option}</Text>
        {active && (
          <View style={styles.onboardingChoiceCheck}>
            <CheckCircle2 size={12} color={nightTheme.text} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function TabDock({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  const activeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    activeAnim.setValue(0);
    Animated.spring(activeAnim, {
      toValue: 1,
      damping: 16,
      stiffness: 210,
      mass: 0.65,
      useNativeDriver: false
    }).start();
  }, [activeAnim, activeTab]);

  const labelMotion = {
    opacity: activeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1]
    }),
    transform: [
      {
        translateY: activeAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [4, 0]
        })
      }
    ]
  };

  return (
    <View style={styles.tabDockOuter}>
      <View style={styles.tabBar}>
        {tabs.map(({ id, label, Icon }) => {
          const active = id === activeTab;
          return (
            <Pressable
              key={id}
              testID={`tab-${id}`}
              accessibilityLabel={label}
              style={({ pressed }) => [styles.tabItem, active && styles.tabItemActive, pressed && styles.tabItemPressed]}
              onPress={() => {
                if (id !== activeTab) onChange(id);
              }}
            >
              <View style={[styles.tabIconShell, active && styles.tabIconShellActive]}>
                <Icon size={active ? 19 : 20} color={active ? equinaTheme.colors.brass : nightTheme.faint} />
                {id === "community" && <View style={[styles.tabLiveDot, active && styles.tabLiveDotActive]} />}
              </View>
              {active && (
                <Animated.View style={[styles.tabActiveLabelWrap, labelMotion]}>
                  <Text numberOfLines={1} style={styles.tabTextActive}>{label}</Text>
                </Animated.View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function HomeScreen({
  horse,
  status,
  likes,
  sharedRide,
  showRecap,
  mood,
  discipline,
  goal,
  frequency,
  carePriority,
  horsePhoto,
  horseBreed,
  rideFeel,
  progress,
  onToggleRide,
  onLogCare,
  onMoodSelect,
  onOpenAssistant,
  onOpenCommunity,
  onReactToFriend,
  onShareRide
}: {
  horse: HorseState;
  status: string;
  likes: number;
  sharedRide: boolean;
  showRecap: boolean;
  mood: MoodOption;
  discipline: CoachDiscipline;
  goal: (typeof onboardingGoals)[number];
  frequency: (typeof ridingFrequencies)[number];
  carePriority: (typeof carePriorities)[number];
  horsePhoto: string;
  horseBreed: string;
  rideFeel: (typeof horseRideFeels)[number];
  progress: number;
  onToggleRide: () => void;
  onLogCare: () => void;
  onMoodSelect: (mood: MoodOption) => void;
  onOpenAssistant: () => void;
  onOpenCommunity: () => void;
  onReactToFriend: () => void;
  onShareRide: () => void;
}) {
  const heroAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const energyAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(heroAnim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: false
    }).start();
  }, [heroAnim]);

  useEffect(() => {
    Animated.timing(energyAnim, {
      toValue: horse.rideActive ? 1 : 0.86,
      duration: 650,
      useNativeDriver: false
    }).start();
  }, [energyAnim, horse.rideActive]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 850, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 850, useNativeDriver: false })
      ])
    );
    if (horse.rideActive) {
      loop.start();
    } else {
      pulseAnim.setValue(0);
    }
    return () => loop.stop();
  }, [pulseAnim, horse.rideActive]);

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
  const pulseStyle = {
    transform: [
      {
        scale: pulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.75]
        })
      }
    ],
    opacity: pulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.5, 0]
    })
  };
  const energyWidth = energyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"]
  });
  const shouldShowFeed = sharedRide || horse.sessionCount > 3;
  const feedItem = homeFeedItems[0];
  const selectedMood = homeMoodOptions.find((option) => option.id === mood) ?? homeMoodOptions[1]!;
  const SelectedMoodIcon = selectedMood.Icon;
  const recapVisible = showRecap && !horse.rideActive;
  const disciplinePlan = {
    Dressage: {
      title: selectedMood.planTitle,
      hero: selectedMood.planBody,
      rideSub: "35 min flatwork",
      live: "Keep contact soft. No chasing.",
      recap: "Flatwork saved",
      main: mood === "Fresh" ? "Transitions before speed. Reward soft answers." : mood === "Tender" ? "No drilling. Stop while Ralfy feels loose." : "Soft contact, 4 clean transitions, no rush."
    },
    Jumping: {
      title: "Build rhythm, then leave it.",
      hero: "30 min poles, rhythm, and one confident line.",
      rideSub: "30 min poles",
      live: "Keep canter steady. Let the line come.",
      recap: "Jumping saved",
      main: "Poles first, one small line, stop before the canter gets flat."
    },
    Eventing: {
      title: "Balance before fitness.",
      hero: "Light conditioning with clean transitions and recovery.",
      rideSub: "40 min fitness",
      live: "Stay balanced. Recovery matters today.",
      recap: "Conditioning saved",
      main: "Short intervals, balance in turns, then long cool-down."
    },
    Trail: {
      title: "Relaxed and forward.",
      hero: "Easy outside miles, confidence, and calm rhythm.",
      rideSub: "45 min trail",
      live: "Keep it calm. Let Ralfy breathe forward.",
      recap: "Trail ride saved",
      main: "Walk out, use hills lightly, finish relaxed."
    }
  }[discipline];
  const frequencyMinutes = frequency === "2 rides/week" ? "-10%" : frequency === "5+ rides/week" ? "+10%" : "steady";
  const rideFeelCue =
    rideFeel === "Needs quiet aids"
      ? "keep the aids quiet"
      : rideFeel === "Extra energy"
        ? "use the forward energy"
        : "build a little more expression";
  const planSteps = [
    {
      title: "Warm-up",
      body: mood === "Tender" ? "12 min walk, long rein, check symmetry." : discipline === "Jumping" ? `10 min walk, then poles. ${rideFeelCue}.` : `8 min walk, then easy trot. ${rideFeelCue}.`,
      Icon: Clock3
    },
    {
      title: mood === "Fresh" ? "Use the energy" : mood === "Tender" ? "Keep it light" : "Main focus",
      body: disciplinePlan.main,
      Icon: Activity
    },
    {
      title: carePriority,
      body: horse.careLogged ? "Care is logged. Save one feeling note." : carePriority === "Recovery" ? "Cool down longer, check legs, note breathing." : carePriority === "Vet records" ? "Log anything unusual after cool-down." : carePriority === "Gear fit" ? "Check saddle marks and girth area." : "Save one feeling note for tomorrow.",
      Icon: Stethoscope
    }
  ];
  const loopSteps = [
    { label: "Plan", Icon: CalendarCheck, done: true, active: !horse.rideActive && !recapVisible },
    { label: horse.rideActive ? "Live" : recapVisible ? "Saved" : "Ride", Icon: Activity, done: horse.rideActive || recapVisible, active: horse.rideActive },
    { label: "Care", Icon: Stethoscope, done: horse.careLogged, active: recapVisible && !horse.careLogged },
    { label: "Club", Icon: MessageSquareText, done: sharedRide, active: recapVisible && !sharedRide }
  ];

  return (
    <View style={styles.screen}>
      {status.length > 0 && (
        <View style={styles.statusStrip}>
          <Sparkles size={15} color={equinaTheme.colors.brass} />
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      <Animated.View style={[styles.homeStage, heroStyle]}>
        <Image source={{ uri: horsePhoto || equinaImages.home }} style={styles.homeStageImage} />
        <View style={styles.homeStageScrim} />
        <View style={styles.homeStageContent}>
          <View style={styles.homeStageTop}>
            <View style={styles.homeStagePill}>
              <Text style={styles.homeStagePillText}>{horse.rideActive ? "Live ride" : recapVisible ? "Recap ready" : "Today's plan"}</Text>
            </View>
            <View style={styles.homeStageMetric}>
              <Flame size={13} color={equinaTheme.colors.brass} />
              <Text style={styles.homeStageMetricText}>{horse.sessionCount} rides</Text>
            </View>
          </View>

          <View style={styles.homeStageMain}>
            <Text style={styles.heroEyebrow}>{horse.name}</Text>
            <Text style={styles.homeStageTitle}>
              {horse.rideActive ? "Riding now" : recapVisible ? "Ride saved." : `${discipline} day`}
            </Text>
            <Text style={styles.homeStageBody}>
              {horse.rideActive ? "Stay present. Finish with one clear feeling note." : recapVisible ? `${disciplinePlan.recap}. Care and sharing are the next useful steps.` : `${disciplinePlan.hero} ${frequencyMinutes === "steady" ? "" : `Load ${frequencyMinutes}.`}`.trim()}
            </Text>
          </View>

          {horse.rideActive && (
            <View style={styles.homeStageLiveTrack}>
              <Animated.View style={[styles.homeStageLiveFill, { width: energyWidth }]} />
            </View>
          )}

          <View style={styles.homeActionDock}>
            <Pressable
              testID="ride-toggle"
              style={({ pressed }) => [styles.homeStageRideButton, horse.rideActive && styles.homeStageRideButtonActive, pressed && styles.homePressLift]}
              onPress={onToggleRide}
            >
              <View>
                <Text style={[styles.homeStageRideTitle, horse.rideActive && styles.homeStageRideTitleActive]}>{horse.rideActive ? "Finish & recap" : recapVisible ? "Ride again" : "Start ride"}</Text>
                <Text style={[styles.homeStageRideSub, horse.rideActive && styles.homeStageRideSubActive]}>{horse.rideActive ? "Save session" : recapVisible ? "New session" : disciplinePlan.rideSub}</Text>
              </View>
              <View style={[styles.homeStageRideCircle, horse.rideActive && styles.homeStageRideCircleActive]}>
                {horse.rideActive ? (
                  <CheckCircle2 size={19} color="#FFF7E6" />
                ) : (
                  <ChevronRight size={19} color={equinaTheme.colors.brass} />
                )}
              </View>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.homeDockMiniButton, horse.careLogged && styles.homeDockMiniButtonDone, pressed && styles.homePressLift]} onPress={onLogCare}>
              <Stethoscope size={17} color={horse.careLogged ? equinaTheme.colors.pine : equinaTheme.colors.brass} />
              <Text style={[styles.homeDockMiniText, horse.careLogged && styles.homeDockMiniTextDone]}>{horse.careLogged ? "Done" : "Care"}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.homeDockMiniButton, pressed && styles.homePressLift]} onPress={onOpenAssistant}>
              <Bot size={17} color={equinaTheme.colors.brass} />
              <Text style={styles.homeDockMiniText}>AI</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <View style={styles.homeLoopCard}>
        {loopSteps.map((step, index) => {
          const StepIcon = step.Icon;
          return (
            <View key={step.label} style={styles.homeLoopStepWrap}>
              <View style={[styles.homeLoopIcon, step.done && styles.homeLoopIconDone, step.active && styles.homeLoopIconActive]}>
                <StepIcon size={15} color={step.done || step.active ? equinaTheme.colors.ivory : nightTheme.faint} />
              </View>
              <Text numberOfLines={1} style={[styles.homeLoopLabel, (step.done || step.active) && styles.homeLoopLabelActive]}>{step.label}</Text>
              {index < loopSteps.length - 1 && <View style={[styles.homeLoopLine, step.done && styles.homeLoopLineDone]} />}
            </View>
          );
        })}
      </View>

      {horse.rideActive && (
        <View style={styles.homeLiveRideCard}>
          <View style={styles.homeLiveRideTop}>
            <View style={styles.homeLiveRideBadge}>
              <Animated.View style={[styles.homeLiveRidePulse, pulseStyle]} />
              <View style={styles.homeLiveRideDot} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.homeKicker}>Live session</Text>
              <Text style={styles.homeLiveRideTitle}>{disciplinePlan.live}</Text>
            </View>
            <View style={styles.homeLiveRideFinish}>
              <Text style={styles.homeLiveRideFinishText}>Live</Text>
            </View>
          </View>
          <View style={styles.homeLiveRideTrack}>
            <Animated.View style={[styles.homeLiveRideFill, { width: energyWidth }]} />
          </View>
        </View>
      )}

      {recapVisible ? (
        <View style={styles.homeRecapCard}>
          <View style={styles.homeRecapTop}>
            <View style={styles.homeRecapBadge}>
              <CheckCircle2 size={20} color={equinaTheme.colors.ivory} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.homeKicker}>Ride recap</Text>
              <Text style={styles.homeRecapTitle}>{disciplinePlan.recap}</Text>
              <Text style={styles.homeRecapBody}>{horse.name} felt {mood.toLowerCase()}. Next time: repeat the best part, then finish earlier.</Text>
            </View>
          </View>
          <View style={styles.homeRecapMetrics}>
            <RecapMetric value={discipline === "Trail" ? "45" : discipline === "Eventing" ? "40" : discipline === "Jumping" ? "30" : "35"} label="min" />
            <RecapMetric value={`+${Math.max(0, progress - 64)}`} label="progress" />
            <RecapMetric value={horse.careLogged ? "Done" : "Open"} label="care" />
          </View>
          <View style={styles.homeRecapInsight}>
            <Bot size={16} color={equinaTheme.colors.brass} />
            <Text style={styles.homeRecapInsightText}>Coach AI can turn this into tomorrow's plan and one drill from Learn.</Text>
          </View>
          <View style={styles.homeRecapActions}>
            <Pressable style={({ pressed }) => [styles.homeRecapButton, pressed && styles.homePressLift]} onPress={onOpenAssistant}>
              <Bot size={15} color={nightTheme.text} />
              <Text style={styles.homeRecapButtonText}>Ask AI</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.homeRecapButton, styles.homeRecapButtonSecondary, horse.careLogged && styles.homeRecapButtonDone, pressed && styles.homePressLift]} onPress={onLogCare}>
              <Stethoscope size={15} color={horse.careLogged ? equinaTheme.colors.ivory : nightTheme.text} />
              <Text style={[styles.homeRecapButtonText, horse.careLogged && styles.homeRecapButtonTextDone]}>{horse.careLogged ? "Care done" : "Care"}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.homeRecapButton, styles.homeRecapButtonSecondary, sharedRide && styles.homeRecapButtonDone, pressed && styles.homePressLift]} onPress={onShareRide}>
              <Sparkles size={15} color={sharedRide ? equinaTheme.colors.ivory : nightTheme.text} />
              <Text style={[styles.homeRecapButtonText, sharedRide && styles.homeRecapButtonTextDone]}>{sharedRide ? "Shared" : "Share"}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.homePlanPanel}>
          <View style={styles.homeRitualTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.homeKicker}>Ride plan</Text>
              <Text style={styles.homeRitualTitle}>{disciplinePlan.title}</Text>
            </View>
            <View style={styles.homeRitualIcon}>
              <SelectedMoodIcon size={17} color={equinaTheme.colors.brass} />
            </View>
          </View>
          <View style={styles.homePersonalPills}>
            <Text style={styles.homePersonalPill}>{goal}</Text>
            <Text style={styles.homePersonalPill}>{frequency}</Text>
            <Text style={styles.homePersonalPill}>{horseBreed || rideFeel}</Text>
          </View>

          <View style={styles.homePlanSteps}>
            {planSteps.map((step) => {
              const PlanIcon = step.Icon;
              return (
                <View key={step.title} style={styles.homePlanStep}>
                  <View style={styles.homePlanStepIcon}>
                    <PlanIcon size={15} color={equinaTheme.colors.brass} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.homePlanStepTitle}>{step.title}</Text>
                    <Text style={styles.homePlanStepBody}>{step.body}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.homeMoodRow}>
            {homeMoodOptions.map((option) => (
              <MoodChip
                key={option.id}
                option={option}
                active={option.id === mood}
                onPress={() => onMoodSelect(option.id)}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.friendPanel}>
        <View style={styles.friendPanelTop}>
          <View>
            <Text style={styles.homeKicker}>Club pulse</Text>
            <Text style={styles.friendPanelTitle}>{recapVisible ? "Share the win" : "3 friends riding"}</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.friendPanelAction, pressed && styles.pressed]} onPress={onOpenCommunity}>
            <Text style={styles.friendPanelActionText}>Club</Text>
            <ChevronRight size={14} color={nightTheme.text} />
          </Pressable>
        </View>
        <View style={styles.homeClubMiddle}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendStoryRow} style={styles.friendStoryScroller}>
            {homeFriendStories.map((friend) => (
              <FriendStory key={friend.name} {...friend} onPress={onOpenCommunity} />
            ))}
          </ScrollView>
          <Pressable
            testID="home-share-ride"
            style={({ pressed }) => [styles.homeClubShare, sharedRide && styles.homeClubShareActive, pressed && styles.homePressLift]}
            onPress={onShareRide}
          >
            <Sparkles size={15} color={sharedRide ? equinaTheme.colors.pine : equinaTheme.colors.brass} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.homeClubShareTitle}>{sharedRide ? "Shared" : "Share"}</Text>
              <Text numberOfLines={1} style={styles.homeClubShareBody}>{sharedRide ? "Club live" : "Ride"}</Text>
            </View>
          </Pressable>
        </View>

        {shouldShowFeed && feedItem && (
          <View style={styles.homeFeedStack}>
            <HomeFeedCard
              item={feedItem}
              kudos={likes}
              onReact={onReactToFriend}
              onOpen={onOpenCommunity}
            />
          </View>
        )}
      </View>

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
  mode,
  onModeChange,
  onCreate,
  listings,
  allListings,
  selectedListing,
  reservedListing,
  sellerName,
  search,
  filter,
  savedCount,
  buyerOrderCount,
  sellerOrderCount,
  sellerRevenueLabel,
  activeListingCount,
  interestCount,
  messageCount,
  onSearch,
  onFilter,
  onSelect,
  onBuy,
  onFitCheck,
  onDispute,
  onShopAction
}: {
  mode: ShopMode;
  onModeChange: (mode: ShopMode) => void;
  onCreate: () => void;
  listings: Listing[];
  allListings: Listing[];
  selectedListing?: Listing;
  reservedListing?: Listing;
  sellerName: string;
  search: string;
  filter: Filter;
  savedCount: number;
  buyerOrderCount: number;
  sellerOrderCount: number;
  sellerRevenueLabel: string;
  activeListingCount: number;
  interestCount: number;
  messageCount: number;
  onSearch: (value: string) => void;
  onFilter: (value: Filter) => void;
  onSelect: (listing: Listing) => void;
  onBuy: () => void;
  onFitCheck: () => void;
  onDispute: () => void;
  onShopAction: (label: string) => void;
}) {
  const featuredListing = selectedListing ?? listings[0];
  const featuredScore = fitScore(featuredListing);
  const feedListings = listings;

  return (
    <View style={styles.screen}>
      <SectionHeader eyebrow="Shop" title={mode === "browse" ? "Find your next piece" : "Sell in minutes"} />
      <View style={styles.segmented}>
        <Pressable testID="shop-mode-browse" style={[styles.segment, mode === "browse" && styles.segmentActive]} onPress={() => onModeChange("browse")}>
          <Text style={[styles.segmentText, mode === "browse" && styles.segmentTextActive]}>Buy</Text>
        </Pressable>
        <Pressable testID="shop-mode-sell" style={[styles.segment, mode === "sell" && styles.segmentActive]} onPress={() => onModeChange("sell")}>
          <Text style={[styles.segmentText, mode === "sell" && styles.segmentTextActive]}>Sell</Text>
        </Pressable>
      </View>

      {mode === "sell" ? (
        <>
          <ShopMenuPanel
            title="Seller hub"
            subtitle={`${activeListingCount} live · ${sellerOrderCount} sold`}
            items={[
              { Icon: Store, label: "Dashboard", value: `${activeListingCount}`, body: "Live items", onPress: () => onShopAction("Seller dashboard") },
              { Icon: PackageCheck, label: "Sold", value: String(sellerOrderCount), body: "Orders", onPress: () => onShopAction("Seller orders") },
              { Icon: WalletCards, label: "Revenue", value: sellerRevenueLabel, body: "Released + held", onPress: () => onShopAction("Revenue") },
              { Icon: MessageSquareText, label: "Messages", value: String(messageCount), body: "Buyer chats", onPress: () => onShopAction("Seller messages") }
            ]}
          />

          <View style={styles.sellerSteps}>
            <SellerStep Icon={Camera} title="Photos" />
            <SellerStep Icon={FileText} title="Details" />
            <SellerStep Icon={ShieldCheck} title="Protected" />
          </View>

          <SectionTitle title="Closet" action={`${allListings.length} live`} />
          <Pressable testID="seller-create-listing" style={({ pressed }) => [styles.sellerHeroButton, pressed && styles.pressed]} onPress={onCreate}>
            <Plus size={17} color={equinaTheme.colors.ivory} />
            <Text style={styles.sellerHeroButtonText}>List item</Text>
          </Pressable>
          {allListings.map((listing) => (
            <SellerListingRow key={listing.id} listing={listing} onPress={() => onSelect(listing)} />
          ))}
        </>
      ) : (
        <>
          <View style={styles.shopTopBar}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[styles.searchBox, styles.shopSearchBox]}>
                <Search size={18} color={nightTheme.faint} />
                <TextInput
                  value={search}
                  onChangeText={onSearch}
                  placeholder="Search brand, size..."
                  placeholderTextColor={nightTheme.faint}
                  style={styles.searchInput}
                />
              </View>
              <Text style={styles.shopMenuSubtitle}>{buyerOrderCount} orders · {savedCount} saved</Text>
            </View>
            <Pressable testID="shop-sell-shortcut" style={({ pressed }) => [styles.sellMiniButton, pressed && styles.pressed]} onPress={() => onModeChange("sell")}>
              <Plus size={17} color={equinaTheme.colors.ivory} />
              <Text style={styles.sellMiniText}>Sell</Text>
            </Pressable>
          </View>

          <View style={styles.chipRow}>
            {filters.map((item) => (
              <Pressable key={item} testID={`market-filter-${item.toLowerCase()}`} style={[styles.filterChip, filter === item && styles.filterChipActive]} onPress={() => onFilter(item)}>
                <Text style={[styles.filterChipText, filter === item && styles.filterChipTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </View>

          {listings.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.panelTitle}>No items yet</Text>
              <Text style={styles.bodyText}>Try All, Dressage, or a broader brand search.</Text>
              <Pressable testID="market-clear-filters" style={({ pressed }) => [styles.clearFilterButton, pressed && styles.pressed]} onPress={() => {
                onSearch("");
                onFilter("All");
              }}>
                <Text style={styles.clearFilterButtonText}>Show all</Text>
              </Pressable>
            </View>
          )}

          {featuredListing && (
            <View style={styles.shopFeatureCard}>
              <Image source={{ uri: featuredListing.photos[0]?.url }} style={styles.shopFeatureImage} />
              <View style={styles.shopFeatureShade} />
              <View style={styles.shopFeatureContent}>
                <View style={styles.shopFeatureTop}>
                  <View style={styles.shopFeatureFit}>
                    <Sparkles size={13} color={equinaTheme.colors.brass} />
                    <Text style={styles.shopFeatureFitText}>{featuredScore}% fit</Text>
                  </View>
                  <View style={styles.shopFeatureVerified}>
                    <BadgeCheck size={13} color={equinaTheme.colors.ivory} />
                    <Text style={styles.shopFeatureVerifiedText}>Verified</Text>
                  </View>
                </View>
                <View style={styles.shopFeatureBottom}>
                  <Text style={styles.shopFeatureKicker}>Curated match</Text>
                  <Text style={styles.shopFeatureTitle}>{featuredListing.brand} {featuredListing.model ?? featuredListing.category}</Text>
                  <View style={styles.shopFeatureMetaRow}>
                    <Text style={styles.shopFeaturePrice}>{money(featuredListing)}</Text>
                    <Text style={styles.shopFeatureMeta}>{conditionLabel(featuredListing.conditionGrade)} · {featuredListing.location}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {feedListings.length > 0 && (
            <>
              <SectionTitle title="All items" action={`${feedListings.length} live`} />
              <View style={styles.shopFeedGrid}>
                {feedListings.map((listing) => (
                  <ShopProductCard key={listing.id} listing={listing} selected={listing.id === featuredListing?.id} onPress={() => onSelect(listing)} />
                ))}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

function StableScreen({
  horseName,
  horsePhoto,
  discipline,
  level,
  horseBreed,
  horseSex,
  horseAge,
  horseHeight,
  passportUploaded,
  medCheckCount,
  labReportCount,
  onUploadPassport,
  onAddMedCheck,
  onAddLabReport,
  onOpenAssistant
}: {
  horseName: string;
  horsePhoto: string;
  discipline: CoachDiscipline;
  level: (typeof riderLevels)[number];
  horseBreed: string;
  horseSex: (typeof horseSexes)[number];
  horseAge: string;
  horseHeight: string;
  passportUploaded: boolean;
  medCheckCount: number;
  labReportCount: number;
  onUploadPassport: () => void;
  onAddMedCheck: () => void;
  onAddLabReport: () => void;
  onOpenAssistant: () => void;
}) {
  const [view, setView] = useState<"overview" | "health" | "docs">("overview");
  const viewAnim = useRef(new Animated.Value(1)).current;
  const savedRecordCount = medCheckCount + labReportCount + (passportUploaded ? 1 : 0);
  const healthStatus = medCheckCount > 0 && labReportCount > 0 ? "Records current" : "Review records";

  const openView = (nextView: "overview" | "health" | "docs") => {
    if (nextView === view) return;
    viewAnim.setValue(0);
    setView(nextView);
    Animated.spring(viewAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 210,
      mass: 0.62,
      useNativeDriver: true
    }).start();
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

  return (
    <View style={styles.screen}>
      <SectionHeader eyebrow="Horse" title={horseName} />

      <View style={styles.stableHero}>
        <Image source={{ uri: horsePhoto || equinaImages.stable }} style={styles.stableHeroImage} />
        <View style={styles.stableHeroScrim} />
        <View style={styles.stableHeroContent}>
          <View style={styles.stableHeroStatus}>
            <View style={styles.stableHeroStatusDot} />
            <Text style={styles.stableHeroStatusText}>{healthStatus}</Text>
          </View>
          <View style={styles.stableHeroTop}>
            <View>
              <Text style={styles.stableKicker}>{discipline}</Text>
              <Text style={styles.stableTitle}>{horseName}</Text>
              <Text style={styles.stableMeta}>{horseBreed || "Breed"} · {horseSex} · {horseAge || "?"} years · {horseHeight || "?"} cm</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.stableViewSwitch}>
        <StableViewTab label="Overview" active={view === "overview"} onPress={() => openView("overview")} />
        <StableViewTab label="Health" active={view === "health"} onPress={() => openView("health")} />
        <StableViewTab label="Docs" active={view === "docs"} onPress={() => openView("docs")} />
      </View>

      <Animated.View style={[styles.stableViewBody, viewMotion]}>
        {view === "overview" && (
          <>
            <View style={styles.stableMetricRow}>
              <StableMetric value={`${savedRecordCount}`} label="records" />
              <StableMetric value={`${medCheckCount}`} label="vet checks" />
              <StableMetric value={level} label="level" />
            </View>

            <View style={styles.stableNextCare}>
              <View style={styles.stableNextCareIcon}>
                <CalendarCheck size={19} color={equinaTheme.colors.brass} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stableNextCareKicker}>Next care</Text>
                <Text style={styles.stableNextCareTitle}>Farrier in 6 days</Text>
                <Text style={styles.stableNextCareBody}>Teeth check next month · recovery note after the next ride.</Text>
              </View>
              <ChevronRight size={17} color={nightTheme.faint} />
            </View>

            <SectionTitle title="Quick records" action={`${savedRecordCount} saved`} />
            <View style={styles.stableQuickRecordRow}>
              <StableQuickRecord Icon={Upload} label="Passport" meta={passportUploaded ? "Stored" : "Add"} active={passportUploaded} onPress={onUploadPassport} />
              <StableQuickRecord Icon={Stethoscope} label="Vet" meta={`${medCheckCount} logs`} active={medCheckCount > 0} onPress={onAddMedCheck} />
              <StableQuickRecord Icon={Activity} label="Labs" meta={`${labReportCount} files`} active={labReportCount > 0} onPress={onAddLabReport} />
            </View>

            <Pressable style={({ pressed }) => [styles.stableAssistantCard, pressed && styles.homePressLift]} onPress={onOpenAssistant}>
              <View style={styles.stableAssistantIcon}>
                <Bot size={18} color={equinaTheme.colors.brass} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stableAssistantKicker}>Coach AI</Text>
                <Text style={styles.stableAssistantTitle}>Ask about {horseName}'s week</Text>
              </View>
              <ChevronRight size={17} color={nightTheme.faint} />
            </Pressable>
          </>
        )}

        {view === "health" && (
          <>
            <View style={styles.stableHealthCard}>
              <View style={styles.stableHealthIcon}>
                <HeartPulse size={21} color={equinaTheme.colors.ivory} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stableHealthKicker}>Health journal</Text>
                <Text style={styles.stableHealthTitle}>{healthStatus}</Text>
                <Text style={styles.stableHealthBody}>Keep vet checks, labs, and recovery notes in one clean timeline.</Text>
              </View>
            </View>

            <SectionTitle title="Health timeline" action="tap to add" />
            <View style={styles.documentStack}>
              <DocumentRow Icon={Stethoscope} title="Vet checks" body={`${medCheckCount} records · teeth, legs, vaccines.`} status="current" onPress={onAddMedCheck} />
              <DocumentRow Icon={Activity} title="Analyses" body={`${labReportCount} lab report${labReportCount === 1 ? "" : "s"} · bloodwork and scans.`} status="sync" onPress={onAddLabReport} />
              <DocumentRow Icon={HeartPulse} title="Recovery notes" body="Add a post-ride note or ask Coach AI for a check-in." status="add" onPress={onOpenAssistant} />
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
                <Text style={styles.stableDocsBody}>{savedRecordCount} stored records for care, travel, and review.</Text>
              </View>
            </View>

            <View style={styles.documentStack}>
              <DocumentRow Icon={FileText} title="Passport" body={passportUploaded ? "Stored, searchable, ready for travel." : `Missing from ${horseName}'s records.`} status={passportUploaded ? "stored" : "add"} onPress={onUploadPassport} />
              <DocumentRow Icon={HeartPulse} title="Med checks" body={`${medCheckCount} vet records · teeth, legs, vaccines.`} status="current" onPress={onAddMedCheck} />
              <DocumentRow Icon={Activity} title="Analyses" body={`${labReportCount} lab report${labReportCount === 1 ? "" : "s"} · bloodwork and scans.`} status="sync" onPress={onAddLabReport} />
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

function StableViewTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable testID={`stable-view-${label.toLowerCase()}`} style={[styles.stableViewTab, active && styles.stableViewTabActive]} onPress={onPress}>
      <Text style={[styles.stableViewTabText, active && styles.stableViewTabTextActive]}>{label}</Text>
    </Pressable>
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

function StableQuickRecord({
  Icon,
  label,
  meta,
  active,
  onPress
}: {
  Icon: typeof Store;
  label: string;
  meta: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable testID={`stable-record-${label.toLowerCase()}`} style={({ pressed }) => [styles.stableQuickRecord, active && styles.stableQuickRecordActive, pressed && styles.homePressLift]} onPress={onPress}>
      <View style={[styles.stableQuickRecordIcon, active && styles.stableQuickRecordIconActive]}>
        <Icon size={17} color={active ? equinaTheme.colors.ivory : equinaTheme.colors.brass} />
      </View>
      <Text style={styles.stableQuickRecordLabel}>{label}</Text>
      <Text style={styles.stableQuickRecordMeta}>{meta}</Text>
    </Pressable>
  );
}

function AssistantScreen({
  listing,
  horse,
  academy,
  coach,
  onAcademyProgress,
  onAcademyModeChange,
  onAcademyLessonOpen,
  onDisciplineChange,
  onGoalChange,
  onLoadChange,
  onCoachStyleChange,
  onOnboardedChange,
  onMessagesChange
}: {
  listing?: Listing;
  horse: HorseState;
  academy: AcademyState;
  coach: CoachState;
  onAcademyProgress: () => void;
  onAcademyModeChange: (mode: AcademyMode) => void;
  onAcademyLessonOpen: (title: string) => void;
  onDisciplineChange: (value: CoachDiscipline) => void;
  onGoalChange: (value: string) => void;
  onLoadChange: (value: string) => void;
  onCoachStyleChange: (value: string) => void;
  onOnboardedChange: (value: boolean) => void;
  onMessagesChange: Dispatch<SetStateAction<ChatMessage[]>>;
}) {
  const [draft, setDraft] = useState("");
  const selectedAcademyLesson = academyLessons.find((lesson) => lesson.title === academy.selectedTitle) ?? academyLessons[0]!;
  const openAcademyLesson = (lesson: (typeof academyLessons)[number]) => {
    onAcademyLessonOpen(lesson.title);
  };

  const sendMessage = (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: prompt
    };
    const coachReply: ChatMessage = {
      id: `coach-${Date.now()}`,
      role: "assistant",
      ...createCoachReply({ prompt, horseName: horse.name, discipline: coach.discipline, goal: coach.goal, load: coach.load, style: coach.style, listing })
    };

    onMessagesChange((current) => [...current, userMessage, coachReply]);
    setDraft("");
    onOnboardedChange(true);
  };

  const startCoach = () => {
    onOnboardedChange(true);
    onMessagesChange((current) => [
      ...current,
      {
        id: `setup-${Date.now()}`,
        role: "assistant",
        label: "Ready",
        confidence: "high",
        text: `${horse.name} is set for ${coach.discipline}: ${coach.goal}. Ask for today's plan.`
      }
    ]);
  };

  return (
    <View style={styles.academyScreen}>
      {academy.mode !== "ai" && <SectionHeader eyebrow="Learn" title="Ride better." />}

      {(academy.mode === "directory" || academy.mode === "ai") && (
        <View style={styles.academySwitch}>
          <Pressable testID="academy-mode-watch" style={styles.academySwitchItem} onPress={() => onAcademyModeChange("home")}>
            <Text style={styles.academySwitchText}>Home</Text>
          </Pressable>
          <Pressable
            testID="academy-mode-directory"
            style={[styles.academySwitchItem, academy.mode === "directory" && styles.academySwitchItemActive]}
            onPress={() => onAcademyModeChange("directory")}
          >
            <Text style={[styles.academySwitchText, academy.mode === "directory" && styles.academySwitchTextActive]}>Videos</Text>
          </Pressable>
          <Pressable
            testID="academy-mode-ai"
            style={[styles.academySwitchItem, academy.mode === "ai" && styles.academySwitchItemActive]}
            onPress={() => onAcademyModeChange("ai")}
          >
            <Text style={[styles.academySwitchText, academy.mode === "ai" && styles.academySwitchTextActive]}>AI</Text>
          </Pressable>
        </View>
      )}

      {academy.mode === "home" ? (
        <View style={styles.learnHome}>
          <View style={styles.learnEntryRow}>
            <Pressable testID="academy-open-ai" style={({ pressed }) => [styles.learnEntryTile, pressed && styles.pressed]} onPress={() => onAcademyModeChange("ai")}>
              <Image source={{ uri: equinaImages.dressage }} style={styles.learnEntryImage} resizeMode="cover" />
              <View style={[styles.learnEntryScrim, styles.learnEntryScrimStrong]} />
              <View style={styles.learnEntryContent}>
                <Text style={styles.learnEntryLabel}>Coach AI</Text>
                <Text style={styles.learnEntryTitle}>Plan your ride.</Text>
                <Text style={styles.learnEntryBody}>Ask, recap, adjust</Text>
              </View>
              <View style={styles.learnEntryIcon}>
                <ChevronRight size={16} color={equinaTheme.colors.ivory} />
              </View>
            </Pressable>
            <Pressable testID="academy-open-directory" style={({ pressed }) => [styles.learnEntryTile, pressed && styles.pressed]} onPress={() => onAcademyModeChange("directory")}>
              <Image source={{ uri: equinaImages.jumping }} style={styles.learnEntryImage} resizeMode="cover" />
              <View style={styles.learnEntryScrim} />
              <View style={styles.learnEntryContent}>
                <Text style={styles.learnEntryLabel}>Videos</Text>
                <Text style={styles.learnEntryTitle}>Ride better.</Text>
                <Text style={styles.learnEntryBody}>{academyLessons.length} lessons</Text>
              </View>
              <View style={styles.learnEntryIcon}>
                <ChevronRight size={16} color={equinaTheme.colors.ivory} />
              </View>
            </Pressable>
          </View>

          <View style={styles.learnSectionRow}>
            <View>
              <Text style={styles.homeKicker}>Continue watching</Text>
              <Text style={styles.learnSectionTitle}>Lessons for today</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.learnAllButton, pressed && styles.pressed]} onPress={() => onAcademyModeChange("directory")}>
              <Text style={styles.learnAllButtonText}>All videos</Text>
              <ChevronRight size={14} color={nightTheme.text} />
            </Pressable>
          </View>

          <View style={styles.academyLessonStack}>
            {academyLessons.slice(0, 3).map((lesson, index) => (
              <AcademyLessonCard key={lesson.title} lesson={lesson} featured={index === 0} onPress={() => openAcademyLesson(lesson)} />
            ))}
          </View>
        </View>
      ) : academy.mode === "directory" ? (
        <AcademyDirectory onOpenLesson={openAcademyLesson} />
      ) : academy.mode === "video" ? (
        <AcademyVideoPage
          lesson={selectedAcademyLesson}
          progress={academy.progress}
          onBack={() => onAcademyModeChange("directory")}
          onComplete={onAcademyProgress}
          onOpenLesson={openAcademyLesson}
        />
      ) : (
        <>
          <View style={styles.coachSetupSheet}>
            <View style={styles.coachSetupTop}>
              <View>
                <Text style={styles.setupEyebrow}>Coach AI</Text>
                <Text style={styles.coachSetupTitle}>{horse.name}'s session</Text>
              </View>
              <View style={styles.setupDots}>
                <View style={styles.setupDotActive} />
                <View style={styles.setupDot} />
                <View style={styles.setupDot} />
              </View>
            </View>
            <CoachPicker title="Discipline" options={coachDisciplines} value={coach.discipline} onChange={(value) => onDisciplineChange(value as CoachDiscipline)} />
            <CoachPicker title="Focus" options={coachGoalsByDiscipline[coach.discipline]} value={coach.goal} onChange={onGoalChange} />
            <CoachPicker title="Load" options={coachLoads} value={coach.load} onChange={onLoadChange} />
            <CoachPicker title="Tone" options={coachStyles} value={coach.style} onChange={onCoachStyleChange} />
            {!coach.onboarded && (
              <Pressable testID="ai-onboarding-start" style={({ pressed }) => [styles.coachStartButton, pressed && styles.pressed]} onPress={startCoach}>
                <Text style={styles.coachStartText}>Start coaching</Text>
                <ChevronRight size={17} color={equinaTheme.colors.ivory} />
              </Pressable>
            )}
          </View>

          <View style={styles.chatPanel}>
            <View style={styles.chatHeader}>
              <View>
                <Text style={styles.chatTitle}>Coach chat</Text>
                <Text style={styles.chatSubtle}>{coach.discipline} · safe, short, useful</Text>
              </View>
              <View style={styles.chatContextPill}>
                <ShieldCheck size={13} color={equinaTheme.colors.pine} />
                <Text style={styles.chatContextText}>{listing ? "Fit context" : "Ride context"}</Text>
              </View>
            </View>

            <View style={styles.messageStack}>
              {coach.messages.map((message) => (
                <View key={message.id} style={[styles.messageRow, message.role === "user" && styles.messageRowUser]}>
                  {message.role === "assistant" && (
                    <View style={styles.messageAvatar}>
                      <Bot size={14} color={equinaTheme.colors.brass} />
                    </View>
                  )}
                  <View style={[styles.messageBubble, message.role === "user" ? styles.messageUser : styles.messageAssistant]}>
                    {message.role === "assistant" && message.label && (
                      <View style={styles.messageMetaRow}>
                        <Text style={styles.messageLabel}>{message.label}</Text>
                        {message.confidence && <Text style={styles.messageConfidence}>{message.confidence}</Text>}
                      </View>
                    )}
                    <Text style={[styles.messageText, message.role === "user" && styles.messageTextUser]}>{message.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.chatComposer}>
              <TextInput
                testID="ai-chat-input"
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask Coach..."
                placeholderTextColor="#8B8578"
                style={styles.chatInput}
                multiline
              />
              <Pressable testID="ai-chat-send" style={({ pressed }) => [styles.chatSendButton, pressed && styles.pressed]} onPress={() => sendMessage(draft)}>
                <SendHorizontal size={18} color={equinaTheme.colors.ivory} />
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function AcademyLibrary({
  onOpenDirectory,
  onOpenAI
}: {
  onOpenDirectory: () => void;
  onOpenAI: () => void;
}) {
  return (
    <View style={styles.academyLibrary}>
      <View style={styles.academyUtilityRow}>
        <Pressable testID="academy-open-ai" style={({ pressed }) => [styles.academyUtilityCard, pressed && styles.pressed]} onPress={onOpenAI}>
          <View style={styles.academyUtilityIcon}>
            <Bot size={17} color={equinaTheme.colors.pine} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.academyUtilityTitle}>Coach AI</Text>
            <Text style={styles.academyUtilityBody}>Plan, recap, ask</Text>
          </View>
          <ChevronRight size={16} color="#8B8578" />
        </Pressable>
        <Pressable testID="academy-open-directory" style={({ pressed }) => [styles.academyUtilityCard, pressed && styles.pressed]} onPress={onOpenDirectory}>
          <View style={styles.academyUtilityIcon}>
            <PlayCircle size={17} color={equinaTheme.colors.pine} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.academyUtilityTitle}>Lessons</Text>
            <Text style={styles.academyUtilityBody}>{academyLessons.length} videos</Text>
          </View>
          <ChevronRight size={16} color="#8B8578" />
        </Pressable>
      </View>
    </View>
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

function AcademyDirectory({
  onOpenLesson
}: {
  onOpenLesson: (lesson: (typeof academyLessons)[number]) => void;
}) {
  const [topic, setTopic] = useState<AcademyTopic>("All");
  const visibleLessons = useMemo(
    () => academyLessons.filter((lesson) => topic === "All" || lesson.topic === topic),
    [topic]
  );

  return (
    <View style={styles.academyDirectoryScreen}>
      <View style={styles.academyDirectoryHeader}>
        <View>
          <Text style={styles.homeKicker}>Directory</Text>
          <Text style={styles.academyDirectoryHeading}>All videos</Text>
          <Text style={styles.academyDirectorySubhead}>Short lessons by topic, coach, and level.</Text>
        </View>
        <View style={styles.academyDirectoryCount}>
          <Text style={styles.academyDirectoryCountText}>{visibleLessons.length}</Text>
        </View>
      </View>

      <View style={styles.academySearchShell}>
        <Search size={17} color="#8B8578" />
        <Text style={styles.academySearchText}>Search videos, coaches, skills</Text>
      </View>

      <View style={styles.academyTopicRow}>
        {academyTopics.map((item) => (
          <Pressable
            key={item}
            testID={`academy-topic-${item.toLowerCase()}`}
            style={({ pressed }) => [styles.academyTopicChip, topic === item && styles.academyTopicChipActive, pressed && styles.pressed]}
            onPress={() => setTopic(item)}
          >
            <Text style={[styles.academyTopicText, topic === item && styles.academyTopicTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.academyLessonStack}>
        {visibleLessons.map((lesson, index) => (
          <AcademyLessonCard key={lesson.title} lesson={lesson} featured={index === 0} onPress={() => onOpenLesson(lesson)} />
        ))}
      </View>
    </View>
  );
}

function AcademyVideoPage({
  lesson,
  progress,
  onBack,
  onComplete,
  onOpenLesson
}: {
  lesson: (typeof academyLessons)[number];
  progress: number;
  onBack: () => void;
  onComplete: () => void;
  onOpenLesson: (lesson: (typeof academyLessons)[number]) => void;
}) {
  const nextLesson =
    academyLessons.find((item) => item.title !== lesson.title && item.topic === lesson.topic) ??
    academyLessons.find((item) => item.title !== lesson.title);

  return (
    <View style={styles.academyVideoPage}>
      <View style={styles.academyVideoTopRow}>
        <Pressable testID="academy-video-back" style={({ pressed }) => [styles.academyBackButton, pressed && styles.pressed]} onPress={onBack}>
          <ChevronRight size={16} color={equinaTheme.colors.ink} style={styles.backChevron} />
          <Text style={styles.academyBackText}>Videos</Text>
        </Pressable>
        <View style={styles.masterclassPill}>
          <Clock3 size={13} color={equinaTheme.colors.brass} />
          <Text style={styles.masterclassPillText}>{lesson.duration}</Text>
        </View>
      </View>

      <View style={styles.academyVideoFrame}>
        <Image source={{ uri: lesson.image }} style={styles.academyVideoImage} />
        <View style={styles.academyVideoScrim} />
        <View style={styles.academyVideoCenter}>
          <View style={styles.academyVideoPlay}>
            <PlayCircle size={34} color={equinaTheme.colors.ink} />
          </View>
        </View>
        <View style={styles.academyVideoMeta}>
          <Text style={styles.academyVideoKicker}>{lesson.level} · {lesson.duration}</Text>
          <Text style={styles.academyVideoTitle}>{lesson.title}</Text>
        </View>
      </View>

      <View style={styles.academyVideoInfoCard}>
        <View style={styles.academyVideoInfoTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.homeKicker}>Now playing</Text>
            <Text style={styles.academyVideoInfoTitle}>{lesson.title}</Text>
            <Text style={styles.academyVideoCoach}>{lesson.coach} · {lesson.coachTitle}</Text>
          </View>
          <View style={styles.academyVideoPercentBadge}>
            <Text style={styles.academyProgressPercent}>{progress}%</Text>
          </View>
        </View>
        <View style={styles.homeProgressTrack}>
          <View style={[styles.homeProgressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.academyVideoActions}>
          <Pressable
            testID="academy-video-complete"
            style={({ pressed }) => [styles.academyPrimaryButton, pressed && styles.pressed]}
            onPress={() => {
              onComplete();
              if (nextLesson) {
                onOpenLesson(nextLesson);
              } else {
                onBack();
              }
            }}
          >
            <Text style={styles.academyPrimaryText}>Next</Text>
            <ChevronRight size={17} color={equinaTheme.colors.ivory} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function AcademyChapterRow({ chapter }: { chapter: { time: string; title: string } }) {
  return (
    <View style={styles.academyChapterRow}>
      <Text style={styles.academyChapterTime}>{chapter.time}</Text>
      <Text style={styles.academyChapterTitle}>{chapter.title}</Text>
      <PlayCircle size={16} color="#8B8578" />
    </View>
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
  onPress
}: {
  lesson: (typeof academyLessons)[number];
  featured: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.academyLessonCard, pressed && styles.pressed]} onPress={onPress}>
      <Image source={{ uri: lesson.image }} style={styles.academyLessonImage} />
      <View style={styles.academyLessonBody}>
        <View style={styles.academyLessonTop}>
          <Text style={styles.academyLessonLevel}>{lesson.level}</Text>
          {featured && <Text style={styles.academyLessonNow}>Now</Text>}
        </View>
        <Text numberOfLines={1} style={styles.academyLessonTitle}>{lesson.title}</Text>
        <Text numberOfLines={1} style={styles.academyLessonMeta}>{lesson.coach} · {lesson.duration}</Text>
        <Text numberOfLines={1} style={styles.academyLessonSummary}>{lesson.summary}</Text>
        <View style={styles.academyLessonTrack}>
          <View style={[styles.academyLessonFill, { width: `${lesson.progress}%` }]} />
        </View>
      </View>
      <ChevronRight size={17} color="#8B8578" />
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
  onClubAction,
  onLike,
  onShareRide
}: {
  posts: Array<{ id: string; title: string; body: string; postType: string; space: string }>;
  likes: number;
  sharedRide: boolean;
  onClubAction: (label: string) => void;
  onLike: () => void;
  onShareRide: () => void;
}) {
  const feedAnim = useRef(new Animated.Value(0)).current;
  const liveAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(feedAnim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true
    }).start();
  }, [feedAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(liveAnim, { toValue: 0, duration: 900, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [liveAnim]);

  const feedMotion = {
    opacity: feedAnim,
    transform: [
      {
        translateY: feedAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0]
        })
      }
    ]
  };
  const livePulse = {
    opacity: liveAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 0]
    }),
    transform: [
      {
        scale: liveAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.8]
        })
      }
    ]
  };

  return (
    <Animated.View style={[styles.screen, feedMotion]}>
      <View style={styles.communityTopBar}>
        <View>
          <Text style={styles.communityEyebrow}>Club</Text>
          <Text style={styles.communityTitle}>Riders live now</Text>
        </View>
        <Pressable testID="share-ride" style={({ pressed }) => [styles.communityShareMini, sharedRide && styles.communityShareMiniDone, pressed && styles.homePressLift]} onPress={onShareRide}>
          {sharedRide ? <CheckCircle2 size={16} color={nightTheme.text} /> : <Plus size={17} color={nightTheme.text} />}
          <Text style={styles.communityShareMiniText}>{sharedRide ? "Posted" : "Post"}</Text>
        </Pressable>
      </View>

      <View style={styles.communityComposer}>
        <Image source={{ uri: equinaImages.profile }} style={styles.communityComposerAvatar} />
        <Pressable style={({ pressed }) => [styles.communityComposerInput, pressed && styles.pressed]} onPress={onShareRide}>
          <Text style={styles.communityComposerText}>{sharedRide ? "Ride shared. Add a photo or note?" : "Share today's ride..."}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.communityComposerIcon, pressed && styles.pressed]} onPress={() => onClubAction("Photo")}>
          <Camera size={17} color={equinaTheme.colors.brass} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.communityStoryRail}>
        {communityStories.map((story) => (
          <Pressable key={story.name} style={({ pressed }) => [styles.communityStory, pressed && styles.homePressLift]} onPress={() => onClubAction(story.name)}>
            <View style={styles.communityStoryRing}>
              <Image source={{ uri: story.image }} style={styles.communityStoryImage} />
              {story.live && (
                <View style={styles.communityLiveBadge}>
                  <Animated.View style={[styles.communityLivePulse, livePulse]} />
                  <View style={styles.communityLiveDot} />
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={styles.communityStoryName}>{story.name}</Text>
            <Text numberOfLines={1} style={styles.communityStoryLabel}>{story.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.communityLiveRoom}>
        <Image source={{ uri: equinaImages.jumping }} style={styles.communityLiveImage} />
        <View style={styles.communityLiveScrim} />
        <View style={styles.communityLiveContent}>
          <View style={styles.communityLiveTop}>
            <View style={styles.communityLivePill}>
              <View style={styles.communityLiveDotSmall} />
              <Text style={styles.communityLivePillText}>Live circle</Text>
            </View>
            <Text style={styles.communityLiveCount}>12 online</Text>
          </View>
          <View>
            <Text style={styles.communityLiveTitle}>Tonight's jump line</Text>
            <Text style={styles.communityLiveBody}>Sofia and Mara are reviewing canter rhythm with coach notes.</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.communityJoinButton, pressed && styles.homePressLift]} onPress={() => onClubAction("Join live circle")}>
            <PlayCircle size={16} color={nightTheme.text} />
            <Text style={styles.communityJoinText}>Join</Text>
          </Pressable>
        </View>
      </View>

      {sharedRide && (
        <CommunityFeedCard
          author="Ilinca"
          meta="Just now · Ralfy"
          title="Ralfy finished a light flatwork session"
          body="35 min · balanced · softer in transitions. Next ride: keep the warm-up shorter."
          image={equinaImages.profile}
          likes={likes + 8}
          comments={2}
          verified
          onLike={onLike}
          onComment={() => onClubAction("Comments")}
        />
      )}

      <View style={styles.communityQuickActions}>
        <SocialActionPill Icon={MessageSquareText} label="Ask" onPress={() => onClubAction("Ask")} />
        <SocialActionPill Icon={Bot} label="Coach Q&A" onPress={() => onClubAction("Coach Q&A")} />
        <SocialActionPill Icon={CircleUserRound} label="Circles" onPress={() => onClubAction("Circles")} />
      </View>

      <View style={styles.communityFeedHeader}>
        <Text style={styles.communityFeedTitle}>For you</Text>
        <Text style={styles.communityFeedMeta}>Dressage · Care · Friends</Text>
      </View>

      {posts.map((post, index) => (
        <CommunityFeedCard
          key={post.id}
          author={index % 2 === 0 ? "Mara" : "Elena"}
          meta={`${post.space.replace("_", " ")} · ${index + 1}h`}
          title={post.title}
          body={post.body}
          image={communityFeedMedia[index % communityFeedMedia.length] ?? equinaImages.stable}
          likes={likes + index * 5}
          comments={index + 3}
          verified={post.space.includes("coach")}
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
        <Pressable style={styles.communityPostMore} onPress={onComment}>
          <Text style={styles.communityPostMoreText}>...</Text>
        </Pressable>
      </View>
      <Text style={styles.communityPostTitle}>{title}</Text>
      <Text style={styles.communityPostBody}>{body}</Text>
      <Image source={{ uri: image }} style={styles.communityPostImage} />
      <View style={styles.communityPostActions}>
        <Pressable style={({ pressed }) => [styles.communityPostAction, pressed && styles.pressed]} onPress={onLike}>
          <Heart size={16} color={equinaTheme.colors.brass} />
          <Text style={styles.communityPostActionText}>{likes}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.communityPostAction, pressed && styles.pressed]} onPress={onComment}>
          <MessageSquareText size={16} color={nightTheme.muted} />
          <Text style={styles.communityPostActionText}>{comments}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.communityPostAction, pressed && styles.pressed]} onPress={onComment}>
          <SendHorizontal size={16} color={nightTheme.muted} />
          <Text style={styles.communityPostActionText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProfileScreen({
  buyerName,
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
  onAddLabReport,
  listingCount,
  orderCount,
  disputeCount
}: {
  buyerName: string;
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
  listingCount: number;
  orderCount: number;
  disputeCount: number;
}) {
  const fileCount = (passportUploaded ? 1 : 0) + labReportCount;

  return (
    <View style={styles.screen}>
      <SectionHeader eyebrow="Profile" title={buyerName} />

      <View style={styles.vaultHero}>
        <View style={styles.vaultTop}>
          <View style={styles.avatar}><Text style={styles.avatarText}>I</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vaultTitle}>{horseName} Records</Text>
            <Text style={styles.vaultBody}>Passport, vet checks, labs, and care history.</Text>
          </View>
          <ShieldCheck size={24} color={equinaTheme.colors.brass} />
        </View>
        <View style={styles.profileQuickStats}>
          <Text style={styles.profileQuickStat}>{horseCount} horse{horseCount > 1 ? "s" : ""}</Text>
          <Text style={styles.profileQuickStat}>{medCheckCount} checks</Text>
          <Text style={styles.profileQuickStat}>{fileCount} file{fileCount === 1 ? "" : "s"}</Text>
        </View>
      </View>

      <SectionTitle title="Records" action="quick add" />
      <CompactActionList
        items={[
          { Icon: Home, title: "Horse", body: "Add another profile", onPress: onAddHorse },
          { Icon: Upload, title: "Passport", body: passportUploaded ? "Stored" : "Upload file", onPress: onUploadPassport },
          { Icon: Stethoscope, title: "Vet", body: "Teeth, legs, vaccines", onPress: onAddMedCheck },
          { Icon: Activity, title: "Labs", body: "Bloodwork and scans", onPress: onAddLabReport }
        ]}
      />

      <View style={styles.horseRecordCard}>
        <Image source={{ uri: horsePhoto || equinaImages.profile }} style={styles.horseRecordImage} />
        <View style={styles.horseRecordBody}>
          <View style={styles.horseRecordTop}>
            <View>
              <Text style={styles.panelTitle}>{horseName}</Text>
              <Text style={styles.bodyText}>{discipline} · {horseBreed || "Breed"} · {horseSex} · {horseAge || "?"} years · {horseHeight || "?"} cm</Text>
            </View>
            <View style={styles.levelBadge}>
              <Trophy size={13} color={equinaTheme.colors.brass} />
              <Text style={styles.levelBadgeText}>{level}</Text>
            </View>
          </View>
          <View style={styles.docPillRow}>
            <DocPill Icon={FileText} label="Passport" done={passportUploaded} />
            <DocPill Icon={Activity} label="Labs" done={labReportCount > 0} />
            <DocPill Icon={Stethoscope} label="Med" done={medCheckCount > 0} />
          </View>
          <View style={styles.docPillRow}>
            <DocPill Icon={CalendarCheck} label={frequency} done />
            <DocPill Icon={Sparkles} label={goal} done />
            <DocPill Icon={HeartPulse} label={rideFeel} done />
          </View>
        </View>
      </View>

      <SectionTitle title="Timeline" action={`${medCheckCount + labReportCount + (passportUploaded ? 1 : 0)} items`} />
      <View style={styles.timelineCard}>
        <TimelineItem Icon={Stethoscope} title="Vet check" body={`${medCheckCount} records · latest clear`} />
        <TimelineItem Icon={Activity} title="Analyses" body={`${labReportCount} lab report${labReportCount > 1 ? "s" : ""} stored`} />
        <TimelineItem Icon={FileText} title="Passport" body={passportUploaded ? "Uploaded and ready" : "Missing - tap Passport"} />
        <TimelineItem Icon={ShoppingBag} title="Shop" body={`${listingCount} items · ${orderCount} saved`} />
      </View>
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

function MarketTrustPill({ Icon, title, body }: { Icon: typeof Store; title: string; body: string }) {
  return (
    <View style={styles.marketTrustPill}>
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
        <Text style={styles.reservedOrderStep}>Escrow paid</Text>
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
        <DossierFact Icon={Clock3} label="Inspect" value="5 days" />
      </View>

      <View style={styles.dossierTimeline}>
        <TimelineStep title="Reserve" body="Funds held in escrow" done />
        <TimelineStep title="Ship" body="Tracked + insured" done={false} />
        <TimelineStep title="Inspect" body="Accept or open help" done={false} />
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
  const score = fitScore(listing);

  return (
    <Pressable testID={`market-row-${listing.id}`} style={({ pressed }) => [styles.marketRow, selected && styles.marketRowSelected, pressed && styles.pressed]} onPress={onPress}>
      <Image source={{ uri: listing.photos[0]?.url }} style={styles.marketThumb} />
      <View style={styles.marketBody}>
        <View style={styles.marketTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.marketBrand}>{listing.brand} {listing.model ?? listing.category}</Text>
            <Text style={styles.marketMeta}>{conditionLabel(listing.conditionGrade)} · {listing.location}</Text>
          </View>
          <View style={styles.marketPriceBlock}>
            <Text style={styles.marketPrice}>{money(listing)}</Text>
            <Text style={styles.marketFit}>{score}% fit</Text>
          </View>
        </View>
        <View style={styles.marketTrust}>
          <BadgeCheck size={14} color={equinaTheme.colors.pine} />
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

function ShopProductCard({ listing, selected, onPress }: { listing: Listing; selected: boolean; onPress: () => void }) {
  const score = fitScore(listing);

  return (
    <Pressable testID={`shop-card-${listing.id}`} style={({ pressed }) => [styles.shopProductCard, selected && styles.shopProductCardSelected, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.shopProductImageWrap}>
        <Image source={{ uri: listing.photos[0]?.url }} style={styles.shopProductImage} />
        <View style={styles.shopProductFit}>
          <Text style={styles.shopProductFitText}>{score}% fit</Text>
        </View>
      </View>
      <View style={styles.shopProductBody}>
        <Text numberOfLines={1} style={styles.shopProductBrand}>{listing.brand} {listing.model ?? listing.category}</Text>
        <Text numberOfLines={1} style={styles.shopProductMeta}>{conditionLabel(listing.conditionGrade)} · {listing.location}</Text>
        <View style={styles.shopProductBottom}>
          <Text style={styles.shopProductPrice}>{money(listing)}</Text>
          {selected && <View style={styles.shopProductSelectedDot} />}
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
        <Text style={styles.shopProtectionTitle}>Protected checkout</Text>
        <Text style={styles.shopProtectionBody}>Escrow · 5-day check</Text>
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

function SellerListingRow({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.sellerListingRow, pressed && styles.pressed]} onPress={onPress}>
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
        <Icon size={14} color="#FFF7E6" />
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
      useNativeDriver: true
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 14,
      stiffness: 260,
      mass: 0.5,
      useNativeDriver: true
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
      useNativeDriver: true
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 16,
      stiffness: 260,
      mass: 0.5,
      useNativeDriver: true
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
  }>;
}) {
  return (
    <View style={styles.compactActionList}>
      {items.map(({ Icon, title, body, onPress }, index) => (
        <View key={title}>
          <Pressable style={styles.compactActionRow} onPress={onPress}>
            <View style={styles.compactActionIcon}>
              <Icon size={18} color="#B8924A" />
            </View>
            <View style={styles.compactActionCopy}>
              <Text style={styles.compactActionTitle}>{title}</Text>
              <Text style={styles.compactActionBody}>{body}</Text>
            </View>
            <ChevronRight size={15} color="#C4BDB3" />
          </Pressable>
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
  onPress
}: {
  Icon: typeof Store;
  title: string;
  body: string;
  status: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.documentRow, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.documentIcon}>
        <Icon size={18} color={equinaTheme.colors.brass} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.documentTitle}>{title}</Text>
        <Text style={styles.documentBody}>{body}</Text>
      </View>
      <View style={styles.documentStatus}>
        {status === "stored" || status === "current" ? <CheckCircle2 size={13} color={equinaTheme.colors.pine} /> : <LockKeyhole size={13} color={equinaTheme.colors.brass} />}
        <Text style={styles.documentStatusText}>{status}</Text>
      </View>
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
      <ChevronRight size={18} color="#8B8578" />
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
    backgroundColor: nightTheme.frame
  },
  onboardingRoot: {
    flex: 1,
    backgroundColor: nightTheme.frame
  },
  onboardingScroll: {
    flex: 1
  },
  onboardingContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 132,
    gap: 18
  },
  onboardingTopBar: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  onboardingBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  onboardingBrandName: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  onboardingBrandMeta: {
    color: nightTheme.faint,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2
  },
  onboardingDemoButton: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.065)"
  },
  onboardingDemoText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700"
  },
  onboardingHero: {
    height: 342,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.42,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 }
  },
  onboardingHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  onboardingHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,6,5,0.52)"
  },
  onboardingHeroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: "space-between"
  },
  onboardingHeroTop: {
    gap: 10
  },
  onboardingLiveChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  onboardingLiveChip: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "rgba(247,243,234,0.12)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    overflow: "hidden",
    maxWidth: 132
  },
  onboardingProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  onboardingProgressStep: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8
  },
  onboardingProgressShell: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,247,230,0.12)"
  },
  onboardingProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.brass
  },
  onboardingEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase"
  },
  onboardingTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 37,
    lineHeight: 39,
    fontWeight: "700",
    letterSpacing: 0
  },
  onboardingBody: {
    color: nightTheme.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 9,
    maxWidth: 330
  },
  onboardingProgressName: {
    color: nightTheme.faint,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  onboardingSpotlight: {
    height: 158,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink
  },
  onboardingSpotlightImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  onboardingSpotlightScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,6,5,0.35)"
  },
  onboardingSpotlightContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 13,
    justifyContent: "space-between"
  },
  onboardingSpotlightBadge: {
    alignSelf: "flex-start",
    minHeight: 29,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(8,7,6,0.45)"
  },
  onboardingSpotlightBadgeText: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "700"
  },
  onboardingSpotlightMeta: {
    color: "rgba(255,247,230,0.82)",
    fontSize: 12,
    fontWeight: "700"
  },
  onboardingStepRail: {
    minHeight: 54,
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(247,243,234,0.045)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  onboardingStepRailItem: {
    flex: 1,
    alignItems: "center",
    gap: 5
  },
  onboardingStepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,7,6,0.32)"
  },
  onboardingStepDotActive: {
    backgroundColor: "rgba(216,169,74,0.26)"
  },
  onboardingStepDotDone: {
    backgroundColor: equinaTheme.colors.pine
  },
  onboardingStepDotText: {
    color: nightTheme.faint,
    fontSize: 10,
    fontWeight: "700"
  },
  onboardingStepDotTextActive: {
    color: nightTheme.text
  },
  onboardingStepRailText: {
    color: nightTheme.faint,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  onboardingStepRailTextActive: {
    color: nightTheme.text
  },
  onboardingPanel: {
    gap: 16
  },
  onboardingPanelTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700"
  },
  onboardingField: {
    gap: 8
  },
  onboardingFieldRow: {
    flexDirection: "row",
    gap: 10
  },
  onboardingMiniField: {
    flex: 1
  },
  onboardingLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  onboardingInput: {
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 15,
    color: nightTheme.text,
    fontSize: 16,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    outlineWidth: 0,
    outlineColor: "transparent"
  },
  horsePhotoSection: {
    gap: 9
  },
  horsePhotoPicker: {
    minHeight: 154,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(8,7,6,0.32)"
  },
  horsePhotoPreview: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  horsePhotoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,6,5,0.42)"
  },
  horsePhotoContent: {
    minHeight: 154,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 11
  },
  horsePhotoIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.14)"
  },
  horsePhotoTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700"
  },
  horsePhotoBody: {
    color: "rgba(255,247,230,0.68)",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3
  },
  horsePhotoThumbRow: {
    flexDirection: "row",
    gap: 8
  },
  horsePhotoThumb: {
    flex: 1,
    minHeight: 78,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(247,243,234,0.1)",
    backgroundColor: "rgba(8,7,6,0.42)"
  },
  horsePhotoThumbActive: {
    borderColor: equinaTheme.colors.brass
  },
  horsePhotoThumbImage: {
    height: 48,
    width: "100%"
  },
  horsePhotoThumbText: {
    color: nightTheme.muted,
    fontSize: 11,
    fontWeight: "700"
  },
  horsePhotoThumbTextActive: {
    color: nightTheme.text
  },
  horsePhotoThumbFooter: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4
  },
  onboardingTrustRow: {
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  onboardingTrustText: {
    flex: 1,
    color: nightTheme.text,
    fontSize: 12,
    lineHeight: 16
  },
  onboardingMicroPreview: {
    minHeight: 58,
    borderRadius: 18,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(8,7,6,0.28)"
  },
  onboardingMicroIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.13)"
  },
  onboardingMicroTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700"
  },
  onboardingMicroBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  onboardingChoiceBlock: {
    gap: 10
  },
  onboardingChoiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  onboardingChoiceMotion: {
    alignSelf: "flex-start"
  },
  onboardingChoice: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    backgroundColor: nightTheme.surface
  },
  onboardingChoiceActive: {
    backgroundColor: "rgba(216,169,74,0.2)"
  },
  onboardingChoiceText: {
    color: nightTheme.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  onboardingChoiceTextActive: {
    color: nightTheme.text
  },
  onboardingChoiceCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.28)",
    marginLeft: 6
  },
  onboardingSummaryCard: {
    minHeight: 68,
    borderRadius: 20,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "rgba(8,7,6,0.32)"
  },
  onboardingSummaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.14)"
  },
  onboardingSummaryTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700"
  },
  onboardingSummaryBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  onboardingRecordPreview: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  onboardingRecordText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(247,243,234,0.07)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    overflow: "hidden"
  },
  onboardingPlanPreview: {
    minHeight: 88,
    borderRadius: 22,
    padding: 14,
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.13)"
  },
  onboardingPreviewKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  onboardingPreviewTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    marginTop: 5
  },
  onboardingPreviewBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4
  },
  onboardingPreviewFlow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 12
  },
  onboardingPreviewNode: {
    flex: 1,
    minHeight: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,7,6,0.28)",
    paddingHorizontal: 8
  },
  onboardingPreviewNodeText: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "700"
  },
  onboardingFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 11,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(14,13,11,0.985)",
    borderTopWidth: 1,
    borderTopColor: "rgba(247,243,234,0.06)"
  },
  onboardingBackButton: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.07)"
  },
  onboardingBackSpacer: {
    width: 74
  },
  onboardingBackText: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700"
  },
  onboardingPrimaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#70582C"
  },
  onboardingPrimaryButtonDisabled: {
    backgroundColor: "rgba(247,243,234,0.07)"
  },
  onboardingPrimaryText: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "700"
  },
  onboardingPrimaryTextDisabled: {
    color: nightTheme.faint
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  headerMonogram: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.07)",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }
  },
  headerMonogramText: {
    color: equinaTheme.colors.brass,
    fontSize: 15,
    fontWeight: "700"
  },
  brand: {
    color: nightTheme.text,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0
  },
  subBrand: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
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
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: nightTheme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
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
    backgroundColor: "#36C275"
  },
  headerStatusText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700"
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 96
  },
  screen: {
    gap: 12
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
    marginHorizontal: 18,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: nightTheme.surfaceSoft,
    borderColor: nightTheme.borderStrong,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }]
  },
  homePressLift: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  homeStage: {
    height: 396,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.42,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 }
  },
  homeStageImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  homeStageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,6,5,0.48)"
  },
  homeStageContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: "space-between",
    gap: 14
  },
  homeStageTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  homeStagePill: {
    minHeight: 36,
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
    fontWeight: "700"
  },
  homeStageMetric: {
    minHeight: 36,
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
    fontWeight: "700"
  },
  homeStageMain: {
    gap: 4
  },
  homeStageTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: 0
  },
  homeStageBody: {
    color: "rgba(255,247,230,0.74)",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "400",
    maxWidth: 276
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
    fontWeight: "700"
  },
  homeStagePlanBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  homeStageLiveTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,247,230,0.2)"
  },
  homeStageLiveFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#36C275"
  },
  homeStageActions: {
    flexDirection: "row",
    gap: 9
  },
  homeActionDock: {
    flexDirection: "row",
    gap: 10
  },
  homeStageRideButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: 22,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(216,169,74,0.22)",
    borderWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  homeStageRideButtonActive: {
    backgroundColor: "rgba(49,91,77,0.68)",
    borderColor: "rgba(111,157,139,0.42)"
  },
  homeStageRideTitle: {
    color: nightTheme.text,
    fontSize: 17,
    fontWeight: "700"
  },
  homeStageRideTitleActive: {
    color: equinaTheme.colors.ivory
  },
  homeStageRideSub: {
    color: nightTheme.muted,
    fontSize: 12,
    marginTop: 2
  },
  homeStageRideSubActive: {
    color: "rgba(255,247,230,0.64)"
  },
  homeStageRideCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.accentFillStrong,
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
    fontWeight: "700"
  },
  homeStageMiniTextDone: {
    color: equinaTheme.colors.ivory
  },
  homeDockMiniButton: {
    width: 62,
    minHeight: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "rgba(247,243,234,0.12)",
    borderWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }
  },
  homeDockMiniButtonDone: {
    backgroundColor: "rgba(49,91,77,0.34)",
    borderColor: "rgba(98,141,126,0.42)"
  },
  homeDockMiniText: {
    color: nightTheme.muted,
    fontSize: 10,
    fontWeight: "700"
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
    fontWeight: "700"
  },
  homeLoopLabelActive: {
    color: nightTheme.text
  },
  homePlanPanel: {
    borderRadius: 28,
    padding: 17,
    gap: 15,
    backgroundColor: "rgba(247,243,234,0.055)",
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }
  },
  homePlanSteps: {
    gap: 0
  },
  homePlanStep: {
    minHeight: 62,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(247,243,234,0.075)"
  },
  homePlanStepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.14)"
  },
  homePlanStepTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "700"
  },
  homePlanStepBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  homeRecapCard: {
    borderRadius: 28,
    padding: 17,
    gap: 14,
    backgroundColor: "rgba(247,243,234,0.055)",
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
    fontWeight: "700",
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
    fontWeight: "700"
  },
  homeRecapLabel: {
    color: nightTheme.faint,
    fontSize: 11,
    marginTop: 2
  },
  homeRecapInsight: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(216,169,74,0.13)"
  },
  homeRecapInsightText: {
    flex: 1,
    color: nightTheme.text,
    fontSize: 12,
    lineHeight: 16
  },
  homeRecapActions: {
    flexDirection: "row",
    gap: 8
  },
  homeRecapButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(216,169,74,0.26)"
  },
  homeRecapButtonSecondary: {
    backgroundColor: "rgba(247,243,234,0.09)"
  },
  homeRecapButtonDone: {
    backgroundColor: equinaTheme.colors.pine
  },
  homeRecapButtonText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700"
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
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
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
    fontWeight: "700",
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
    fontWeight: "700"
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
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 4
  },
  heroEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
    textTransform: "uppercase"
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
    backgroundColor: "#6F6A60",
    marginTop: 5
  },
  liveDotActive: {
    backgroundColor: "#36C275"
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
    backgroundColor: "#36C275"
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
    fontWeight: "700"
  },
  statLabel: {
    color: "#BDB29F",
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
    fontWeight: "700",
    color: "#FFF7E6"
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
    backgroundColor: "#D8A94A"
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
    fontWeight: "700"
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
    fontWeight: "700",
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
    fontWeight: "700",
    marginTop: 2
  },
  homeBriefMeta: {
    color: equinaTheme.colors.pine,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700"
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
    fontWeight: "700"
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
    fontWeight: "700",
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
    fontWeight: "700"
  },
  homeMoodRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 1
  },
  moodChipWrap: {
    flex: 1
  },
  moodChip: {
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(8,7,6,0.28)",
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  moodChipActive: {
    backgroundColor: "rgba(216,169,74,0.18)"
  },
  moodChipIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    fontSize: 12,
    fontWeight: "700"
  },
  moodChipLabelActive: {
    color: nightTheme.text
  },
  moodChipBody: {
    color: nightTheme.faint,
    fontSize: 10,
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
    borderColor: "#EFE8DA"
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
    fontWeight: "700"
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
    borderColor: "#D7E2DC"
  },
  homeSoftActionText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "700"
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
    fontWeight: "700",
    marginTop: 2
  },
  homePlanBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  homePlanAsk: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  homePlanAskText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700"
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
    borderColor: "#D7E2DC"
  },
  homeMicroActionText: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "700"
  },
  homeMicroActionTextDone: {
    color: equinaTheme.colors.pine
  },
  homeLiveRideCard: {
    borderRadius: 20,
    padding: 14,
    gap: 12,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: "rgba(49,91,77,0.36)",
    shadowColor: "#000000",
    shadowOpacity: 0.055,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
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
    backgroundColor: "#36C275"
  },
  homeLiveRideDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#36C275"
  },
  homeLiveRideTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 1
  },
  homeLiveRideFinish: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.pine
  },
  homeLiveRideFinishText: {
    color: equinaTheme.colors.ivory,
    fontSize: 12,
    fontWeight: "700"
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
    fontWeight: "400",
    textTransform: "uppercase"
  },
  homeMomentumTitle: {
    color: nightTheme.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
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
    fontWeight: "700"
  },
  homeProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#EFE8DA",
    overflow: "hidden"
  },
  homeProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: equinaTheme.colors.pine
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
    fontWeight: "700"
  },
  momentumLabel: {
    color: nightTheme.muted,
    fontSize: 11,
    marginTop: 2
  },
  friendPanel: {
    borderRadius: 26,
    padding: 15,
    gap: 12,
    backgroundColor: "rgba(247,243,234,0.045)",
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  },
  friendPanelTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  friendPanelTitle: {
    color: nightTheme.text,
    fontSize: 20,
    lineHeight: 23,
    fontWeight: "700",
    marginTop: 1
  },
  friendPanelAction: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(216,169,74,0.14)",
    borderWidth: 0
  },
  friendPanelActionText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700"
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
    width: 108,
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(8,7,6,0.26)",
    borderWidth: 0
  },
  homeClubShareActive: {
    backgroundColor: "#1E2A25",
    borderColor: "rgba(54,194,117,0.24)"
  },
  homeClubShareTitle: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "700"
  },
  homeClubShareBody: {
    color: nightTheme.faint,
    fontSize: 11,
    marginTop: 1
  },
  friendStory: {
    width: 54,
    height: 54,
    minHeight: 54,
    borderRadius: 18,
    padding: 0,
    backgroundColor: "rgba(8,7,6,0.28)",
    borderWidth: 0,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0
  },
  friendAvatarText: {
    color: equinaTheme.colors.ivory,
    fontSize: 15,
    fontWeight: "700"
  },
  friendLiveDot: {
    position: "absolute",
    right: -2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#36C275",
    borderWidth: 2,
    borderColor: "#FFFFFF"
  },
  friendName: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "700"
  },
  friendMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    marginTop: 2
  },
  compactActionList: {
    backgroundColor: nightTheme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: nightTheme.border,
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
    fontWeight: "700"
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
    marginLeft: 56
  },
  compactActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(247,243,234,0.065)",
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
    fontWeight: "700"
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
    textTransform: "uppercase"
  },
  trainingTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
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
    color: "#6A665E",
    fontSize: 12,
    fontWeight: "400"
  },
  trainingProgressValue: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700"
  },
  trainingTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#EFE8DA",
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
    fontWeight: "700"
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
    fontWeight: "700"
  },
  homeFeedStack: {
    gap: 9
  },
  homeFeedCard: {
    backgroundColor: nightTheme.surfaceSoft,
    borderRadius: 16,
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
    fontWeight: "700"
  },
  feedRider: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700"
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
    fontWeight: "700"
  },
  feedTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700"
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
    fontWeight: "700"
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
    borderColor: "#D5DFDA"
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
    fontWeight: "700"
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
    color: "#8B8578",
    fontSize: 11,
    fontWeight: "400"
  },
  homeTackTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
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
    backgroundColor: nightTheme.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 }
  },
  searchInput: {
    flex: 1,
    color: nightTheme.text,
    paddingVertical: 12,
    fontSize: 15
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingRight: 0
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(247,243,234,0.045)",
    borderWidth: 0
  },
  filterChipActive: {
    backgroundColor: nightTheme.accentFill
  },
  filterChipText: {
    color: nightTheme.muted,
    fontSize: 13,
    fontWeight: "400"
  },
  filterChipTextActive: {
    color: nightTheme.text,
    fontWeight: "700"
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
    fontWeight: "700"
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
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: 0
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
    fontSize: 17,
    fontWeight: "700"
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
    backgroundColor: "#EFE8DA"
  },
  listingCardBody: {
    padding: 11,
    gap: 4
  },
  cardTitle: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700"
  },
  cardMeta: {
    color: equinaTheme.colors.brass,
    fontSize: 15,
    fontWeight: "700"
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
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0
  },
  inverseTitle: {
    color: equinaTheme.colors.ivory
  },
  bodyText: {
    color: nightTheme.muted,
    fontSize: 14,
    lineHeight: 20
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
    color: "#6A665E",
    fontSize: 11,
    fontWeight: "400",
    textTransform: "uppercase"
  },
  factValue: {
    marginTop: 4,
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700"
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
    fontWeight: "700"
  },
  secondaryButtonText: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700"
  },
  sectionHeader: {
    gap: 5,
    paddingTop: 2
  },
  eyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    fontWeight: "400",
    textTransform: "uppercase"
  },
  screenTitle: {
    color: nightTheme.text,
    fontSize: 25,
    fontWeight: "700",
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
    height: 250,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 }
  },
  stableHeroImage: {
    width: "100%",
    height: "100%"
  },
  stableHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.32)"
  },
  stableHeroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
    justifyContent: "space-between",
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
    fontWeight: "700"
  },
  stableHeroTop: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12
  },
  stableKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    fontWeight: "400",
    textTransform: "uppercase"
  },
  stableTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 36,
    lineHeight: 39,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 2
  },
  stableMeta: {
    color: "#E8DDC8",
    fontSize: 13,
    fontWeight: "400",
    marginTop: 4
  },
  stableViewSwitch: {
    minHeight: 48,
    borderRadius: 18,
    padding: 5,
    flexDirection: "row",
    gap: 4,
    backgroundColor: nightTheme.surface
  },
  stableViewTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  stableViewTabActive: {
    backgroundColor: nightTheme.accentFillStrong
  },
  stableViewTabText: {
    color: nightTheme.faint,
    fontSize: 13,
    fontWeight: "700"
  },
  stableViewTabTextActive: {
    color: nightTheme.text
  },
  stableViewBody: {
    gap: 12
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
    fontWeight: "700"
  },
  stableMetricLabel: {
    color: nightTheme.faint,
    fontSize: 11,
    fontWeight: "400"
  },
  stableNextCare: {
    minHeight: 82,
    borderRadius: 20,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  stableNextCareIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  stableNextCareKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  stableNextCareTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 2
  },
  stableNextCareBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3
  },
  stableQuickRecordRow: {
    flexDirection: "row",
    gap: 8
  },
  stableQuickRecord: {
    flex: 1,
    minHeight: 112,
    borderRadius: 19,
    padding: 11,
    justifyContent: "space-between",
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  stableQuickRecordActive: {
    backgroundColor: nightTheme.surfaceSoft,
    borderColor: nightTheme.borderStrong
  },
  stableQuickRecordIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  stableQuickRecordIconActive: {
    backgroundColor: "rgba(49,91,77,0.72)"
  },
  stableQuickRecordLabel: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700"
  },
  stableQuickRecordMeta: {
    color: nightTheme.muted,
    fontSize: 11,
    fontWeight: "400"
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
    fontWeight: "700",
    textTransform: "uppercase"
  },
  stableAssistantTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 3
  },
  stableHealthCard: {
    minHeight: 112,
    borderRadius: 22,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(49,91,77,0.72)"
  },
  stableHealthIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.12)"
  },
  stableHealthKicker: {
    color: "rgba(255,247,230,0.7)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  stableHealthTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "700",
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
    borderRadius: 20,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  stableDocsIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  stableDocsTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700"
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
    fontWeight: "700",
    lineHeight: 24
  },
  stableScoreLabel: {
    color: nightTheme.muted,
    fontSize: 10,
    fontWeight: "400",
    textTransform: "uppercase"
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
    borderColor: "#D5DFDA"
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
    gap: 9
  },
  documentRow: {
    backgroundColor: nightTheme.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  documentIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  documentTitle: {
    color: nightTheme.text,
    fontSize: 15,
    fontWeight: "700"
  },
  documentBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3
  },
  documentStatus: {
    alignItems: "center",
    gap: 3,
    minWidth: 48
  },
  documentStatusText: {
    color: nightTheme.muted,
    fontSize: 10,
    fontWeight: "400"
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
    fontWeight: "700"
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
    fontWeight: "700"
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
    textTransform: "uppercase"
  },
  dailyTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 18,
    fontWeight: "700"
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
    textTransform: "uppercase"
  },
  dailyTitleLight: {
    color: nightTheme.text,
    fontSize: 18,
    fontWeight: "700"
  },
  dailyBodyLight: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16
  },
  emptyState: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: nightTheme.border,
    gap: 9
  },
  clearFilterButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.ink
  },
  clearFilterButtonText: {
    color: equinaTheme.colors.ivory,
    fontSize: 13,
    fontWeight: "700"
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
    backgroundColor: "#EFE8DA"
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "rgba(247,243,234,0.045)",
    borderRadius: 18,
    padding: 4,
    gap: 4,
    borderWidth: 0
  },
  segment: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    outlineWidth: 0
  },
  segmentActive: {
    backgroundColor: nightTheme.accentFill,
    borderWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  segmentText: {
    color: nightTheme.muted,
    fontSize: 13,
    fontWeight: "400"
  },
  segmentTextActive: {
    color: nightTheme.text,
    fontWeight: "700"
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
    textTransform: "uppercase"
  },
  shopTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "700"
  },
  shopBody: {
    color: "#D8CCB8",
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
    fontWeight: "700"
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
    fontWeight: "700"
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
    fontWeight: "700"
  },
  shopMenuLabel: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700"
  },
  shopMenuBody: {
    color: nightTheme.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400"
  },
  shopTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  shopSearchBox: {
    flex: 1,
    minHeight: 50
  },
  sellMiniButton: {
    minWidth: 76,
    minHeight: 54,
    borderRadius: 18,
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
    fontWeight: "700"
  },
  shopTrustStrip: {
    flexDirection: "row",
    gap: 8
  },
  shopFeedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14
  },
  shopProductCard: {
    width: "48.4%",
    backgroundColor: nightTheme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: nightTheme.border,
    padding: 8,
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  shopProductCardSelected: {
    borderColor: equinaTheme.colors.brass,
    backgroundColor: nightTheme.surface
  },
  shopProductImageWrap: {
    width: "100%",
    aspectRatio: 0.86,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#EFE8DA"
  },
  shopProductImage: {
    width: "100%",
    height: "100%"
  },
  shopProductFit: {
    position: "absolute",
    left: 8,
    top: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(22,21,18,0.72)"
  },
  shopProductFitText: {
    color: equinaTheme.colors.ivory,
    fontSize: 10,
    fontWeight: "700"
  },
  shopProductBody: {
    paddingHorizontal: 2,
    paddingBottom: 2,
    gap: 4
  },
  shopProductBrand: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700"
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
    fontWeight: "700"
  },
  shopProductSelectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  shopFeatureCard: {
    height: 292,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 }
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
    fontWeight: "700"
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
    fontWeight: "700"
  },
  shopFeatureBottom: {
    gap: 5
  },
  shopFeatureKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
    textTransform: "uppercase"
  },
  shopFeatureTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 31,
    lineHeight: 34,
    fontWeight: "700"
  },
  shopFeatureMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexWrap: "wrap"
  },
  shopFeaturePrice: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700"
  },
  shopFeatureMeta: {
    color: "#F5EBD8",
    fontSize: 13,
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
    backgroundColor: "#EFE8DA"
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
    textTransform: "uppercase"
  },
  shopSelectedTitle: {
    color: nightTheme.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
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
    fontWeight: "700"
  },
  shopFitLabel: {
    color: nightTheme.muted,
    fontSize: 9,
    fontWeight: "400",
    textTransform: "uppercase"
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
    backgroundColor: "#FFF7E6"
  },
  shopProtectionTitle: {
    color: nightTheme.text,
    fontSize: 14,
    fontWeight: "700"
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
    fontWeight: "700"
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
    fontWeight: "700",
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
    backgroundColor: "#FFF7E6",
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
    fontWeight: "700"
  },
  sellerStatsRow: {
    flexDirection: "row",
    gap: 9
  },
  sellerSteps: {
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  sellerStep: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: nightTheme.surfaceSoft
  },
  sellerStepIndex: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7E6"
  },
  sellerStepIndexText: {
    color: equinaTheme.colors.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  sellerStepTitle: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700"
  },
  sellerStepBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginTop: 2
  },
  sellerListingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: nightTheme.surface,
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  sellerListingImage: {
    width: 58,
    height: 58,
    borderRadius: 8,
    backgroundColor: "#EFE8DA"
  },
  sellerListingBody: {
    flex: 1,
    gap: 3
  },
  sellerListingTitle: {
    color: nightTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700"
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
    fontWeight: "700"
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
    backgroundColor: "#FFF7E6",
    alignItems: "center",
    justifyContent: "center"
  },
  fitScoreValue: {
    color: equinaTheme.colors.ink,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 24
  },
  fitScoreLabel: {
    color: equinaTheme.colors.graphite,
    fontSize: 10,
    fontWeight: "400",
    textTransform: "uppercase"
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
    color: "#FFFFFF",
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "700",
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
    backgroundColor: "#FFF7E6",
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
    flex: 1,
    minHeight: 70,
    backgroundColor: nightTheme.surface,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: nightTheme.border,
    gap: 7
  },
  marketTrustPillTitle: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700"
  },
  marketTrustPillBody: {
    color: nightTheme.muted,
    fontSize: 10,
    lineHeight: 13,
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
    textTransform: "uppercase"
  },
  reservedOrderTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    marginTop: 2
  },
  reservedOrderPrice: {
    color: equinaTheme.colors.ivory,
    fontSize: 16,
    fontWeight: "700"
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
    textTransform: "uppercase"
  },
  marketDossierTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
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
    textTransform: "uppercase",
    marginTop: 5
  },
  dossierFactValue: {
    color: nightTheme.text,
    fontSize: 13,
    fontWeight: "700"
  },
  dossierTimeline: {
    borderTopWidth: 1,
    borderTopColor: "#E5DFD3",
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
    borderColor: "#D8CCB8",
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
    fontWeight: "700"
  },
  timelineStepBody: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 15,
    marginTop: 2
  },
  marketRow: {
    backgroundColor: nightTheme.surface,
    borderRadius: 16,
    padding: 10,
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  marketRowSelected: {
    borderColor: equinaTheme.colors.brass,
    backgroundColor: nightTheme.surface
  },
  marketThumb: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: "#EFE8DA"
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
    fontWeight: "700"
  },
  marketPriceBlock: {
    alignItems: "flex-end",
    gap: 3
  },
  marketPrice: {
    color: equinaTheme.colors.brass,
    fontSize: 16,
    fontWeight: "700"
  },
  marketFit: {
    color: equinaTheme.colors.pine,
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
    color: equinaTheme.colors.pine,
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
    fontWeight: "700"
  },
  marketSafetyBody: {
    color: "#D8CCB8",
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
    fontWeight: "700"
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
    fontWeight: "700"
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
    gap: 10
  },
  learnHome: {
    gap: 12
  },
  learnEntryRow: {
    flexDirection: "row",
    gap: 10
  },
  learnEntryTile: {
    flex: 1,
    minHeight: 174,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: nightTheme.surface
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
    left: 14,
    right: 14,
    bottom: 14
  },
  learnEntryLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 7
  },
  learnEntryTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "700"
  },
  learnEntryBody: {
    color: "rgba(255,247,230,0.68)",
    fontSize: 12,
    lineHeight: 15,
    marginTop: 5
  },
  learnEntryIcon: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
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
    fontWeight: "700",
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
    fontWeight: "700"
  },
  academySwitch: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: "rgba(247,243,234,0.045)",
    padding: 4,
    flexDirection: "row",
    gap: 4,
    borderWidth: 0
  },
  academySwitchItem: {
    flex: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    outlineWidth: 0,
    outlineColor: "transparent",
    borderWidth: 0
  },
  academySwitchItemActive: {
    backgroundColor: nightTheme.accentFill,
    borderWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  academySwitchText: {
    color: nightTheme.muted,
    fontSize: 13,
    fontWeight: "400"
  },
  academySwitchTextActive: {
    color: nightTheme.text,
    fontWeight: "700"
  },
  academyLibrary: {
    gap: 10
  },
  academyHero: {
    height: 236,
    borderRadius: 22,
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
    fontWeight: "700"
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
    fontWeight: "700",
    lineHeight: 21
  },
  academyProgressLabel: {
    color: nightTheme.muted,
    fontSize: 10,
    fontWeight: "400",
    textTransform: "uppercase"
  },
  academyHeroKicker: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    fontWeight: "400",
    textTransform: "uppercase"
  },
  academyHeroTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
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
    fontWeight: "700"
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
    fontWeight: "700"
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
    fontWeight: "700",
    marginTop: 2
  },
  academyProgressPercent: {
    color: equinaTheme.colors.pine,
    fontSize: 18,
    fontWeight: "700"
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
    fontWeight: "700"
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
    color: "#8B8578",
    fontSize: 10,
    lineHeight: 12
  },
  academyPathPercent: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700"
  },
  academyPathMiniTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E9E0D1",
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
    fontWeight: "700"
  },
  academyUtilityBody: {
    color: "#8B8578",
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
    fontWeight: "700"
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
    fontWeight: "700"
  },
  academyDirectoryScreen: {
    gap: 10
  },
  academyDirectoryHeader: {
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  academyDirectoryHeading: {
    color: nightTheme.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    marginTop: 2
  },
  academyDirectorySubhead: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4
  },
  academyDirectoryCount: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.borderStrong
  },
  academyDirectoryCountText: {
    color: nightTheme.text,
    fontSize: 16,
    fontWeight: "700"
  },
  academySearchShell: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    gap: 9
  },
  academySearchText: {
    color: "#8B8578",
    fontSize: 13,
    lineHeight: 17
  },
  academyTopicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  academyTopicChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surface,
    borderWidth: 0
  },
  academyTopicChipActive: {
    backgroundColor: nightTheme.accentFill
  },
  academyTopicText: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "400"
  },
  academyTopicTextActive: {
    color: nightTheme.text,
    fontWeight: "700"
  },
  academyVideoPage: {
    gap: 10
  },
  academyVideoTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  academyBackButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  backChevron: {
    transform: [{ rotate: "180deg" }]
  },
  academyBackText: {
    color: nightTheme.text,
    fontSize: 12,
    fontWeight: "700"
  },
  academyVideoFrame: {
    width: "100%",
    aspectRatio: 1.78,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: equinaTheme.colors.ink,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }
  },
  academyVideoImage: {
    width: "100%",
    height: "100%"
  },
  academyVideoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18,17,14,0.26)"
  },
  academyVideoCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  academyVideoPlay: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,247,230,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)"
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
    fontWeight: "400",
    textTransform: "uppercase"
  },
  academyVideoTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "700",
    marginTop: 3
  },
  academyVideoCoach: {
    color: "#8B8578",
    fontSize: 12,
    marginTop: 3
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
    fontWeight: "700",
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
  academyVideoSummary: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18
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
    fontWeight: "700"
  },
  academyChapterRow: {
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: nightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10
  },
  academyChapterTime: {
    color: equinaTheme.colors.brass,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    minWidth: 38
  },
  academyChapterTitle: {
    flex: 1,
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700"
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
    backgroundColor: "#EFE8DA"
  },
  academyNextTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
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
    fontWeight: "700"
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
    fontWeight: "700"
  },
  academyCoachName: {
    color: nightTheme.text,
    fontSize: 10,
    fontWeight: "700",
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
    gap: 9
  },
  academyLessonCard: {
    minHeight: 94,
    borderRadius: 16,
    padding: 9,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    shadowColor: "#000000",
    shadowOpacity: 0.025,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  academyLessonImage: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#EFE8DA"
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
    textTransform: "uppercase"
  },
  academyLessonNow: {
    color: equinaTheme.colors.pine,
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: nightTheme.surfaceSoft,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden"
  },
  academyLessonTitle: {
    color: nightTheme.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700"
  },
  academyLessonMeta: {
    color: nightTheme.muted,
    fontSize: 12,
    lineHeight: 15
  },
  academyLessonSummary: {
    color: "#8B8578",
    fontSize: 11,
    lineHeight: 14
  },
  academyLessonTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "#EFE8DA",
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
  coachAvatar: {
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
    textTransform: "uppercase"
  },
  coachRoomTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
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
    fontWeight: "700"
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
    fontWeight: "700"
  },
  coachSignalLabel: {
    color: "#D8CCB8",
    fontSize: 10,
    marginTop: 1
  },
  coachSetupSheet: {
    backgroundColor: nightTheme.surface,
    borderRadius: 22,
    padding: 13,
    gap: 10,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
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
    textTransform: "uppercase"
  },
  coachSetupTitle: {
    color: nightTheme.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
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
    backgroundColor: "#E5DFD3"
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
    fontWeight: "700"
  },
  coachStartButton: {
    minHeight: 46,
    borderRadius: 17,
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
    fontWeight: "700"
  },
  chatPanel: {
    backgroundColor: nightTheme.surface,
    borderRadius: 24,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }
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
    fontWeight: "700"
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
    fontWeight: "400",
    textTransform: "uppercase"
  },
  messageConfidence: {
    color: nightTheme.muted,
    fontSize: 11
  },
  messageText: {
    color: nightTheme.text,
    fontSize: 13,
    lineHeight: 18
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
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  communityEyebrow: {
    color: equinaTheme.colors.brass,
    fontSize: 11,
    fontWeight: "400",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  communityTitle: {
    color: nightTheme.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "700",
    marginTop: 2
  },
  communityShareMini: {
    minHeight: 38,
    borderRadius: 999,
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
    fontWeight: "700"
  },
  communityComposer: {
    minHeight: 58,
    borderRadius: 22,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border
  },
  communityComposerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: nightTheme.surfaceSoft
  },
  communityComposerInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: 16,
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  communityComposerText: {
    color: nightTheme.muted,
    fontSize: 14,
    fontWeight: "400"
  },
  communityComposerIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,169,74,0.12)"
  },
  communityStoryRail: {
    gap: 12,
    paddingRight: 16
  },
  communityStory: {
    width: 76,
    alignItems: "center",
    gap: 5
  },
  communityStoryRing: {
    width: 64,
    height: 64,
    borderRadius: 24,
    padding: 2,
    borderWidth: 1,
    borderColor: "rgba(216,169,74,0.6)"
  },
  communityStoryImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
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
    fontWeight: "700",
    maxWidth: 72
  },
  communityStoryLabel: {
    color: nightTheme.faint,
    fontSize: 10,
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
    fontWeight: "700"
  },
  communityLiveCount: {
    color: "rgba(255,247,230,0.72)",
    fontSize: 12,
    fontWeight: "700"
  },
  communityLiveTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700"
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
    fontWeight: "700"
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
    fontWeight: "700"
  },
  communityFeedHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 2
  },
  communityFeedTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700"
  },
  communityFeedMeta: {
    color: nightTheme.faint,
    fontSize: 11,
    fontWeight: "400"
  },
  communityPostCard: {
    borderRadius: 24,
    padding: 12,
    gap: 10,
    backgroundColor: nightTheme.surface,
    borderWidth: 1,
    borderColor: nightTheme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 }
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
    borderRadius: 16,
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
    fontWeight: "700"
  },
  communityPostMeta: {
    color: nightTheme.faint,
    fontSize: 11,
    marginTop: 2
  },
  communityPostMore: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: nightTheme.surfaceSoft
  },
  communityPostMoreText: {
    color: nightTheme.muted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: -5
  },
  communityPostTitle: {
    color: nightTheme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700"
  },
  communityPostBody: {
    color: nightTheme.muted,
    fontSize: 13,
    lineHeight: 18
  },
  communityPostImage: {
    height: 214,
    width: "100%",
    borderRadius: 20,
    backgroundColor: nightTheme.surfaceSoft
  },
  communityPostActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  communityPostAction: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: nightTheme.surfaceSoft
  },
  communityPostActionText: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "700"
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
    fontWeight: "700",
    letterSpacing: 0
  },
  clubBody: {
    color: "#D8CCB8",
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
    fontWeight: "700"
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
    fontWeight: "700"
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
    textTransform: "uppercase"
  },
  postType: {
    color: nightTheme.muted,
    fontSize: 12,
    fontWeight: "400"
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
    fontWeight: "700"
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
    fontWeight: "700",
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
    color: "#D8CCB8",
    fontSize: 13
  },
  vaultProgressValue: {
    color: equinaTheme.colors.ivory,
    fontSize: 18,
    fontWeight: "700"
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
    color: "#D8CCB8",
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
    backgroundColor: "#EFE8DA"
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
    fontWeight: "700"
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
    fontWeight: "700"
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
    fontWeight: "700"
  },
  tabDockOuter: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    paddingTop: 4,
    backgroundColor: "rgba(14,13,11,0.94)"
  },
  tabBar: {
    minHeight: 62,
    backgroundColor: "rgba(23,21,17,0.96)",
    borderRadius: 30,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.36,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 }
  },
  tabItem: {
    flex: 0.82,
    minHeight: 46,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    outlineWidth: 0,
    outlineColor: "transparent"
  },
  tabItemActive: {
    flex: 1.44,
    backgroundColor: "rgba(247,243,234,0.06)",
    borderWidth: 0,
    paddingHorizontal: 10
  },
  tabItemPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }]
  },
  tabIconShell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  tabIconShellActive: {
    backgroundColor: nightTheme.accentFill
  },
  tabLiveDot: {
    position: "absolute",
    right: 5,
    top: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: equinaTheme.colors.brass,
    borderWidth: 1,
    borderColor: "#FFFFFF"
  },
  tabLiveDotActive: {
    borderColor: nightTheme.surface
  },
  tabActiveLabelWrap: {
    maxWidth: 74
  },
  tabTextActive: {
    color: nightTheme.text,
    fontSize: 11,
    fontWeight: "700"
  }
});
