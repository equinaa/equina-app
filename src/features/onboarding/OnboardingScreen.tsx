import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as AppleAuthentication from "expo-apple-authentication";
import { LinearGradient } from "expo-linear-gradient";
import {
  Camera,
  Check,
  ChevronDown,
  ImageOff,
  LockKeyhole,
  Mail,
  ShieldCheck
} from "lucide-react-native";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { actionHaptic, selectionHaptic } from "../../ui/motion/haptics";
import { useReducedMotion } from "../../ui/motion/useReducedMotion";
import {
  socialAuthAvailability,
  type EmailAuthMode
} from "../account/social-auth";
import {
  EquinaBackButton,
  EquinaButton,
  EquinaField,
  EquinaProgress,
  EquinaSelector,
  EquinaSheet
} from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";

export type OnboardingStep = "you" | "horse" | "preview";
export type OnboardingDiscipline = "Dressage" | "Jumping" | "Eventing" | "Trail";
export type RiderLevel = "Beginner" | "Intermediate" | "Advanced" | "Pro";
export type OnboardingCompletionMode = "connected" | "preview" | "unavailable";
export type OnboardingAuthProvider = "apple" | "google";
type AccountMethod = "choice" | "email" | "password" | "signin" | "recovery";

export const onboardingSteps: readonly OnboardingStep[] = ["you", "horse", "preview"];

const disciplines: readonly OnboardingDiscipline[] = ["Dressage", "Jumping", "Eventing", "Trail"];
const riderLevels: readonly RiderLevel[] = ["Beginner", "Intermediate", "Advanced", "Pro"];
const horseBreedOptions = [
  { id: "warmblood", value: "Warmblood", label: "Warmblood" },
  { id: "belgian-warmblood", value: "Belgian Warmblood", label: "Belgian Warmblood" },
  { id: "dutch-warmblood", value: "Dutch Warmblood (KWPN)", label: "Dutch Warmblood (KWPN)" },
  { id: "hanoverian", value: "Hanoverian", label: "Hanoverian" },
  { id: "holsteiner", value: "Holsteiner", label: "Holsteiner" },
  { id: "selle-francais", value: "Selle Français", label: "Selle Français" },
  { id: "irish-sport-horse", value: "Irish Sport Horse", label: "Irish Sport Horse" },
  { id: "oldenburg", value: "Oldenburg", label: "Oldenburg" },
  { id: "thoroughbred", value: "Thoroughbred", label: "Thoroughbred" },
  { id: "arabian", value: "Arabian", label: "Arabian" },
  { id: "quarter-horse", value: "Quarter Horse", label: "Quarter Horse" },
  { id: "andalusian", value: "Andalusian", label: "Andalusian" },
  { id: "friesian", value: "Friesian", label: "Friesian" },
  { id: "connemara-pony", value: "Connemara Pony", label: "Connemara Pony" },
  { id: "welsh-pony", value: "Welsh Pony", label: "Welsh Pony" },
  { id: "other-mixed", value: "Other / mixed", label: "Other / mixed" },
  { id: "not-sure", value: "", label: "Not sure yet" }
] as const;
const stepLabels: Record<OnboardingStep, string> = {
  you: "You",
  horse: "Your horse",
  preview: "Your Equina"
};
const disciplineNotes: Record<OnboardingDiscipline, string> = {
  Dressage: "Precision and feel",
  Jumping: "Rhythm and confidence",
  Eventing: "Balance and fitness",
  Trail: "Calm miles outside"
};
const horsePhotoCrop: Record<HorsePhotoOption["id"], StyleProp<ImageStyle>> = {
  portrait: undefined,
  stable: { transform: [{ scale: 1.22 }, { translateX: -6 }] },
  action: { transform: [{ scale: 1.42 }, { translateY: 8 }] }
};

type HorsePhotoOption = {
  id: "portrait" | "stable" | "action";
  label: string;
  image: string;
  value: string;
};

type OnboardingScreenProps = {
  step: OnboardingStep;
  name: string;
  email: string;
  discipline: OnboardingDiscipline;
  level: RiderLevel;
  hasHorse: boolean;
  horsePhoto: string;
  horseName: string;
  horseBreed: string;
  disciplineImages: Record<OnboardingDiscipline, string>;
  horsePhotoOptions: readonly HorsePhotoOption[];
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onDisciplineChange: (value: OnboardingDiscipline) => void;
  onLevelChange: (value: RiderLevel) => void;
  onHasHorseChange: (value: boolean) => void;
  onHorsePhotoChange: (value: string) => void;
  onHorseNameChange: (value: string) => void;
  onHorseBreedChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => Promise<void> | void;
  onSocialAuth: (provider: OnboardingAuthProvider) => Promise<void> | void;
  onPasswordContinue: (password: string) => Promise<void> | void;
  onPasswordSignIn: (password: string) => Promise<void> | void;
  onPasswordRecovery: () => Promise<void> | void;
  onUseDemo: () => void;
  completionMode: OnboardingCompletionMode;
  signedIn: boolean;
  emailAuthMode: EmailAuthMode;
  busy?: boolean;
  error?: string;
  showDemo?: boolean;
};

