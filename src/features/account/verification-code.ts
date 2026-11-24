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
 * What the field keeps of what was typed, pasted or filled in from the email.
 *
 * A pasted email carries other digits too: the rider's own address
 * ("anna1987@..."), a year. So a run of digits that can be a code by itself is
 * the code, and the first such run wins. With no such run the digits are one
 * code written in groups, "123 456", and are joined.
 */
export const cleanCode = (typed: string) => {
  const runs = typed.match(/\d+/g) ?? [];
  const whole = runs.find((run) => run.length >= codeMinLength && run.length <= codeMaxLength);
  return (whole ?? runs.join("")).slice(0, codeMaxLength);
};

/**
 * Whether the code may be sent. From six digits on, since a six-digit code is
 * complete at six. The app cannot tell a longer code is still being typed, so
 * it never sends by itself: only the button and the keyboard's Done key do.
 */
export const codeReady = (code: string) => code.length >= codeMinLength && code.length <= codeMaxLength;
