import type { Metadata } from "next";
import { LocalTime } from "@/components/local-time";
import {
  clubAccessLabel,
  heldPlanState,
  planSummary,
  planTierValues,
  sourceLabel,
  type HeldPlan,
  type PlanTierRow
} from "@/lib/plans";
import { requireStaff } from "@/lib/staff";
import { GrantForm } from "./grant-form";
import { PlanTierForm } from "./plan-tier-form";

export const metadata: Metadata = { title: "Plans" };

// Whether riders feel the plans yet. Until the flag is on, everyone has
// everything (the founding phase) and only Ralf's allowance follows a plan.
const enforcementNote = (flag: { enabled: boolean; rollout_percent: number } | null) => {
  if (!flag) return null;
  if (!flag.enabled || flag.rollout_percent === 0) {
    return "Plans are not applied yet: every rider has every lesson and the whole Club until the plans flag is on. Ralf’s monthly credits already follow each rider’s plan whenever Ralf is metered. Accounts with their own plans override (testers) see their plan’s limits now.";
  }
  if (flag.rollout_percent < 100) {
    return `Plans apply to ${flag.rollout_percent}% of riders, and to accounts with their own override.`;
  }
  return "Plans apply to every rider.";
};

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

export default async function PlansPage() {
  const { supabase, role } = await requireStaff();
  const isAdmin = role === "admin";

  const [{ data: tierData, error: tierError }, { data: policyData }, { data: flag }, held] = await Promise.all([
    supabase
      .from("plan_tiers")
      .select("key, name, rank, academy_picks, club_access, coach_sessions, event_tickets, trial_days")
      .order("rank"),
    supabase.from("coach_credit_policies").select("key, monthly_credits"),
    supabase.from("app_feature_flags").select("enabled, rollout_percent").eq("key", "plans").maybeSingle(),
    isAdmin ? supabase.rpc("staff_list_plans") : Promise.resolve({ data: null, error: null })
  ]);
  const credits = new Map(((policyData ?? []) as Array<{ key: string; monthly_credits: number }>).map((row) => [row.key, row.monthly_credits]));
  const tiers = ((tierData ?? []) as Array<Omit<PlanTierRow, "monthly_credits">>).map((tier) => ({
    ...tier,
    monthly_credits: credits.get(tier.key) ?? 0
  }));
  const names = Object.fromEntries(tiers.map((tier) => [tier.key, tier.name]));
  const holders = (held.data ?? []) as HeldPlan[];
  const note = enforcementNote(flag as { enabled: boolean; rollout_percent: number } | null);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Plans</h1>
          <p className="meta">
            What each plan holds, and who has one. Prices are set in the App Store once Equina’s account exists; nothing here
            charges anyone.
          </p>
        </div>
      </div>

      {note ? <p className="notice">{note}</p> : null}
      {tierError ? <p className="form-error" role="alert">The plans could not be loaded. Refresh the page.</p> : null}

      <div className="plan-grid">
        {tiers.map((tier) => (
          <section key={tier.key} className="panel" aria-labelledby={`plan-${tier.key}`}>
            <div className="stack-tight">
              <h2 id={`plan-${tier.key}`}>{tier.name}</h2>
              <p className="meta">{planSummary(tier)}</p>
            </div>
            {isAdmin ? (
              <PlanTierForm planKey={tier.key} values={planTierValues(tier)} />
            ) : (
              <ul className="plain-list">
                <li>{tier.academy_picks === null ? "Every lesson" : `Free lessons and ${count(tier.academy_picks, "paid pick", "paid picks")}`}</li>
                <li>{clubAccessLabel[tier.club_access]}</li>
                <li>{count(tier.monthly_credits, "Ralf credit", "Ralf credits")} a month</li>
                <li>{count(tier.coach_sessions, "1-on-1 coach session", "1-on-1 coach sessions")}</li>
                <li>{count(tier.event_tickets, "annual event ticket", "annual event tickets")}</li>
                {tier.key === "free" ? null : <li>{count(tier.trial_days, "day", "days")} free trial</li>}
              </ul>
            )}
          </section>
        ))}
      </div>

      {isAdmin ? (
        <div className="columns">
          <section className="stack-tight" aria-labelledby="holders-title">
            <div className="panel-head">
              <h2 id="holders-title">Riders with a plan</h2>
              <span className="meta">{count(holders.filter((row) => row.live).length, "active", "active")}</span>
            </div>
            {held.error ? <p className="form-error" role="alert">The list could not be loaded. Refresh the page.</p> : null}
            {!held.error && holders.length === 0 ? (
              <div className="empty">
                <h3>Nobody yet</h3>
                <p className="meta">Plans bought in the store and plans you give appear here.</p>
              </div>
            ) : null}
            {holders.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Rider</th>
                      <th scope="col">Plan</th>
                      <th scope="col">From</th>
                      <th scope="col">Until</th>
                      <th scope="col">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map((row) => {
                      const state = heldPlanState(row);
                      return (
                        <tr key={`${row.user_id}-${row.source}`}>
                          <td>
                            <strong>{row.display_name || row.email}</strong>
                            <div className="meta">{row.display_name ? row.email : null}{row.note ? `${row.display_name ? " · " : ""}${row.note}` : null}</div>
                          </td>
                          <td>
                            {row.tier_name}
                            <div><span className={`chip ${state.tone}`}>{state.label}</span></div>
                          </td>
                          <td>
                            {sourceLabel[row.source]}
                            {row.source === "staff" && row.granted_by_email ? <div className="meta">{row.granted_by_email}</div> : null}
                          </td>
                          <td className="meta">
                            {row.ends_at ? <LocalTime iso={row.ends_at} style="date" /> : "No end date"}
                          </td>
                          <td className="meta"><LocalTime iso={row.updated_at} style="date" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="panel" aria-labelledby="grant-title">
            <h2 id="grant-title">Give a plan</h2>
            <p className="meta">For testers, coaches and friends of Equina. It applies at once, with nothing to pay.</p>
            <GrantForm names={names} />
          </section>
        </div>
      ) : (
        <p className="notice">Only an admin can change what a plan holds, give a plan, or see who holds one.</p>
      )}
    </main>
  );
}
