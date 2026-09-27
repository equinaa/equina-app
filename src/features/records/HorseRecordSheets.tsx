import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  Activity,
  CalendarCheck,
  FileText,
  HeartPulse,
  NotebookPen,
  Plus,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Upload,
  Wheat
} from "lucide-react-native";
import type { HorseRecord, HorseRecordFile, HorseTimelineRecord, UploadAsset } from "../../backend";
import type { Discipline } from "../../domain/types";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import {
  EquinaButton,
  EquinaField,
  EquinaSelector,
  EquinaSheet
} from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";
import { cadenceOf, isCareType, nextDueOn } from "../../domain/care-schedule";
import type { HorseInput, TimelineRecordInput } from "./useHorseRecords";

/**
 * How often this kind of care comes round. Picking one fills the due date in,
 * which is the whole point -- a rider should never have to count six weeks
 * forward on a calendar to book the farrier.
 */
const cadenceChoices = ["None", "6 weeks", "3 months", "6 months", "1 year"] as const;
const cadenceDaysByChoice: Record<(typeof cadenceChoices)[number], number | null> = {
  None: null,
  "6 weeks": 42,
  "3 months": 90,
  "6 months": 182,
  "1 year": 365
};
const choiceForCadence = (days: number | null): (typeof cadenceChoices)[number] =>
  cadenceChoices.find((choice) => cadenceDaysByChoice[choice] === days) ?? "None";

/** Setting the cadence back to None has to remove it, not leave the old one. */
const omitCadence = (details: Record<string, unknown>): Record<string, unknown> => {
  const { cadenceDays: _dropped, ...rest } = details;
  return rest;
};

const disciplines = ["dressage", "jumping", "eventing", "trail"] as const;
const sexOptions = ["mare", "gelding", "stallion", "unknown"] as const;
const recordStatuses = ["current", "due", "expired"] as const;
const recordTypes: Array<{
  type: HorseTimelineRecord["recordType"];
  label: string;
  Icon: typeof FileText;
}> = [
  { type: "passport", label: "Passport", Icon: FileText },
  { type: "vet", label: "Vet", Icon: Stethoscope },
  { type: "lab", label: "Lab", Icon: Activity },
  { type: "vaccination", label: "Vaccine", Icon: ShieldCheck },
  { type: "dental", label: "Dental", Icon: HeartPulse },
  { type: "farrier", label: "Farrier", Icon: CalendarCheck },
  { type: "nutrition", label: "Nutrition", Icon: Wheat },
  { type: "care", label: "Care", Icon: Plus },
  { type: "note", label: "Note", Icon: NotebookPen }
];

const today = () => new Date().toISOString().slice(0, 10);

const assetSize = async (uri: string, knownSize?: number | null) => {
  if (knownSize && knownSize > 0) return knownSize;
  const response = await fetch(uri);
  if (!response.ok) throw new Error("The selected file could not be read.");
  return (await response.blob()).size;
};

const imageUploadAsset = async (asset: ImagePicker.ImagePickerAsset): Promise<UploadAsset> => ({
  uri: asset.uri,
  fileName: asset.fileName ?? `horse-${Date.now()}.jpg`,
  mimeType: asset.mimeType ?? "image/jpeg",
  byteSize: await assetSize(asset.uri, asset.fileSize)
});

const documentUploadAsset = async (asset: DocumentPicker.DocumentPickerAsset): Promise<UploadAsset> => ({
  uri: asset.uri,
  fileName: asset.name,
  mimeType: asset.mimeType ?? "application/pdf",
  byteSize: await assetSize(asset.uri, asset.size)
});

