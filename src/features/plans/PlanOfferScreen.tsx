import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PlanState } from "../../backend";
import { MotionPressable } from "../../ui/motion/MotionPressable";
import { EquinaButton } from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";
import { Paywall } from "./Paywall";
import type { PurchasesController } from "./usePurchases";

/**
 * The one plan offer a new account sees, right after onboarding. Free is a
 * real choice here, not a way to dismiss a nag: it has a button of its own
 * at the top and at the bottom, and choosing it never brings this back.
 */
export function PlanOfferScreen({
  plan,
  purchases,
  onClose
}: {
  plan: PlanState;
  purchases: PurchasesController;
  onClose: () => void;
}) {
  const paid = plan.tiers.filter((tier) => tier.key !== "free");
  const free = plan.tiers.find((tier) => tier.key === "free");

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
        <View style={styles.topBar}>
          <MotionPressable
            testID="plan-offer-skip"
            accessibilityRole="button"
            accessibilityLabel={`Continue with ${free?.name ?? "Free"}`}
            style={styles.skip}
            onPress={onClose}
          >
            <Text style={styles.skipText}>Continue with {free?.name ?? "Free"}</Text>
          </MotionPressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>Your account is ready</Text>
            <Text accessibilityRole="header" style={styles.title}>Choose how you ride with Equina</Text>
            <Text style={styles.lead}>
              {free?.name ?? "Free"} keeps your horse's records and ride journal for as long as you like.{" "}
              {paid.map((tier) => tier.name).join(" and ")} open more of the Academy, the Club and Ralf. You can change
              plans any time in Account.
            </Text>
          </View>
          <Paywall plan={plan} purchases={purchases} tiers={paid} onPurchased={onClose} />
          <EquinaButton
            testID="plan-offer-free"
            label={`Continue with ${free?.name ?? "Free"}`}
            variant="secondary"
            showArrow={false}
            onPress={onClose}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.canvas
  },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: equinaTheme.spacing.md
  },
  skip: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet
  },
  skipText: {
    color: equinaTheme.text.primary,
    fontSize: 14,
    fontWeight: "600"
  },
  content: {
    gap: equinaTheme.spacing.lg,
    paddingHorizontal: equinaTheme.spacing.md,
    paddingBottom: equinaTheme.spacing.xl
  },
  intro: {
    gap: 6
  },
  eyebrow: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  title: {
    ...equinaTheme.typography.display,
    color: equinaTheme.text.primary
  },
  lead: {
    color: equinaTheme.text.secondary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400"
  }
});