export function OnboardingScreen({
  step,
  name,
  email,
  discipline,
  level,
  hasHorse,
  horsePhoto,
  horseName,
  horseBreed,
  disciplineImages,
  horsePhotoOptions,
  onNameChange,
  onEmailChange,
  onDisciplineChange,
  onLevelChange,
  onHasHorseChange,
  onHorsePhotoChange,
  onHorseNameChange,
  onHorseBreedChange,
  onNext,
  onBack,
  onComplete,
  onSocialAuth,
  onPasswordContinue,
  onPasswordSignIn,
  onPasswordRecovery,
  onUseDemo,
  completionMode,
  signedIn,
  emailAuthMode,
  busy = false,
  error = "",
  showDemo = false
}: OnboardingScreenProps) {
  const scrollRef = useRef<ScrollView>(null);
  const stageMotion = useRef(new Animated.Value(1)).current;
  const [completing, setCompleting] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [accountMethod, setAccountMethod] = useState<AccountMethod>("choice");
  const [password, setPassword] = useState("");
  const reducedMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const compactHeight = height < 720;
  const stepIndex = Math.max(0, onboardingSteps.indexOf(step));
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const accountReady = name.trim().length > 1;
  const horseReady = !hasHorse || horseName.trim().length > 1;
  const canContinue = step === "you" ? accountReady : step === "horse" ? horseReady : true;
  const usesPresetHorsePhoto = horsePhotoOptions.some((option) => option.value === horsePhoto);
  const homeHeroPhoto =
    hasHorse && !usesPresetHorsePhoto && horsePhoto
      ? horsePhoto
      : disciplineImages[discipline];
  const firstName = name.trim().split(/\s+/)[0] || "Rider";
  const disciplineHeroHeight = compactHeight ? 104 : Math.min(184, Math.round(height * 0.215));

  const ridePreview = useMemo(
    () =>
      ({
        Dressage: {
          title: "Find a softer contact.",
          meta: "35 min · flatwork",
          plan: "Build a soft rhythm, then finish on one clean transition."
        },
        Jumping: {
          title: "Build a calmer line.",
          meta: "30 min · poles",
          plan: "Find the canter over poles, then finish on one confident line."
        },
        Eventing: {
          title: "Train the engine.",
          meta: "40 min · fitness",
          plan: "Work in short balanced intervals, then take a long recovery walk."
        },
        Trail: {
          title: "Make space to breathe.",
          meta: "45 min · outside",
          plan: "Settle the walk and follow one calm, forward rhythm."
        }
      })[discipline],
    [discipline]
  );

  useEffect(() => {
    setFieldFocused(false);
    scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion });

    if (reducedMotion) {
      stageMotion.setValue(1);
      return;
    }

    stageMotion.setValue(0);
    Animated.timing(stageMotion, {
      toValue: 1,
      duration: equinaTheme.motion.transition,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [reducedMotion, stageMotion, step]);

  const stageStyle = {
    opacity: stageMotion,
    transform: [
      {
        translateX: stageMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0]
        })
      },
      {
        translateY: stageMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [reducedMotion ? 0 : 8, 0]
        })
      }
    ]
  };

  const handleNext = () => {
    if (!canContinue) return;
    setFieldFocused(false);
    Keyboard.dismiss();
    actionHaptic();
    onNext();
  };

  const handleBack = () => {
    setFieldFocused(false);
    selectionHaptic();
    onBack();
  };

  const handleComplete = async () => {
    if (completing || busy) return;
    setFieldFocused(false);
    Keyboard.dismiss();
    actionHaptic();
    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  };

  const dismissAccountSheet = () => {
    setAccountSheetVisible(false);
    setAccountMethod("choice");
    setPassword("");
  };

  const handlePreviewAction = () => {
    if (completionMode === "connected" && !signedIn) {
      selectionHaptic();
      setAccountSheetVisible(true);
      return;
    }
    void handleComplete();
  };

  const continueWithEmail = async () => {
    if (!emailReady || completing || busy) return;
    await handleComplete();
  };

  const continueWithPassword = async () => {
    if (!emailReady || password.length < 10 || password.length > 128 || completing || busy) return;
    setCompleting(true);
    try {
      await onPasswordContinue(password);
    } finally {
      setCompleting(false);
    }
  };

  const signInWithPassword = async () => {
    if (!emailReady || password.length < 10 || password.length > 128 || completing || busy) return;
    setCompleting(true);
    try {
      await onPasswordSignIn(password);
    } finally {
      setCompleting(false);
    }
  };

  const recoverPassword = async () => {
    if (!emailReady || completing || busy) return;
    setCompleting(true);
    try {
      await onPasswordRecovery();
    } finally {
      setCompleting(false);
    }
  };

  const completionLabel =
    completionMode === "connected"
      ? signedIn
        ? "Unlock my starter pack"
        : "Save my Equina"
      : completionMode === "preview"
        ? "Enter my Equina"
        : "Account unavailable";
  const primaryLabel = step === "you" ? "Continue" : step === "horse" ? "See my Equina" : completionLabel;
  const completionUnavailable = step === "preview" && completionMode === "unavailable";
  const revealActiveInput = () => {
    setFieldFocused(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
      });
    });
  };

  return (
    <KeyboardAvoidingView
      testID="onboarding-screen"
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.chrome}>
        <View style={styles.topBar}>
          <Text accessibilityRole="header" style={styles.brand}>Equina</Text>
          {step === "you" && showDemo && (
            <MotionPressable
              testID="onboarding-use-demo"
              accessibilityRole="button"
              accessibilityLabel="Use demo profile"
              hitSlop={4}
              onPress={onUseDemo}
              style={styles.demoButton}
            >
              <Text style={styles.demoText}>Use demo</Text>
            </MotionPressable>
          )}
        </View>
        <EquinaProgress current={stepIndex + 1} total={onboardingSteps.length} label={stepLabels[step]} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          compactHeight && styles.scrollContentCompact,
          fieldFocused && styles.scrollContentFocused,
          step === "preview" && styles.previewScrollContent
        ]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.stage,
            compactHeight && styles.stageCompact,
            step === "preview" && styles.previewStage,
            stageStyle
          ]}
        >
          {step === "you" && (
            <>
              <StageHeader title="Built around your ride." body="Choose your discipline and level." />

              <View style={styles.disciplineSection}>
                <View style={[styles.disciplineHero, { height: disciplineHeroHeight }]}>
                  <ResilientImage uri={disciplineImages[discipline]} style={styles.absoluteImage} />
                  <LinearGradient
                    colors={["rgba(5,6,5,0.02)", "rgba(5,6,5,0.12)", "rgba(5,6,5,0.9)"]}
                    locations={[0, 0.48, 1]}
                    style={styles.absoluteImage}
                  />
                  <View style={styles.disciplineCopy}>
                    <Text style={styles.disciplineName}>{discipline}</Text>
                    <Text style={styles.disciplineMeta}>{disciplineNotes[discipline]}</Text>
                  </View>
                </View>
                <View accessibilityRole="radiogroup" style={styles.disciplineSelector}>
                  {disciplines.map((option) => (
                    <MotionPressable
                      key={option}
                      testID={`onboarding-discipline-${option.toLowerCase()}`}
                      accessibilityRole="radio"
                      accessibilityLabel={option}
                      accessibilityState={{ selected: discipline === option }}
                      onPress={() => {
                        if (discipline !== option) selectionHaptic();
                        onDisciplineChange(option);
                      }}
                      style={[
                        styles.disciplineOption,
                        discipline === option && styles.disciplineOptionSelected
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                        style={[
                          styles.disciplineOptionText,
                          discipline === option && styles.disciplineOptionTextSelected
                        ]}
                      >
                        {option}
                      </Text>
                    </MotionPressable>
                  ))}
                </View>
              </View>

              <EquinaSelector
                label="Riding level"
                options={riderLevels}
                value={level}
                onChange={onLevelChange}
                testPrefix="onboarding-level"
              />

              <View style={styles.identitySection}>
                <EquinaField
                  testID="onboarding-name"
                  label="Name"
                  value={name}
                  onChangeText={onNameChange}
                  onFocus={revealActiveInput}
                  onBlur={() => setFieldFocused(false)}
                  placeholder="Your name"
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  maxLength={60}
                />
              </View>
            </>
          )}

          {step === "horse" && (
            <>
              <StageHeader
                title="Do you have your own horse?"
                body="Build a horse profile now, or add one later."
              />

              <View accessibilityRole="radiogroup" style={styles.horsePathSwitch}>
                <MotionPressable
                  testID="onboarding-horse-mode-own"
                  accessibilityRole="radio"
                  accessibilityLabel="Add a horse profile"
                  accessibilityState={{ selected: hasHorse }}
                  onPress={() => {
                    if (!hasHorse) selectionHaptic();
                    onHasHorseChange(true);
                  }}
                  style={[styles.horsePathOption, hasHorse && styles.horsePathOptionActive]}
                >
                  <Text style={[styles.horsePathText, hasHorse && styles.horsePathTextActive]}>My horse</Text>
                </MotionPressable>
                <MotionPressable
                  testID="onboarding-horse-mode-none"
                  accessibilityRole="radio"
                  accessibilityLabel="Continue without a horse"
                  accessibilityState={{ selected: !hasHorse }}
                  onPress={() => {
                    if (hasHorse) selectionHaptic();
                    onHasHorseChange(false);
                  }}
                  style={[styles.horsePathOption, !hasHorse && styles.horsePathOptionActive]}
                >
                  <Text style={[styles.horsePathText, !hasHorse && styles.horsePathTextActive]}>Not yet</Text>
                </MotionPressable>
              </View>

              {hasHorse ? (
                <HorseProfileEditor
                  value={horsePhoto}
                  options={horsePhotoOptions}
                  discipline={discipline}
                  fallbackPhoto={disciplineImages[discipline]}
                  horseName={horseName}
                  horseBreed={horseBreed}
                  onInputFocus={revealActiveInput}
                  onInputBlur={() => setFieldFocused(false)}
                  onPhotoChange={onHorsePhotoChange}
                  onHorseNameChange={onHorseNameChange}
                  onHorseBreedChange={onHorseBreedChange}
                />
              ) : (
                <RiderFirstSetup
                  discipline={discipline}
                  level={level}
                  image={disciplineImages[discipline]}
                />
              )}
            </>
          )}

          {step === "preview" && (
            <View style={styles.homePreview}>
              <ResilientImage uri={homeHeroPhoto} style={styles.absoluteImage} />
              <LinearGradient
                colors={["rgba(5,6,5,0.28)", "rgba(5,6,5,0.06)", "rgba(5,6,5,0.94)"]}
                locations={[0, 0.42, 1]}
                style={styles.absoluteImage}
              />
              <View style={styles.previewContent}>
                <View style={styles.previewTopline}>
                  <View style={styles.previewContext}>
                    <Text style={styles.previewContextLabel}>YOUR EQUINA</Text>
                    <View style={styles.previewContextDot} />
                    <Text style={styles.previewContextValue}>{discipline}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.previewDiscipline}>{level}</Text>
                </View>
                <View style={styles.previewBottom}>
                  <View style={styles.previewMain}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      style={styles.previewGreeting}
                    >
                      Ready, {firstName}.
                    </Text>
                    <Text style={styles.previewHorse}>
                      {hasHorse
                        ? `${horseName.trim() || "Your horse"} · ${ridePreview.meta}`
                        : `Your ${discipline.toLowerCase()} plan · ${ridePreview.meta}`}
                    </Text>
                    <Text numberOfLines={2} style={styles.previewTitle}>{ridePreview.title}</Text>
                    <Text style={styles.previewPlan}>{ridePreview.plan}</Text>
                  </View>
                  <View testID="onboarding-account-mode" style={styles.starterPack}>
                    <View style={styles.starterPackIcon}>
                      <ShieldCheck size={17} color={equinaTheme.colors.brass} />
                    </View>
                    <View style={styles.starterPackCopy}>
                      <Text style={styles.starterPackLabel}>YOUR STARTER PACK</Text>
                      <Text numberOfLines={2} style={styles.starterPackText}>
                        First ride plan · personal Academy path · Ralf brief
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.footer}>
        {stepIndex > 0 && (
          <EquinaBackButton
            testID="onboarding-back"
            onPress={handleBack}
          />
        )}
        <EquinaButton
          testID={step === "preview" ? "onboarding-create-account" : "onboarding-continue"}
          label={
            busy && step === "preview"
              ? completionMode === "connected"
                ? "Securing account..."
                : "Opening Equina..."
              : primaryLabel
          }
          disabled={!canContinue || completing || busy || completionUnavailable}
          onPress={step === "preview" ? handlePreviewAction : handleNext}
          style={styles.primaryButton}
        />
      </View>

      <AccountMethodSheet
        visible={accountSheetVisible}
        method={accountMethod}
        emailAuthMode={emailAuthMode}
        email={email}
        password={password}
        busy={busy || completing}
        error={error}
        onMethodChange={setAccountMethod}
        onEmailChange={onEmailChange}
        onPasswordChange={setPassword}
        onSocialAuth={onSocialAuth}
        onEmailContinue={() => void continueWithEmail()}
        onPasswordContinue={() => void continueWithPassword()}
        onPasswordSignIn={() => void signInWithPassword()}
        onPasswordRecovery={() => void recoverPassword()}
        onDismiss={dismissAccountSheet}
      />

    </KeyboardAvoidingView>
  );
}

