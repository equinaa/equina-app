/**
 * What Ralf may read about a rider before he answers.
 *
 * Account > Privacy and Ralf lists what "Ralf may use" and says that turning
 * a switch off changes the next request. coach-chat asks here once and reads
 * only what comes back: a table this does not allow is never queried, so
 * nothing from it can reach the provider.
 *
 * Pure on purpose (no Deno or npm imports), so the Node tests import it.
 */

/** The four switches, as user_preferences stores them. */
export type CoachContextSwitches = {
  reduced_personalization?: boolean | null;
  use_rider_profile?: boolean | null;
  use_selected_horse?: boolean | null;
  use_ride_history?: boolean | null;
};

export type CoachContextAllowance = {
  /** "Rider profile": display name, discipline and level. */
  riderProfile: boolean;
  /**
   * "Selected horse": the conversation's horse when its name, breed and
   * discipline may be sent, null when they may not or there is no horse.
   */
  horseId: string | null;
  /**
   * "Ride history": null when no ride may be sent. Otherwise whose rides:
   * the conversation's horse, or with `horseId` null the rides logged with no
   * horse.
   */
  rides: { horseId: string | null } | null;
};

/**
 * - A switch that was never saved reads as its column default: the three
 *   sources on, "Minimal context" off.
 * - "Minimal context" wins over the other three, whatever they hold: Account
 *   greys them out while it is on, and keeps their values.
 * - Rides are those of the horse the conversation is about, never every
 *   horse's. A conversation with no horse (a rider who has none, or a question
 *   about a ride that had none) reads the rides logged with no horse, so one
 *   horse's rides are never read as another's.
 * - "Selected horse" off holds back the horse's name, breed and discipline.
 *   The rides on that horse keep their own switch: a ride row names no horse.
 */
export const coachContextFor = (
  switches: CoachContextSwitches | null | undefined,
  conversationHorseId: string | null | undefined,
): CoachContextAllowance => {
  if (switches?.reduced_personalization) return { riderProfile: false, horseId: null, rides: null };
  const horseId = conversationHorseId || null;
  return {
    riderProfile: switches?.use_rider_profile !== false,
    horseId: switches?.use_selected_horse !== false ? horseId : null,
    rides: switches?.use_ride_history !== false ? { horseId } : null,
  };
};
