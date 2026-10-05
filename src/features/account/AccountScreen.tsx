import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  Bell,
  ChevronLeft,
  CircleHelp,
  Database,
  Download,
  GraduationCap,
  Heart,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserRound,
  UsersRound,
  X
} from "lucide-react-native";
import type {
  AccountDeletionRequestRecord,
  AccountSnapshot,
  BlockedAccountRecord,
  NotificationPreferencesRecord,
  ProfileRecord,
  UploadAsset,
  UserPreferencesRecord
} from "../../backend";
import type { Discipline } from "../../domain/types";
import { selectionHaptic, warningHaptic } from "../../ui/motion/haptics";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { SettingsGroup } from "../../ui/settings/SettingsGroup";
import { SettingsRow } from "../../ui/settings/SettingsRow";
import { equinaTheme } from "../../ui/theme/theme";
import { trainingFocusByDiscipline } from "../coach/coach-types";
import type { AccountMode, AccountRoute } from "./account-types";

const disciplines: Array<{ value: Discipline; label: string }> = [
  { value: "dressage", label: "Dressage" },
  { value: "jumping", label: "Jumping" },
  { value: "eventing", label: "Eventing" },
  { value: "trail", label: "Trail" }
];
const levels: Array<{ value: NonNullable<ProfileRecord["skillLevel"]>; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "pro", label: "Pro" }
];

