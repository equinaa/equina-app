# Equina Backend Deployment Inventory

Inventory date: 2026-07-29

> **Re-provisioning note (2026-09-09).** The original environment
> (`vdcrllzyzbdjonotrujb`) was deleted and rebuilt as `mvdxohyayriywbcknulg`
> (Frankfurt) from the same 34 migrations; the web client moved from
> `equina-five.vercel.app` to `equina-ten.vercel.app`. The database, the six
> Edge Functions, and the all-flags-off posture below were reproduced and
> verified on the new project. Two items are **not** yet true of it: the
> `equina-storage-cleanup` cron job has not been scheduled, and the named
> internal user override has not been re-applied.

Linked environment: `mvdxohyayriywbcknulg` (Frankfurt). This is currently the
only hosted environment and must not be treated as both staging and production.

## Database

| Item | Remote version | State | Rollout | Rollback |
| --- | --- | --- | --- | --- |
| Additive migrations | `202607210001` through `202607290005` | 34/34 synchronized | Global database flags default off | Disable the affected flag; ship a forward migration |
| Named-user overrides | `202607290002` | Deployed | One internal user: Horse and Records only, 30-day expiry | `clear_feature_flag_override` from an authorized staff session |
| Worker leases | `202607290003` and `202607290005` | Deployed | Storage active; other workers disabled | Stop scheduler, preserve jobs, ship a forward migration |
| Scheduler extensions | `202607290004` | Deployed | `pg_cron` and `pg_net` available | Unschedule the named job |

Global rows in `app_feature_flags` remain `enabled=false` with
`rollout_percent=0`.

## Edge Functions

| Function | Version | JWT | Required secrets | Remote state | Rollout / alert | Rollback |
| --- | ---: | --- | --- | --- | --- | --- |
| `backend-capabilities` | 6 | no | Supabase managed; optional provider secrets are checked fail-closed | Active | Public read only; alert on 5xx | Disable client flags, deploy previous reviewed source |
| `create-upload-ticket` | 2 | yes | Supabase managed | Active | Named internal Horse/Records | Disable `horse_management` and `record_mutations` |
| `complete-upload` | 3 | yes | Supabase managed; `MALWARE_SCAN_*` required before public rollout | Active | Alert on 5xx, mismatch, signature and scan failures | Disable flags; delete function only if containment requires it |
| `delete-upload-asset` | 2 | yes | Supabase managed | Active | Named internal Horse/Records | Disable flags |
| `delete-horse-record` | 2 | yes | Supabase managed | Active | Named internal Horse/Records | Disable flags |
| `process-storage-cleanup` | 2 | no | `STORAGE_AUTOMATION_SECRET` | Active | Every five minutes; alert on failed/dead-letter backlog | Unschedule cron, rotate secret, preserve queue |

No other function is deployed. In particular, Club, messaging, notification,
account deletion/export, Ralf, moderation, seller, tax, Stripe, dispute, payout,
and order workers remain remote-disabled.

## Scheduler

| Job | Schedule | Authentication | Last proof |
| --- | --- | --- | --- |
| `equina-storage-cleanup` | `*/5 * * * *` | Vault-held `STORAGE_AUTOMATION_SECRET` | Manual `pg_net` invocation returned HTTP 200 with zero failed jobs |

The scheduler secret is stored independently in Edge Function secrets and Supabase
Vault. It is not in source control, Expo configuration, Vercel client variables,
or documentation.

## Capability Response

The unauthenticated remote response is:

```json
{
  "version": "2026-07-29",
  "capabilities": {
    "auth": true,
    "accountSettings": false,
    "coachChat": false,
    "pushNotifications": false,
    "records": false,
    "horseManagement": false,
    "clubPublishing": false,
    "clubInteractions": false,
    "listingCreation": false,
    "messaging": false,
    "checkout": false
  }
}
```

An authenticated named internal user receives Horse and Records only when the
internal client build also enables the two compile-time switches.

## Web Client Delivery

| Item | State |
| --- | --- |
| Production alias | `https://equina-ten.vercel.app` |
| Deployment | `dpl_HkDJ3uWi5J3E3JqHPDLx5GDkVxHa`, Ready |
| Supabase client config | URL and publishable key only |
| Horse/Records compile switches | true; server named-user gate still required |
| All other privileged client switches | false |
| Demo fallback | false |
| Production bundle secret scan | zero server-secret markers |

Hosted Auth has email confirmation and secure password change enabled, with email
and recovery callbacks allowlisted for the native scheme, localhost, and production
web. Custom SMTP and CAPTCHA are still absent, so email delivery is not production
approved.

The EAS remote environment could not be listed because the local EAS CLI has no
authenticated Expo account/token. Local `eas.json` and `app.json` contain no
credential value, but the remote EAS environment remains an explicit audit blocker.

## Environment Separation

| Environment | Supabase | Client flags | Data |
| --- | --- | --- | --- |
| Local | Local CLI or linked internal project for explicit remote tests | Demo off; only target capability on | Synthetic only |
| Staging | **Required but not yet provisioned** | Internal distribution, named users | Synthetic and consented QA accounts |
| Production | Existing project only after staging promotion is established | Default off, gradual overrides | Real users |

Promotion must be migration by migration and function by function. Never copy a
database password, service key, automation secret, provider secret, or private
Storage object between environments.

## Emergency Rollback

1. Disable the client compile-time switch and clear the named database override.
2. Stop the matching cron job or provider traffic.
3. Preserve rows and cleanup queues; do not edit or remove an applied migration.
4. For an upload incident, remove `complete-upload` only after flags are disabled.
5. Rotate the affected server secret and inspect redacted logs/request IDs.
6. Ship an additive forward fix, rerun isolation and bundle scans, then restore one
   named internal user before any wider rollout.
