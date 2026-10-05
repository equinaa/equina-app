import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check, Minus } from "lucide-react-native";
import type { PlanTier } from "../../backend";
import { equinaTheme } from "../../ui/theme/theme";
import { tierFeatures } from "./plan-rules";

/**
 * One plan: its name, what it holds, and -- when plans are on sale -- its
 * price above the list and its button below. The plan screen and the offer
 * after sign-up show the same card.
 */
export function PlanCard({
  tier,
  mine,
  pill,
  price,
  children
}: {
  tier: PlanTier;
  mine: boolean;
  /** A short note in the corner, such as the trial. "Your plan" replaces it. */
  pill?: string | null;
  price?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View testID={`plan-card-${tier.key}`} style={[styles.card, mine && styles.cardMine]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardName}>{tier.name}</Text>
        {mine ? (
          <Text style={styles.badge}>Your plan</Text>
        ) : pill ? (
          <Text style={styles.pill}>{pill}</Text>
        ) : null}
      </View>
      {price}
      <View style={styles.features}>
        {tierFeatures(tier).map((feature) => (
          <View
            key={feature.text}
            accessible
            accessibilityLabel={`${feature.included ? "Included" : "Not included"}: ${feature.text}`}
            style={styles.feature}
          >
            {feature.included ? (
              <Check size={15} color={equinaTheme.colors.brass} strokeWidth={2.2} />
            ) : (
              <Minus size={15} color={equinaTheme.text.tertiary} strokeWidth={2} />
            )}
            <Text style={[styles.featureText, !feature.included && styles.featureOff]}>{feature.text}</Text>
          </View>
        ))}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 18,
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised
  },
  cardMine: {
    borderWidth: 1,
    borderColor: equinaTheme.colors.brass
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  cardName: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary
  },
  badge: {
    ...equinaTheme.typography.label,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    color: equinaTheme.colors.ink,
    backgroundColor: equinaTheme.colors.brass
  },
  pill: {
    ...equinaTheme.typography.label,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    color: equinaTheme.colors.brass,
    backgroundColor: equinaTheme.material.selected
  },
  features: {
    gap: 10
  },
  feature: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  featureText: {
    flex: 1,
    color: equinaTheme.text.primary,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "400"
  },
  featureOff: {
    color: equinaTheme.text.tertiary
  }
});