const labelFor = (value?: string) => {
  if (!value) return "Not set";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const focusOptionsFor = (discipline: Discipline, current?: string) => {
  const options = [...trainingFocusByDiscipline[labelFor(discipline) as keyof typeof trainingFocusByDiscipline] ?? []];
  // A focus saved before the lists existed stays choosable rather than vanishing.
  if (current && !options.includes(current)) options.push(current);
  return options.map((value) => ({ value, label: value }));
};

type ConfirmAction = "signout" | "coach-history" | "delete-account" | null;

export function AccountScreen({
  mode,
  marketplaceOpen,
  snapshot,
  horseName,
  busy,
  error,
  blocked,
  onOpenHorse,
  onSaveProfile,
  onUploadAvatar,
  onSavePreferences,
  onSaveTrainingProfile,
  onSaveNotifications,
  onLoadBlocked,
  onUnblock,
  onRequestExport,
  onClearCoachHistory,
  onScheduleDeletion,
  onCancelDeletion,
  onSignOut,
  onClose
}: {
  mode: AccountMode;
  /** Buying, selling or messaging is on, so its settings mean something. */
  marketplaceOpen: boolean;
  snapshot: AccountSnapshot;
  horseName: string;
  busy: string;
  error: string;
  blocked: BlockedAccountRecord[];
  onOpenHorse: () => void;
  onSaveProfile: (input: {
    displayName: string;
    locale: string;
    discipline: Discipline;
    skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
  }) => Promise<void>;
  onUploadAvatar: (asset: UploadAsset) => Promise<void>;
  onSavePreferences: (
    patch: Partial<Omit<UserPreferencesRecord, "userId" | "version" | "updatedAt">>
  ) => Promise<void>;
  onSaveTrainingProfile: (input: {
    discipline: Discipline;
    skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
    focus: string;
  }) => Promise<void>;
  onSaveNotifications: (
    patch: Partial<Omit<NotificationPreferencesRecord, "userId" | "updatedAt">>
  ) => Promise<void>;
  onLoadBlocked: () => Promise<void>;
  onUnblock: (userId: string) => Promise<void>;
  onRequestExport: () => Promise<{ signedUrl: string } | null>;
  onClearCoachHistory: () => Promise<void>;
  onScheduleDeletion: (reason?: string) => Promise<AccountDeletionRequestRecord | null>;
  onCancelDeletion: () => Promise<void>;
  onSignOut: () => Promise<void> | void;
  /** Account opens over a tab; this goes back to it. */
  onClose: () => void;
}) {
  const [route, setRoute] = useState<AccountRoute>("root");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [exportReady, setExportReady] = useState("");

  useEffect(() => {
    if (route === "blocked") void onLoadBlocked();
  }, [onLoadBlocked, route]);

  const navigate = (next: AccountRoute) => {
    selectionHaptic();
    setRoute(next);
    setExportReady("");
  };

  const executeConfirmation = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "signout") await onSignOut();
    if (action === "coach-history") await onClearCoachHistory();
    if (action === "delete-account") {
      warningHaptic();
      await onScheduleDeletion();
    }
  };

  const exportData = async () => {
    const result = await onRequestExport();
    if (!result) return;
    setExportReady(result.signedUrl);
  };

  const openExport = async () => {
    if (!exportReady) return;
    await Linking.openURL(exportReady);
  };

  return (
    <View style={styles.screen}>
      {route !== "root" ? (
        <AccountRouteHeader title={routeTitle(route)} onBack={() => navigate("root")} />
      ) : (
        <View style={styles.rootHeader}>
          <Text accessibilityRole="header" style={styles.rootTitle}>Account</Text>
          <MotionPressable
            testID="account-close"
            accessibilityRole="button"
            accessibilityLabel="Close account"
            hitSlop={4}
            style={styles.closeButton}
            onPress={onClose}
          >
            <X size={20} color={equinaTheme.text.primary} />
          </MotionPressable>
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {busy ? (
        <View style={styles.busyLine}>
          <ActivityIndicator size="small" color={equinaTheme.colors.brass} />
          <Text style={styles.busyText}>Saving securely...</Text>
        </View>
      ) : null}

      {route === "root" ? (
        <AccountRoot
          mode={mode}
          marketplaceOpen={marketplaceOpen}
          snapshot={snapshot}
          horseName={horseName}
          onNavigate={navigate}
          onOpenHorse={onOpenHorse}
          onSignOut={() => setConfirmAction("signout")}
        />
      ) : route === "profile" ? (
        <ProfileEditor
          snapshot={snapshot}
          saving={busy === "profile" || busy === "avatar"}
          onSave={onSaveProfile}
          onUploadAvatar={onUploadAvatar}
        />
      ) : route === "personalization" ? (
        <TrainingProfileSettings
          snapshot={snapshot}
          saving={busy === "training"}
          onSave={onSaveTrainingProfile}
          onSaved={() => navigate("root")}
        />
      ) : route === "notifications" ? (
        <NotificationSettings
          values={snapshot.notifications}
          disabled={busy === "notifications"}
          demo={mode === "demo"}
          marketplaceOpen={marketplaceOpen}
          onSave={onSaveNotifications}
        />
      ) : route === "privacy" ? (
        <PrivacySettings
          snapshot={snapshot}
          mode={mode}
          marketplaceOpen={marketplaceOpen}
          disabled={Boolean(busy)}
          exportReady={Boolean(exportReady)}
          onSave={onSavePreferences}
          onExport={() => void exportData()}
          onOpenExport={() => void openExport()}
          onClearHistory={() => setConfirmAction("coach-history")}
        />
      ) : route === "security" ? (
        <SecuritySettings
          mode={mode}
          deletion={snapshot.deletionRequest}
          disabled={Boolean(busy)}
          onBlocked={() => navigate("blocked")}
          onDelete={() => setConfirmAction("delete-account")}
          onCancelDeletion={onCancelDeletion}
        />
      ) : route === "blocked" ? (
        <BlockedAccounts
          mode={mode}
          blocked={blocked}
          busy={busy}
          onUnblock={onUnblock}
        />
      ) : (
        <HelpAndLegal marketplaceOpen={marketplaceOpen} />
      )}

      <ConfirmationSheet
        action={confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void executeConfirmation()}
      />
    </View>
  );
}

function AccountRoot({
  mode,
  marketplaceOpen,
  snapshot,
  horseName,
  onNavigate,
  onOpenHorse,
  onSignOut
}: {
  mode: AccountMode;
  snapshot: AccountSnapshot;
  horseName: string;
  onNavigate: (route: AccountRoute) => void;
  onOpenHorse: () => void;
  onSignOut: () => void;
  marketplaceOpen: boolean;
}) {
  const notifications = snapshot.notifications;
  const notificationSummary = marketplaceOpen
    ? notifications.humanMessages ? "Messages on" : "Quiet"
    : notifications.horseReminders || notifications.academyReminders ? "Reminders on" : "Quiet";
  const initials = snapshot.profile.displayName.trim().split(/\s+/)
    .slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "EQ";
  return (
    <>
      <View style={styles.identity}>
        {snapshot.profile.avatarUrl ? (
          <Image source={{ uri: snapshot.profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}><Text style={styles.avatarText}>{initials}</Text></View>
        )}
        <View style={styles.identityCopy}>
          <Text numberOfLines={2} style={styles.identityName}>{snapshot.profile.displayName}</Text>
          <Text numberOfLines={1} style={styles.identityEmail}>{snapshot.email}</Text>
          <Text style={styles.identityMeta}>
            {mode === "demo"
              ? "Demo profile · stored on this device"
              : snapshot.emailVerified ? "Verified account" : "Email verification pending"}
          </Text>
        </View>
        <MotionPressable
          testID="account-edit-profile"
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          style={styles.editButton}
          onPress={() => onNavigate("profile")}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </MotionPressable>
      </View>

      <SettingsGroup>
        <SettingsRow
          Icon={Heart}
          title="Horses"
          value={horseName}
          testID="account-open-horses"
          onPress={onOpenHorse}
        />
      </SettingsGroup>

      <SettingsGroup title="Your Equina">
        <SettingsRow
          Icon={SlidersHorizontal}
          title="Training profile"
          value={`${labelFor(snapshot.profile.discipline)} · ${labelFor(snapshot.profile.skillLevel)}`}
          testID="account-open-personalization"
          onPress={() => onNavigate("personalization")}
        />
        <SettingsRow
          Icon={Bell}
          title="Notifications"
          value={notificationSummary}
          testID="account-open-notifications"
          onPress={() => onNavigate("notifications")}
        />
        <SettingsRow
          Icon={Shield}
          title="Privacy and Ralf"
          value={snapshot.preferences.reducedPersonalization ? "Minimal context" : "Personalized"}
          testID="account-open-privacy"
          onPress={() => onNavigate("privacy")}
        />
      </SettingsGroup>

      <SettingsGroup title="Account">
        <SettingsRow
          Icon={LockKeyhole}
          title="Security"
          value={snapshot.deletionRequest ? "Deletion scheduled" : "Protected"}
          testID="account-open-security"
          onPress={() => onNavigate("security")}
        />
        <SettingsRow
          Icon={CircleHelp}
          title="Help and legal"
          testID="account-open-help"
          onPress={() => onNavigate("help")}
        />
      </SettingsGroup>

      <Pressable
        testID="account-sign-out"
        accessibilityRole="button"
        accessibilityLabel={mode === "demo" ? "Exit demo" : "Sign out"}
        style={styles.signOut}
        onPress={onSignOut}
      >
        <LogOut size={18} strokeWidth={1.7} color={equinaTheme.text.secondary} />
        <Text style={styles.signOutText}>{mode === "demo" ? "Exit demo" : "Sign out"}</Text>
      </Pressable>
    </>
  );
}

function ProfileEditor({
  snapshot,
  saving,
  onSave,
  onUploadAvatar
}: {
  snapshot: AccountSnapshot;
  saving: boolean;
  onSave: (input: {
    displayName: string;
    locale: string;
    discipline: Discipline;
    skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
  }) => Promise<void>;
  onUploadAvatar: (asset: UploadAsset) => Promise<void>;
}) {
  const [name, setName] = useState(snapshot.profile.displayName);
  const initials = name.trim().slice(0, 2).toUpperCase() || "EQ";

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85
    });
    if (result.canceled || !result.assets[0]) return;
    const selected = result.assets[0];
    const response = await fetch(selected.uri);
    const byteSize = selected.fileSize ?? (await response.arrayBuffer()).byteLength;
    await onUploadAvatar({
      uri: selected.uri,
      fileName: selected.fileName ?? `equina-avatar-${Date.now()}.jpg`,
      mimeType: selected.mimeType ?? "image/jpeg",
      byteSize
    });
  };

  return (
    <View style={styles.routeBody}>
      <Pressable
        testID="account-avatar-picker"
        accessibilityRole="button"
        accessibilityLabel="Change profile photo"
        style={styles.avatarEditor}
        onPress={() => void pickAvatar()}
      >
        {snapshot.profile.avatarUrl ? (
          <Image source={{ uri: snapshot.profile.avatarUrl }} style={styles.avatarLarge} />
        ) : (
          <View style={[styles.avatarFallback, styles.avatarLarge]}><Text style={styles.avatarLargeText}>{initials}</Text></View>
        )}
        <Text style={styles.avatarAction}>Change photo</Text>
      </Pressable>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Display name</Text>
        <TextInput
          testID="account-name-input"
          accessibilityLabel="Display name"
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoCapitalize="words"
          style={styles.input}
        />
      </View>

      <MotionPressable
        testID="account-profile-save"
        accessibilityRole="button"
        accessibilityLabel="Save profile"
        accessibilityState={{ disabled: saving || name.trim().length < 2 }}
        disabled={saving || name.trim().length < 2}
        style={[styles.primaryButton, (saving || name.trim().length < 2) && styles.disabledButton]}
        onPress={() => void onSave({
          displayName: name,
          locale: snapshot.profile.locale,
          discipline: snapshot.profile.discipline ?? "jumping",
          skillLevel: snapshot.profile.skillLevel ?? "intermediate"
        })}
      >
        <Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Save profile"}</Text>
      </MotionPressable>
    </View>
  );
}

