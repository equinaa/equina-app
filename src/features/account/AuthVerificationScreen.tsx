import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MailCheck } from "lucide-react-native";
import { EquinaBackButton, EquinaButton } from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";
import type { EmailAuthMode } from "./social-auth";

// Matches the auth service's one-email-per-minute limit (max_frequency).
const resendCooldownSeconds = 60;

export function AuthVerificationScreen({
  email,
  mode,
  purpose,
  error,
  verifying,
  onVerify,
  onResend,
  onBack,
  onSignInInstead
}: {
  email: string;
  mode: EmailAuthMode;
  /** "create" sends to an address that was just registered. The others answer
   *  neutrally, because no account may exist for the address at all. */
  purpose: "create" | "signin" | "recovery";
  error: string;
  verifying: boolean;
  onVerify: (code: string) => void;
  onResend: () => Promise<void>;
  onBack: () => void;
  /** The link was opened on another device -- a computer, usually. It confirms
   *  the account but cannot finish here, so offer the way in instead. */
  onSignInInstead?: () => void;
}) {
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(resendCooldownSeconds);
  const [focused, setFocused] = useState(false);
  const waitingForLink = mode === "magic-link";

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const resend = async () => {
    if (cooldown > 0) return;
    try {
      await onResend();
      setCooldown(resendCooldownSeconds);
    } catch {
      // onResend already put the reason on screen; the button stays usable.
    }
  };
  const neutral = purpose !== "create";
  const sentTo = neutral ? `If an Equina account uses ${email}, we sent` : "We sent";

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.top}>
        <EquinaBackButton testID="auth-otp-back" onPress={onBack} />
        <Text style={styles.brand}>Equina</Text>
        <View style={styles.backSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrowText}>{purpose === "recovery" ? "Password reset" : "Secure sign-in"}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {waitingForLink ? "Open your email." : "Check your inbox."}
        </Text>
        <Text style={styles.body}>
          {waitingForLink
            ? neutral
              ? `${sentTo} a link to it. Open it on this device and Equina will finish here.`
              : `Tap the secure link sent to ${email}. Equina will finish here automatically.`
            : neutral
              ? `${sentTo} a six-digit code to it. Enter it below.`
              : `Enter the six-digit code sent to ${email}.`}
        </Text>

        {waitingForLink ? (
          <View
            testID="auth-otp-input"
            accessibilityRole="progressbar"
            accessibilityLabel="Waiting for secure email link"
            style={styles.linkWaiting}
          >
            <MailCheck size={28} color={equinaTheme.colors.brass} />
            <View style={styles.linkWaitingCopy}>
              <Text style={styles.linkWaitingTitle}>{neutral ? "Check your email" : "Link sent"}</Text>
              <Text style={styles.linkWaitingBody}>You can return here after opening it.</Text>
            </View>
            <ActivityIndicator size="small" color={equinaTheme.colors.brass} />
          </View>
        ) : (
          <View
            style={[
              styles.codeField,
              focused && styles.codeFieldFocused,
              Boolean(error) && styles.codeFieldError
            ]}
          >
            <TextInput
              testID="auth-otp-input"
              accessibilityLabel="Six-digit verification code"
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              placeholder="000000"
              placeholderTextColor={equinaTheme.text.tertiary}
              selectionColor={equinaTheme.colors.brass}
              returnKeyType="done"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={() => code.length === 6 && onVerify(code)}
              style={styles.codeInput}
            />
          </View>
        )}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        <Text style={styles.securityNote}>
          {waitingForLink
            ? "The link expires shortly and can only be exchanged by this device."
            : "The code expires shortly and is never stored by Equina."}
        </Text>
        <Pressable
          testID="auth-otp-resend"
          accessibilityRole="button"
          accessibilityState={{ disabled: cooldown > 0 }}
          disabled={cooldown > 0}
          onPress={() => void resend()}
          style={styles.resend}
        >
          <Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>
            {cooldown > 0
              ? `Resend in ${cooldown}s`
              : waitingForLink
                ? "Resend secure link"
                : "Resend code"}
          </Text>
        </Pressable>
        {waitingForLink && onSignInInstead ? (
          <Pressable
            testID="auth-otp-other-device"
            accessibilityRole="button"
            onPress={onSignInInstead}
            style={styles.resend}
          >
            <Text style={styles.resendText}>Opened the link on another device? Sign in here</Text>
          </Pressable>
        ) : null}
      </View>

      {waitingForLink ? (
        <View
          testID="auth-otp-verify"
          accessibilityRole="text"
          style={styles.linkFooter}
        >
          <Text style={styles.linkFooterText}>
            {verifying ? "Securing your account..." : "Waiting for your secure return"}
          </Text>
        </View>
      ) : (
        <View style={styles.footer}>
          <EquinaButton
            testID="auth-otp-verify"
            label={verifying ? "Verifying..." : "Verify and continue"}
            disabled={code.length !== 6 || verifying}
            onPress={() => onVerify(code)}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.canvas,
    paddingHorizontal: 18
  },
  top: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  brand: {
    color: equinaTheme.colors.ivory,
    fontSize: 18,
    fontWeight: "600"
  },
  backSpacer: {
    width: 44,
    height: 44
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 72,
    gap: 12
  },
  eyebrowText: {
    color: equinaTheme.colors.brass,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600"
  },
  title: {
    color: equinaTheme.colors.ivory,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "600",
    marginTop: 8
  },
  body: {
    color: equinaTheme.text.secondary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    maxWidth: 320
  },
  codeField: {
    minHeight: 64,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised,
    justifyContent: "center",
    marginTop: 16
  },
  codeFieldFocused: {
    backgroundColor: equinaTheme.surfaces.elevated
  },
  codeFieldError: {
    borderWidth: 1,
    borderColor: equinaTheme.colors.danger
  },
  codeInput: {
    color: equinaTheme.colors.ivory,
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0,
    paddingHorizontal: 20,
    paddingVertical: 14,
    outlineStyle: "none"
  } as never,
  linkWaiting: {
    minHeight: 78,
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.raised,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    marginTop: 16
  },
  linkWaitingCopy: {
    flex: 1,
    gap: 2
  },
  linkWaitingTitle: {
    color: equinaTheme.colors.ivory,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  linkWaitingBody: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400"
  },
  error: {
    // colors.danger measures 2.7:1 on the canvas and fails AA for text.
    color: equinaTheme.colorRole.criticalOnDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400"
  },
  securityNote: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400",
    marginTop: 4
  },
  resend: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingRight: 12
  },
  resendText: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    fontWeight: "600"
  },
  resendDisabled: {
    color: equinaTheme.text.tertiary
  },
  footer: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: equinaTheme.material.separator
  },
  linkFooter: {
    minHeight: 64,
    marginHorizontal: -18,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: equinaTheme.material.separator
  },
  linkFooterText: {
    color: equinaTheme.text.tertiary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600"
  }
});
