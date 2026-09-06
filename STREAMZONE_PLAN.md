# Streamzone delivery plan

This file is the durable handoff for humans and future AI agents. Reconcile it with the code before selecting work; do not treat checked boxes as a substitute for inspection.

## Product goal

Build a dependable multi-tenant service where each streamer can configure rich chat commands once and run them consistently across streaming providers. Keep provider, AI, accounting, and response-delivery concerns replaceable and provider-neutral.

## Current state

- Hapi serves public stream data and an authenticated, tenant-scoped creator dashboard using hapipal, Vision, and Handlebars.
- SQLite/Objection persistence is defined by one canonical greenfield migration. It directly creates the current auth, streaming, audience, StreamSession, participant, point/reward, instruction, and standalone AI schema without historical conversion or backfill steps.
- Every provider `Stream` belongs to exactly one same-tenant `StreamSession` from creation. Authenticated session list/create/update endpoints make that invariant operable for management clients and simulcasts.
- Command configuration has authenticated CRUD endpoints. Command chat authorization has one runtime/domain role set: `everyone`, `moderator`, `supermod`, and `owner`; application code does not import domain constants from migrations.
- Provider-neutral audience identity, channel relationships, participant scopes, point accounting, deterministic/manual rewards, and standalone streamer AI configuration/invocation records are implemented.
- AI is a standalone channel capability keyed by streamer. `AiInvocation` is the AI execution/accounting record; reward-scoped AI does not exist in the current architecture.
- The dashboard does not yet expose command management forms; that is the next frontend/testability milestone.

## Core decisions

- A command belongs to exactly one streamer and its normalized name is unique within that streamer.
- Command chat roles are exactly `everyone`, `moderator`, `supermod`, and `owner`, sourced from `lib/runtime/chat-roles.js`.
- Cooldowns use explicit `global`, `streamer`, `session`, or `participant` scope.
- Dashboard authorization derives only from authenticated `User` plus `StreamerMembership`; audience/provider relationships never grant creator-team access.
- A `StreamSession` is Streamzone's accounting/runtime window. Every provider `Stream` is assigned to one same-tenant session at creation, and that association is not a nullable compatibility state or an update-time migration mechanism.
- Rewards support `deterministicBot` and `manual` fulfillment only. `RewardExecutorConfiguration` remains for deterministic reward executor configuration.
- AI is configured per streamer as a channel capability. It is not a reward, reward executor, or legacy fulfillment type.
- This pre-v1 repository has one canonical `migrations/001-initial-schema.js`; do not reintroduce historical upgrade, conversion, dual-read, backfill, or compatibility migrations without an actual deployed-data requirement.

## Runtime direction

Use the provider-neutral pipeline:

`provider adapter -> ChatMessage -> InteractionContext -> runtime stages -> InteractionOutcome + ChatResponse -> provider adapter`

Keep configuration, runtime state, accounting, and audit history separate. Provider adapters translate provider payloads into internal contracts and must not leak Twitch/YouTube event shapes into command execution.

## Ready queue

Work in this order unless a documented prerequisite or explicit user instruction changes it.

- [x] Route composition with one route per file and parity tests. (2026-09-06)
- [x] Membership schema, role capabilities, creator ownership, invitations, and tenant isolation. (2026-09-06)
- [x] Provider-neutral audience identity and participant accounting scopes. (2026-09-06)
- [x] **Greenfield schema + legacy purge.** Collapse historical migrations into one canonical schema; remove reward-scoped AI; require explicit StreamSession ownership; remove runtime imports from migrations; rebuild fresh-schema tests. (2026-09-06)
- [ ] **Add command management to the dashboard.** Provide accessible create/edit/enable-disable/delete forms with cooldown and required chat-role controls, validation/empty/error states, and route-level integration testability.
- [ ] **Connect deterministic command execution to the normalized runtime.** Implement configurable matching/arguments, safe allowlisted template rendering, output limits, and concrete service integrations.
- [ ] **Build the first provider adapter.** Choose Twitch or YouTube based on product priority; isolate credentials, reconnect/backoff, event deduplication, and send limits.
- [ ] **Add execution audit and operational telemetry.** Persist bounded execution metadata and add structured logs/metrics without secrets or unnecessary chat content.
- [ ] **Complete production AI channel configuration.** Build provider configuration, safety controls, budgets, conversation state, timeouts, and prompt-injection coverage around the existing streamer-scoped configuration and `AiInvocation` foundation.

## Quality gates

Keep these green for every increment:

```sh
npm install
npm test
npm run test:syntax
```

Also boot `npm start` against a fresh SQLite database. Never log session tokens, provider credentials, full AI prompts, or unredacted sensitive chat content.

## Progress log

- **2026-09-06 — Greenfield schema and legacy purge:** replaced the historical migration chain with one canonical initial schema; removed reward-scoped AI schema/execution paths; made provider streams require an explicit same-tenant StreamSession; added minimal session management endpoints; centralized command chat roles in runtime domain code; rebuilt fresh-schema/session/reward coverage; and removed legacy migration/session assumptions from the local test console and documentation. Next milestone: dashboard command management and its testability surface.
