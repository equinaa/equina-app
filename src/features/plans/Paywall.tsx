import { useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import type { PlanKey, PlanState, PlanTier } from "../../backend";
import { completionHaptic, selectionHaptic } from "../../ui/motion/haptics";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { EquinaButton, EquinaSelector } from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";
import {
  actionLabel,
  annualSavings,
  eligibleTrial,
  legalLinks,
  monthlyEquivalentLine,
  noOffersLine,
  offersFailedLine,
  offersLoadingLine,
  periodLabels,
  priceLine,
  priceSpoken,
  pricesSpoken,
  purchaseBusyLabel,
  renewalDisclosure,
  savingsLine,
  trialLength,
  trialLine
} from "./paywall-copy";
import { PlanCard } from "./PlanCard";
import { cardAction, offerFor, type BillingPeriod } from "./purchase-catalog";
import type { PurchasesController } from "./usePurchases";

const periodOptions = [periodLabels.monthly, periodLabels.annual];

/**
 * The plans with their store prices and buttons, the restore button, the
 * renewal terms and the legal links. Shown only while purchases are
 * available; the plan screen and the offer after sign-up both use it.
 */
export function Paywall({
  plan,
  purchases,
  tiers,
  onPurchased
}: {
  plan: PlanState;
  purchases: PurchasesController;
  tiers: PlanTier[];
  onPurchased?: () => void;
}) {
  // Annual first: the better price, and the one most riders keep.
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  // Where the last message belongs: the card that was tapped, or restore.
  const [messageAt, setMessageAt] = useState<PlanKey | "restore" | null>(null);
  const { platform, status } = purchases;
  const legal = legalLinks();
  const busy = purchases.busy !== null;
  const restoring = purchases.busy?.kind === "restore";
  const restoreDisabled = busy || !purchases.storeReady;

  const message = (place: PlanKey | "restore") =>
    purchases.message && messageAt === place ? (
      <Text
        accessibilityRole={purchases.message.tone === "error" ? "alert" : "text"}
        accessibilityLiveRegion="polite"
        style={[styles.message, purchases.message.tone === "error" && styles.messageError]}
      >
        {purchases.message.text}
      </Text>
    ) : null;

  return (
    <View style={styles.body}>
      {tiers.some((tier) => tier.key !== "free") ? (
        <EquinaSelector
          label="Billing"
          options={periodOptions}
          value={periodLabels[period]}
          onChange={(label) => setPeriod(label === periodLabels.monthly ? "monthly" : "annual")}
          testPrefix="paywall-period"
        />
      ) : null}

      {status === "idle" || status === "loading" ? (
        <View style={styles.statusLine}>
          <ActivityIndicator size="small" color={equinaTheme.colors.brass} />
          <Text style={styles.statusText}>{offersLoadingLine(platform)}</Text>
        </View>
      ) : status === "failed" ? (
        <View style={styles.statusBlock}>
          <Text accessibilityRole="alert" style={styles.statusText}>{offersFailedLine(platform)}</Text>
          <MotionPressable
            testID="paywall-retry"
            accessibilityRole="button"
            accessibilityLabel="Try loading prices again"
            style={styles.textButton}
            onPress={purchases.reload}
          >
            <Text style={styles.textButtonLabel}>Try again</Text>
          </MotionPressable>
        </View>
      ) : purchases.offers.length === 0 ? (
        <Text style={styles.statusText}>{noOffersLine(platform)}</Text>
      ) : null}

      {tiers.map((tier) => {
        const offer = offerFor(purchases.offers, tier.key, period);
        const action = cardAction({ tier: tier.key, plan, subscription: purchases.subscription, offer, platform });
        const trial = action === "buy" && offer ? eligibleTrial(offer, purchases.eligibility[offer.productId]) : null;
        const label = actionLabel({ action, tierName: tier.name, trial });
        const sells = action === "buy" || action === "upgrade";
        const busyHere =
          (sells && purchases.busy?.kind === "purchase" && purchases.busy.productId === offer?.productId) ||
          (!sells && purchases.busy?.kind === "manage" && messageAt === tier.key);
        const savings = period === "annual"
          ? savingsLine(annualSavings(offerFor(purchases.offers, tier.key, "monthly"), offer))
          : null;
        const secondary = offer ? [monthlyEquivalentLine(offer), savings].filter(Boolean).join(" · ") : "";

        const act = async () => {
          setMessageAt(tier.key);
          if (!sells) {
            await purchases.manage();
            return;
          }
          if (!offer) return;
          if (await purchases.purchase(offer.productId)) {
            completionHaptic();
            onPurchased?.();
          }
        };

        return (
          <PlanCard
            key={tier.key}
            tier={tier}
            mine={tier.key === plan.tier}
            pill={trial ? `${trialLength(trial).adjective} free trial` : null}
            price={
              tier.key === "free" ? (
                <Text style={styles.price}>Free</Text>
              ) : offer ? (
                <View style={styles.priceBlock}>
                  <Text accessibilityLabel={priceSpoken(offer)} style={styles.price}>{priceLine(offer)}</Text>
                  {secondary ? (
                    <Text accessibilityLabel={pricesSpoken(secondary)} style={styles.priceSecondary}>{secondary}</Text>
                  ) : null}
                </View>
              ) : null
            }
          >
            {trial && offer ? (
              <Text accessibilityLabel={pricesSpoken(trialLine(offer, trial) ?? "")} style={styles.trialLine}>
                {trialLine(offer, trial)}
              </Text>
            ) : null}
            {label ? (
              <EquinaButton
                testID={`plan-action-${tier.key}`}
                label={busyHere && sells ? purchaseBusyLabel(platform) : label}
                variant={sells ? "primary" : "secondary"}
                showArrow={false}
                disabled={busy || !purchases.storeReady || (sells && status !== "ready")}
                leading={busyHere ? <ActivityIndicator size="small" color={equinaTheme.text.tertiary} /> : undefined}
                onPress={() => void act()}
              />
            ) : null}
            {message(tier.key)}
          </PlanCard>
        );
      })}

      <View style={styles.restore}>
        <MotionPressable
          testID="paywall-restore"
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          accessibilityState={{ disabled: restoreDisabled, busy: restoring }}
          disabled={restoreDisabled}
          style={styles.textButton}
          onPress={() => {
            selectionHaptic();
            setMessageAt("restore");
            void purchases.restore();
          }}
        >
          {restoring ? <ActivityIndicator size="small" color={equinaTheme.colors.brass} /> : null}
          <Text style={[styles.textButtonLabel, restoreDisabled && !restoring && styles.textButtonDisabled]}>
            {restoring ? "Restoring…" : "Restore purchases"}
          </Text>
        </MotionPressable>
        {message("restore")}
      </View>

      <Text style={styles.disclosure}>{renewalDisclosure(platform)}</Text>

      <View style={styles.legal}>
        <LegalLink testID="paywall-terms" label="Terms of Use" url={legal.termsUrl} />
        {legal.privacyPolicyUrl ? (
          <LegalLink testID="paywall-privacy" label="Privacy Policy" url={legal.privacyPolicyUrl} />
        ) : null}
      </View>
    </View>
  );
}

function LegalLink({ label, url, testID }: { label: string; url: string; testID: string }) {
  return (
    <MotionPressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={styles.legalLink}
      onPress={() => void Linking.openURL(url).catch(() => undefined)}
    >
      <Text style={styles.legalText}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16
  },
  statusLine: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  statusBlock: {
    gap: 4
  },
  statusText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  priceBlock: {
    gap: 2
  },
  price: {
    color: equinaTheme.text.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  priceSecondary: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary,
    fontVariant: ["tabular-nums"]
  },
  trialLine: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400"
  },
  message: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  messageError: {
    color: equinaTheme.colorRole.criticalOnDark
  },
  restore: {
    alignItems: "center",
    gap: 4
  },
  textButton: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    minWidth: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 12
  },
  textButtonLabel: {
    color: equinaTheme.colors.brass,
    fontSize: 14,
    fontWeight: "600"
  },
  textButtonDisabled: {
    color: equinaTheme.text.tertiary
  },
  disclosure: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.tertiary
  },
  legal: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8
  },
  legalLink: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  legalText: {
    color: equinaTheme.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textDecorationLine: "underline"
  }
});
