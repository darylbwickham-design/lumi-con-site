# Factory Live with Streamer.bot

These are copy-and-paste C# actions, not a Streamer.bot import. They use the local bridge bundled with Factory Live. The bridge starts when the host loads a world. Keep Streamer.bot and the game on the same Windows PC, and connect Twitch in Streamer.bot first.

Do not attach both Lumia and Streamer.bot to the same reward: each would send the effect. The two apps keep separate multiplier and death-counter values; these examples do not synchronise them. Creature and explosion multipliers can crash the game, especially during respawn. Back up saves and choose a multiplier your computer can handle.

## Set up a reward

1. Create or select a Twitch channel point reward in Streamer.bot.
2. Create an action, add a **Twitch → Channel Point Reward Redemption** trigger for that reward, and add a **Core → C# → Execute C# Code** sub-action.
3. Paste `Trigger.cs` into the C# editor. Change `Preset` near the top to the desired ID from the table below. Leave `Mob` empty. Compile and save.
4. Repeat for each reward, using its own action and preset. Configure its cost and cooldown in Twitch/Streamer.bot; availability and cooldowns also depend on the installed bridge configuration.

Each action reads the local bridge token automatically. It sends the current Streamer.bot multiplier and includes the redemption ID when supplied, helping the bridge deduplicate deliveries. It reports rejection details in the Streamer.bot log. A response of accepted means queued, not necessarily already spawned.

| Reward or command | Preset | Default effect |
| --- | --- | --- |
| Hog wave | `hog-swarm` | 80 hogs |
| Alpha hogs | `alpha-hogs` | 12 alpha hogs |
| Spitter pack | `spitter-pack` | 24 spitters |
| Stinger pack | `stinger-pack` | 12 stingers |
| Elite stinger | `elite-stinger` | 1 elite stinger |
| Crab hatcher | `crab-hatcher` | 10 hatchers |
| Chaos | `chaos-mode` | four hostile groups of 300 |
| Hatcher surge | `hatcher-surge` | 300 hatchers |
| Spitter surge | `spitter-surge` | 300 spitters |
| Alpha spitter surge | `alpha-spitter-surge` | 300 alpha spitters |
| Jetpack hog surge | `jetpack-hog-surge` | 300 jetpack hogs |
| Nobelisk rain | `nobelisk-rain` | 12 regular Nobelisks |
| Pulse rain | `pulse-rain` | 8 pulse Nobelisks |
| Gas rain | `gas-rain` | 6 gas Nobelisks |
| Cluster rain | `cluster-rain` | 10 cluster Nobelisks |
| Nuke drop | `nuke-drop` | 1 nuclear Nobelisk |
| Nuclear carpet | `nuke-carpet` | 5 nuclear Nobelisks |
| Nukem | `nobelisk-chaos` | 250 mixed Nobelisks |
| Turn around | `turn-around` | turn the pioneer |
| Equipment drop | `equipment-drop` | drop a piece of equipment |
| Creature roulette | `creature-roulette` | random creature preset |
| Surprise me | `surprise-me` | random effect preset |

Counts above are the bridge's defaults and can differ if the configuration has been edited. Chaos contains hostile creatures only. For a specific creature or wildlife, set `Mob` to a name from the Factory Live mob endpoint list and `Quantity` to the desired amount. Hostile multipliers require a game mod with stacked-spawn support; wildlife cannot use a multiplier above 1. For a wildlife reward, use a separate copy of the script and set its multiplier to 1 instead of reading the global value.

### Bundled Lumia reward defaults

This table describes the **Lumia plugin's bundled templates**. They are starting settings, not a list of any streamer's current live prices. A streamer can change a reward after importing it. Cooldowns are in seconds; bridge cooldowns still apply separately.