export function HorseEditorSheet({
  visible,
  horse,
  saving,
  error,
  onDismiss,
  onSave,
  onSetPrimary,
  onArchive
}: {
  visible: boolean;
  horse: HorseRecord | null;
  saving: boolean;
  error: string;
  onDismiss: () => void;
  onSave: (input: HorseInput, photo?: UploadAsset) => Promise<void>;
  onSetPrimary?: () => Promise<void>;
  onArchive?: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("jumping");
  const [sex, setSex] = useState<NonNullable<HorseRecord["sex"]>>("unknown");
  const [birthDate, setBirthDate] = useState("");
  const [height, setHeight] = useState("");
  const [photo, setPhoto] = useState<UploadAsset | undefined>();
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setName(horse?.name ?? "");
    setBreed(horse?.breed ?? "");
    setDiscipline(horse?.discipline ?? "jumping");
    setSex(horse?.sex ?? "unknown");
    setBirthDate(horse?.birthDate ?? "");
    setHeight(horse?.heightCm ? String(horse.heightCm) : "");
    setPhoto(undefined);
    setLocalError("");
  }, [horse, visible]);

  const pickPhoto = async () => {
    setLocalError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setLocalError("Allow photo access to add a horse portrait.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.88
    });
    if (!result.canceled && result.assets[0]) {
      try {
        setPhoto(await imageUploadAsset(result.assets[0]));
      } catch (assetError) {
        setLocalError(assetError instanceof Error ? assetError.message : "Photo could not be prepared.");
      }
    }
  };

  const submit = async () => {
    const cleanName = name.trim();
    const heightCm = height.trim() ? Number(height.trim()) : undefined;
    if (cleanName.length < 1 || cleanName.length > 80) {
      setLocalError("Use a horse name between 1 and 80 characters.");
      return;
    }
    if (heightCm !== undefined && (!Number.isFinite(heightCm) || heightCm < 50 || heightCm > 230)) {
      setLocalError("Height must be between 50 and 230 cm.");
      return;
    }
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setLocalError("Use YYYY-MM-DD for the birth date.");
      return;
    }
    setLocalError("");
    await onSave({
      name: cleanName,
      breed: breed.trim() || undefined,
      discipline,
      sex,
      birthDate: birthDate || undefined,
      heightCm
    }, photo);
  };

  const previewUri = photo?.uri ?? horse?.photoUrl;

  return (
    <EquinaSheet
      visible={visible}
      title={horse ? "Horse profile" : "Add a horse"}
      closeTestID="horse-editor-close"
      onDismiss={onDismiss}
    >
      <View style={styles.formStack}>
        <Pressable
          testID="horse-editor-photo"
          accessibilityRole="button"
          accessibilityLabel={previewUri ? "Change horse photo" : "Add horse photo"}
          style={styles.photoPicker}
          onPress={() => void pickPhoto()}
        >
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Upload size={22} color={equinaTheme.colors.brass} />
              <Text style={styles.photoPlaceholderText}>Add portrait</Text>
            </View>
          )}
        </Pressable>
        <EquinaField
          testID="horse-editor-name"
          label="Name"
          value={name}
          maxLength={80}
          autoCapitalize="words"
          onChangeText={setName}
        />
        <EquinaField
          testID="horse-editor-breed"
          label="Breed"
          optional
          value={breed}
          maxLength={100}
          autoCapitalize="words"
          onChangeText={setBreed}
        />
        <EquinaSelector
          label="Discipline"
          options={disciplines}
          value={discipline}
          testPrefix="horse-editor-discipline"
          onChange={setDiscipline}
        />
        <EquinaSelector
          label="Sex"
          options={sexOptions}
          value={sex}
          testPrefix="horse-editor-sex"
          onChange={setSex}
        />
        <View style={styles.fieldPair}>
          <View style={styles.fieldHalf}>
            <EquinaField
              testID="horse-editor-birth-date"
              label="Birth date"
              optional
              placeholder="YYYY-MM-DD"
              value={birthDate}
              inputMode="numeric"
              maxLength={10}
              onChangeText={setBirthDate}
            />
          </View>
          <View style={styles.fieldHalf}>
            <EquinaField
              testID="horse-editor-height"
              label="Height (cm)"
              optional
              placeholder="166"
              value={height}
              inputMode="decimal"
              maxLength={5}
              onChangeText={setHeight}
            />
          </View>
        </View>
        {(localError || error) ? <Text accessibilityRole="alert" style={styles.error}>{localError || error}</Text> : null}
        <EquinaButton
          testID="horse-editor-save"
          label={saving ? "Saving..." : horse ? "Save profile" : "Create horse"}
          disabled={saving}
          onPress={() => void submit()}
        />
        {horse && !horse.isPrimary && onSetPrimary ? (
          <EquinaButton
            testID="horse-editor-primary"
            label="Make primary horse"
            variant="secondary"
            disabled={saving}
            onPress={() => void onSetPrimary()}
          />
        ) : null}
        {horse && onArchive ? (
          <MotionPressable
            testID="horse-editor-archive"
            accessibilityRole="button"
            accessibilityLabel={`Archive ${horse.name}`}
            disabled={saving}
            style={styles.destructiveAction}
            onPress={() => void onArchive()}
          >
            <Trash2 size={17} color={equinaTheme.colors.danger} />
            <Text style={styles.destructiveText}>Archive horse</Text>
          </MotionPressable>
        ) : null}
      </View>
    </EquinaSheet>
  );
}

