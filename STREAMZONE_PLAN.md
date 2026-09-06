# Streamzone delivery plan

This file is the durable handoff for the remaining pre-v1 work. Treat the repository as the source of truth and reconcile this plan with the current branch before starting a milestone.

## Product goal

Build a dependable multi-tenant service where streamers configure commands and channel features once and run them consistently across streaming providers. Provider transport, normalized runtime execution, accounting, AI, audit, and response delivery should remain explicit replaceable boundaries.

## Implemented baseline

- Hapi/hapipal serves public routes and authenticated creator management through Vision/Handlebars.
- `User` plus `StreamerMembership` provides tenant-scoped dashboard authorization with `viewer`, `editor`, `admin`, and `owner` capabilities.
- The owner-management UI covers team/invitations, rewards and points, standalone AI configuration/instructions, command CRUD, and stream/source/session management.
- The fresh-deployment relational schema is defined in `migrations/001-initial-schema.js`.
- Provider-neutral audience identity, channel relationships, streamer/session participation, activity accounting, point balances/ledger entries, and rewards persistence/services are present.
- Standalone AI persistence and services are present through `AiFeatureConfiguration`, streamer instruction versions, and `AiInvocation`.
- Every provider `Stream` is created inside one same-streamer `StreamSession`; simulcast streams share the StreamSession while retaining separate provider/source records.
- Commands support normalized names, response templates, enable/disable state, cooldown seconds/scope, and chat roles `everyone`, `moderator`, `supermod`, and `owner`.
- `lib/runtime/` defines `ChatMessage`, `InteractionContext`, the ordered runtime pipeline, `InteractionOutcome`, `ChatResponse`, command authorization, and cooldown behavior.
- The local test console exercises provider-neutral chat services with deterministic identities/state and a mock AI provider.
- Playwright covers authenticated owner-management behavior on desktop/mobile and can emit review screenshots.
- GitHub Actions runs clean installs, unit tests, syntax checks, and Playwright behavioral coverage; screenshots are retained as non-blocking review artifacts.

## Architecture invariants

- Dashboard authorization comes only from authenticated `User` + `StreamerMembership`; audience/provider relationships do not grant management access.
- `Streamer` is the tenant boundary. Streamer-owned resources must be tenant-checked before mutation or disclosure.
- `Source` represents a provider channel. `Stream` represents one provider broadcast occurrence. `StreamSession` represents the Streamzone runtime/accounting window.
- Every `Stream` has a required `streamSessionId`, and its source and StreamSession belong to the same streamer.
- Provider adapters translate external events to/from the contracts in `lib/runtime/`; provider payload shapes do not enter command execution.
- The runtime stage order remains explicit: deduplication, identity resolution, relationship refresh, StreamSession resolution, moderation, command matching, command authorization, cooldowns, execution, accounting, audit, and response delivery.
- Durable StreamSession state and high-volume runtime state remain separate abstractions.
- Rewards use `deterministicBot` or `manual` fulfillment through the reward domain.
- Standalone AI is configured through `AiFeatureConfiguration`, executed through `AiInvocation`, and versioned streamer instructions remain its own lifecycle.
- Management roles and command chat roles are separate authorization systems.

## Ready Queue

Work in this order unless an explicit product decision changes a prerequisite.

1. **First production provider adapter** — implement one real Twitch or YouTube adapter with credential isolation, connection lifecycle, reconnect/backoff, outbound send limits, and a narrow provider-neutral interface.
2. **Provider chat ingestion** — consume provider chat events, normalize them to `ChatMessage`, enforce provider-event idempotency/deduplication, resolve identities/relationships, and bind messages to the active StreamSession.
3. **Normalized runtime execution** — wire persisted commands into the existing runtime pipeline with command matching/arguments, safe allowlisted template rendering, output limits, concrete cooldown/runtime-state integration, and provider-neutral `ChatResponse` delivery.
4. **Telemetry and audit** — implement the audit stage and structured operational telemetry for ingestion/execution/delivery outcomes with bounded metadata, correlation IDs, latency/error metrics, and secret/content redaction.
5. **Production AI provider integration** — install a real provider behind the existing AI provider boundary and finish production controls for credentials, budgets, safety, timeouts, prompt-injection resistance, output limits, and failure accounting.
6. **Production deployment hardening** — define deployment topology and persistent infrastructure, externalize runtime state as needed, add health/readiness checks, secret management, database backup/restore strategy, observability, and release/rollback procedures.

## Milestone boundary

The next meaningful product milestone is one provider completing the full chat loop:

`provider event -> ChatMessage -> InteractionContext/runtime stages -> InteractionOutcome + ChatResponse -> provider send`

That milestone should use the existing management configuration and StreamSession/accounting model rather than introducing provider-specific execution paths.

## Quality gates

Keep these green for every increment:

```sh
npm ci
npm test
npm run test:syntax
npm run test:e2e
```

For UI-affecting work, also run:

```sh
npm run ui:capture
```

Screenshot capture is for review and artifact retention; behavioral assertions remain the blocking browser gate.

When runtime/server wiring changes, also boot `npm start` against a fresh SQLite database and exercise the affected management or test-console flow. Do not log session tokens, provider credentials, full AI prompts, or unredacted sensitive chat content.
