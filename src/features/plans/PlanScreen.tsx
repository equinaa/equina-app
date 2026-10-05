import { StyleSheet, Text, View } from "react-native";
import { Check, Minus } from "lucide-react-native";
import type { PlanState } from "../../backend";
import { equinaTheme } from "../../ui/theme/theme";
import { picksLeft, planStatusLine, tierFeatures, tierOf } from "./plan-rules";

/**
 * The rider's plan and the three plans side by side. Nothing here sells yet:
 * subscriptions open with the App Store release, and until the plans flag is
 * on every rider has everything.
 */
export function PlanScreen({ plan }: { plan: PlanState }) {
  const current = tierOf(plan);
  const left = picksLeft(plan);
  const trialDays = [...new Set(plan.tiers.filter((tier) => tier.trialDays > 0).map((tier) => tier.trialDays))];
  const paidNames = plan.tiers.filter((tier) => tier.key !== "free").map((tier) => tier.name).join(" and ");

  return (
    <View style={styles.body}>
      <View testID="plan-current" style={styles.current}>
        <Text style={styles.eyebrow}>Your plan</Text>
        <Text accessibilityRole="header" style={styles.currentName}>{current.name}</Text>
        <Text style={styles.currentLine}>{planStatusLine(plan)}</Text>
        {plan.enforced && left !== null && plan.academy.picksLimit !== null ? (
          <Text style={styles.currentMeta}>
            {plan.academy.picksUsed} of {plan.academy.picksLimit} lesson picks used
          </Text>
        ) : null}
      </View>

      {!plan.enforced ? (
        <Text style={styles.lead}>These are the plans for when subscriptions open.</Text>
      ) : null}

      {plan.tiers.map((tier) => {
        const mine = tier.key === plan.tier;
        return (
          <View key={tier.key} testID={`plan-card-${tier.key}`} style={[styles.card, mine && styles.cardMine]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardName}>{tier.name}</Text>
              {mine ? (
                <Text style={styles.badge}>Your plan</Text>
              ) : tier.trialDays > 0 ? (
                <Text style={styles.trial}>{tier.trialDays}-day free trial</Text>
              ) : null}
            </View>
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
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Subscriptions open with the App Store release</Text>
        <Text style={styles.footerText}>
          {paidNames && trialDays.length === 1 ? `${paidNames} start with a ${trialDays[0]}-day free trial. ` : ""}
          One Ralf credit is one message; a message with a photo is three. The Equina team arranges coach sessions and
          event tickets with you.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16
  },
  current: {
    gap: 4,
    paddingVertical: 4
  },
  eyebrow: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  currentName: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary
  },
  currentLine: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400"
  },
  currentMeta: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary,
    fontVariant: ["tabular-nums"]
  },
  lead: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400"
  },
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
  trial: {
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
  },
  footer: {
    gap: 6,
    paddingTop: 4
  },
  footerTitle: {
    color: equinaTheme.text.primary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600"
  },
  footerText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  }
});
