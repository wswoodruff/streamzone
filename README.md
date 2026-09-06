# Streamzone

Streamzone is a multi-streamer platform for interactive livestream chat experiences. It connects provider-neutral chat commands and standalone channel features such as `!ai` to bot-powered interactions across streaming providers. The server uses Hapi, hapipal, Vision/Handlebars, Schwifty/Objection/Knex, and Schmervice.

## Domain model

- A **streamer** is a creator hosted by Streamzone and owns provider **sources**.
- A **StreamSession** is a Streamzone-owned interaction/accounting window for one streamer. It may encompass multiple provider streams for a simulcast.
- A **stream** is a provider broadcast. Every stream belongs to exactly one same-tenant `StreamSession` from creation; there is no ungrouped compatibility state.
- A **command** is a streamer-specific deterministic text response with cooldown and chat-role configuration. Command chat roles are `everyone`, `moderator`, `supermod`, and `owner`.
- **AI** is a standalone streamer/channel capability configured by `AiFeatureConfiguration`. `AiInvocation` is its execution/accounting record. AI is not a reward fulfillment type or reward executor.
- A **reward** is fulfilled either by the deterministic bot executor or manually. `RewardExecutorConfiguration` stores deterministic executor details only.

Web accounts and audience identities are separate concerns: `User` plus `StreamerMembership` is the creator-dashboard authorization boundary; `ChatUser`, `ChatIdentity`, `ChannelRelationship`, `StreamerParticipant`, and `StreamSessionParticipant` describe livestream audience identity and participation and never grant dashboard access.

The executable roadmap and future-agent handoff live in [`STREAMZONE_PLAN.md`](STREAMZONE_PLAN.md).

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm start
```

The service listens on `http://localhost:3000` by default. On startup, Schwifty creates and migrates `streamzone.sqlite` from the single canonical greenfield migration. Override defaults with `HOST`, `PORT`, and `DATABASE_FILE`.

Run validation with:

```sh
npm test
npm run test:syntax
```

## Authentication and authorization

Create an account at `/register` or sign in at `/login` to access `/dashboard`. Mutating management routes require the authenticated session cookie. Public catalog reads and authenticated management reads are deliberately separate.

Membership roles are `viewer`, `editor`, `admin`, and `owner`. Viewers may read management data; editors additionally manage sources, streams/sessions, commands, and rewards; admins additionally manage memberships and invitations; owners additionally delete streamers and transfer ownership. Tenant-scoped resources return `404` to authenticated non-members and `403` to members lacking the required capability.

## Streams and sessions

Create the Streamzone session first, then create each provider broadcast inside it. A simulcast uses the same `streamSessionId` for one stream per source:

```sh
curl -X POST http://localhost:3000/streamers/1/stream-sessions \
  -H 'content-type: application/json' \
  -d '{"title":"Friday stream","status":"scheduled"}'

curl -X POST http://localhost:3000/streams \
  -H 'content-type: application/json' \
  -d '{"sourceId":1,"streamSessionId":1,"externalId":"video-id","title":"Friday stream","status":"scheduled"}'
```

Authenticated management clients can list sessions with `GET /streamers/{streamerId}/stream-sessions` and update lifecycle state with `PATCH /streamers/{streamerId}/stream-sessions/{streamSessionId}`. Session association is immutable on the stream update surface.

## Commands

Configure a command for a streamer:

```sh
curl -X POST http://localhost:3000/streamers/1/commands \
  -H 'content-type: application/json' \
  -d '{"name":"hello","responseTemplate":"Welcome, {{user}}!","cooldownSeconds":10,"requiredChatRole":"everyone"}'
```

Use `PATCH` or `DELETE` on `/streamers/{streamerId}/commands/{commandId}`. The authenticated list hides disabled commands by default; management clients can request `includeDisabled=true`.

## Session and runtime state

Durable interaction state is accessed through `StreamSessionStateService`, keyed by `(streamSessionId, namespace, key)`. Runtime cooldowns and high-volume deduplication use the separate `RuntimeState` interface. Both are scoped to the explicit StreamSession lifecycle rather than provider reconnects or legacy stream rows.

## Project layout

- `server/manifest.js` registers Schwifty, Schmervice, Hapi Cookie, Vision, and the application plugin.
- `lib/index.js` asks haute-couture to discover and compose app components.
- `lib/routes/` groups one route definition per file by resource.
- `lib/models/` defines the current auth, streaming, audience, economy, rewards, instruction, and standalone AI persistence model.
- `lib/runtime/chat-roles.js` is the runtime/domain source of truth for command chat roles. Application code does not import constants from migrations.
- `lib/services/streaming-service.js` owns streamer/source/StreamSession/stream operations and session lifecycle reconciliation.
- `migrations/001-initial-schema.js` is the complete relational schema for a fresh pre-v1 deployment. There are no historical conversion, backfill, or compatibility migrations.