function StageHeader({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.stageHeader}>
      <Text accessibilityRole="header" style={styles.stageTitle}>{title}</Text>
      <Text style={styles.stageBody}>{body}</Text>
    </View>
  );
}

function AccountMethodSheet({
  visible,
  method,
  emailAuthMode,
  email,
  password,
  busy,
  error,
  onMethodChange,
  onEmailChange,
  onPasswordChange,
  onSocialAuth,
  onEmailContinue,
  onPasswordContinue,
  onPasswordSignIn,
  onPasswordRecovery,
  onDismiss
}: {
  visible: boolean;
  method: AccountMethod;
  emailAuthMode: EmailAuthMode;
  email: string;
  password: string;
  busy: boolean;
  error: string;
  onMethodChange: (method: AccountMethod) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSocialAuth: (provider: OnboardingAuthProvider) => Promise<void> | void;
  onEmailContinue: () => void;
  onPasswordContinue: () => void;
  onPasswordSignIn: () => void;
  onPasswordRecovery: () => void;
  onDismiss: () => void;
}) {
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordReady = password.length >= 10 && password.length <= 128;
  const hasSocialAuth = socialAuthAvailability.apple || socialAuthAvailability.google;
  const usesPassword = method === "password" || method === "signin";
  const title = {
    choice: "Save your Equina",
    email: "Continue with email",
    password: "Create a password",
    signin: "Welcome back",
    recovery: "Recover your account"
  }[method];
  const primaryLabel = busy
    ? "Securing account..."
    : method === "email"
      ? emailAuthMode === "magic-link" ? "Email secure link" : "Send secure code"
      : method === "password"
        ? "Create secure account"
        : method === "signin"
          ? "Sign in"
          : "Send recovery link";
  const primaryAction = method === "email"
    ? onEmailContinue
    : method === "password"
      ? onPasswordContinue
      : method === "signin"
        ? onPasswordSignIn
        : onPasswordRecovery;

  return (
    <EquinaSheet
      visible={visible}
      title={title}
      closeTestID="onboarding-auth-sheet-close"
      onDismiss={onDismiss}
    >
      {method === "choice" ? (
        <View style={styles.authChoice}>
          <Text style={styles.authIntro}>Keep your plan, Academy progress, horse records, and conversations in sync.</Text>

          {socialAuthAvailability.apple ? (
            Platform.OS === "ios" ? (
              <AppleAuthentication.AppleAuthenticationButton
                testID="onboarding-auth-apple"
                accessibilityLabel="Continue with Apple"
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={14}
                onPress={() => {
                  if (!busy) void onSocialAuth("apple");
                }}
                style={styles.appleButton}
              />
            ) : (
              <SocialAuthButton
                testID="onboarding-auth-apple"
                mark={Platform.OS === "web" ? "\uF8FF" : "A"}
                label="Continue with Apple"
                disabled={busy}
                onPress={() => void onSocialAuth("apple")}
              />
            )
          ) : null}

          {socialAuthAvailability.google ? (
            <SocialAuthButton
              testID="onboarding-auth-google"
              mark="G"
              label="Continue with Google"
              disabled={busy}
              onPress={() => void onSocialAuth("google")}
            />
          ) : null}

          {hasSocialAuth ? (
            <View style={styles.authDivider}>
              <View style={styles.authDividerLine} />
              <Text style={styles.authDividerText}>OR</Text>
              <View style={styles.authDividerLine} />
            </View>
          ) : null}

          <MotionPressable
            testID="onboarding-auth-email"
            accessibilityRole="button"
            accessibilityLabel="Continue with email"
            disabled={busy}
            onPress={() => onMethodChange("email")}
            style={styles.emailAuthButton}
          >
            <Mail size={19} color={equinaTheme.text.primary} />
            <Text style={styles.emailAuthButtonText}>Continue with email</Text>
          </MotionPressable>
          <MotionPressable
            testID="onboarding-auth-existing-account"
            accessibilityRole="button"
            accessibilityLabel="Sign in with password"
            disabled={busy}
            onPress={() => onMethodChange("signin")}
            style={styles.authAlternative}
          >
            <Text style={styles.authAlternativeText}>Already have an account? Sign in</Text>
          </MotionPressable>
          <Text style={styles.authPrivacy}>Private session · no marketing opt-in · sign out anytime</Text>
        </View>
      ) : (
        <View style={styles.authEmail}>
          <Text style={styles.authIntro}>
            {method === "email"
              ? emailAuthMode === "magic-link"
                ? "We will email a secure sign-in link. No password to remember."
                : "We will send a short verification code. No password to remember."
              : method === "password"
                ? "Use 10 or more characters. Your password is handled only by the secure auth service."
                : method === "signin"
                  ? "Use the email and password connected to your Equina."
                  : "We will send a short-lived recovery link if the account exists."}
          </Text>
          <EquinaField
            testID="onboarding-email"
            label="Email"
            value={email}
            onChangeText={onEmailChange}
            onBlur={() => onEmailChange(email.trim().toLowerCase())}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            returnKeyType={usesPassword ? "next" : "done"}
            maxLength={120}
          />
          {usesPassword ? (
            <EquinaField
              testID="onboarding-auth-password"
              label="Password"
              value={password}
              onChangeText={onPasswordChange}
              placeholder="10+ characters"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={method === "password" ? "new-password" : "current-password"}
              textContentType={method === "password" ? "newPassword" : "password"}
              secureTextEntry
              returnKeyType="done"
              maxLength={128}
              onSubmitEditing={() => {
                if (!passwordReady || !emailReady) return;
                if (method === "password") onPasswordContinue();
                else onPasswordSignIn();
              }}
            />
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.authError}>{error}</Text> : null}
          <EquinaButton
            testID={
              method === "email"
                ? "onboarding-auth-send-code"
                : method === "password"
                  ? "onboarding-auth-create-password"
                  : method === "signin"
                    ? "onboarding-auth-sign-in"
                    : "onboarding-auth-recovery"
            }
            label={primaryLabel}
            disabled={busy || !emailReady || (usesPassword && !passwordReady)}
            leading={<LockKeyhole size={18} color={equinaTheme.colors.ink} />}
            onPress={primaryAction}
          />
          {method === "email" ? (
            <MotionPressable
              testID="onboarding-auth-use-password"
              accessibilityRole="button"
              onPress={() => onMethodChange("password")}
              style={styles.authAlternative}
            >
              <Text style={styles.authAlternativeText}>Create an account with a password</Text>
            </MotionPressable>
          ) : null}
          {method === "password" ? (
            <MotionPressable
              testID="onboarding-auth-use-code"
              accessibilityRole="button"
              onPress={() => onMethodChange("email")}
              style={styles.authAlternative}
            >
              <Text style={styles.authAlternativeText}>Use a secure email link instead</Text>
            </MotionPressable>
          ) : null}
          {method === "signin" ? (
            <MotionPressable
              testID="onboarding-auth-forgot-password"
              accessibilityRole="button"
              onPress={() => onMethodChange("recovery")}
              style={styles.authAlternative}
            >
              <Text style={styles.authAlternativeText}>Forgot your password?</Text>
            </MotionPressable>
          ) : null}
          {method === "recovery" ? (
            <MotionPressable
              testID="onboarding-auth-recovery-back"
              accessibilityRole="button"
              onPress={() => onMethodChange("signin")}
              style={styles.authAlternative}
            >
              <Text style={styles.authAlternativeText}>Back to password sign-in</Text>
            </MotionPressable>
          ) : null}
          <MotionPressable
            testID="onboarding-auth-methods-back"
            accessibilityRole="button"
            onPress={() => onMethodChange("choice")}
            style={styles.authAlternative}
          >
            <Text style={styles.authAlternativeMuted}>Back to sign-in options</Text>
          </MotionPressable>
        </View>
      )}
    </EquinaSheet>
  );
}

