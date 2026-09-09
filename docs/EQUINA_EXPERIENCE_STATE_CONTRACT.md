# Equina Experience State Contract

Every production route must implement the following states before its feature flag
can be enabled. Default copy lives in `src/ui/states/experience-states.ts`.

| State | Required behavior | Primary recovery |
| --- | --- | --- |
| Loading | Preserve layout dimensions and current context | automatic completion or cancel |
| Empty | Explain what belongs here without fake activity | one relevant create/import action |
| Error | State that the mutation did not complete | retry without duplicate submission |
| Offline | Keep saved data visible and queue only safe mutations | retry when connected |
| Permission denied | Explain why access is needed at action time | review system access or choose fallback |

## Mutation State Machine

`idle -> submitting -> success | error`

- `submitting` disables duplicate submission without changing control size;
- `success` names the persisted object and allows edit or undo where appropriate;
- `error` preserves the user's draft and provides retry;
- navigation Back never discards a draft without a confirmation;
- retry carries an idempotency key for payments, posts, uploads, and messages.

## Current Sprint Boundary

Sprint 0 defines these states and keeps backend-dependent actions read-only. Later
sprints implement them per route rather than inventing new patterns.

