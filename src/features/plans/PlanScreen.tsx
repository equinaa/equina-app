import { StyleSheet, Text, View } from "react-native";
import type { PlanState } from "../../backend";
import { equinaTheme } from "../../ui/theme/theme";
import { Paywall } from "./Paywall";
import { PlanCard } from "./PlanCard";
import { picksLeft, planStatusLine, tierOf } from "./plan-rules";
import { closedPlansCopy, closedTrialLine, closedTrialPill, creditsNote } from "./plan-screen-copy";
import type { PurchasesController } from "./usePurchases";

/**
 * The rider's plan and the three plans side by side. While purchases are
 * unavailable -- no RevenueCat key, no privacy policy, plans not enforced, or
 * the web -- nothing here sells, and the footer says so in words that hold on
 * every platform: the Equina team sets the plan.
 */
export function PlanScreen({ plan, purchases }: { plan: PlanState; purchases?: PurchasesController }) {
  const current = tierOf(plan);
  const left = picksLeft(plan);
  const trialLine = closedTrialLine(plan.tiers);
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
          {!plan.enforced ? <Text style={styles.lead}>{closedPlansCopy.lead}</Text> : null}

          {plan.tiers.map((tier) => (
            <PlanCard key={tier.key} tier={tier} mine={tier.key === plan.tier} pill={closedTrialPill(tier)} />
          ))}

          <View testID="plan-closed-note" style={styles.footer}>
            <Text style={styles.footerTitle}>{closedPlansCopy.title}</Text>
            <Text style={styles.footerText}>{closedPlansCopy.body}</Text>
            <Text style={styles.footerText}>{trialLine ? `${trialLine} ${creditsNote}` : creditsNote}</Text>
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