function SocialAuthButton({
  testID,
  mark,
  label,
  disabled,
  onPress
}: {
  testID: string;
  mark: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <MotionPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.socialAuthButton, disabled && styles.authButtonDisabled]}
    >
      <Text style={styles.socialAuthMark}>{mark}</Text>
      <Text style={styles.socialAuthText}>{label}</Text>
    </MotionPressable>
  );
}

function BreedSelector({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const selectedLabel =
    horseBreedOptions.find((option) => option.value === value)?.label ??
    (value.trim() || "Not sure yet");

  return (
    <View style={styles.breedField}>
      <View style={styles.breedLabelRow}>
        <Text style={styles.breedLabel}>Breed</Text>
        <Text style={styles.breedOptional}>Optional</Text>
      </View>
      <MotionPressable
        testID="onboarding-horse-breed"
        accessibilityRole="button"
        accessibilityLabel={`Horse breed: ${selectedLabel}`}
        onPress={() => {
          selectionHaptic();
          setVisible(true);
        }}
        style={styles.breedControl}
      >
        <Text
          numberOfLines={1}
          style={[styles.breedValue, !value && styles.breedValuePlaceholder]}
        >
          {selectedLabel}
        </Text>
        <ChevronDown size={18} color={equinaTheme.text.tertiary} />
      </MotionPressable>

      <EquinaSheet
        visible={visible}
        title="Choose a breed"
        closeTestID="onboarding-horse-breed-close"
        onDismiss={() => setVisible(false)}
      >
        <Text style={styles.breedSheetIntro}>Choose the closest match. You can change it later.</Text>
        <ScrollView
          style={styles.breedSheetScroll}
          contentContainerStyle={styles.breedSheetContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {horseBreedOptions.map((option, index) => {
            const selected = option.value === value;
            return (
              <MotionPressable
                key={option.id}
                testID={`onboarding-horse-breed-${option.id}`}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
                onPress={() => {
                  if (!selected) selectionHaptic();
                  onChange(option.value);
                  setVisible(false);
                }}
                style={[
                  styles.breedOption,
                  index < horseBreedOptions.length - 1 && styles.breedOptionDivider
                ]}
              >
                <Text style={[styles.breedOptionText, selected && styles.breedOptionTextSelected]}>
                  {option.label}
                </Text>
                {selected ? <Check size={17} color={equinaTheme.colors.brass} /> : null}
              </MotionPressable>
            );
          })}
        </ScrollView>
      </EquinaSheet>
    </View>
  );
}

function HorseProfileEditor({
  value,
  options,
  discipline,
  fallbackPhoto,
  horseName,
  horseBreed,
  onInputFocus,
  onInputBlur,
  onPhotoChange,
  onHorseNameChange,
  onHorseBreedChange
}: {
  value: string;
  options: readonly HorsePhotoOption[];
  discipline: OnboardingDiscipline;
  fallbackPhoto: string;
  horseName: string;
  horseBreed: string;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onPhotoChange: (value: string) => void;
  onHorseNameChange: (value: string) => void;
  onHorseBreedChange: (value: string) => void;
}) {
  const { height } = useWindowDimensions();
  const [photoIssue, setPhotoIssue] = useState("");
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const selectedPhoto = options.find((option) => option.value === value);
  const usesDemoPhoto = !value || Boolean(selectedPhoto);
  const displayPhoto = selectedPhoto?.image ?? (value || fallbackPhoto);
  const heroHeight = height < 720 ? 136 : Math.min(260, Math.round(height * 0.29));

  const pickHorsePhoto = async () => {
    actionHaptic();
    setPhotoIssue("");

    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setPhotoIssue("Photo access is off. Enable it in Settings to add your horse.");
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.86
      });

      const selectedUri = result.canceled ? undefined : result.assets[0]?.uri;
      if (selectedUri) {
        selectionHaptic();
        onPhotoChange(selectedUri);
        setPhotoSheetVisible(false);
      }
    } catch {
      setPhotoIssue("That photo could not be opened. Try another one.");
    }
  };

  return (
    <View style={styles.horseEditor}>
      <View style={[styles.horseProfileHero, { height: heroHeight }]}>
        <ResilientImage
          uri={displayPhoto}
          imageStyle={selectedPhoto ? horsePhotoCrop[selectedPhoto.id] : undefined}
          style={styles.absoluteImage}
        />
        <LinearGradient
          colors={["rgba(5,6,5,0.24)", "rgba(5,6,5,0.02)", "rgba(5,6,5,0.92)"]}
          locations={[0, 0.42, 1]}
          style={styles.absoluteImage}
        />

        <View style={styles.horseProfileTopline}>
          <Text style={styles.horseProfileEyebrow}>YOUR TEAMMATE</Text>
          <MotionPressable
            testID="onboarding-horse-photo-upload"
            accessibilityRole="button"
            accessibilityLabel={usesDemoPhoto ? "Add your horse photo" : "Change horse photo"}
            onPress={() => {
              selectionHaptic();
              setPhotoSheetVisible(true);
            }}
            style={styles.photoUploadButton}
          >
            <Camera size={16} color={equinaTheme.text.primary} />
            <Text style={styles.photoUploadText}>{usesDemoPhoto ? "Add photo" : "Change"}</Text>
          </MotionPressable>
        </View>

        <View style={styles.horseProfileCopy}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.horseProfileName}>
            {horseName.trim() || "Name your horse"}
          </Text>
          <Text numberOfLines={1} style={styles.horseProfileMeta}>
            {horseBreed.trim() ? `${horseBreed.trim()} · ${discipline}` : discipline}
          </Text>
        </View>
      </View>

      {photoIssue.length > 0 && <Text accessibilityLiveRegion="polite" style={styles.photoIssue}>{photoIssue}</Text>}

      <View style={styles.horseFields}>
        <EquinaField
          testID="onboarding-horse-name"
          label="Horse name"
          value={horseName}
          onChangeText={onHorseNameChange}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          placeholder="Name your horse"
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={60}
        />
        <BreedSelector
          value={horseBreed}
          onChange={onHorseBreedChange}
        />
      </View>

      <EquinaSheet
        visible={photoSheetVisible}
        title="Choose a horse photo"
        closeTestID="onboarding-horse-photo-close"
        onDismiss={() => setPhotoSheetVisible(false)}
      >
        <View style={styles.photoSheetBody}>
          <Text style={styles.photoSheetIntro}>Add your own photo or use a sample while you get started.</Text>
          <View accessibilityRole="radiogroup" style={styles.photoSheetOptions}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <MotionPressable
                  key={option.id}
                  testID={`onboarding-horse-photo-${option.id}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} starter horse photo`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (!selected) selectionHaptic();
                    setPhotoIssue("");
                    onPhotoChange(option.value);
                    setPhotoSheetVisible(false);
                  }}
                  style={styles.photoSheetOption}
                >
                  <View style={styles.photoSheetImage}>
                    <ResilientImage
                      uri={option.image}
                      imageStyle={horsePhotoCrop[option.id]}
                      style={styles.absoluteImage}
                    />
                    {selected && (
                      <View style={styles.demoPhotoCheck}>
                        <Check size={11} strokeWidth={2.6} color={equinaTheme.colors.ink} />
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={styles.photoSheetLabel}>{option.label}</Text>
                </MotionPressable>
              );
            })}
          </View>
          <EquinaButton
            testID="onboarding-horse-photo-library"
            label="Choose from library"
            showArrow={false}
            leading={<Camera size={18} color={equinaTheme.colors.ink} />}
            onPress={() => void pickHorsePhoto()}
          />
        </View>
      </EquinaSheet>
    </View>
  );
}

