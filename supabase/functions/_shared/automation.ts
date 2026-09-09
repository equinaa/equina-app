import { HttpError } from "./http.ts";

const digest = async (value: string) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );

const matchesSecret = async (expected: string, received: string) => {
  const [expectedDigest, receivedDigest] = await Promise.all([
    digest(expected),
    digest(received),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= expectedDigest[index]! ^ receivedDigest[index]!;
  }
  return difference === 0;
};

export const requireAutomationSecret = async (
  request: Request,
  secretName: string,
  headerName: string,
) => {
  const expected = Deno.env.get(secretName);
  const received = request.headers.get(headerName);
  if (!expected || !received || !(await matchesSecret(expected, received))) {
    throw new HttpError(
      401,
      "Automation authorization failed.",
      "automation_unauthorized",
    );
  }
};
