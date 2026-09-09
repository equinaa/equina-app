# Equina Checkout Activation Checklist

Current state: **disabled**. Supported seller countries: **none**. Supported buyer
countries: **none**. `shopTransactions` remains false in both client and database
rollout layers.

Equina may browse listings worldwide, but it must not accept payment until every
item below has an accountable owner and staging evidence.

## Commercial Model

- [ ] Choose and document the Stripe Connect account model.
- [ ] Confirm whether charges use destination charges or separate charges and
      transfers for each seller country.
- [ ] Describe the flow as protected marketplace payment, never licensed escrow.
- [ ] Approve take rate, protection fee, refunds, chargebacks, negative balances,
      payout timing, reserves, and reconciliation ownership.

## Country And Currency Matrix

- [ ] List each supported seller country with Connect availability and KYC rules.
- [ ] List each supported buyer country and cross-border route.
- [ ] Approve presentment and settlement currencies per route.
- [ ] Prove no prohibited cross-border transfer or unsupported currency conversion.
- [ ] Define country/currency fail-closed behavior in quote and checkout functions.

## Seller And Listing Readiness

- [ ] Seller identity, beneficial owner, payout account, sanctions, and capability
      checks pass before a listing can transact.
- [ ] Restricted products policy covers damaged helmets, unsafe tack, counterfeit
      goods, recalled products, medicine, and prohibited transport equipment.
- [ ] High-value authenticity and ownership evidence rules are approved.

## Shipping, Returns, And Disputes

- [ ] Shipping provider, tracking webhooks, loss/damage ownership, and high-value
      insurance are contracted per route.
- [ ] Inspection period, misrepresentation evidence, return labels, deadlines,
      partial refunds, and item-return confirmation are legally reviewed.
- [ ] Manual support and escalation ownership exists for disputes and fraud.

## Tax And Legal

- [ ] VAT/OSS, deemed-supplier analysis, invoices, marketplace reporting, and tax
      quote ownership are approved per seller type and route.
- [ ] Marketplace terms, privacy terms, prohibited goods, retention, consumer
      cancellation rights, and seller business/private status are localized.
- [ ] Finance and legal approve reconciliation and record retention.

## Technical Proof

- [ ] Stripe test accounts cover every country/account model.
- [ ] Webhook signatures, replay, idempotency, out-of-order delivery, and provider
      timeout pass.
- [ ] Payment intent, order, transfer, refund, dispute, and listing states reconcile
      after deliberate drift.
- [ ] Order workers use durable claims, lease tokens, stale recovery, and idempotent
      provider operations.
- [ ] Alerts exist for webhook failures, payment drift, transfer failures, reserves,
      refunds, chargebacks, and negative balances.
- [ ] Two users and an unauthorized third user pass the staging matrix on iOS and
      Android.

Only after all checks pass may one named internal route be enabled. Country expansion
is a new approval, not a percentage rollout.

