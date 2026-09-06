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

Public catalog reads and authenticated management reads are deliberately separate.
Public queries expose hosted streamers and streams without consulting or returning
membership data. Management endpoints and dashboard queries instead scope results to
the signed-in user's streamer memberships. For tenant-scoped resources, a signed-out
request receives `401`; a signed-in non-member receives `404` (so tenant existence is
not disclosed); and a member whose role lacks the capability receives `403`.

### Membership roles

| Role | Management reads | Sources, streams, commands | Memberships and invitations | Delete streamer | Transfer ownership |
| --- | --- | --- | --- | --- | --- |
| `viewer` | Yes | No | No | No | No |
| `editor` | Yes | Yes | No | No | No |
| `admin` | Yes | Yes | Yes | No | No |
| `owner` | Yes | Yes | Yes | Yes | Yes |

Admins may manage only roles below their own authority; owners may manage every role.
After ownership has been established, every streamer must retain at least one owner, so
the final owner cannot be removed or demoted. Ownership transfer promotes an existing
member to owner and demotes the transferring owner to admin in one transaction.

Creating a streamer atomically creates an `owner` membership for the authenticated
caller. The response contains both records as `{ "streamer": {...}, "membership":
{...} }`.

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
- `lib/routes/` groups routes by resource, with exactly one route definition per file;
  haute-couture discovers these modules and route-composition tests guard HTTP parity.
- `lib/models/` defines streamers, provider sources, streams, and their relationships.
- `lib/models/command.js` defines per-streamer command configuration.
- `lib/services/streaming-service.js` owns database operations for the streaming domain.
- `lib/services/auth-service.js` owns password verification and revocable sessions.
- `lib/routes/commands/`, `invitations/`, `memberships/`, `sources/`, `streamers/`, and
  `streams/` expose the management API; `lib/routes/web/` serves pages and account flow.
- `migrations/` contains the relational database schema. Tables use singular PascalCase
  names matching their models, such as `User`, `Streamer`, `StreamerMembership`, and
  `Command`; new models and migrations must follow the same convention.

Run checks with `npm test` and `npm run test:syntax`.