| Bundled reward name | Preset or action | Points | Cooldown |
| --- | --- | ---: | ---: |
| Factory Live Alpha Hog Wave | `alpha-hogs` | 500 | 30 |
| Factory Live Hog Wave | `hog-swarm` | 750 | 30 |
| Factory Live Forest Spitter Wave | `spitter-pack` | 500 | 25 |
| Factory Live Stinger Pack | `stinger-pack` | 750 | 35 |
| Factory Live Elite Stinger | `elite-stinger` | 250 | 45 |
| Factory Live Hatcher Trial | `crab-hatcher` | 750 | 60 |
| Factory Live Standard Nobelisks | `nobelisk-rain` | 500 | 5 |
| Factory Live Pulse Nobelisks | `pulse-rain` | 500 | 7 |
| Factory Live Gas Nobelisks | `gas-rain` | 750 | 8 |
| Factory Live Carpet Bomb | `cluster-rain` | 750 | 10 |
| Factory Live Nuke Drop | `nuke-drop` | 750 | 20 |
| Factory Live Nuclear Carpet Bomb | `nuke-carpet` | 1,000 | 45 |
| Factory Live Turn Around | `turn-around` | 100 | 60 |
| Factory Live Drop Equipment | `equipment-drop` | 500 | 60 |
| Factory Live Creature Roulette | `creature-roulette` | 250 | 60 |
| Factory Live Surprise Me | `surprise-me` | 250 | 60 |
| Factory Live Multiplier +1 | multiplier action | 50 | 0 |

## Multiplier reward

Create a 50-point reward with a **maximum of 15 redemptions per stream** in Twitch. Link it to a new action containing `IncreaseMultiplier.cs`. Set this action to a non-concurrent queue so simultaneous redemptions cannot lose increments. It starts at 1, increases by 1 up to 16, and posts `the current multiplier is now X` in Twitch chat. The other reward actions above read that value. Set a second action containing `ResetMultiplier.cs` to run on Twitch **Stream Online**, and optionally connect a moderator-only chat command to it for a manual reset. Streamer.bot stores the value across app restarts; the reset action starts a new stream at 1. Twitch enforces the 15-per-stream limit.

## Moderator commands

Create a moderator-only `!chaos` command and attach it to a copy of `Trigger.cs` with `Preset = "chaos-mode"` and `UseChatMultiplier = true`. `!chaos 10` passes multiplier 10; missing or invalid input uses 1, and input is capped at 100. This command uses the typed multiplier rather than the reward multiplier. For `!nukem`, create another moderator-only action with `Preset = "nobelisk-chaos"`, `UseChatMultiplier = false`, and `UseStreamMultiplier = false`. This uses a fixed multiplier of 1, matching the bundled Lumia chat command.

The additional command names from the bundled bridge configuration can be set up the same way: `!hogs` → `hog-swarm`, `!alphas` → `alpha-hogs`, `!spitters` → `spitter-pack`, `!stingers` → `stinger-pack`, `!elitestinger` → `elite-stinger`, `!nobelisk` → `nobelisk-rain`, `!pulse` → `pulse-rain`, `!gas` → `gas-rain`, `!cluster` → `cluster-rain`, `!nuke` → `nuke-drop`, `!nukewave` → `nuke-carpet`, `!turn` → `turn-around`, `!roulette` → `creature-roulette`, and `!surprise` → `surprise-me`. Create the desired commands in Streamer.bot and connect each to its matching action; they are not created automatically by these snippets. Set permissions and cooldowns to suit the channel.

## Death alert

Create an action with `DeathCounter.cs` and run it from a recurring timer every 2 seconds while Streamer.bot is open. It reads the bridge's recent death ID, increments its own persisted counter once for each new observed ID, and says `the pioneer has died X times` in Twitch chat. Create a moderator-only reset command using `ResetDeaths.cs`. This counter is separate from Lumia's. Polling is best effort: deaths missed while the bridge or timer is offline, or multiple deaths between polls, cannot be reconstructed. A recent death may be counted on first connection.

## Troubleshooting

- Load a save as the host and check Factory Live is enabled before trying a reward. If the bridge is offline, requests cannot reach the game.
- Open Streamer.bot's log for rejected events or compilation errors. A creature multiplier can be rejected by an older game mod, and wildlife cannot be stacked.
- Check Streamer.bot is connected to Twitch and that the intended bot account can send messages. If a reward fires twice, check it is not also connected in Lumia or duplicated in Streamer.bot.
- The token in `link.json` controls the local bridge. Keep it private and do not expose the bridge to the public internet.

Streamer.bot reference: https://docs.streamer.bot/api/csharp/guide/intro and https://docs.streamer.bot/api/csharp/guide/variables
