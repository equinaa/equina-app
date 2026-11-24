/**
 * Where "Contact support" writes to: the one place the address lives, so the
 * app, the store listings and the privacy policy can be checked against a
 * single line.
 *
 * It is the address published on https://www.equina.ai, on the company's own
 * domain. A rider's message can carry personal details, so an address on any
 * other domain is a leak, not a typo: tests/support-contact.test.ts keeps the
 * look-alike domain out of everything that ships.
 */
export const supportEmail = "contact@equina.ai";

/** Opens the rider's mail app on a new message, with the subject filled in. */
export const supportMailto = `mailto:${supportEmail}?subject=${encodeURIComponent("Equina support")}`;
