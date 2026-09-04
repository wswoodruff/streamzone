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

- Hapi serves public stream data and an authenticated creator dashboard.
- SQLite/Objection models cover users, sessions, streamers, provider sources, streams,
  and per-streamer text commands.
- Command configuration now has authenticated list/create/update/delete endpoints. The
  listing hides disabled commands unless requested. There is no chat ingestion or execution yet.
- Authentication exists, but users are not associated with streamers. Consequently,
  any authenticated user can currently mutate any streamer. This is the top security
  and product-model gap and must be resolved before external deployment.
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

## Ready queue

Work in this order unless a documented prerequisite or user instruction changes it.

- [ ] **Associate users with streamers and enforce tenant authorization.** Add a
  membership table with owner/admin/editor roles; centralize authorization; scope every
  mutating streamer, source, stream, and command operation; add cross-tenant denial tests
  and a migration path for existing rows.
- [ ] **Add command management to the dashboard.** Provide accessible forms for create,
  edit, enable/disable, cooldown, and delete; include validation and empty/error states.
- [ ] **Define normalized chat contracts and deterministic matching.** Add plain domain
  objects for messages/responses, configurable prefix parsing, case normalization, exact
  token matching, argument extraction, and unit tests without provider SDKs.
- [ ] **Implement runtime policy and text-template execution.** Enforce per-streamer and
  per-user cooldowns, safely render an allowlisted variable set, cap output lengths, and
  expose structured outcomes for ignored/rejected/executed messages.
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