function ChoiceSection<T extends string>({
  title,
  options,
  value,
  onChange
}: {
  title: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceSection}>
      <Text style={styles.fieldLabel}>{title}</Text>
      <View style={styles.choiceList}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={`account-choice-${option.value.toLowerCase().replace(/\s+/g, "-")}`}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              style={[styles.choice, options.length === 3 && styles.choiceThird, selected && styles.choiceSelected]}
              onPress={() => {
                selectionHaptic();
                onChange(option.value);
              }}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// How the rider rides and what they are working on. Academy and Ralf read
// all three, so they live together rather than across two screens.
function TrainingProfileSettings({
  snapshot,
  saving,
  onSave,
  onSaved
}: {
  snapshot: AccountSnapshot;
  saving: boolean;
  onSave: (input: {
    discipline: Discipline;
    skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
    focus: string;
  }) => Promise<void>;
  onSaved: () => void;
}) {
  const [discipline, setDiscipline] = useState<Discipline>(snapshot.profile.discipline ?? "jumping");
  const [level, setLevel] = useState<NonNullable<ProfileRecord["skillLevel"]>>(snapshot.profile.skillLevel ?? "intermediate");
  const savedFocus = snapshot.preferences.academyFocus;
  const [focus, setFocus] = useState(savedFocus ?? "");
  const focusOptions = focusOptionsFor(discipline, discipline === snapshot.profile.discipline ? savedFocus : undefined);
  const focusChosen = focusOptions.some((option) => option.value === focus);

  const changeDiscipline = (next: Discipline) => {
    setDiscipline(next);
    // Each discipline has its own focuses; a focus from another would not apply.
    const nextOptions = focusOptionsFor(next);
    if (!nextOptions.some((option) => option.value === focus)) setFocus(nextOptions[0]?.value ?? "");
  };

  const save = async () => {
    try {
      await onSave({ discipline, skillLevel: level, focus });
      onSaved();
    } catch {
      // The error line at the top of Account says what failed; the choices stay.
    }
  };

  return (
    <View style={styles.routeBody}>
      <Text style={styles.routeLead}>Your Academy path and Ralf's answers start from these. You can still change the focus for one conversation with Ralf.</Text>
      <ChoiceSection title="Discipline" options={disciplines} value={discipline} onChange={changeDiscipline} />
      <ChoiceSection title="Level" options={levels} value={level} onChange={setLevel} />
      <ChoiceSection title="Current focus" options={focusOptions} value={focus} onChange={setFocus} />
      <MotionPressable
        testID="account-personalization-save"
        accessibilityRole="button"
        accessibilityLabel="Save training profile"
        accessibilityState={{ disabled: saving || !focusChosen }}
        disabled={saving || !focusChosen}
        style={[styles.primaryButton, (saving || !focusChosen) && styles.disabledButton]}
        onPress={() => void save()}
      >
        <Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Save training profile"}</Text>
      </MotionPressable>
    </View>
  );
}

function NotificationSettings({
  values,
  disabled,
  demo,
  marketplaceOpen,
  onSave
}: {
  values: NotificationPreferencesRecord;
  disabled: boolean;
  demo: boolean;
  marketplaceOpen: boolean;
  onSave: (
    patch: Partial<Omit<NotificationPreferencesRecord, "userId" | "updatedAt">>
  ) => Promise<void>;
}) {
  return (
    <View style={styles.routeBody}>
      <Text style={styles.routeLead}>
        {demo
          ? "These choices are saved for the demo. Native push is not registered."
          : "Equina asks for system permission only when you turn on a notification category."}
      </Text>
      <SettingsGroup title="Notify me about">
        {marketplaceOpen ? (
          <>
            <SettingsRow
              title="Messages"
              detail="Buyer and seller replies"
              switchValue={values.humanMessages}
              disabled={disabled}
              onToggle={(humanMessages) => void onSave({ humanMessages })}
            />
            <SettingsRow
              title="Order changes"
              detail="Shipping, inspection, and disputes"
              switchValue={values.orderChanges}
              disabled={disabled}
              onToggle={(orderChanges) => void onSave({ orderChanges })}
            />
          </>
        ) : null}
        <SettingsRow
          title="Horse reminders"
          detail="Records and care you schedule"
          switchValue={values.horseReminders}
          disabled={disabled}
          onToggle={(horseReminders) => void onSave({ horseReminders })}
        />
        <SettingsRow
          title="Academy"
          detail="Your next saved lesson"
          switchValue={values.academyReminders}
          disabled={disabled}
          onToggle={(academyReminders) => void onSave({ academyReminders })}
        />
      </SettingsGroup>
      {marketplaceOpen ? (
        <SettingsGroup title="Privacy">
          <SettingsRow
            title="Message previews"
            detail="Off keeps message text out of push payloads"
            switchValue={values.messagePreviews}
            disabled={disabled}
            onToggle={(messagePreviews) => void onSave({ messagePreviews })}
          />
        </SettingsGroup>
      ) : null}
      <Text style={styles.footnote}>Equina never puts horse health notes, AI prompts, payment data, or email in a push notification.</Text>
    </View>
  );
}

function PrivacySettings({
  snapshot,
  mode,
  marketplaceOpen,
  disabled,
  exportReady,
  onSave,
  onExport,
  onOpenExport,
  onClearHistory
}: {
  snapshot: AccountSnapshot;
  mode: AccountMode;
  marketplaceOpen: boolean;
  disabled: boolean;
  exportReady: boolean;
  onSave: (
    patch: Partial<Omit<UserPreferencesRecord, "userId" | "version" | "updatedAt">>
  ) => Promise<void>;
  onExport: () => void;
  onOpenExport: () => void;
  onClearHistory: () => void;
}) {
  const values = snapshot.preferences;
  return (
    <View style={styles.routeBody}>
      <Text style={styles.routeLead}>Choose the factual context Ralf may use. Turning context off changes the next server request, not just the interface.</Text>
      <SettingsGroup title="Ralf may use">
        <SettingsRow
          title="Rider profile"
          switchValue={values.useRiderProfile}
          disabled={disabled || values.reducedPersonalization}
          onToggle={(useRiderProfile) => void onSave({ useRiderProfile })}
        />
        <SettingsRow
          title="Selected horse"
          switchValue={values.useSelectedHorse}
          disabled={disabled || values.reducedPersonalization}
          onToggle={(useSelectedHorse) => void onSave({ useSelectedHorse })}
        />
        <SettingsRow
          title="Ride history"
          detail="Only persisted rides when available"
          switchValue={values.useRideHistory}
          disabled={disabled || values.reducedPersonalization}
          onToggle={(useRideHistory) => void onSave({ useRideHistory })}
        />
        <SettingsRow
          title="Minimal context"
          detail="Send only the current question"
          switchValue={values.reducedPersonalization}
          disabled={disabled}
          onToggle={(reducedPersonalization) => void onSave({ reducedPersonalization })}
        />
      </SettingsGroup>

      <SettingsGroup title="Your data">
        <SettingsRow
          Icon={exportReady ? Download : Database}
          title={exportReady ? "Open prepared export" : "Export my data"}
          detail={mode === "demo" ? "Requires a verified account" : "JSON file, signed link expires"}
          disabled={mode === "demo" || disabled}
          onPress={exportReady ? onOpenExport : onExport}
        />
        <SettingsRow
          Icon={Trash2}
          title="Delete Ralf history"
          detail="Removes conversations and responses"
          destructive
          disabled={disabled}
          onPress={onClearHistory}
        />
      </SettingsGroup>
      {marketplaceOpen ? (
        <Text style={styles.footnote}>Marketplace messages are server-readable for fraud, safety, and dispute review. Equina does not claim end-to-end encryption.</Text>
      ) : null}
    </View>
  );
}

function SecuritySettings({
  mode,
  deletion,
  disabled,
  onBlocked,
  onDelete,
  onCancelDeletion
}: {
  mode: AccountMode;
  deletion?: AccountDeletionRequestRecord;
  disabled: boolean;
  onBlocked: () => void;
  onDelete: () => void;
  onCancelDeletion: () => Promise<void>;
}) {
  return (
    <View style={styles.routeBody}>
      <SettingsGroup title="Access">
        <SettingsRow
          Icon={UsersRound}
          title="Blocked accounts"
          onPress={onBlocked}
        />
        <SettingsRow
          Icon={LockKeyhole}
          title="Sign-in method"
          value={mode === "demo" ? "Demo" : "Email"}
        />
      </SettingsGroup>

      {deletion ? (
        <View style={styles.deletionNotice}>
          <Text style={styles.deletionTitle}>Deletion scheduled</Text>
          <Text style={styles.deletionBody}>Your account is scheduled for {new Date(deletion.scheduledFor).toLocaleDateString()}. Legal Shop records may be retained in restricted form.</Text>
          <Pressable
            testID="account-cancel-deletion"
            accessibilityRole="button"
            accessibilityLabel="Cancel account deletion"
            disabled={disabled}
            style={styles.cancelDeletion}
            onPress={() => void onCancelDeletion()}
          >
            <Text style={styles.cancelDeletionText}>Keep my account</Text>
          </Pressable>
        </View>
      ) : (
        <SettingsGroup title="Account removal">
          <SettingsRow
            Icon={Trash2}
            title="Delete account"
            detail={mode === "demo" ? "Exit demo from Account instead" : "14-day recovery period"}
            destructive
            disabled={mode === "demo" || disabled}
            onPress={onDelete}
          />
        </SettingsGroup>
      )}
      <Text style={styles.footnote}>Deletion removes your profile, your horses and their records, your ride journal, Academy progress, Ralf history, and push devices. Payment, fraud, and dispute records follow their legal retention period.</Text>
    </View>
  );
}

function BlockedAccounts({
  mode,
  blocked,
  busy,
  onUnblock
}: {
  mode: AccountMode;
  blocked: BlockedAccountRecord[];
  busy: string;
  onUnblock: (userId: string) => Promise<void>;
}) {
  if (mode === "demo" || blocked.length === 0) {
    return (
      <View style={styles.emptyState}>
        <UsersRound size={28} strokeWidth={1.6} color={equinaTheme.text.tertiary} />
        <Text style={styles.emptyTitle}>No blocked accounts</Text>
        <Text style={styles.emptyBody}>People you block in Club or Shop will appear here.</Text>
      </View>
    );
  }
  return (
    <SettingsGroup>
      {blocked.map((account) => (
        <SettingsRow
          key={account.id}
          title={account.displayName}
          value={busy === `unblock:${account.id}` ? "Working..." : "Unblock"}
          disabled={busy === `unblock:${account.id}`}
          onPress={() => void onUnblock(account.id)}
        />
      ))}
    </SettingsGroup>
  );
}

function HelpAndLegal({ marketplaceOpen }: { marketplaceOpen: boolean }) {
  return (
    <View style={styles.routeBody}>
      <Text style={styles.routeLead}>
        {marketplaceOpen
          ? "Equina is training guidance, organization, education, community, and protected marketplace infrastructure. It is not veterinary diagnosis."
          : "Equina is training guidance, organization, education, and community. It is not veterinary diagnosis."}
      </Text>
      <SettingsGroup title="Support">
        <SettingsRow
          Icon={MessageCircle}
          title="Contact support"
          value="Email"
          onPress={() => void Linking.openURL("mailto:support@equina.app?subject=Equina%20support")}
        />
      </SettingsGroup>
      <SettingsGroup title="Legal">
        <SettingsRow
          Icon={Shield}
          title="Privacy summary"
          detail="Private horse data uses account-scoped server authorization"
        />
        <SettingsRow
          Icon={GraduationCap}
          title="Ralf safety"
          detail="Guidance only; health concerns escalate to a professional"
        />
      </SettingsGroup>
    </View>
  );
}

function AccountRouteHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.routeHeader}>
      <MotionPressable
        testID="account-route-back"
        accessibilityRole="button"
        accessibilityLabel={`Back from ${title}`}
        style={styles.backButton}
        onPress={onBack}
      >
        <ChevronLeft size={22} color={equinaTheme.text.primary} />
      </MotionPressable>
      <Text numberOfLines={1} style={styles.routeTitle}>{title}</Text>
      <View style={styles.backButton} />
    </View>
  );
}