function RiderFirstSetup({
  discipline,
  level,
  image
}: {
  discipline: OnboardingDiscipline;
  level: RiderLevel;
  image: string;
}) {
  const { height } = useWindowDimensions();
  const panelHeight = height < 720 ? 190 : Math.min(310, Math.round(height * 0.35));

  return (
    <View testID="onboarding-rider-first" style={[styles.riderFirstPanel, { height: panelHeight }]}>
      <ResilientImage uri={image} style={styles.absoluteImage} />
      <LinearGradient
        colors={["rgba(5,6,5,0.18)", "rgba(5,6,5,0.10)", "rgba(5,6,5,0.94)"]}
        locations={[0, 0.36, 1]}
        style={styles.absoluteImage}
      />
      <View style={styles.riderFirstTopline}>
        <Text style={styles.riderFirstEyebrow}>RIDER-FIRST PROFILE</Text>
        <Text style={styles.riderFirstMeta}>{level} · {discipline}</Text>
      </View>
      <View style={styles.riderFirstCopy}>
        <Text style={styles.riderFirstTitle}>Every ride still counts.</Text>
        <Text style={styles.riderFirstBody}>
          Your plans and lessons adapt to you. Horse records stay empty until you add one.
        </Text>
      </View>
    </View>
  );
}

