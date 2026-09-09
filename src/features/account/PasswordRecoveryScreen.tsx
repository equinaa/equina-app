import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LockKeyhole } from "lucide-react-native";
import { EquinaButton, EquinaField } from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";

export function PasswordRecoveryScreen({
  busy,
  error,
  onComplete,
  onCancel
}: {
  busy: boolean;
  error: string;
  onComplete: (password: string) => Promise<void> | void;
  onCancel: () => Promise<void> | void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState("");

  const submit = async () => {
    if (password.length < 10 || password.length > 128) {
      setLocalError("Use between 10 and 128 characters.");
      return;
    }
    if (password !== confirmation) {
      setLocalError("The passwords do not match.");
      return;
    }
    setLocalError("");
    await onComplete(password);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={styles.content}>
        <View style={styles.mark}>
          <LockKeyhole size={22} color={equinaTheme.colors.brass} />
        </View>
        <Text style={styles.eyebrow}>SECURE RECOVERY</Text>
        <Text accessibilityRole="header" style={styles.title}>Choose a new password.</Text>
        <Text style={styles.body}>This recovery session is temporary. Your new password is sent only to the secure auth service.</Text>
        <View style={styles.form}>
          <EquinaField
            testID="recovery-password"
            label="New password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            secureTextEntry
            maxLength={128}
          />
          <EquinaField
            testID="recovery-password-confirmation"
            label="Confirm password"
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            secureTextEntry
            returnKeyType="done"
            maxLength={128}
            onSubmitEditing={() => void submit()}
          />
        </View>
        {(localError || error) ? <Text accessibilityRole="alert" style={styles.error}>{localError || error}</Text> : null}
        <EquinaButton
          testID="recovery-password-save"
          label={busy ? "Updating securely..." : "Update password"}
          disabled={busy}
          onPress={() => void submit()}
        />
        <Pressable
          testID="recovery-password-cancel"
          accessibilityRole="button"
          disabled={busy}
          style={styles.cancel}
          onPress={() => void onCancel()}
        >
          <Text style={styles.cancelText}>Cancel and sign out</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.canvas
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 12
  },
  mark: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  eyebrow: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  title: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary
  },
  body: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary,
    maxWidth: 340
  },
  form: {
    gap: equinaTheme.spacing.md,
    marginTop: equinaTheme.spacing.compact
  },
  error: {
    ...equinaTheme.typography.meta,
    color: "#E7A4A5"
  },
  cancel: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  cancelText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  }
});
