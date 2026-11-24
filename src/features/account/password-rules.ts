/**
 * A password being chosen, for a new account or after a reset: the limits the
 * auth repository enforces again before anything is sent.
 */
export const newPasswordMinLength = 10;
export const passwordMaxLength = 128;

export const newPasswordReady = (password: string) =>
  password.length >= newPasswordMinLength && password.length <= passwordMaxLength;

/**
 * A password being used to sign in. Whether it is right is the auth service's
 * to say, not the form's: an account set up by staff can hold a password
 * shorter than the app lets a rider choose, and it must still be able to try.
 */
export const signInPasswordReady = (password: string) => password.length > 0;
