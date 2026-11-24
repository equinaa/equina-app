/**
 * The code the auth service emails. Its length is a setting of the hosted
 * project ("Email OTP length", 6 to 10 digits) that the app cannot read, and
 * an installed build cannot be patched. So the field takes every length the
 * server may use, and no screen names one: a changed setting must never lock
 * riders out of sign-up, code sign-in and password reset all at once.
 */
export const codeMinLength = 6;
export const codeMaxLength = 10;

/**
 * What the field keeps of what was typed, pasted or filled in from the email:
 * "123 456" and "Your Equina sign-in code: 123456" both leave the digits.
 */
export const cleanCode = (typed: string) => typed.replace(/\D/g, "").slice(0, codeMaxLength);

/**
 * Whether the code may be sent. From six digits on, since a six-digit code is
 * complete at six. The app cannot tell a longer code is still being typed, so
 * it never sends by itself: only the button and the keyboard's Done key do.
 */
export const codeReady = (code: string) => code.length >= codeMinLength && code.length <= codeMaxLength;
