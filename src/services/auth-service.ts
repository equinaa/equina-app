import { z } from "zod";
import type { AuthSession, User } from "../domain/types";
import { createId } from "./id";
import type { EquinaStore } from "./store";

const signInSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  locale: z.enum(["ro", "en", "hu"]).default("ro")
});

export class AuthService {
  constructor(private readonly store: EquinaStore) {}

  signIn(input: unknown): AuthSession {
    const data = signInSchema.parse(input);
    let user = this.store.users.find((candidate) => candidate.email === data.email);

    if (!user) {
      user = {
        id: createId("usr"),
        email: data.email,
        phone: data.phone,
        locale: data.locale,
        roles: ["rider"],
        createdAt: new Date().toISOString()
      } satisfies User;
      this.store.users.push(user);
    }

    return {
      token: createId("ses"),
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
    };
  }
}
