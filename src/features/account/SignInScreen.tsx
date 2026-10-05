import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { LinearGradient } from "expo-linear-gradient";
import { Mail } from "lucide-react-native";
import {
  AccountMethodSheet,
  SocialAuthButton,
  type AccountMethod
} from "../onboarding/OnboardingScreen";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { equinaTheme } from "../../ui/theme/theme";
import { signInCopy as copy } from "./sign-in-copy";
import { visibleProviders } from "./provider-visibility";
import { socialAuthAvailability, type EmailAuthMode, type SocialAuthProvider } from "./social-auth";

const plateImage = require("../../../assets/images/equestrian/jumping-lesson.jpg");

export type SignInScreenProps = {
  /** Whether a backend exists at all. Without one no method can work. */
  configured: boolean;
  emailAuthMode: EmailAuthMode;
  busy: boolean;
  error: string;
  /** A neutral, non-error message, e.g. that a reset link was sent. */
  notice: string;
  showDemo: boolean;
  onProvider: (provider: SocialAuthProvider) => void;
  onPasswordSignIn: (email: string, password: string) => void;
  /** Resolve true once the request was answered; the sheet then closes so
   *  the neutral notice shows on the screen behind it. */
  onPasswordRecovery: (email: string) => Promise<boolean>;
  onEmailLinkSignIn: (email: string) => Promise<boolean>;
  onCreateAccount: () => void;
  onUseDemo: () => void;
  onClearMessages: () => void;
  /** Prefills the email field, e.g. after an account was created on this device. */
  initialEmail?: string;
};