function ResilientImage({
  uri,
  style,
  imageStyle
}: {
  uri: string;
  style: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [uri]);

  return (
    <View style={[styles.imageFallback, style]}>
      <ImageOff size={20} color={equinaTheme.text.tertiary} />
      {!failed && (
        <Image
          source={{ uri }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          style={[styles.absoluteImage, imageStyle]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: equinaTheme.surfaceRole.base
  },
  chrome: {
    paddingHorizontal: 18,
    paddingTop: 0
  },
  topBar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  brand: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary
  },
  demoButton: {
    minWidth: 72,
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    paddingHorizontal: equinaTheme.spacing.compact,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  demoText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  error: {
    color: equinaTheme.colors.danger,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    paddingHorizontal: 18,
    paddingBottom: 4
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: equinaTheme.spacing.md,
    paddingBottom: equinaTheme.spacing.md
  },
  scrollContentCompact: {
    paddingTop: equinaTheme.spacing.sm
  },
  scrollContentFocused: {
    paddingBottom: equinaTheme.spacing.xxl
  },
  previewScrollContent: {
    paddingTop: equinaTheme.spacing.sm,
    paddingBottom: 0
  },
  stage: {
    flexGrow: 1,
    gap: equinaTheme.spacing.md
  },
  stageCompact: {
    gap: equinaTheme.spacing.compact
  },
  previewStage: {
    gap: 0
  },
  stageHeader: {
    gap: equinaTheme.spacing.xs
  },
  stageTitle: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary
  },
  stageBody: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary,
    maxWidth: 350
  },
  horsePathSwitch: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    padding: 4,
    borderRadius: equinaTheme.radius.control,
    overflow: "hidden",
    flexDirection: "row",
    gap: 4,
    backgroundColor: "rgba(247,243,234,0.055)"
  },
  horsePathOption: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    flex: 1,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center"
  },
  horsePathOptionActive: {
    backgroundColor: equinaTheme.surfaces.elevated
  },
  horsePathText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  horsePathTextActive: {
    color: equinaTheme.colors.brass
  },
  disciplineSection: {
    gap: equinaTheme.spacing.sm
  },
  disciplineHero: {
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  disciplineSelector: {
    minHeight: 48,
    padding: 3,
    borderRadius: equinaTheme.radius.control,
    flexDirection: "row",
    backgroundColor: equinaTheme.material.quiet
  },
  disciplineOption: {
    minWidth: 0,
    minHeight: 44,
    flex: 1,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  disciplineOptionSelected: {
    backgroundColor: equinaTheme.surfaces.elevated
  },
  disciplineOptionText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary,
    textAlign: "center"
  },
  disciplineOptionTextSelected: {
    color: equinaTheme.colors.brass
  },
  disciplineCopy: {
    position: "absolute",
    left: equinaTheme.spacing.compact,
    right: equinaTheme.spacing.compact,
    bottom: equinaTheme.spacing.compact,
    gap: 2
  },
  disciplineName: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  disciplineMeta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  identitySection: {
    gap: equinaTheme.spacing.compact
  },
  horseFields: {
    gap: equinaTheme.spacing.compact
  },
  breedField: {
    gap: equinaTheme.spacing.xs
  },
  breedLabelRow: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.compact
  },
  breedLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  breedOptional: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  },
  breedControl: {
    minHeight: 52,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: equinaTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    backgroundColor: equinaTheme.surfaces.raised
  },
  breedValue: {
    ...equinaTheme.typography.body,
    flex: 1,
    minWidth: 0,
    color: equinaTheme.text.primary
  },
  breedValuePlaceholder: {
    color: equinaTheme.text.tertiary
  },
  breedSheetIntro: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary,
    paddingBottom: equinaTheme.spacing.sm
  },
  breedSheetScroll: {
    maxHeight: 440
  },
  breedSheetContent: {
    paddingBottom: equinaTheme.spacing.sm
  },
  breedOption: {
    minHeight: 52,
    paddingHorizontal: equinaTheme.spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.compact
  },
  breedOptionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: equinaTheme.material.separator
  },
  breedOptionText: {
    ...equinaTheme.typography.body,
    flex: 1,
    color: equinaTheme.text.primary
  },
  breedOptionTextSelected: {
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  horseEditor: {
    gap: equinaTheme.spacing.compact
  },
  riderFirstPanel: {
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  riderFirstTopline: {
    position: "absolute",
    left: equinaTheme.spacing.md,
    right: equinaTheme.spacing.md,
    top: equinaTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.compact
  },
  riderFirstEyebrow: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  riderFirstMeta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary
  },
  riderFirstCopy: {
    position: "absolute",
    left: equinaTheme.spacing.md,
    right: equinaTheme.spacing.md,
    bottom: equinaTheme.spacing.md,
    gap: equinaTheme.spacing.xs
  },
  riderFirstTitle: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary
  },
  riderFirstBody: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary,
    maxWidth: 320
  },
  horseProfileHero: {
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  horseProfileTopline: {
    position: "absolute",
    left: equinaTheme.spacing.md,
    right: equinaTheme.spacing.md,
    top: equinaTheme.spacing.compact,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.compact
  },
  horseProfileEyebrow: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.primary
  },
  photoUploadButton: {
    minHeight: 44,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: equinaTheme.spacing.compact,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(14,13,11,0.72)"
  },
  photoUploadText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.primary
  },
  horseProfileCopy: {
    position: "absolute",
    left: equinaTheme.spacing.md,
    right: equinaTheme.spacing.md,
    bottom: equinaTheme.spacing.md,
    gap: 2
  },
  horseProfileName: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary,
    textShadowColor: "rgba(0,0,0,0.72)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  horseProfileMeta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  demoPhotoCheck: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: equinaTheme.radius.compact,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass
  },
  photoIssue: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.danger
  },
  photoSheetBody: {
    gap: equinaTheme.spacing.md
  },
  photoSheetIntro: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary
  },
  photoSheetOptions: {
    flexDirection: "row",
    gap: equinaTheme.spacing.compact
  },
  photoSheetOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    gap: 6
  },
  photoSheetImage: {
    height: 88,
    borderRadius: equinaTheme.radius.control,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  photoSheetLabel: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    textAlign: "center"
  },
  homePreview: {
    minHeight: 414,
    flex: 1,
    marginHorizontal: -18,
    borderBottomLeftRadius: equinaTheme.radius.hero,
    borderBottomRightRadius: equinaTheme.radius.hero,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  previewContent: {
    ...StyleSheet.absoluteFillObject,
    padding: equinaTheme.spacing.md,
    justifyContent: "space-between"
  },
  previewTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.compact
  },
  previewContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  previewContextLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  previewContextDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: equinaTheme.colors.brass
  },
  previewContextValue: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary
  },
  previewGreeting: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.brass,
    fontWeight: "600"
  },
  previewDiscipline: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  previewMain: {
    gap: 6
  },
  previewBottom: {
    gap: equinaTheme.spacing.compact
  },
  previewHorse: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    textShadowColor: "rgba(0,0,0,0.72)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  previewTitle: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary
  },
  previewPlan: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary,
    maxWidth: 330
  },
  starterPack: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    paddingTop: equinaTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(247,243,234,0.22)"
  },
  starterPackIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  starterPackCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  starterPackLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  starterPackText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  authChoice: {
    gap: equinaTheme.spacing.compact
  },
  authEmail: {
    gap: equinaTheme.spacing.md
  },
  authIntro: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary,
    paddingBottom: equinaTheme.spacing.xs
  },
  appleButton: {
    width: "100%",
    height: 54
  },
  socialAuthButton: {
    minHeight: 54,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: equinaTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: equinaTheme.spacing.compact,
    backgroundColor: equinaTheme.colors.ivory
  },
  socialAuthMark: {
    width: 22,
    color: equinaTheme.colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center"
  },
  socialAuthText: {
    color: equinaTheme.colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  authButtonDisabled: {
    opacity: 0.48
  },
  authDivider: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  authDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: equinaTheme.material.separator
  },
  authDividerText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  },
  emailAuthButton: {
    minHeight: 54,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: equinaTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: equinaTheme.spacing.sm,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  emailAuthButtonText: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  authPrivacy: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary,
    textAlign: "center"
  },
  authError: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colors.danger
  },
  authAlternative: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: equinaTheme.spacing.compact
  },
  authAlternativeText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  authAlternativeMuted: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: equinaTheme.spacing.sm,
    paddingBottom: equinaTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: equinaTheme.material.separator,
    backgroundColor: equinaTheme.surfaceRole.base
  },
  primaryButton: {
    flex: 1
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.raised
  },
  absoluteImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
});
