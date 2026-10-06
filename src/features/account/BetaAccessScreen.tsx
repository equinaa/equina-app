import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LockKeyhole } from "lucide-react-native";
import type { AccountDeletionRequestRecord, BackendCapabilities } from "../../backend";
import { EquinaButton } from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";
import { betaAccessCopy as copy } from "./beta-access-copy";

/**
 * The beta door: shown instead of onboarding and the app to a signed-in
 * account the server has not let in yet (202610060003). The account is kept;
 * the rider checks again, signs out, or deletes it.
 */
export function BetaAccessScreen({
  email,
  deletion,
  busy,
  error,
  onCheckAgain,
  onSignOut,
  onScheduleDeletion,
  onCancelDeletion
}: {
  email: string;
  deletion?: AccountDeletionRequestRecord;
  /** The account controller's busy key, while a deletion is being saved. */
  busy: string;
  /** The account controller's last error, such as a deletion that failed. */
  error: string;
  /** Asks the server again; null when the session ended meanwhile. */
  onCheckAgain: () => Promise<BackendCapabilities | null>;
  onSignOut: () => void;
  onScheduleDeletion: () => Promise<unknown>;
  onCancelDeletion: () => Promise<void>;
}) {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);

  const checkAgain = async () => {
    if (checking) return;
    setChecking(true);
    setStatus("");
    try {
      const next = await onCheckAgain();
      // Let in, this screen is gone; the session's phase decides between
      // onboarding and the app.
      if (next && !next.appAccess) setStatus(copy.stillWaiting);
    } catch {
      setStatus(copy.unreachable);
    } finally {
      setChecking(false);
    }
  };

  const scheduleDeletion = async () => {
    setConfirmingDeletion(false);
    await onScheduleDeletion();
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.root}>
      <Text style={styles.brand}>{copy.wordmark}</Text>
      <LockKeyhole size={26} color={equinaTheme.colors.brass} />
      <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body(email)}</Text>

      {status ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.status}>{status}</Text>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <EquinaButton
          testID="beta-check-again"
          label={checking ? copy.checking : copy.checkAgain}
          disabled={checking}
          leading={checking ? <ActivityIndicator size="small" color={equinaTheme.colors.ink} /> : undefined}
          onPress={() => void checkAgain()}
        />
        <EquinaButton
          testID="beta-sign-out"
          label={copy.signOut}
          variant="secondary"
          showArrow={false}
          onPress={onSignOut}
        />
      </View>

      {deletion ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{copy.deletion.title}</Text>
          <Text style={styles.noticeBody}>{copy.deletion.body(new Date(deletion.scheduledFor).toLocaleDateString())}</Text>
          <Pressable
            testID="beta-cancel-deletion"
            accessibilityRole="button"
            accessibilityLabel={copy.deletion.keep}
            disabled={Boolean(busy)}
            style={styles.textButton}
            onPress={() => void onCancelDeletion()}
          >
            <Text style={styles.keepText}>{copy.deletion.keep}</Text>
          </Pressable>
        </View>
      ) : confirmingDeletion ? (
        <View style={styles.notice}>
          <Text accessibilityRole="header" style={styles.noticeTitle}>{copy.confirm.title}</Text>
          <Text style={styles.noticeBody}>{copy.confirm.body}</Text>
          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.confirm.cancel}
              style={styles.confirmCancel}
              onPress={() => setConfirmingDeletion(false)}
            >
              <Text style={styles.confirmCancelText}>{copy.confirm.cancel}</Text>
            </Pressable>
            <Pressable
              testID="beta-confirm-deletion"
              accessibilityRole="button"
              accessibilityLabel={copy.confirm.confirm}
              disabled={Boolean(busy)}
              style={styles.confirmDanger}
              onPress={() => void scheduleDeletion()}
            >
              <Text style={styles.confirmDangerText}>{copy.confirm.confirm}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          testID="beta-delete-account"
          accessibilityRole="button"
          accessibilityLabel={copy.deleteAccount}
          accessibilityHint={copy.deleteHint}
          disabled={Boolean(busy)}
          style={styles.textButton}
          onPress={() => setConfirmingDeletion(true)}
        >
          <Text style={styles.deleteText}>{copy.deleteAccount}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.canvas
  },
  root: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 40
  },
  brand: {
    color: equinaTheme.text.primary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    marginBottom: 4
  },
  title: {
    color: equinaTheme.text.primary,
    ...equinaTheme.typography.title,
    textAlign: "center",
    maxWidth: 320
  },
  body: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    textAlign: "center",
    maxWidth: 320
  },
  status: {
    color: equinaTheme.text.primary,
    ...equinaTheme.typography.meta,
    textAlign: "center",
    maxWidth: 320
  },
  error: {
    color: equinaTheme.colorRole.criticalOnDark,
    ...equinaTheme.typography.meta,
    textAlign: "center",
    maxWidth: 320
  },
  actions: {
    width: "100%",
    maxWidth: 420,
    gap: 12,
    marginTop: 8
  },
  textButton: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  deleteText: {
    color: equinaTheme.colorRole.criticalOnDark,
    fontSize: 14,
    fontWeight: "600"
  },
  keepText: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    fontWeight: "600"
  },
  notice: {
    width: "100%",
    maxWidth: 420,
    gap: 8,
    padding: 16,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.raised,
    marginTop: 8
  },
  noticeTitle: {
    color: equinaTheme.colorRole.criticalOnDark,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  noticeBody: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400"
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4
  },
  confirmCancel: {
    flex: 1,
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet
  },
  confirmCancelText: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    fontWeight: "600"
  },
  confirmDanger: {
    flex: 1,
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.colorRole.critical
  },
  confirmDangerText: {
    color: equinaTheme.text.primary,
    fontSize: 15,
    fontWeight: "600"
  }
});
