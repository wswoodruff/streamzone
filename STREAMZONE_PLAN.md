# Streamzone delivery plan

This file is the durable handoff for humans and future AI agents. It records both the
product direction and the next executable work. Keep it accurate as the repository
changes; do not treat it as a speculative wish list.

## Instruction for future AI agents

When the user says **“continue on the plan”** (or equivalent):

1. Read this entire file, `README.md`, any applicable `AGENTS.md`, and the current git
   status before changing code.
2. Reconcile this document with the code. Never assume an item is complete solely
   because it is checked here.
3. Take the first unchecked item in **Ready queue** whose prerequisites are met. Deliver
   the smallest end-to-end, tested increment; do not start several roadmap items.
4. Preserve provider-neutral domain boundaries. Provider adapters translate Twitch or
   YouTube events into internal events; command behavior must not depend directly on a
   provider payload.
5. Add or update automated tests and user-facing documentation with the implementation.
6. Before finishing, update this file in the same change:
   - check completed work and add the completion date;
   - revise **Current state**, **Decisions**, risks, and the Ready queue when reality changed;
   - append a concise entry to **Progress log** with files/features and validation run;
   - leave one clearly actionable next item at the top of the queue.
7. Do not mark an item complete when tests are failing. Record an external blocker in
   the progress log and leave the item unchecked instead.

## Product goal

Build a dependable multi-tenant service where each streamer can configure rich chat
commands once and run them consistently across streaming providers. Configuration must
be pleasant for creators, execution must be safe under chat-scale load, and provider,
AI, and response-delivery concerns must remain replaceable.

## Current state

- Hapi serves public stream data and an authenticated, tenant-scoped creator dashboard.
- SQLite/Objection models cover users, sessions, streamers, provider sources, streams,
  per-streamer text commands, memberships, and invitations. Database tables use the
  models' singular PascalCase names.
- Command configuration now has authenticated list/create/update/delete endpoints. The
  listing hides disabled commands unless requested. A provider-neutral runtime contract
  and composable execution pipeline exist; provider ingestion and concrete production
  stage integrations are not connected yet.
- Membership roles and centralized capabilities protect management reads and writes;
  invitations provide the membership onboarding path and streamer creation establishes
  its creator as an owner atomically.
- Audience identity and Streamzone-owned stream sessions are defined below but are not
  implemented yet. Provider adapters and execution/accounting must wait for those
  stable scopes.
- The UI does not yet expose streamer, source, stream, or command configuration forms.

## Account, audience, and session definitions

These concepts must remain separate in schema, services, and authorization checks:

- **User** — a registered Streamzone web account that authenticates to the site. The
  existing `lib/models/user.js` remains the registered web-account model. A `User` is
  not automatically a chat audience identity.
- **StreamerMembership** — the creator-team RBAC association from a `User` to a
  `Streamer`, carrying an `owner`, `admin`, `editor`, or `viewer` role. The existing
  `lib/models/streamer-membership.js` remains creator-team RBAC and the sole source of
  tenant dashboard capabilities.
- **ChatUser** — the provider-neutral audience entity used for participation and usage
  accounting. It may own several `ChatIdentity` records and need not be linked to a
  registered `User`; any optional account link must confer no authorization by itself.
- **ChatIdentity** — a provider-scoped account owned by one `ChatUser`, uniquely keyed
  by `(provider, providerUserId)`. Provider display name, handle, and avatar are mutable
  attributes and must not be used as durable keys.
- **ChannelRelationship** — the latest provider-reported relationship between a
  `ChatIdentity` and a `Source`, including applicable broadcaster, moderator,
  subscriber/member, follower, and blocked state plus observed/provider timestamps.
  It supplies chat-policy context only and is not an RBAC membership.
- **StreamSession** — a Streamzone-owned interaction/accounting window belonging to one
  `Streamer`. It can associate one or more provider `Stream` records and scopes runtime
  cooldowns, budgets, usage, participants, and audit outcomes independently of provider
  reconnects or changing broadcast identifiers.
- **Participant** — the unique `(streamSessionId, chatUserId)` association. It holds
  session-local first/last activity and aggregate usage/state; provider account facts
  remain on `ChatIdentity` and channel status remains on `ChannelRelationship`.

Dashboard authorization is derived only from an authenticated `User` and that user's
`StreamerMembership`. Provider subscription or channel-member status must never grant
dashboard authorization. Neither linking a `ChatUser` to a `User` nor broadcaster,
moderator, subscriber/member, follower, participant, or other provider status may
create or imply a `StreamerMembership`.

