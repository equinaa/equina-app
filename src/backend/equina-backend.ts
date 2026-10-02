import type { Session } from "@supabase/supabase-js";
import type { BackendCapabilities } from "./contracts";
import { AccountRepository } from "./account-repository";
import { AuthRepository } from "./auth-repository";
import { CoachRepository } from "./coach-repository";
import { ClubRepository } from "./club-repository";
import { EdgeClient } from "./edge-client";
import { MarketplaceRepository } from "./marketplace-repository";
import { NotificationRepository } from "./notification-repository";
import { RecordsRepository } from "./records-repository";
import { AcademyRepository } from "./academy-repository";
import { RideRepository } from "./ride-repository";
import { forgetStoredSession, getSupabaseClient } from "./supabase-client";

export class EquinaBackend {
  readonly account: AccountRepository;
  readonly auth: AuthRepository;
  readonly coach: CoachRepository;
  readonly records: RecordsRepository;
  readonly rides: RideRepository;
  readonly academy: AcademyRepository;
  readonly club: ClubRepository;
  readonly marketplace: MarketplaceRepository;
  readonly notifications: NotificationRepository;
  private readonly edge: EdgeClient;

  constructor() {
    const client = getSupabaseClient();
    this.account = new AccountRepository(client);
    this.auth = new AuthRepository(client, forgetStoredSession);
    this.coach = new CoachRepository(client);
    this.records = new RecordsRepository(client);
    this.rides = new RideRepository(client);
    this.academy = new AcademyRepository(client);
    this.club = new ClubRepository(client);
    this.marketplace = new MarketplaceRepository(client);
    this.notifications = new NotificationRepository(client);
    this.edge = new EdgeClient(client);
  }

  async connect(): Promise<{ session: Session | null; capabilities: BackendCapabilities }> {
    const [session, response] = await Promise.all([
      this.auth.session(),
      this.edge.invoke<{ capabilities: BackendCapabilities }>("backend-capabilities", undefined, "GET")
    ]);
    return { session, capabilities: response.capabilities };
  }
}

let backend: EquinaBackend | null = null;

export const getEquinaBackend = () => {
  backend ??= new EquinaBackend();
  return backend;
};