function ConfirmationSheet({
  action,
  onCancel,
  onConfirm
}: {
  action: ConfirmAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // The modal keeps fading for a moment after `action` is cleared. Show the
  // copy it opened with until it is gone: falling through to the last branch
  // flashed "Schedule account deletion?" every time someone signed out.
  const [shownAction, setShownAction] = useState<NonNullable<ConfirmAction>>(action ?? "signout");
  if (action && action !== shownAction) setShownAction(action);
  const copy = confirmationCopy[action ?? shownAction];
  return (
    <Modal visible={Boolean(action)} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close confirmation" style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text style={styles.sheetTitle}>{copy.title}</Text>
          <Text style={styles.sheetBody}>{copy.body}</Text>
          <View style={styles.sheetActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" style={styles.sheetCancel} onPress={onCancel}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
            <Pressable testID={`confirm-${action ?? "none"}`} accessibilityRole="button" accessibilityLabel={copy.confirm} disabled={!action} style={styles.sheetDanger} onPress={onConfirm}>
              <Text style={styles.sheetDangerText}>{copy.confirm}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const confirmationCopy: Record<NonNullable<ConfirmAction>, { title: string; body: string; confirm: string }> = {
  signout: { title: "Sign out of Equina?", body: "Private messages and drafts will be cleared from this device.", confirm: "Sign out" },
  "coach-history": { title: "Delete Ralf history?", body: "Conversations and assistant responses will be removed. This cannot be undone.", confirm: "Delete history" },
  "delete-account": { title: "Schedule account deletion?", body: "You have 14 days to cancel. Personal data is removed when the deletion becomes effective.", confirm: "Schedule deletion" }
};

const routeTitle = (route: AccountRoute) => ({
  root: "Account",
  profile: "Edit profile",
  personalization: "Training profile",
  notifications: "Notifications",
  privacy: "Privacy and Ralf",
  security: "Security",
  blocked: "Blocked accounts",
  help: "Help and legal"
})[route];

const styles = StyleSheet.create({
  screen: {
    gap: 24,
    paddingBottom: 32
  },
  rootHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  rootTitle: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quiet
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 8
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 18
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.elevated
  },
  avatarText: {
    color: equinaTheme.colors.brass,
    fontSize: 20,
    fontWeight: "600"
  },
  identityCopy: {
    flex: 1,
    minWidth: 0
  },
  identityName: {
    color: equinaTheme.text.primary,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "600"
  },
  identityEmail: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    marginTop: 2
  },
  identityMeta: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    marginTop: 3
  },
  editButton: {
    minWidth: 52,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.raised
  },
  editButtonText: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    fontWeight: "600"
  },
  signOut: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  signOutText: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    fontWeight: "600"
  },
  error: {
    color: equinaTheme.colorRole.criticalOnDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    paddingHorizontal: 4
  },
  busyLine: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  busyText: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    fontWeight: "400"
  },
  routeHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  routeTitle: {
    flex: 1,
    color: equinaTheme.text.primary,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "600",
    textAlign: "center"
  },
  routeBody: {
    gap: 24
  },
  routeLead: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400"
  },
  avatarEditor: {
    minHeight: 106,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  avatarLarge: {
    width: 76,
    height: 76,
    borderRadius: 18
  },
  avatarLargeText: {
    color: equinaTheme.colors.brass,
    fontSize: 24,
    fontWeight: "600"
  },
  avatarAction: {
    color: equinaTheme.colors.brass,
    fontSize: 13,
    fontWeight: "600"
  },
  field: {
    gap: 8
  },
  fieldLabel: {
    color: equinaTheme.text.secondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600"
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: equinaTheme.text.primary,
    backgroundColor: equinaTheme.surfaces.raised,
    fontSize: 15,
    fontWeight: "400",
    outlineStyle: "none"
  } as never,
  choiceSection: {
    gap: 8
  },
  choiceList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choice: {
    flexBasis: "47%",
    minHeight: 44,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: equinaTheme.surfaces.raised,
    paddingHorizontal: 12
  },
  choiceThird: {
    flexBasis: "30%"
  },
  choiceSelected: {
    backgroundColor: equinaTheme.colors.brass
  },
  choiceText: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    fontWeight: "400"
  },
  choiceTextSelected: {
    color: equinaTheme.text.inverse,
    fontWeight: "600"
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass
  },
  primaryButtonText: {
    color: equinaTheme.text.inverse,
    fontSize: 15,
    fontWeight: "600"
  },
  disabledButton: {
    opacity: 0.45
  },
  footnote: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400"
  },
  deletionNotice: {
    gap: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.raised
  },
  deletionTitle: {
    color: equinaTheme.colorRole.criticalOnDark,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600"
  },
  deletionBody: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400"
  },
  cancelDeletion: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center"
  },
  cancelDeletionText: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    fontWeight: "600"
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 56,
    paddingHorizontal: 24
  },
  emptyTitle: {
    color: equinaTheme.text.primary,
    fontSize: 18,
    fontWeight: "600"
  },
  emptyBody: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    textAlign: "center"
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.56)"
  },
  sheet: {
    gap: 12,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 24,
    paddingBottom: 32,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  sheetTitle: {
    color: equinaTheme.text.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600"
  },
  sheetBody: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400"
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8
  },
  sheetCancel: {
    minHeight: 56,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: equinaTheme.surfaces.raised
  },
  sheetCancelText: {
    color: equinaTheme.text.primary,
    fontSize: 14,
    fontWeight: "600"
  },
  sheetDanger: {
    minHeight: 56,
    flex: 1.35,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: equinaTheme.colors.danger
  },
  sheetDangerText: {
    color: equinaTheme.colors.ivory,
    fontSize: 14,
    fontWeight: "600"
  }
});
