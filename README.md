# Streamzone

Streamzone is a multi-streamer platform for interactive livestream chat experiences. It
will connect chat commands such as `!8ball` and `!ai` to bot-powered interactions across
streaming providers. The first foundation is a provider-neutral catalog of streamers,
their YouTube or Twitch sources, and the broadcasts discovered on those sources.

The server follows [hapipal](https://hapipal.com/) conventions and is composed by
`haute-couture`. It uses [`schwifty`](https://github.com/hapipal/schwifty) for
Objection/Knex models and migrations and
[`schmervice`](https://github.com/hapipal/schmervice) for application services.

## Domain model

- A **streamer** is a creator hosted by Streamzone. It owns one or more sources.
- A **source** identifies the streamer's channel on a provider. YouTube and Twitch are
  accepted initially, while keeping provider-specific identifiers out of the streamer.
- A **stream** is a scheduled, live, or completed broadcast belonging to a source.
- Commands, chat connections, and AI integrations are intentionally future layers built
  on top of this provider-neutral foundation.

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

## Project layout

- `server/manifest.js` registers Schwifty, Schmervice, and the application plugin.
- `lib/index.js` asks haute-couture to discover and compose app components.
- `lib/models/` defines streamers, provider sources, streams, and their relationships.
- `lib/services/streaming-service.js` owns database operations for the streaming domain.
- `lib/routes/streaming.js` exposes the initial management API.
- `migrations/` contains the relational database schema.

Run checks with `npm test` and `npm run test:syntax`.
