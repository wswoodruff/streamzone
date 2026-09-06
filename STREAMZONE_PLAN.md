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
  listing hides disabled commands unless requested. There is no chat ingestion or execution yet.
- Membership roles and centralized capabilities protect management reads and writes;
  invitations provide the membership onboarding path and streamer creation establishes
  its creator as an owner atomically.
- The UI does not yet expose streamer, source, stream, or command configuration forms.

## Architecture direction

Use a pipeline with explicit contracts:

`provider adapter -> normalized ChatMessage -> command matcher -> policy checks -> command executor -> normalized ChatResponse -> provider adapter`

Keep configuration (commands, permissions, templates), runtime state (cooldowns,
deduplication), and audit history separate. Start with deterministic text templates;
add AI-backed executors only after authorization, limits, and observability are in place.

## Decisions

- A command belongs to exactly one streamer and its name is unique within that streamer.
- Persist command names without a leading `!`, normalized to lowercase. Provider adapters
  or the matcher own prefix parsing.
- Disabled commands are hidden from the authenticated listing by default; management
  clients can request them with `includeDisabled=true`.
- Cooldowns are configured in seconds, from `0` through one day. Runtime enforcement is
  intentionally deferred until an execution pipeline exists.
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
- [ ] **Normalize chat contracts and implement runtime execution.** Add provider-neutral
  message/response objects, configurable deterministic matching, argument extraction,
  cooldown policy, safe allowlisted template rendering, output limits, and structured
  outcomes, all covered without provider SDKs.
- [ ] **Build the first provider adapter.** Choose Twitch or YouTube based on explicit
  product priority; isolate credentials, reconnect/backoff, event deduplication, and send
  limits behind an adapter interface.
- [ ] **Add execution audit and operational telemetry.** Persist bounded execution
  metadata without secrets or unnecessary chat content; add structured logs and metrics
  for latency, errors, rate limits, and command usage.
- [ ] **Add pluggable AI commands.** Introduce an executor interface, per-streamer model
  configuration, safety controls, budgets, timeouts, fallbacks, and prompt-injection tests.

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

- **2026-09-03 — Command configuration foundation:** added the commands migration/model,
  streamer relationship, scoped service operations, authenticated mutation routes,
  enabled-command listing, unit coverage, and API documentation. Validation: `npm test`,
  `npm run test:syntax`.
