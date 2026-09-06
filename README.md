# Streamzone

Streamzone is a multi-streamer platform for interactive livestream chat experiences. It
will connect chat commands such as `!8ball` and `!ai` to bot-powered interactions across
streaming providers. The first foundation is a provider-neutral catalog of streamers,
their YouTube or Twitch sources, and the broadcasts discovered on those sources.

The server follows [hapipal](https://hapipal.com/) conventions and is composed by
`haute-couture`. Frontend pages are rendered with Hapi Vision and Handlebars. It uses [`schwifty`](https://github.com/hapipal/schwifty) for
Objection/Knex models and migrations and
[`schmervice`](https://github.com/hapipal/schmervice) for application services.

## Domain model

- A **streamer** is a creator hosted by Streamzone. It owns one or more sources.
- A **source** identifies the streamer's channel on a provider. YouTube and Twitch are
  accepted initially, while keeping provider-specific identifiers out of the streamer.
- A **stream** is a scheduled, live, or completed broadcast belonging to a source.
- A **command** is a streamer-specific, configurable text response with an enabled flag
  and cooldown setting. Chat connections and command execution are future layers.

The executable roadmap and future-agent handoff live in [`STREAMZONE_PLAN.md`](STREAMZONE_PLAN.md).
When asking an AI to “continue on the plan,” that document defines how it selects work
and records its progress.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm start
```

The service listens on `http://localhost:3000` by default. On startup, Schwifty creates
and migrates `streamzone.sqlite`. Override the defaults with `HOST`, `PORT`, and
`DATABASE_FILE` environment variables.

## API

The home page and live-stream catalog are public. Create an account at `/register` or
sign in at `/login` to access the creator dashboard at `/dashboard`. Authentication uses
an HTTP-only, same-site cookie backed by a revocable, seven-day database session;
passwords are salted and hashed with scrypt. Set a strong `COOKIE_PASSWORD` in deployed
environments. Mutating API routes require an authenticated session, while the catalog
`GET` routes remain public.

Creating a streamer atomically creates an `owner` membership for the authenticated
caller. The response contains both records as `{ "streamer": {...}, "membership":
{...} }`.

### Assigning owners to legacy streamers

Migration `004` intentionally does not guess owners for streamer rows that existed
before memberships were introduced. An unowned streamer remains visible through the
public catalog, but all tenant-scoped reads and mutations are denied because no user
has a membership.

An administrator must prepare a reviewed, deterministic JSON mapping using database
IDs and run the bootstrap command after migrations have completed:

```json
[
  { "streamerId": 1, "userId": 12 },
  { "streamerId": 2, "userId": 19 }
]
```

```sh
DATABASE_FILE=/path/to/streamzone.sqlite npm run bootstrap:owners -- owners.json
```

The command applies the complete mapping in one transaction. It rejects missing users
or streamers, duplicate streamer mappings, and streamers that already have any
membership, rather than overwriting or inferring ownership. A failure rolls back every
assignment so the mapping can be corrected and rerun.

Register a streamer and one of their channels:

```sh
curl -X POST http://localhost:3000/streamers \
  -H 'content-type: application/json' \
  -d '{"slug":"example-creator","displayName":"Example Creator"}'

curl -X POST http://localhost:3000/streamers/1/sources \
  -H 'content-type: application/json' \
  -d '{"provider":"youtube","channelId":"UC_example"}'
```

Track a broadcast and list currently live streams:

```sh
curl -X POST http://localhost:3000/streams \
  -H 'content-type: application/json' \
  -d '{"sourceId":1,"externalId":"video-id","title":"Friday stream","status":"live"}'

curl 'http://localhost:3000/streams?status=live'
```

`GET /streamers` returns each hosted streamer with their configured sources. `GET
/streams` returns streams with their source and streamer, and optionally accepts a
`status` query filter.

Configure a text command for a streamer (authenticated requests require the session
cookie obtained from login):

```sh
curl -X POST http://localhost:3000/streamers/1/commands \
  -H 'content-type: application/json' \
  -d '{"name":"hello","responseTemplate":"Welcome, {{user}}!","cooldownSeconds":10}'

curl --cookie 'streamzone-session=YOUR_SESSION_COOKIE' \
  http://localhost:3000/streamers/1/commands
```

Use `PATCH` or `DELETE` on `/streamers/{streamerId}/commands/{commandId}` to manage an
existing command. The authenticated `GET` endpoint returns enabled commands only; pass
`includeDisabled=true` when a management client needs the complete configuration.

## Project layout

- `server/manifest.js` registers Schwifty, Schmervice, and the application plugin.
- `lib/index.js` asks haute-couture to discover and compose app components.
- `lib/models/` defines streamers, provider sources, streams, and their relationships.
- `lib/models/command.js` defines per-streamer command configuration.
- `lib/services/streaming-service.js` owns database operations for the streaming domain.
- `lib/services/auth-service.js` owns password verification and revocable sessions.
- `lib/routes/streaming.js` exposes the initial management API.
- `lib/routes/web.js` serves the public site, account flow, and dashboard with Vision.
- `migrations/` contains the relational database schema.

Run checks with `npm test` and `npm run test:syntax`.
