# Streamzone

Streamzone is a pre-v1 multi-tenant platform for interactive livestream chat experiences. The application keeps provider-specific chat transport outside the domain/runtime layer so commands, rewards, and points can operate against the same internal contracts across streaming providers. Standalone AI uses those provider-neutral contracts as an independent channel feature.

The server uses Hapi and hapipal, Vision/Handlebars for server-rendered management UI, Schwifty/Objection/Knex with SQLite for local persistence, Schmervice for application services, and Hapi Cookie for authenticated web sessions.

The remaining delivery roadmap lives in [`STREAMZONE_PLAN.md`](STREAMZONE_PLAN.md).

## Current architecture

- `User` and `StreamerMembership` define authenticated creator-team access. Dashboard roles are `viewer`, `editor`, `admin`, and `owner`.
- `ChatUser`, `ChatIdentity`, `ChannelRelationship`, `StreamerParticipant`, and `StreamSessionParticipant` represent livestream audience identity and participation. Audience/provider relationships never grant dashboard access.
- A `Streamer` owns provider `Source` records. A `Source` identifies a channel on Twitch or YouTube.
- A `StreamSession` is the Streamzone-owned runtime/accounting window for one streamer. A provider `Stream` is one broadcast occurrence on one `Source`, and every `Stream` belongs to exactly one same-streamer `StreamSession`.
- Commands are streamer-scoped deterministic command definitions with response templates, cooldowns, and required chat roles (`everyone`, `moderator`, `supermod`, `owner`).
- `lib/runtime/` defines the provider-neutral `ChatMessage`, `InteractionContext`, ordered runtime stages, `InteractionOutcome`, and `ChatResponse` contracts. Provider ingestion and concrete production execution are not yet wired end to end.
- Durable interaction state lives in `StreamSessionState`, while cooldown/deduplication state uses the replaceable `RuntimeState` interface. The default server uses an in-process runtime-state implementation.
- The point economy uses `PointAccount` and `PointLedgerEntry`. Rewards use deterministic-bot or manual fulfillment through `RewardDefinition`, `RewardExecutorConfiguration`, and `RewardRedemption`.
- Standalone AI uses `AiFeatureConfiguration`, versioned streamer instructions, and `AiInvocation`.
- `migrations/001-initial-schema.js` defines the complete relational schema for a fresh deployment.

## Local setup

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

The application listens on `http://localhost:3000` by default. Schwifty runs the schema migration at startup against `streamzone.sqlite`. Override the defaults with `HOST`, `PORT`, and `DATABASE_FILE`.

Create an account at `/register` or sign in at `/login`. Authenticated creator management starts at `/dashboard`.

Playwright also needs Chromium installed locally:

```sh
npx playwright install chromium
```

Run the local quality gates with:

```sh
npm test
npm run test:syntax
npm run test:e2e
```

Generate review screenshots separately with:

```sh
npm run ui:capture
```

## Owner dashboard

`/dashboard` is the authenticated server-rendered management shell. It exposes current streamer context plus command management, creator-team/invitation management, and rewards and points controls. Standalone AI configuration and streamer instruction workflows have their own management area.

Stream topology is managed at `/dashboard/stream-management`, where authorized users can manage `Source` records, `StreamSession` lifecycle, and provider `Stream` occurrences. The UI keeps StreamSession and provider-broadcast concepts distinct: create/select the Streamzone session, then attach one provider occurrence per source to that session.

Command management supports create, edit, enable/disable, and delete flows with cooldown scope and required-chat-role controls. Disabled commands remain visible to management so they can be re-enabled.

## Management authorization

Management authorization is capability-based and tenant-scoped:

| Role | Capabilities |
| --- | --- |
| `viewer` | Read management data. |
| `editor` | Viewer access plus manage sources, streams/sessions, commands, and rewards/fulfillment. Editors can also configure standalone AI and edit AI instruction drafts. |
| `admin` | Editor access plus manage memberships/invitations and publish AI instructions. |
| `owner` | Admin access plus delete the streamer and transfer ownership. |

Authenticated non-members receive tenant-hiding `404` responses for scoped resources; members without the required capability receive `403`.

