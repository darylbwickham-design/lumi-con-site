# Factory Live for Satisfactory

Factory Live lets viewers trigger persistent creature waves, impact-detonated Nobelisk drops, backpack shuffles, and a camera turn. It targets Satisfactory 1.2 with SML 3.12 and runs on the Windows player hosting the game. The same PC runs the bridge and Lumia Stream or Streamer.bot.

| Preset | Default event | Example chat command |
| --- | --- | --- |
| `hog-swarm` | 80 hogs over successive waves | `!hogs` |
| `alpha-hogs` | 12 alpha hogs | `!alphas` |
| `spitter-pack` | 24 forest spitters | `!spitters` |
| `stinger-pack` | 12 small Stingers | `!stingers` |
| `elite-stinger` | 1 Elite Stinger | `!elitestinger` |
| `hatcher-drop` | 1 Crab Hatcher nest | `!hatcher` |
| `nobelisk-rain` | 6 standard Nobelisks | `!nobelisk` |
| `pulse-rain` | 4 Pulse Nobelisks | `!pulse` |
| `gas-rain` | 3 Gas Nobelisks | `!gas` |
| `cluster-rain` | 5 Cluster Nobelisks | `!cluster` |
| `nuke-drop` | 1 Nuke Nobelisk | `!nuke` |
| `pack-shuffle` | Swap up to four pairs of occupied backpack slots | `!shuffle` |
| `turn-around` | Turn the host’s view 180° | `!turn` |

## Install the Windows Steam build

