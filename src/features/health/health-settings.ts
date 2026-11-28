import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The rider's Apple Health choices, kept on this phone under their account:
 * whether rides show their effort, whether finished rides are saved to Apple
 * Health, whether the one-time Connect card was put away, and what they
 * answered when Ralf first asked for the heart rate. Choices, never health
 * data: the heart rate itself is never stored (useRideEffort.ts).
 *
 * What Equina may read from Apple Health is the rider's choice in Apple's own
 * sheet and the Health app; nothing here copies or overrides it.
 */

export type RalfEffortConsent = "allowed" | "declined";

export type HealthSettings = {
  /** The "Your effort" card on a ride. */
  showEffort: boolean;
  /** A ride the clock timed is saved to Apple Health as an Equestrian Sports workout. */
  saveRides: boolean;
  /** "Not now" on the Connect card: it does not come back for this account. */
  connectDismissed: boolean;
  /** Null until the rider is first asked; Ralf gets no heart rate before a yes. */
  ralfEffort: RalfEffortConsent | null;
};

export const defaultHealthSettings: HealthSettings = {
  showEffort: true,
  saveRides: true,
  connectDismissed: false,
  ralfEffort: null
};

export type HealthSettingsStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export const healthSettingsKey = (userId: string) => `equina.apple-health.v1:${userId}`;

/** A stored value, or the defaults for whatever is missing or cannot be read. */
export const parseHealthSettings = (raw: string | null | undefined): HealthSettings => {
  if (!raw) return { ...defaultHealthSettings };
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaultHealthSettings };
    const flag = (name: keyof HealthSettings) =>
      typeof value[name] === "boolean" ? (value[name] as boolean) : (defaultHealthSettings[name] as boolean);
    return {
      showEffort: flag("showEffort"),
      saveRides: flag("saveRides"),
      connectDismissed: flag("connectDismissed"),
      ralfEffort: value.ralfEffort === "allowed" || value.ralfEffort === "declined" ? value.ralfEffort : null
    };
  } catch {
    return { ...defaultHealthSettings };
  }
};

/** Ralf gets the heart rate only after a yes, and never while Minimal context is on. */
export const ralfMayUseEffort = (settings: HealthSettings, minimalContext: boolean) =>
  settings.ralfEffort === "allowed" && !minimalContext;

export function createHealthSettingsStore(storage: HealthSettingsStorage) {
  const listeners = new Map<string, Set<(settings: HealthSettings) => void>>();
  // What each account's settings are now, so a screen that opens later reads
  // the change another one just made, even before storage has it.
  const current = new Map<string, HealthSettings>();
  let queue: Promise<unknown> = Promise.resolve();

  const load = async (userId: string): Promise<HealthSettings> => {
    const known = current.get(userId);
    if (known) return known;
    let settings = { ...defaultHealthSettings };
    try {
      settings = parseHealthSettings(await storage.getItem(healthSettingsKey(userId)));
    } catch {
      // No storage: the defaults stand, and nothing is asked twice in this session.
    }
    if (!current.has(userId)) current.set(userId, settings);
    return current.get(userId)!;
  };

  /** Changes one or more choices, tells every screen showing them, then keeps them. */
  const update = (userId: string, patch: Partial<HealthSettings>) => {
    const next = queue.then(async () => {
      const settings = { ...(await load(userId)), ...patch };
      current.set(userId, settings);
      for (const listener of listeners.get(userId) ?? []) listener(settings);
      try {
        await storage.setItem(healthSettingsKey(userId), JSON.stringify(settings));
      } catch {
        // Kept for this session; asked again after a restart at worst.
      }
      return settings;
    });
    queue = next.catch(() => undefined);
    return next;
  };

  const subscribe = (userId: string, listener: (settings: HealthSettings) => void) => {
    const set = listeners.get(userId) ?? new Set();
    set.add(listener);
    listeners.set(userId, set);
    return () => {
      set.delete(listener);
    };
  };

  return { load, update, subscribe };
}

/** This phone's store. */
export const healthSettings = createHealthSettingsStore(AsyncStorage);