## Architecture direction

Use a pipeline with explicit contracts:

`provider adapter -> ChatMessage -> InteractionContext -> runtime stages -> InteractionOutcome + ChatResponse -> provider adapter`

The ordered runtime stages are deduplication, identity resolution, relationship refresh,
stream-session resolution, moderation, command matching, cooldowns, execution,
accounting, audit, and response delivery. Every stage accepts only provider-neutral
contracts and injected domain functions, so it is independently unit-testable without
installing Twitch or YouTube SDKs. Command matching must inspect `ChatMessage.text` and
enrich `InteractionContext`; it must never receive a provider event object.

Keep configuration (commands, permissions, templates), runtime state (cooldowns,
deduplication), and audit history separate. The current `Command` schema is deliberately
limited to deterministic text responses: it contains a name, response template, enabled
state, and cooldown settings. AI configuration, safety policy, accounting, and
conversation state must live outside `Command.responseTemplate` and the ordinary command
record.

Treat AI as a streamer-configured channel capability, not as a reward, a reward executor,
or a special kind of deterministic text command. A command such as `!ai` may be one
invocation surface that routes an interaction to the capability, but the command does not
own the AI feature or its state. Internally, preserve a provider-neutral executor boundary
so model providers remain replaceable; that executor is an implementation detail, not the
product model presented to streamers.

## Decisions

- A command belongs to exactly one streamer and its name is unique within that streamer.
- Persist command names without a leading `!`, normalized to lowercase. Provider adapters
  or the matcher own prefix parsing.
- Disabled commands are hidden from the authenticated listing by default; management
  clients can request them with `includeDisabled=true`.
- Cooldowns are configured in seconds, from `0` through one day. Runtime enforcement is
  keyed by an explicit `global`, `streamer`, `session`, or `participant` scope. The
  centralized key builder rejects missing scopes and identifiers; stages must not build
  cooldown strings ad hoc.
- Runtime completion is represented by one of the structured outcomes `ignored`,
  `cooldown`, `unauthorized`, `insufficient_points`, `accepted`, `fulfilled`, `failed`,
  or `refunded`. Audit and delivery consume these outcomes rather than provider results.
- Templates are stored as text but are not rendered yet. A future renderer must use an
  allowlist of variables and must escape output appropriate to the destination.
- Tenant authorization precedes provider credentials and live chat connections.
- Keep one route definition per file beneath a resource-oriented `lib/routes/`
  directory. Haute-couture discovers and composes those modules; route parity tests
  must protect the complete HTTP surface during organization changes.
- Use singular PascalCase table names matching model names (for example, `Streamer`,
  `StreamerMembership`, and `Command`) for every new table and migration.
- The role matrix is: viewers may read management data; editors additionally manage
  sources, streams, and commands; admins additionally manage memberships and
  invitations; owners additionally delete streamers and transfer ownership.
- A streamer must always retain at least one owner once ownership is established.
  Removing or demoting the final owner is forbidden; ownership transfer promotes an
  existing member and demotes the transferring owner atomically.
- For tenant-scoped resources, unauthenticated requests receive `401`, authenticated
  non-members receive `404` so resource existence is not disclosed across tenants, and
  members who lack a required capability receive `403`.
- Public catalog queries and management queries are separate service operations and
  routes. Public reads may include hosted streamers and live streams without membership
  data; management and dashboard reads require authentication and are scoped to the
  caller's memberships.
- Keep web accounts, creator-team authorization, audience identity, provider channel
  status, and per-session participation as separate concerns. In particular,
  `lib/models/user.js` remains the web-account model and
  `lib/models/streamer-membership.js` remains creator-team RBAC.
- A StreamSession, rather than a provider connection or provider broadcast identifier,
  is the accounting scope for participants, cooldown state, command/AI budgets, and
  execution audit outcomes.
- AI is configured per streamer as a channel capability. It is not modeled as a reward or
  reward executor, and its configuration, safety policy, accounting, and conversation
  state remain separate from deterministic `Command` records. Provider-neutral AI
  executors are an internal replaceability boundary only.

## Ready queue

Work in this order unless a documented prerequisite or user instruction changes it.
Completed prerequisites remain here to make the required execution order explicit.

- [x] **Refactor to one route per file with haute-couture.** Preserve route parity with
  composition tests while organizing route modules by resource. (2026-09-06)