These dashboard roles are separate from command chat roles. Command authorization uses `everyone`, `moderator`, `supermod`, and `owner` from `lib/runtime/chat-roles.js`.

## StreamSession model

A `StreamSession` is the durable Streamzone interaction window for a show/session and has `scheduled`, `live`, or `ended` lifecycle state. It can group multiple provider broadcasts for a simulcast.

A `Stream` is a provider occurrence and has its own provider-facing status. At creation it must reference both a `Source` and a `StreamSession`, and the source/session must belong to the same streamer. A session can contain at most one stream per source. The session association is not changed through the stream update surface.

Durable session-scoped application state is keyed by `(streamSessionId, namespace, key)` through `StreamSessionStateService`. High-volume deduplication and cooldown state remain behind `RuntimeState` so production infrastructure can replace the in-process implementation without changing command executors.

## Rewards and points

The point economy uses `PointAccount` for balances and `PointLedgerEntry` for auditable balance changes. Earning policies and participant activity are modeled separately from redemption.

`RewardDefinition` supports two fulfillment types: `deterministicBot` and `manual`. `RewardExecutorConfiguration` stores deterministic executor configuration, and `RewardRedemption` records the participant, point cost, StreamSession context, status, and failure/fulfillment lifecycle.

## Standalone AI

AI is a streamer-scoped channel feature configured by `AiFeatureConfiguration`. Configuration includes invocation command, provider/model identifiers, fixed point pricing, cooldowns, input/output limits, token limit, and timeout. Streamer instructions are versioned independently.

`AiInvocation` is the execution/accounting record for an AI request and ties an invocation to a streamer, StreamSession, chat identity/user, configuration version, instruction version, point reservation, and execution status.

The production server does not currently install a real AI provider. The local test console injects a deterministic mock provider so the standalone AI flow can be exercised without an external model request.

## Test console

The local test console exercises provider-neutral chat behavior against the normal services and database without a real streaming provider.

Start the host in one terminal:

```sh
npm run console:host
```

Then attach one or more simulated chat clients:

```sh
npm run console
```

The host binds to `127.0.0.1:3010` by default and exposes its test-only routes only in that process. See [`TEST_CONSOLE.md`](TEST_CONSOLE.md) for setup, simulated chat roles, point controls, and standalone AI testing.

## Playwright and CI

`npm run test:e2e` runs behavioral Chromium coverage from `e2e/dashboard.spec.js`. The harness boots the real Hapi application against a temporary SQLite database, seeds deterministic owner/management state, and authenticates through the real `/login` cookie-session flow. Desktop and mobile projects run with one worker for deterministic stateful behavior.

`npm run ui:capture` runs the separate screenshot spec and writes owner-dashboard and command-management screenshots to `artifacts/ui/`. These are review artifacts, not pixel-diff assertions.

GitHub Actions performs clean `npm ci` installs, unit tests, syntax checks, and Playwright behavior tests. Chromium browser binaries are cached by `package-lock.json`, while `playwright install --with-deps chromium` still ensures the matching browser and Linux system dependencies are present. Screenshot capture is non-blocking and uploaded with Playwright artifacts for review.

## Project layout

- `server/manifest.js` configures Hapi, Schwifty, Schmervice, Cookie, Inert, Vision, SQLite, migrations, and the default runtime-state implementation.
- `lib/index.js` uses haute-couture to discover and compose application components.
- `lib/routes/` contains resource and server-rendered web routes.
- `lib/services/` contains authorization, streaming, audience, economy, rewards, dashboard, and instruction services.
- Standalone AI services use their own `lib/services/ai-feature-service.js` and `lib/services/ai-invocation-service.js` boundaries.
- `lib/models/` contains the current persistence model.
- `lib/runtime/` contains provider-neutral interaction contracts and stages.
- `lib/runtime-state/` contains the replaceable runtime-state boundary and in-process implementation.
- `migrations/001-initial-schema.js` is the fresh-deployment relational schema.
- `tools/test-console/` contains the local provider-neutral chat harness.
- `e2e/` contains Playwright fixtures, the test server, behavior specs, and review screenshot capture.
