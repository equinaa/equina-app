import type { Metadata } from "next";
import { LocalTime } from "@/components/local-time";
import { doorState, inviteState, type BetaInvite, type DoorFlag } from "@/lib/beta";
import { requireStaff } from "@/lib/staff";
import { DoorForm } from "./door-form";
import { InviteActions } from "./invite-actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Beta" };

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

export default async function BetaPage() {
  const { supabase, role } = await requireStaff();
  const isAdmin = role === "admin";

  const [{ data: flag }, listed] = await Promise.all([
    supabase.from("app_feature_flags").select("enabled, rollout_percent").eq("key", "public_access").maybeSingle(),
    isAdmin ? supabase.rpc("staff_list_beta_invites") : Promise.resolve({ data: null, error: null })
  ]);
  const door = doorState(flag as DoorFlag);
  const invites = (listed.data ?? []) as BetaInvite[];
  const live = invites.filter((row) => !row.revoked_at);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Beta</h1>
          <p className="meta">
            Who gets into Equina before launch. Feature flags say what is ready and plans say what a rider gets; this
            page says who is inside at all.
          </p>
        </div>
      </div>

      <section className="panel" aria-labelledby="door-title">
        <div className="panel-head">
          <h2 id="door-title">The door</h2>
          <span className={`chip ${door.openBeyondInvites ? "positive" : "warning"}`}>{door.label}</span>
        </div>
        <p className="meta">{door.detail}</p>
        <p className="meta">
          Waiting at the door, an account can still export or delete its data. Nothing here changes a rider’s plan.
        </p>
        {isAdmin ? (
          <div className="door-actions">
            {!door.openToEveryone ? (
              <div className="stack-tight">
                <h3>Open at launch</h3>
                <p className="meta">Every account, new or waiting, gets in at once.</p>
                <DoorForm key="open" decision="open" />
              </div>
            ) : null}
            {door.openBeyondInvites ? (
              <div className="stack-tight">
                <h3>Close to invited riders</h3>
                <p className="meta">Riders without an invite wait at the door again. Their accounts and data stay.</p>
                <DoorForm key="close" decision="close" />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {isAdmin ? (
        <div className="columns">
          <section className="stack-tight" aria-labelledby="invites-title">
            <div className="panel-head">
              <h2 id="invites-title">Invites</h2>
              <span className="meta">
                {count(live.length, "invited", "invited")} · {count(live.filter((row) => row.has_account).length, "signed up", "signed up")}
              </span>
            </div>
            {listed.error ? <p className="form-error" role="alert">The invites could not be loaded. Refresh the page.</p> : null}
            {!listed.error && invites.length === 0 ? (
              <div className="empty">
                <h3>Nobody yet</h3>
                <p className="meta">Riders you invite appear here, and show as signed up once they confirm their email.</p>
              </div>
            ) : null}
            {invites.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Rider</th>
                      <th scope="col">Status</th>
                      <th scope="col">Invited</th>
                      <th scope="col">Signed up</th>
                      <th scope="col"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((row) => {
                      const state = inviteState(row);
                      return (
                        <tr key={row.email}>
                          <td>
                            <strong>{row.email}</strong>
                            {row.note ? <div className="meta">{row.note}</div> : null}
                          </td>
                          <td>
                            <span className={`chip ${state.tone}`}>{state.label}</span>
                            {row.revoked_at ? <div className="meta"><LocalTime iso={row.revoked_at} style="date" /></div> : null}
                          </td>
                          <td className="meta">
                            <LocalTime iso={row.invited_at} style="date" />
                            {row.invited_by_email ? <div>{row.invited_by_email}</div> : null}
                          </td>
                          <td className="meta">
                            {row.signed_up_at ? <LocalTime iso={row.signed_up_at} style="date" /> : "Not yet"}
                          </td>
                          <td>
                            <InviteActions email={row.email} revoked={Boolean(row.revoked_at)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="panel" aria-labelledby="invite-title">
            <h2 id="invite-title">Invite a rider</h2>
            <p className="meta">
              They get in as soon as they sign up and confirm this email, or at once if they already have. Equina sends
              no email about it.
            </p>
            <InviteForm />
          </section>
        </div>
      ) : (
        <p className="notice">Only an admin can invite riders, see the invites, or open Equina to everyone.</p>
      )}
    </main>
  );
}
