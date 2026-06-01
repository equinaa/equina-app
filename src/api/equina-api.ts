import { AiAssistantService, DeterministicAiProvider } from "../services/ai-service";
import { AuthService } from "../services/auth-service";
import { CommunityService } from "../services/community-service";
import { ListingService } from "../services/listing-service";
import { OrderService } from "../services/order-service";
import { ProfileService } from "../services/profile-service";
import { createEmptyStore, type EquinaStore } from "../services/store";

export interface EquinaApi {
  store: EquinaStore;
  auth: AuthService;
  profiles: ProfileService;
  listings: ListingService;
  orders: OrderService;
  community: CommunityService;
  ai: AiAssistantService;
}

export const createEquinaApi = (store: EquinaStore = createEmptyStore()): EquinaApi => ({
  store,
  auth: new AuthService(store),
  profiles: new ProfileService(store),
  listings: new ListingService(store),
  orders: new OrderService(store),
  community: new CommunityService(store),
  ai: new AiAssistantService(new DeterministicAiProvider())
});
