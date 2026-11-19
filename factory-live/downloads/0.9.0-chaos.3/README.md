# Factory Live Chaos Mode

Chaos Mode queues **1,200 creatures** from one viewer event. It sends 300 Crab Hatchers, 300 mixed small Spitters, 300 mixed alpha Spitters, and 300 mixed Hogs and Stingers. Nobelisk Chaos adds a separate **250-drop firework show**. The Windows build targets Satisfactory Steam build 517554 with SML 3.12.

## Install on a test profile

1. Use a separate Satisfactory install and a copy of the save you want to stress-test. Enable SML 3.12 in that profile.
2. Extract `FactoryLive_Chaos_0.9.0-chaos.3_Windows.zip` into `FactoryGame/Mods/FactoryLive` in the test install. The descriptor should be at `FactoryGame/Mods/FactoryLive/FactoryLive.uplugin`. The test build uses the Factory Live mod identity so it can read the save's existing mob ledger.
3. Extract `FactoryLive_Chaos_0.9.0-chaos.3_Bridge.zip` to a separate folder. With Node.js 22 or later, run `node bridge.mjs serve` from that folder. The Chaos bridge defaults to loopback port **37129** and creates its own credentials in `%LOCALAPPDATA%\FactoryLiveChaos\link.json`. If you use a custom bridge config, copy in the `equipment-drop` preset and keep your current port and credentials.
4. Load the test world as host. Once you can control the pioneer, use a second terminal in the same bridge folder.

```powershell
node bridge.mjs status
node bridge.mjs arm
node bridge.mjs trigger chaos-mode
```

## Set up a $10 alert in Lumia Stream

1. In Lumia 9.4, open **Settings → Plugins → Installed → Install Manually** and install `FactoryLive_Chaos_Lumia_1.2.0.lumiaplugin`. Its separate plugin ID lets it sit alongside the regular Factory Live plugin.
2. Add **Factory Live Chaos → Check Bridge** to a test action and verify the Chaos world is ready.
3. On the successful tip or payment alert, add **Factory Live Chaos → Trigger Preset → Chaos Mode (1,200 creatures)**. Set the amount and currency filter in the alert or payment integration. For example, trigger on USD 10 or more. For a channel-points reward, set the price in Twitch and attach the same action.

## Set up a $10 alert in Streamer.bot

1. Create an action and add the supplied `integrations/StreamerBotWebhook.cs` as an **Execute C# Code** sub-action. It already selects `chaos-mode` and reads the Chaos bridge's link file.
2. Bind it to a successful tip or payment trigger and apply your amount and currency filter. You can also bind it to a dedicated Twitch reward.
3. For another preset, create another action and set the `Preset` constant in that copy of the sub-action.

## Wave presets

| Preset | Requested creatures | Default cooldown |
| --- | --- | --- |
| `chaos-mode` | 300 each of Hatchers, mixed small Spitters, mixed alpha Spitters, and mixed Hogs and Stingers | 60 seconds |
| `hatcher-surge` | 300 Crab Hatchers | 60 seconds |
| `spitter-surge` | 300 forest spitters | 30 seconds |
| `alpha-spitter-surge` | 300 alpha forest spitters | 30 seconds |
| `jetpack-hog-surge` | 300 Jetpack Hogs | 30 seconds |

The bridge accepts all four Chaos Mode waves together if the loaded game supports all four creatures and there is room. Hatcher presets share a 60-second cooldown and a cap of 600 alive or queued. The global pending limit is 2,400 creatures. The mod admits up to 24,000 living creature points, 32,000 points including corpses, and 32,000 active world creatures. One Hatcher uses 12 points, one forest spitter uses two, one alpha forest spitter uses four, and one Jetpack Hog uses three.

Chaos Mode rotates through available native variants, including Forest, Red Forest, Desert and Aquatic Spitters, five Hog types, and three Stinger sizes. It attempts at most one creature spawn per frame and spaces spawn work farther apart when frame times rise. A severe frame stall pauses new spawns briefly. Use open terrain to give the waves room. Hatchers can spread 6–66 m from the pioneer and the other mobs can spread 9–81 m. Placement failure, respawn, or a timeout can cut a wave short.

`node bridge.mjs status` shows the running wave counts. `game.creatureJobs` reports requested, spawned, and remaining creatures. In the host game console, `FactoryLive.Mobs` shows persistent mob history. Run `node bridge.mjs disarm` to clear pending waves. Spawned creatures stay in the world and persist when you save.

## Nobelisk Chaos

Add **Factory Live Chaos → Trigger Preset → Nobelisk Chaos (250-drop firework show)** to a separate Lumia alert, reward, or moderator command. With the regular Factory Live plugin linked to the updated bridge, use **Trigger Custom Preset** and enter `nobelisk-chaos`. In Streamer.bot, set the action's `Preset` constant to `nobelisk-chaos`.

The show launches ten rotating stars of 25 primary Nobelisks. Standard, Pulse, Gas, and Cluster are chosen at random, with one Nuke as the final drop. The drops travel outward and detonate on impact. Stars have a short gap between them. The final Nuke waits for the other drops to resolve and respects any existing Nuke recovery timer.

The preset has a 60-second cooldown and reserves the Nobelisk queue for the show. Creature waves can run during it. The mod staggers launches and impacts and keeps at most 16 primaries in flight. In `node bridge.mjs status`, `game.nobelisks` reports launches and impacts and `game.pending.fireworks` indicates a show is active. A respawn clears queued effects and cancels undetonated drops one per frame. New effects wait for a five-second recovery window after the game's respawn transition.

## Drop Random Equipment

Bind **Drop Random Equipment** in the Chaos Lumia plugin, or use **Trigger Custom Preset** with `equipment-drop`. It drops one item from a random eligible equipment slot as a normal pickup near the pioneer. The pioneer must be alive and on foot on solid ground. The default cooldown is 60 seconds.

## Webhook

Send JSON to `POST http://127.0.0.1:37129/v1/trigger` with the webhook token as a bearer credential. Use either `{"preset":"chaos-mode","eventId":"your-payment-event-id"}` or `{"entityId":"spitter","variant":7,"qty":24}` for 24 Aquatic Alpha Spitters. Use the port in your local link file if you customized it. An authenticated `GET /v1/presets` returns the configured presets, variant numbers and quantities. Reuse the exact event ID when retrying one payment event. HTTP 202 means the bridge queued the request.

For StreamElements, receive the event on the game PC in Lumia Stream and add an outbound API POST action or a Factory Live preset action. The StreamElements cloud chatbot's `$(customapi)` sends GET requests and cannot set an authorization header. [StreamElements customapi documentation](https://docs.streamelements.com/chatbot/variables/customapi)

The other Factory Live creature, Nobelisk, and player-action presets remain in `bridge.config.json`. For source builds, copy the inner `FactoryLive` folder to the matching SML Starter Project's `Mods` folder and package Factory Live Chaos with Alpakit. [Satisfactory modding setup](https://docs.ficsit.app/satisfactory-modding/latest/Development/BeginnersGuide/dependencies.html)
