import { useEffect, useState } from "react";
import type { EquinaBackend, ListingRecord } from "../../backend";
import type { ConditionGrade, Currency, Listing, ListingCategory, ListingStatus } from "../../domain/types";

const supportedStatuses = new Set<ListingStatus>(["draft", "pending_review", "active", "sold", "rejected"]);

const toListing = (record: ListingRecord): Listing => ({
  id: record.id,
  sellerId: record.sellerId,
  category: record.category as ListingCategory,
  title: record.title,
  brand: record.brandName,
  model: record.model,
  conditionGrade: record.conditionGrade as ConditionGrade,
  priceAmount: record.priceMinor / 100,
  currency: record.currency as Currency,
  status: supportedStatuses.has(record.status as ListingStatus)
    ? record.status as ListingStatus
    : "active",
  location: [record.locality, record.countryCode].filter(Boolean).join(", "),
  photos: (record.photos ?? []).map((photo) => ({
    id: photo.id,
    url: photo.signedUrl ?? "",
    requiredAngle: photo.requiredAngle
  })),
  metadata: record.metadata,
  createdAt: record.createdAt
});

export function useConnectedShopCatalog({
  backend,
  enabled
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    if (!backend || !enabled) {
      setListings([]);
      return () => { active = false; };
    }
    setLoading(true);
    setError("");
    void backend.marketplace.browse({ limit: 50 }).then((records) => {
      if (active) setListings(records.map(toListing));
    }).catch(() => {
      if (active) setError("Live Shop items could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [backend, enabled, revision]);

  return {
    listings,
    loading,
    error,
    refresh: () => setRevision((value) => value + 1)
  };
}