export function SignInScreen({
  configured,
  emailAuthMode,
  busy,
  error,
  notice,
  showDemo,
  onProvider,
  onPasswordSignIn,
  onPasswordRecovery,
  onEmailLinkSignIn,
  onCreateAccount,
  onUseDemo,
  onClearMessages,
  initialEmail = ""
}: SignInScreenProps) {
  const { height, fontScale } = useWindowDimensions();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [method, setMethod] = useState<AccountMethod>("signin");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");

  const providers = visibleProviders(Platform.OS, socialAuthAvailability);
  const hasProvider = providers.apple || providers.google;

  // The photo is decoration. On a short screen or with large text it gives
  // its space back so the sign-in buttons stay in view -- Apple asks for its
  // button to be visible without scrolling. Only at accessibility text sizes,
  // where nothing fits, does the screen scroll.
  const plateHeight = fontScale > 1.3
    ? 0
    : Math.min(420, Math.max(220, height * (height < 700 ? 0.38 : 0.46)));

  // VoiceOver does not read live regions; announce the outcome explicitly.
  useEffect(() => {
    const message = error || notice;
    if (message && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  }, [error, notice]);

  const openEmail = () => {
    onClearMessages();
    setPassword("");
    setMethod("signin");
    setSheetVisible(true);
  };

  const closeSheet = () => {
    if (busy) return;
    setSheetVisible(false);
    setPassword("");
  };

  const sendAndClose = async (request: (email: string) => Promise<boolean>) => {
    if (await request(email.trim())) {
      setSheetVisible(false);
      setPassword("");
    }
  };

  // The status line always holds its height, so an error appearing never
  // shoves the buttons down under the person's thumb.
  const statusText = error || notice || (busy ? copy.status.finishing : "");

  return (
    <View style={styles.root} testID="signin-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {plateHeight > 0 ? (
          <View
            style={[styles.plate, { height: plateHeight }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Image source={plateImage} resizeMode="cover" style={styles.plateImage} />
            <LinearGradient
              colors={["rgba(8,7,6,0)", "rgba(8,7,6,0.55)", equinaTheme.surfaces.canvas]}
              locations={[0, 0.55, 1]}
              style={styles.plateFade}
            />
            <Text style={styles.wordmark}>{copy.wordmark}</Text>
          </View>
        ) : (
          <Text style={[styles.wordmark, styles.wordmarkInline]}>{copy.wordmark}</Text>
        )}

        <View style={styles.middle}>
          <Text accessibilityRole="header" numberOfLines={3} style={styles.headline}>{copy.headline}</Text>
          <Text style={styles.subhead}>{copy.subhead}</Text>
        </View>

        <View style={styles.spacer} />

        <View style={styles.footer} pointerEvents={busy && !sheetVisible ? "none" : "auto"}>
          <Text
            testID="signin-status"
            accessibilityRole={error ? "alert" : undefined}
            accessibilityLiveRegion="polite"
            style={[styles.status, error ? styles.statusError : null]}
          >
            {statusText}
          </Text>

          {configured ? (
            <>
              {providers.apple ? (
                <AppleAuthentication.AppleAuthenticationButton
                  testID="signin-apple"
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={14}
                  style={styles.appleButton}
                  onPress={() => {
                    if (!busy) onProvider("apple");
                  }}
                />
              ) : null}

              {/* When Google is switched on, this must use Google's official
                  button assets -- their branding rules forbid a bare "G". */}
              {providers.google ? (
                <SocialAuthButton
                  testID="signin-google"
                  mark="G"
                  label={copy.google}
                  disabled={busy}
                  onPress={() => onProvider("google")}
                />
              ) : null}

              {hasProvider ? (
                <View style={styles.divider} accessible={false}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{copy.divider}</Text>
                  <View style={styles.dividerLine} />
                </View>
              ) : null}

              <MotionPressable
                testID="signin-create"
                accessibilityRole="button"
                accessibilityLabel={copy.createAccountA11y}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => {
                  onClearMessages();
                  onCreateAccount();
                }}
                style={styles.createButton}
              >
                <Text style={styles.createButtonText}>{copy.createAccount}</Text>
              </MotionPressable>

              <MotionPressable
                testID="signin-email"
                accessibilityRole="button"
                accessibilityLabel={copy.email}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={openEmail}
                style={styles.emailButton}
              >
                <Mail size={19} color={equinaTheme.text.primary} />
                <Text style={styles.emailButtonText}>{copy.email}</Text>
              </MotionPressable>
            </>
          ) : (
            <View style={styles.unavailable}>
              <Text style={styles.unavailableTitle}>{copy.unavailable.title}</Text>
              <Text style={styles.unavailableBody}>{copy.unavailable.body}</Text>
              {showDemo ? (
                <Pressable
                  testID="signin-demo"
                  accessibilityRole="button"
                  onPress={onUseDemo}
                  style={styles.demoButton}
                >
                  <Text style={styles.demoButtonText}>{copy.unavailable.demo}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      <AccountMethodSheet
        visible={sheetVisible}
        method={method}
        emailAuthMode={emailAuthMode}
        email={email}
        password={password}
        busy={busy}
        error={sheetVisible ? error : ""}
        onMethodChange={(next) => {
          onClearMessages();
          setMethod(next);
        }}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSocialAuth={(provider) => onProvider(provider)}
        // Creating an account -- by password or by an emailed code -- runs
        // through onboarding, which collects the rider and horse first. The
        // sheet's create paths therefore hand over to it rather than dead-end.
        onEmailContinue={() => {
          setSheetVisible(false);
          onCreateAccount();
        }}
        onPasswordContinue={() => {
          setSheetVisible(false);
          onCreateAccount();
        }}
        onPasswordSignIn={() => onPasswordSignIn(email.trim(), password)}
        onPasswordRecovery={() => void sendAndClose(onPasswordRecovery)}
        onEmailLinkSignIn={() => void sendAndClose(onEmailLinkSignIn)}
        onDismiss={closeSheet}
        intent="signin"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.canvas
  },
  // flexGrow keeps the spacer pushing the buttons to the bottom whenever the
  // content fits, which is every text size short of the accessibility ones.
  scrollContent: {
    flexGrow: 1
  },
  plate: {
    width: "100%",
    backgroundColor: equinaTheme.surfaces.raised
  },
  plateImage: {
    width: "100%",
    height: "100%"
  },
  plateFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "62%"
  },
  wordmark: {
    position: "absolute",
    left: equinaTheme.spacing.md,
    bottom: equinaTheme.spacing.lg,
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary
  },
  wordmarkInline: {
    position: "relative",
    left: 0,
    bottom: 0,
    marginTop: equinaTheme.spacing.xl,
    marginHorizontal: equinaTheme.spacing.md
  },
  middle: {
    paddingHorizontal: equinaTheme.spacing.md,
    marginTop: equinaTheme.spacing.lg,
    gap: equinaTheme.spacing.sm
  },
  headline: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary
  },
  subhead: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary
  },
  spacer: { flex: 1 },
  footer: {
    paddingHorizontal: equinaTheme.spacing.md,
    paddingBottom: equinaTheme.spacing.lg,
    gap: equinaTheme.spacing.compact
  },
  status: {
    minHeight: 36,
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  statusError: {
    color: equinaTheme.colorRole.criticalOnDark
  },
  appleButton: {
    width: "100%",
    height: 54
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: equinaTheme.material.separator
  },
  dividerText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 1.1
  },
  emailButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.raised,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: equinaTheme.spacing.sm
  },
  emailButtonText: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  createButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colorRole.accent
  },
  createButtonText: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.inverse,
    fontWeight: "600"
  },
  demoButton: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    alignItems: "center",
    justifyContent: "center"
  },
  demoButtonText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colorRole.accent,
    fontWeight: "600"
  },
  unavailable: {
    gap: equinaTheme.spacing.sm,
    backgroundColor: equinaTheme.surfaces.raised,
    borderRadius: equinaTheme.radius.card,
    padding: equinaTheme.spacing.md
  },
  unavailableTitle: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  unavailableBody: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  }
});