- [x] **Use singular PascalCase table names.** Define the initial schema with names
  matching the models and cover fresh database creation with schema tests.
  (2026-09-06)
- [x] **Establish membership schema, role capabilities, and creator ownership.** Add
  owner/admin/editor/viewer memberships, centralized capabilities, atomic creator-owner
  creation for every new streamer. (2026-09-06)
- [x] **Enforce authorization across management routes and dashboard queries.** Scope
  all management reads and writes to memberships and cover same-tenant, cross-tenant,
  role, and dashboard isolation behavior. (2026-09-06)
- [x] **Add invitations and membership management endpoints.** Support invitation
  creation, listing, revocation, and acceptance plus role updates/removal while enforcing
  authority ordering and final-owner protection. (2026-09-06)
- [ ] **Add command management to the dashboard.** Provide accessible forms for create,
  edit, enable/disable, cooldown, and delete; include validation and empty/error states.
- [ ] **Establish provider-neutral audience identity.** Add `ChatUser`, `ChatIdentity`,
  and `ChannelRelationship` models/migrations and services with stable provider IDs,
  uniqueness and merge/link rules, mutable profile snapshots, and tests proving that
  audience or provider channel status cannot authorize dashboard access.
- [ ] **Establish StreamSession and Participant accounting scopes.** Add the
  Streamzone-owned session lifecycle, associate provider `Stream` records without using
  them as the runtime boundary, create unique session participants by `ChatUser`, and
  test reconnect, multi-provider, lifecycle, and tenant-isolation behavior.
- [ ] **Connect deterministic command execution to the normalized runtime.** Implement
  configurable matching and argument extraction against `ChatMessage`, safe allowlisted
  template rendering, output limits, and concrete service integrations for the existing
  provider-neutral pipeline.
- [ ] **Build the first provider adapter.** Choose Twitch or YouTube based on explicit
  product priority; isolate credentials, reconnect/backoff, event deduplication, and send
  limits behind an adapter interface.
- [ ] **Add execution audit and operational telemetry.** Persist bounded execution
  metadata without secrets or unnecessary chat content; add structured logs and metrics
  for latency, errors, rate limits, and command usage.
- [ ] **Add the streamer-configured AI channel feature.** Add per-streamer AI
  configuration, safety controls, budgets, conversation state, timeouts, fallbacks, and
  prompt-injection tests. Support invocation surfaces such as `!ai` without storing AI
  policy or state in `Command.responseTemplate`; keep the provider-neutral executor
  interface as an internal implementation boundary.

## Completed foundations

- [x] Provider-neutral streamer/source/stream catalog. (existing foundation)
- [x] Account registration, password hashing, and revocable cookie sessions. (existing foundation)
- [x] Per-streamer configurable text-command persistence and CRUD API. (2026-09-03)

## Quality gates

Every increment should keep these green:

- `npm test`
- `npm run test:syntax`

Add integration tests around authorization and database behavior before adding external
provider connections. Never log session tokens, provider credentials, full AI prompts,
or unredacted sensitive chat content.

## Progress log

- **2026-09-06 — Provider-neutral runtime boundary:** added validated `ChatMessage`,
  `ChatResponse`, `InteractionContext`, and structured `InteractionOutcome` contracts;
  an ordered, dependency-injected runtime pipeline and unit-testable stages; explicit
  cooldown scopes and centralized key construction; and command persistence/validation
  for cooldown scope. Validation: `npm test`, `npm run test:syntax`.

- **2026-09-03 — Command configuration foundation:** added the commands migration/model,
  streamer relationship, scoped service operations, authenticated mutation routes,
  enabled-command listing, unit coverage, and API documentation. Validation: `npm test`,
  `npm run test:syntax`.

## StreamSession compatibility rollout

Existing `Stream` rows intentionally retain a null `streamSessionId`. During the
compatibility period, reads and provider ingestion must support both grouped and
ungrouped occurrences; no migration should infer sessions from titles, timestamps, or
provider identifiers alone. New broadcasts should create or attach to an explicitly
owned session where the caller can identify that grouping safely. Historical rows may
be backfilled in small, auditable batches only when tenant, event, and provider identity
are unambiguous. Metrics should track the remaining null association rate. The nullable
column and dual-read behavior can be retired only after backfill review, provider retry
and duplicate handling is verified, and a release has observed no required legacy
writes.
