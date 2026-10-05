import { StyleSheet, Text, View } from "react-native";
import type { PlanState } from "../../backend";
import { equinaTheme } from "../../ui/theme/theme";
import { Paywall } from "./Paywall";
import { PlanCard } from "./PlanCard";
import { picksLeft, planStatusLine, tierOf } from "./plan-rules";
import type { PurchasesController } from "./usePurchases";

const creditsNote =
  "One Ralf credit is one message; a message with a photo is three. The Equina team arranges coach sessions and " +
  "event tickets with you.";

/**
 * The rider's plan and the three plans side by side. While purchases are
 * unavailable -- no RevenueCat key, no privacy policy, plans not enforced, or
 * the web -- nothing here sells, and the footer says subscriptions open with
 * the App Store release.
 */
export function PlanScreen({ plan, purchases }: { plan: PlanState; purchases?: PurchasesController }) {
  const current = tierOf(plan);
  const left = picksLeft(plan);
  const trialDays = [...new Set(plan.tiers.filter((tier) => tier.trialDays > 0).map((tier) => tier.trialDays))];
  const paidNames = plan.tiers.filter((tier) => tier.key !== "free").map((tier) => tier.name).join(" and ");
  const selling = Boolean(purchases?.available);

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

      {selling && purchases ? (
        <>
          <Paywall plan={plan} purchases={purchases} tiers={plan.tiers} />
          <Text style={styles.footerText}>{creditsNote}</Text>
        </>
      ) : (
        <>
          {!plan.enforced ? (
            <Text style={styles.lead}>These are the plans for when subscriptions open.</Text>
          ) : null}

          {plan.tiers.map((tier) => (
            <PlanCard
              key={tier.key}
              tier={tier}
              mine={tier.key === plan.tier}
              pill={tier.trialDays > 0 ? `${tier.trialDays}-day free trial` : null}
            />
          ))}

          <View style={styles.footer}>
            <Text style={styles.footerTitle}>Subscriptions open with the App Store release</Text>
            <Text style={styles.footerText}>
              {paidNames && trialDays.length === 1 ? `${paidNames} start with a ${trialDays[0]}-day free trial. ` : ""}
              {creditsNote}
            </Text>
          </View>
        </>
      )}
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
