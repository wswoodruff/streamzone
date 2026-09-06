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

The host listens on `127.0.0.1:3010` by default and registers its `__test-console` routes only in the console host process. The normal `npm start` server does not expose them.

## Client setup

Each terminal prompts for a provider stream, an existing provider `ChatIdentity` or new username, optional channel relationships, and a simulated command access role (`everyone`, `moderator`, `supermod`, or `owner`). Every provider stream already belongs to exactly one `StreamSession`; the console does not synthesize missing sessions or repair incomplete stream records.

Create the streamer, `StreamSession`, source, and provider stream through the normal application/API before attaching the console.

After setup the terminal acts like one simulated chat client. Enter messages such as `!hello world` or `!ai explain this in one sentence`.

## Console commands

- `/help` — show console commands.
- `/state` — show the selected stream, session, chat identity, point balance, and AI configuration.
- `/balance` — show the current channel-point balance.
- `/points N` — credit or debit test points.
- `/ai` — configure the selected streamer's standalone AI channel feature for local testing.
- `/switch` — choose another stream/user for this terminal.
- `/quit` — exit the client.

The console AI provider is deliberately a deterministic mock. It exercises prompt composition, standalone `AiFeatureConfiguration`, `AiInvocation`, point reservation/settlement, cooldowns, and response delivery without making an external model request.

## Standalone AI flow

The console's `/ai` command configures `AiFeatureConfiguration` for the selected streamer and publishes or uses a streamer AI instruction version. Invoking `!ai` goes through `AiFeatureService` and `AiInvocation`, with point reservation and settlement handled by the shared point economy.