export function RecordEditorSheet({
  visible,
  record,
  initialType,
  saving,
  error,
  files = [],
  onDismiss,
  onSave,
  onDelete,
  onOpenFile,
  onRemoveFile
}: {
  visible: boolean;
  record: HorseTimelineRecord | null;
  initialType?: HorseTimelineRecord["recordType"];
  saving: boolean;
  error: string;
  files?: HorseRecordFile[];
  onDismiss: () => void;
  onSave: (input: TimelineRecordInput, asset?: UploadAsset) => Promise<void>;
  onDelete?: () => Promise<void>;
  onOpenFile?: (file: HorseRecordFile) => Promise<void> | void;
  onRemoveFile?: (file: HorseRecordFile) => Promise<void> | void;
}) {
  const [recordType, setRecordType] = useState<HorseTimelineRecord["recordType"]>("note");
  const [status, setStatus] = useState<HorseTimelineRecord["status"]>("current");
  const [title, setTitle] = useState("");
  const [occurredOn, setOccurredOn] = useState(today());
  const [dueOn, setDueOn] = useState("");
  const [cadence, setCadence] = useState<(typeof cadenceChoices)[number]>("None");

  const recurring = isCareType(recordType);
  const cadenceDays = recurring ? cadenceDaysByChoice[cadence] : null;

  const chooseCadence = (choice: (typeof cadenceChoices)[number]) => {
    setCadence(choice);
    const days = cadenceDaysByChoice[choice];
    if (!days) return;
    const next = nextDueOn(occurredOn, days);
    if (next) setDueOn(next);
  };
  const [providerName, setProviderName] = useState("");
  const [notes, setNotes] = useState("");
  const [asset, setAsset] = useState<UploadAsset | undefined>();
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!visible) return;
    const nextType = record?.recordType ?? initialType ?? "note";
    setRecordType(nextType);
    setStatus(record?.status ?? "current");
    setTitle(record?.title ?? recordTypes.find((entry) => entry.type === nextType)?.label ?? "Record");
    setOccurredOn(record?.occurredOn ?? today());
    setDueOn(record?.dueOn ?? "");
    setCadence(choiceForCadence(record ? cadenceOf(record) : null));
    setProviderName(record?.providerName ?? "");
    setNotes(record?.notes ?? "");
    setAsset(undefined);
    setLocalError("");
  }, [initialType, record, visible]);

  const chooseType = (nextType: HorseTimelineRecord["recordType"]) => {
    setRecordType(nextType);
    if (!record) setTitle(recordTypes.find((entry) => entry.type === nextType)?.label ?? "Record");
  };

  const pickDocument = async () => {
    setLocalError("");
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"],
      copyToCacheDirectory: true,
      multiple: false
    });
    if (!result.canceled && result.assets[0]) {
      try {
        setAsset(await documentUploadAsset(result.assets[0]));
      } catch (assetError) {
        setLocalError(assetError instanceof Error ? assetError.message : "File could not be prepared.");
      }
    }
  };

  const submit = async () => {
    if (!title.trim() || title.trim().length > 120) {
      setLocalError("Use a title between 1 and 120 characters.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      setLocalError("Use YYYY-MM-DD for the record date.");
      return;
    }
    if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) {
      setLocalError("Use YYYY-MM-DD for the due date.");
      return;
    }
    setLocalError("");
    await onSave({
      recordType,
      status,
      title: title.trim(),
      occurredOn,
      dueOn: dueOn || undefined,
      providerName: providerName.trim() || undefined,
      notes: notes.trim() || undefined,
      source: record?.source ?? "rider",
      details: cadenceDays
        ? { ...(record?.details ?? {}), cadenceDays }
        : omitCadence(record?.details ?? {})
    }, asset);
  };

  return (
    <EquinaSheet
      visible={visible}
      title={record ? "Edit record" : "New record"}
      closeTestID="record-editor-close"
      onDismiss={onDismiss}
    >
      <View style={styles.formStack}>
        {!record ? (
          <View>
            <Text style={styles.label}>Record type</Text>
            <View style={styles.typeGrid}>
              {recordTypes.map(({ type, label, Icon }) => {
                const active = type === recordType;
                return (
                  <MotionPressable
                    key={type}
                    testID={`record-type-${type}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={label}
                    style={[styles.typeOption, active && styles.typeOptionActive]}
                    onPress={() => chooseType(type)}
                  >
                    <Icon size={17} color={active ? equinaTheme.colors.brass : equinaTheme.text.secondary} />
                    <Text style={[styles.typeOptionText, active && styles.typeOptionTextActive]}>{label}</Text>
                  </MotionPressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <EquinaField
          testID="record-editor-title"
          label="Title"
          value={title}
          maxLength={120}
          onChangeText={setTitle}
        />
        <EquinaSelector
          label="Status"
          options={recordStatuses}
          value={status as (typeof recordStatuses)[number]}
          testPrefix="record-editor-status"
          onChange={setStatus}
        />
        <View style={styles.fieldPair}>
          <View style={styles.fieldHalf}>
            <EquinaField
              testID="record-editor-date"
              label="Date"
              value={occurredOn}
              inputMode="numeric"
              maxLength={10}
              onChangeText={setOccurredOn}
            />
          </View>
          <View style={styles.fieldHalf}>
            <EquinaField
              testID="record-editor-due-date"
              label="Due"
              optional
              value={dueOn}
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              maxLength={10}
              onChangeText={setDueOn}
            />
          </View>
        </View>
        {recurring ? (
          <EquinaSelector
            label="Repeats"
            options={cadenceChoices}
            value={cadence}
            testPrefix="record-editor-cadence"
            onChange={chooseCadence}
          />
        ) : null}
        <EquinaField
          testID="record-editor-provider"
          label="Provider"
          optional
          value={providerName}
          maxLength={120}
          onChangeText={setProviderName}
        />
        <EquinaField
          testID="record-editor-notes"
          label="Notes"
          optional
          value={notes}
          multiline
          numberOfLines={4}
          maxLength={4000}
          onChangeText={setNotes}
        />
        {files.map((file) => (
          <View key={file.id} style={styles.savedFile}>
            <MotionPressable
              testID={`record-file-open-${file.id}`}
              accessibilityRole="link"
              accessibilityLabel={`Open ${file.originalName}`}
              style={styles.savedFileOpen}
              onPress={() => void onOpenFile?.(file)}
            >
              <FileText size={18} color={equinaTheme.colors.brass} />
              <View style={styles.fileCopy}>
                <Text numberOfLines={1} style={styles.fileTitle}>{file.originalName}</Text>
                <Text style={styles.fileMeta}>{Math.max(1, Math.round(file.byteSize / 1024))} KB · private</Text>
              </View>
            </MotionPressable>
            {onRemoveFile ? (
              <MotionPressable
                testID={`record-file-remove-${file.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${file.originalName}`}
                disabled={saving}
                style={styles.savedFileRemove}
                onPress={() => void onRemoveFile(file)}
              >
                <Trash2 size={17} color={equinaTheme.text.tertiary} />
              </MotionPressable>
            ) : null}
          </View>
        ))}
        <MotionPressable
          testID="record-editor-file"
          accessibilityRole="button"
          accessibilityLabel={asset ? `Change attachment, ${asset.fileName}` : "Add PDF or image attachment"}
          style={styles.filePicker}
          onPress={() => void pickDocument()}
        >
          <View style={styles.fileIcon}>
            <Upload size={18} color={equinaTheme.colors.brass} />
          </View>
          <View style={styles.fileCopy}>
            <Text numberOfLines={1} style={styles.fileTitle}>{asset?.fileName ?? "Add attachment"}</Text>
            <Text style={styles.fileMeta}>{asset ? `${Math.max(1, Math.round(asset.byteSize / 1024))} KB · private` : "PDF or image · up to 20 MB"}</Text>
          </View>
        </MotionPressable>
        {(localError || error) ? <Text accessibilityRole="alert" style={styles.error}>{localError || error}</Text> : null}
        <EquinaButton
          testID="record-editor-save"
          label={saving ? "Saving securely..." : record ? "Save record" : "Add to timeline"}
          disabled={saving}
          onPress={() => void submit()}
        />
        {record && onDelete ? (
          <MotionPressable
            testID="record-editor-delete"
            accessibilityRole="button"
            accessibilityLabel={`Delete ${record.title}`}
            disabled={saving}
            style={styles.destructiveAction}
            onPress={() => void onDelete()}
          >
            <Trash2 size={17} color={equinaTheme.colors.danger} />
            <Text style={styles.destructiveText}>Delete record</Text>
          </MotionPressable>
        ) : null}
      </View>
    </EquinaSheet>
  );
}

const styles = StyleSheet.create({
  formStack: {
    gap: equinaTheme.spacing.md
  },
  photoPicker: {
    height: 150,
    borderRadius: equinaTheme.radius.card,
    overflow: "hidden",
    backgroundColor: equinaTheme.surfaces.raised
  },
  photoPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: equinaTheme.spacing.sm
  },
  photoPlaceholderText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  fieldPair: {
    flexDirection: "row",
    gap: equinaTheme.spacing.compact
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0
  },
  label: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    marginBottom: equinaTheme.spacing.sm
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: equinaTheme.spacing.sm
  },
  typeOption: {
    width: "31%",
    minHeight: 54,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: equinaTheme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: equinaTheme.spacing.xs,
    backgroundColor: equinaTheme.material.quiet
  },
  typeOptionActive: {
    backgroundColor: equinaTheme.material.selected
  },
  typeOptionText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary,
    textAlign: "center"
  },
  typeOptionTextActive: {
    color: equinaTheme.colors.brass
  },
  filePicker: {
    minHeight: 64,
    borderRadius: equinaTheme.radius.control,
    paddingHorizontal: equinaTheme.spacing.compact,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    backgroundColor: equinaTheme.surfaces.raised
  },
  savedFile: {
    minHeight: 64,
    borderRadius: equinaTheme.radius.control,
    paddingLeft: equinaTheme.spacing.compact,
    paddingRight: equinaTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: equinaTheme.material.quiet
  },
  savedFileOpen: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  savedFileRemove: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  fileIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  fileCopy: {
    flex: 1,
    minWidth: 0
  },
  fileTitle: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary
  },
  fileMeta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary,
    marginTop: 2
  },
  error: {
    ...equinaTheme.typography.meta,
    color: "#E7A4A5"
  },
  destructiveAction: {
    minHeight: 48,
    borderRadius: equinaTheme.radius.control,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: equinaTheme.spacing.sm,
    backgroundColor: "rgba(157,43,46,0.1)"
  },
  destructiveText: {
    ...equinaTheme.typography.label,
    color: "#E7A4A5"
  }
});