Keep Satisfactory Mod Loader 3.12 enabled in Satisfactory Mod Manager. Extract `FactoryLive_0.7.0_Windows.zip` into `FactoryGame/Mods/FactoryLive` inside the Satisfactory installation. The descriptor should be at `FactoryGame/Mods/FactoryLive/FactoryLive.uplugin`. Extract `FactoryLive_0.7.0_Bridge.zip` to a separate folder. Launch the game through SMM. Factory Live is a local plugin, and a searchable SMM listing requires a release on ficsit.app. [Manual install guide](https://docs.ficsit.app/satisfactory-modding/latest/ManualInstallDirections.html)

For a clean Factory Live test profile, keep **Mods On** and install only **Satisfactory Mod Loader** in SMM. For an unmodded launch, move the local `FactoryGame/Mods/FactoryLive` folder outside `Mods` before disabling SML. Restore the folder when SML is enabled again.

Nobelisks use the game's native blast, gas and fallout effects. Explosions can damage the player and remove destructible scenery. The effect targets the local pioneer, including listen-server hosts. This package targets the Steam Windows client.

## Build from source

The inner `FactoryLive` folder is the Unreal plugin source. For Satisfactory build CL517554, use the matching SML Starter Project revision, the Coffee Stain custom Unreal Engine 5.6.1 editor, and Wwise 2025.1.6.9117 with Unreal integration 2025.1.6.9117.4248. Follow the setup through opening `FactoryGame.uproject`. [Satisfactory modding setup](https://docs.ficsit.app/satisfactory-modding/latest/Development/BeginnersGuide/dependencies.html) · [Starter Project at CL517554](https://github.com/satisfactorymodding/SatisfactoryModLoader/tree/a7e855031811d39bbdd12fc2563b87ea2d80cb5f)

1. Copy the inner `FactoryLive` folder into the Starter Project's `Mods` folder. Confirm that `Mods/FactoryLive/FactoryLive.uplugin` exists.
2. Open the Starter Project, set your Satisfactory installation in Alpakit Dev Packaging Settings, and package **Factory Live** with **Copy to Game Path** enabled. Keep SML 3.12 enabled through Satisfactory Mod Manager and launch the game. Alpakit installs the local build directly into the game's `FactoryGame/Mods` folder. SMM manages the loader, and Satisfactory loads the local plugin from that folder. A published release on ficsit.app would let SMM install Factory Live from its mod list. [Alpakit and SMM setup](https://docs.ficsit.app/satisfactory-modding/latest/Development/BeginnersGuide/project_setup.html#_packaging_mods_with_alpakit)

## Run and control a session

Use Node.js 22 or later. In the outer `FactoryLive` folder, run:

```powershell
node bridge.mjs serve
```

After loading into a save and gaining control of your pioneer, use another terminal in the same folder:

```powershell
node bridge.mjs status
node bridge.mjs arm
node bridge.mjs trigger alpha-hogs
node bridge.mjs trigger cluster-rain
node bridge.mjs disarm
```

`status` shows game readiness, throttling, queue depth and the loaded save's mob totals in `game.mobs`. The `game.nobelisks` counts show primary launches, impacts that triggered detonation, expired drops, cancelled drops and drops still in flight. The `game.pending.cluster` count covers all queued Nobelisk types in the game. A successful trigger confirms entry into the bridge queue. The game log, under `%LOCALAPPDATA%\FactoryGame\Saved\Logs`, records job acceptance, completed spawns, timeouts and failures under `LogFactoryLive`.

`disarm` clears pending jobs and removes undetonated drops. Existing creatures remain in the world. A bomb already handed to the game's detonation logic can complete normally. The bridge starts disarmed and disarms again on a lost game heartbeat. Leaving a save or starting a new game requires arming again after it connects. The bridge creates separate local tokens in `%LOCALAPPDATA%\FactoryLive\link.json`.

## Backpack snapshots and viewer shuffle

Use a terminal in the bridge folder while the host pioneer is loaded and unpaused. The host can take a snapshot, restore or undo with the bridge disarmed.

```powershell
node bridge.mjs inventory snapshot
node bridge.mjs inventory status
node bridge.mjs inventory restore
node bridge.mjs inventory undo
```

- `snapshot` records the host’s main backpack slots, quantities and native item state. It replaces the previous snapshot.
- `restore` replaces the backpack with the snapshot. It keeps the contents you had immediately before the restore as a recovery copy. Items acquired after the snapshot are removed from the backpack during replacement.
- `undo` restores the recovery copy and captures the contents it replaced. `status` shows whether the loaded host has a snapshot or recovery copy and reports the last operation.

Save the game after taking a snapshot to retain it across reloads. Each save stores its own snapshot and recovery copy for its host. The commands handle the main backpack. Equipment slots, hotbars, storage containers and items on the ground are separate. Restore requires enough compatible backpack slots. The bridge reports the operation’s result after the game responds.

To let chat shuffle your backpack, bind `pack-shuffle` in Lumia or `!shuffle` in Streamer.bot. The game uses its normal stack swap operation for up to four pairs of compatible slots. The default cooldown is 45 seconds, and custom shuffle presets share a 20-second minimum. Snapshot, restore and undo are host controls authenticated by the local game token.

Use `turn-around` in Lumia or `!turn` in Streamer.bot to let chat turn the host’s view 180° while on foot. The default cooldown is 30 seconds. Turn Around and Backpack Shuffle share one pending player-action slot, and each effect gets its own shared 20-second minimum across aliases.

## Saved mobs and kills

Each Satisfactory save contains its own mob history. Living creatures use Satisfactory's native creature persistence, and the history records a stable ID, species, originating job and status for each spawn. The game records a kill when the creature dies. It shows `missing` when an actor disappears outside a death event or its saved reference fails to resolve.

In the host's game console, run `FactoryLive.Mobs` for totals and the latest 25 entries. Run `FactoryLive.Mobs 25` for the preceding 25. The `LogFactoryLiveMobs` game log also records each spawn and death.

Manual saves and autosaves capture the current creatures and their history. Loading an older save restores its own snapshot. Save after a fight to keep those kills on your next reload.

Crab Hatchers keep their last saved position, health, and kill record. An alive nest can reappear after reload once the host is within 120 m and terrain collision is available. The Hatcher record covers the nest itself. Its flying crabs are temporary actors managed by the game.

## Lumia Stream

Create a Lumia chat command, point redemption or alert and add an API action that sends a POST. Use these settings, substituting the `webhookToken` from `link.json` and the preset for that event. If you use Lumia's Custom JavaScript action, paste `integrations/lumia-action.txt` and replace its token and preset in the editor. [Lumia API action and Custom JavaScript reference](https://dev.lumiastream.com/docs/custom-code/custom-actions)

```text
POST http://127.0.0.1:37128/v1/trigger
Authorization: Bearer <webhookToken>
Content-Type: application/json

{"preset":"cluster-rain"}
```

Use one action per effect. For example, bind `hog-swarm` to a chat command, `cluster-rain` to a reward and `spitter-pack` to a raid alert. Leave the chat text and user input out of the JSON body and set the fixed preset in the action.

## Streamer.bot

**WebSocket for chat and Twitch rewards.** In **Servers/Clients → WebSocket Server**, start the loopback server. Create the chat commands under **Commands** with the platform, permissions and cooldowns you want. Make a copy of `bridge.config.json` as `bridge.local.json`, set `streamerBot.enabled` to `true`, and set the URL to your WebSocket endpoint. The `commands` object maps literal command strings to presets. The `rewards` object maps Twitch custom reward IDs to presets, for example `{ "a-reward-id": "cluster-rain" }`. [Streamer.bot commands](https://docs.streamer.bot/guide/commands) · [WebSocket configuration](https://docs.streamer.bot/api/websocket/guide/configuration)

If Streamer.bot's WebSocket authentication is enabled, set `FACTORYLIVE_STREAMERBOT_PASSWORD` in the PowerShell session before starting the bridge:

```powershell
$env:FACTORYLIVE_STREAMERBOT_PASSWORD = Read-Host "Streamer.bot WebSocket password" -MaskInput
node bridge.mjs serve bridge.local.json
```

**Webhook for other triggers.** For a sub, cheer, tip, hotkey or any other action, add **Core → C# → Execute C# Code** and paste `integrations/StreamerBotWebhook.cs`. Set the `Preset` string at the top. The code reads the webhook token on the same PC and returns `factoryLiveStatus` and `factoryLiveResult` to the action. Enable the `System.Net.Http` and Newtonsoft.Json references in the C# editor if required. Choose one route for each command or reward when both tools are running. [Streamer.bot HTTP POST examples](https://docs.streamer.bot/examples/http-post)

## Wave limits and webhook responses

Change preset counts and cooldowns in `bridge.local.json`. Use `"effect": "nobelisk"` plus a `"nobelisk"` value of `standard`, `pulse`, `gas`, `cluster` or `nuke`. Existing `"effect": "cluster"` configs still select Cluster Nobelisks, and existing chat actions can keep the `cluster-rain` preset.

A wave can request up to 500 creatures or 12 primary Nobelisks. Those caps are shared across the bridge queue, in-transit work and work pending in the game. Creature and Nobelisk requests have separate lanes, and the bridge rate-limits webhook traffic and event bursts.

The mod budgets 28 points for living creatures and 36 for living creatures plus corpses. Hogs cost one point, spitters and small Stingers cost two, alpha hogs cost three, Elite Stingers cost five, and Crab Hatchers cost six. New spawns wait when the game has 48 active creatures or either mod budget is full. Waves resume as slots open. Moving creatures spawn at least 50 cm above the pioneer’s capsule center, with a clear drop of up to 3 m onto navigable ground. Crab Hatchers are placed directly on clear ground.

The Hatcher cap is two living and pending nests combined, including any nests waiting for the host to approach after a reload. Managed nests stagger an opening wave of three flying crabs, then produce one at a time when the game’s wave conditions allow.

Nobelisks tumble from above the pioneer and trigger their native detonation on the first blocking impact. Drops expire after four seconds if the game cannot process an impact. Standard drops can have up to three primaries in flight. Pulse, Gas, Cluster and Nuke drops have one primary in flight at a time and get a short recovery interval based on the effect. Nuke presets accept one per request and share a 15-second minimum between blasts.

The mod performs one spawn or triggers one primary detonation per frame at most. Pacing slows under heavier load and pauses after long frames or costly operations. The bridge rejects new events during that pause. Queued bridge jobs expire after two minutes. Jobs delivered to the game have up to 15 minutes to finish.

Send only configured preset names to `POST /v1/trigger`. Optionally include a stable `eventId` to deduplicate a retried webhook. The endpoint returns `202` when queued, `200` for a duplicate, `409` when the game is unavailable or disarmed, and `429` when cooldowns, rate limits, queue caps or the frame-time pause apply. Keep the endpoint on loopback and use the webhook token in stream tools. The game token also grants operator controls.

From the outer folder, run `node --test` to check webhook authentication, a 10,000-event spam burst, queue limits, session cleanup and the Streamer.bot handshake. The standalone C++ test in `test/frame-budget.cpp` exercises pacing and recovery. In-game performance still depends on the save, hardware, and other installed mods.
