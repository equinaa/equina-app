import type {
  CommunityPost,
  Dispute,
  Horse,
  Listing,
  Order,
  Profile,
  Review,
  SellerVerification,
  User
} from "../domain/types";

export interface EquinaStore {
  users: User[];
  profiles: Profile[];
  sellerVerifications: SellerVerification[];
  horses: Horse[];
  listings: Listing[];
  orders: Order[];
  disputes: Dispute[];
  reviews: Review[];
  posts: CommunityPost[];
}

export const createEmptyStore = (): EquinaStore => ({
  users: [],
  profiles: [],
  sellerVerifications: [],
  horses: [],
  listings: [],
  orders: [],
  disputes: [],
  reviews: [],
  posts: []
});
