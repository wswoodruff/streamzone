# Streamzone test console

The test console is a local-only multi-terminal harness for exercising Streamzone's provider-neutral chat runtime against the normal application services and database.

## Start it

Terminal 1 owns the shared application/runtime process:

```sh
npm run console:host
```

Then open as many additional terminals as you want:

```sh
npm run console
```

The host listens on `127.0.0.1:3010` by default and registers its `__test-console` routes only in the console host process. The normal `npm start` server does not expose them. Override the port with `TEST_CONSOLE_PORT` or point a client at another host with `TEST_CONSOLE_URL`.

All clients attached to one host share the same application services, SQLite database, and in-process runtime state. That means deduplication and cooldown behavior is visible across terminals instead of being isolated per shell.

## Client setup

Each terminal prompts for:

1. A stream, shown in an autocomplete list with live streams first.
2. A `StreamSession` when the selected provider stream is not already attached to one. The console can create a temporary session.
3. An existing provider `ChatIdentity` or a new username/provider user ID.
4. Optional provider channel relationships such as follower, subscriber, moderator, VIP, or broadcaster.
5. A simulated command access role (`everyone`, `moderator`, `supermod`, or `owner`) so restricted commands can be exercised from separate terminals.

After setup the terminal acts like one simulated chat client. Enter messages such as:

```text
!hello world
!ai explain this in one sentence
```

## Console commands

- `/help` — show console commands.
- `/state` — show the selected stream, session, chat identity, point balance, and AI configuration.
- `/balance` — show the current channel-point balance.
- `/points N` — credit or debit test points (`/points 100`, `/points -25`).
- `/ai` — configure the selected streamer's standalone AI channel feature for local testing.
- `/switch` — choose another stream/user for this terminal.
- `/quit` — exit the client.

The console AI provider is deliberately a deterministic mock. It exercises prompt composition, standalone `AiFeatureConfiguration`, `AiInvocation`, point reservation/settlement, cooldowns, and response delivery without making an external model request.

## AI is not a reward

AI is a streamer-scoped channel capability. The console's `/ai` command writes `AiFeatureConfiguration` keyed directly by `streamerId` and publishes/uses a streamer AI instruction version. Invoking `!ai` goes through `AiFeatureService` and `AiInvocation`; it never creates a `RewardDefinition`, `RewardRedemption`, or reward executor record.

Legacy reward-scoped AI execution is intentionally disabled and migrated away from the active model. Ordinary rewards remain `deterministicBot` or `manual` fulfillment only.
