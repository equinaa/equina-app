// What the beta page shows and accepts. The database holds the same rules
// (202610060003); these exist so staff see which field to fix.
//
// No imports: the project's test suite runs these rules directly.

export const inviteNoteLimit = 200;
const emailLimit = 320;
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The email the way the database stores and matches it: an invite for
// "Rider@Example.com " lets in the account that signs up as rider@example.com.
export const normalizeEmail = (input: string) => input.trim().toLowerCase();

export const validEmail = (email: string) =>
  email.length >= 3 && email.length <= emailLimit && emailShape.test(email);

// --- Inviting someone ------------------------------------------------------------

export type InviteFields = { email: string; note: string | null };
export type InviteFieldName = keyof InviteFields;
export type InviteErrors = Partial<Record<InviteFieldName, string>>;

export const readInviteForm = (
  read: (name: InviteFieldName) => string
): { fields: InviteFields | null; errors: InviteErrors } => {
  const errors: InviteErrors = {};

  const email = normalizeEmail(read("email"));
  if (!validEmail(email)) errors.email = "Enter the email address the rider signs up with.";

  const note = read("note").trim();
  if (note.length > inviteNoteLimit) errors.note = `Keep the note under ${inviteNoteLimit} characters.`;

  if (Object.keys(errors).length > 0) return { fields: null, errors };
  return { fields: { email, note: note || null }, errors };
};

// --- The invite list -------------------------------------------------------------

// A row of staff_list_beta_invites().
export type BetaInvite = {
  email: string;
  note: string | null;
  invited_at: string;
  invited_by_email: string | null;
  revoked_at: string | null;
  updated_at: string;
  has_account: boolean;
  signed_up_at: string | null;
};

// Where an invite stands, as a chip. Signed up means a confirmed account
// uses the email, so that rider is inside now.
export const inviteState = (row: Pick<BetaInvite, "revoked_at" | "has_account">): { label: string; tone: string } => {
  if (row.revoked_at) return { label: "Revoked", tone: "" };
  if (row.has_account) return { label: "Signed up", tone: "positive" };
  return { label: "Invited", tone: "warning" };
};

// --- The door ----------------------------------------------------------------------

// The public_access flag as the page reads it.
export type DoorFlag = { enabled: boolean; rollout_percent: number } | null;

export type DoorState = {
  // Everyone who signs up gets in.
  openToEveryone: boolean;
  // Anyone at all gets in without an invite: everyone, or a share of accounts.
  openBeyondInvites: boolean;
  label: string;
  detail: string;
};

export const doorState = (flag: DoorFlag): DoorState => {
  const percent = flag?.enabled ? flag.rollout_percent : 0;
  if (percent <= 0) {
    return {
      openToEveryone: false,
      openBeyondInvites: false,
      label: "Open to invited riders",
      detail: "Only the emails invited below, once confirmed, and accounts with their own public_access override get in. Everyone else who signs up waits at the door with their account saved."
    };
  }
  if (percent < 100) {
    return {
      openToEveryone: false,
      openBeyondInvites: true,
      label: `Open to invited riders and ${percent}% of everyone else`,
      detail: `The public_access rollout lets in ${percent}% of accounts, by the same stable share every flag uses, on top of every invited rider.`
    };
  }
  return {
    openToEveryone: true,
    openBeyondInvites: true,
    label: "Open to everyone",
    detail: "Everyone who signs up gets in. Invites no longer change anything until the door is closed again."
  };
};

// The launch switch: opening or closing, and the box that says the admin
// knows what that does. Nothing changes without it.
export type DoorDecision = "open" | "close";

export const doorConfirmation: Record<DoorDecision, string> = {
  open: "I understand everyone who signs up gets in",
  close: "I understand riders without an invite wait at the door again"
};

export const readDoorForm = (
  read: (name: "decision" | "confirm") => string
): { open: boolean | null; error: string | null } => {
  const decision = read("decision");
  if (decision !== "open" && decision !== "close") return { open: null, error: "Choose to open or close Equina." };
  if (read("confirm") !== "yes") return { open: null, error: `Tick “${doorConfirmation[decision]}” first.` };
  return { open: decision === "open", error: null };
};
