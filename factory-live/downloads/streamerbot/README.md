# Factory Live 0.9.8 with Streamer.bot

Install Factory Live using Satisfactory Mod Manager. Run Streamer.bot under the same Windows user as Satisfactory, connect your Twitch broadcaster account, then load a save as host. The bundled bridge starts and arms when the world is ready.

Back up your save before testing. Heavy waves, high multipliers and repeated explosions can freeze or crash Satisfactory. Start with a small wave at 1×.

## Paste an action and attach a reward

1. In **Platforms → Twitch → Channel Point Rewards**, select a reward or add one.
2. In **Actions**, create an action and add a Twitch **Reward Redemption** trigger for that specific reward.
3. Extract the ZIP. Open the matching C# file in a text editor and copy the entire file.
4. Add **Core → C# → Execute C# Code** and paste the code. Click **Find Refs** if needed, then **Compile** and **Save and Compile**.
5. Start with the small `gentle/hog-wild.cs` example, which queues three basic hogs at 1×. Use a separate Twitch reward for each example you enable.

The scripts read the loopback port and token from `%LOCALAPPDATA%\FactoryLiveChaos\link.json` or the folder set in `FACTORYLIVE_CHAOS_HOME`. Keep both tokens private. Attach a reward to one app so it fires once. The script sets `factoryLiveStatus` and `factoryLiveResult`. Look in **Action Queues → Action History**. HTTP 202 means queued. The game may still be waiting for its frame-time, placement, capacity or respawn conditions to recover.

[Reward Redemption reference](https://docs.streamer.bot/api/triggers/twitch/channel-reward/reward-redemption) · [Execute C# Code reference](https://docs.streamer.bot/api/csharp/guide/intro)

## Match the bundled Lumia templates

Set these prices and cooldowns when you create each Twitch reward. Bridge cooldowns apply separately. The two bounce actions use their selected launch strength regardless of the stream multiplier, share the bridge’s 12-second bounce cooldown, and can cause fall damage. The 20× version can be fatal.

| Reward | File | Points | Cooldown |
| --- | --- | --- | --- |
| Factory Live Alpha Hog Wave | `presets/alpha-hogs.cs` | 500 | 30 sec |
| Factory Live Hog Wave | `presets/hog-swarm.cs` | 750 | 30 sec |
| Factory Live Forest Spitter Wave | `presets/spitter-pack.cs` | 500 | 25 sec |
| Factory Live Stinger Pack | `presets/stinger-pack.cs` | 750 | 35 sec |
| Factory Live Elite Stinger | `presets/elite-stinger.cs` | 250 | 45 sec |
| Factory Live Hatcher Trial | `presets/crab-hatcher.cs` | 750 | 60 sec |
| Factory Live Standard Nobelisks | `presets/nobelisk-rain.cs` | 500 | 5 sec |
| Factory Live Pulse Nobelisks | `presets/pulse-rain.cs` | 500 | 7 sec |
| Factory Live Gas Nobelisks | `presets/gas-rain.cs` | 750 | 8 sec |
| Factory Live Carpet Bomb | `presets/cluster-rain.cs` | 750 | 10 sec |
| Factory Live Nuke Drop | `presets/nuke-drop.cs` | 750 | 20 sec |
| Factory Live Nuclear Carpet Bomb | `presets/nuke-carpet.cs` | 1,000 | 45 sec |
| Factory Live Turn Around | `presets/turn-around.cs` | 100 | 60 sec |
| Factory Live Drop Equipment | `presets/equipment-drop.cs` | 500 | 60 sec |
| Factory Live Creature Roulette | `presets/creature-roulette.cs` | 250 | 60 sec |
| Factory Live Surprise Me | `presets/surprise-me.cs` | 250 | 60 sec |
| Factory Live Multiplier +1 | `IncreaseMultiplier.cs` | 50 | 0 sec |
| Boing Voyage (5x Bounce) | `examples/boing-voyage.cs` | 25 | 15 sec |
| Fall Damage Express (20x Bounce) | `examples/fall-damage-express.cs` | 100 | 30 sec |


### +1 multiplier

Use `IncreaseMultiplier.cs` with a 50-point reward. Set a maximum of 15 redemptions per stream in Twitch. Use a non-concurrent action queue so simultaneous requests get counted. The value starts at 1× and reaches 16× after 15 uses. Each increase posts `the current multiplier is now X`.

Paste `ResetMultiplier.cs` into its own action and attach it to Twitch **Stream Online** to reset each stream to 1×. You can also attach a broadcaster-only `!resetmulti` chat command. Lumia and Streamer.bot store their counters separately.

## Shipped presets

Paste the matching file under `presets/` for each effect. This table lists the 0.9.8 package's defaults at 1×. Commands in the last column are optional names you can create in Streamer.bot. `!chaos 10` uses `examples/chaos-chat.cs`.

| Preset | Effect at 1× | Bridge cooldown | Optional command |
| --- | --- | --- | --- |
| `hog-swarm` | 80 basic hogs | 30 sec | `!hogs` |
| `alpha-hogs` | 12 alpha hogs | 30 sec | `!alphas` |
| `spitter-pack` | 24 forest spitters | 25 sec | `!spitters` |
| `stinger-pack` | 12 small stingers | 35 sec | `!stingers` |
| `elite-stinger` | 1 elite stinger | 45 sec | `!elitestinger` |
| `crab-hatcher` | 10 normal hatchers | 60 sec | — |
| `chaos-mode` | 4 groups of 300 hostile creatures | 60 sec | `!chaos 10` |
| `hatcher-surge` | 300 normal hatchers | 60 sec | — |
| `spitter-surge` | 300 forest spitters | 30 sec | — |
| `alpha-spitter-surge` | 300 alpha forest spitters | 30 sec | — |
| `jetpack-hog-surge` | 300 jetpack hogs | 30 sec | — |
| `nobelisk-rain` | 12 standard Nobelisks | 5 sec | `!nobelisk` |
| `pulse-rain` | 8 pulse Nobelisks | 7 sec | `!pulse` |
| `gas-rain` | 6 gas Nobelisks | 8 sec | `!gas` |
| `cluster-rain` | 10 cluster Nobelisks | 10 sec | `!cluster` |
| `nuke-drop` | 1 nuclear Nobelisk | 20 sec | `!nuke` |
| `nuke-carpet` | 5 nuclear Nobelisks | 45 sec | `!nukewave` |
| `nobelisk-chaos` | 250 mixed Nobelisks | 60 sec | `!nukem` |
| `turn-around` | Turn the Pioneer 180° | 30 sec | `!turn` |
| `equipment-drop` | Drop 1 random piece of equipped gear | 60 sec | — |
| `creature-roulette` | Choose alpha hogs, forest spitters, small stingers, or elite stingers | 60 sec | `!roulette` |
| `surprise-me` | Choose a turn or elite stingers | 60 sec | `!surprise` |


Set `!chaos` to **Starts With** and limit it to broadcasters and moderators. On its action, add a **Command Triggered** trigger and paste `examples/chaos-chat.cs`. A valid number after the command sets the stack multiplier. It falls back to 1× for missing or invalid input and caps typed values at 100×. Create an exact match `!nukem` using `presets/nobelisk-chaos.cs`, fixed at 1×.

For Bits, add a Twitch **Cheer** trigger. Enter only a **Max** of 100 for exact 100-Bit Nukem and attach `presets/nobelisk-chaos.cs`. Enter only a **Max** of 300 for exact 300-Bit Chaos and attach `examples/chaos-fixed.cs`. These are chat Cheers.

[Command setup](https://docs.streamer.bot/guide/core/commands) · [Cheer reference](https://docs.streamer.bot/api/triggers/twitch/chat/cheer)

## Smaller creature rewards

Use the files under `gentle/` to set explicit counts before multiplying. These scripts call the named mob route. The stock presets and their random choices retain the shipped configuration.

| C# file | At 1× | At 8× |
| --- | ---: | ---: |
| `gentle/hog-wild.cs` | 3 basic hogs | 24 |
| `gentle/hamageddon.cs` | 2 alpha hogs | 16 |
| `gentle/spit-happens.cs` | 2 forest spitters | 16 |
| `gentle/web-of-lies.cs` | 2 small stingers | 16 |
| `gentle/youve-got-venom.cs` | 1 elite stinger | 8 |
| `gentle/crabsolutely-hatching.cs` | 1 normal hatcher | 8 |

These counts scale with the active multiplier, including above 8×.

## Build your own action

Replace the four settings at the top of `Trigger.cs` with a block below. `stream` reads the +1 reward total, `chat` reads the typed multiplier, and `fixed` uses `FixedMultiplier`. Every example has a complete corresponding script in the ZIP.

### Hog Wild — 3 basic hogs per multiplier level

Ready-to-paste file `gentle/hog-wild.cs`.

```csharp
    private static readonly string Route = "/v1/mobs/hog";
    private const string Body = "{\"qty\":3}";
    private static readonly string Multiplier = "stream";
    private const int FixedMultiplier = 1;
```

### One elite hatcher at a fixed size

Ready-to-paste file `examples/elite-hatcher-fixed.cs`.

```csharp
    private static readonly string Route = "/v1/mobs/elite-hatcher";
    private const string Body = "{\"qty\":1}";
    private static readonly string Multiplier = "fixed";
    private const int FixedMultiplier = 1;
```

### Three Lizard Doggos at a fixed size

Ready-to-paste file `examples/doggo-party.cs`.

```csharp
    private static readonly string Route = "/v1/mobs/lizard-doggo";
    private const string Body = "{\"qty\":3}";
    private static readonly string Multiplier = "fixed";
    private const int FixedMultiplier = 1;
```

### Six gas Nobelisks from a numeric variant

Ready-to-paste file `examples/gas-six.cs`.

```csharp
    private static readonly string Route = "/v1/trigger";
    private const string Body = "{\"entityId\":\"nobelisk\",\"variant\":2,\"qty\":6}";
    private static readonly string Multiplier = "fixed";
    private const int FixedMultiplier = 1;
```

### Boing Voyage — 5× bounce force

Ready-to-paste file `examples/boing-voyage.cs`.

```csharp
    private static readonly string Route = "/v1/hooks/pioneer-pop";
    private const string Body = "{\"strength\":\"5x\"}";
    private static readonly string Multiplier = "fixed";
    private const int FixedMultiplier = 1;
```

### Fall Damage Express — 20× bounce force

Ready-to-paste file `examples/fall-damage-express.cs`.

```csharp
    private static readonly string Route = "/v1/hooks/pioneer-pop";
    private const string Body = "{\"strength\":\"20x\"}";
    private static readonly string Multiplier = "fixed";
    private const int FixedMultiplier = 1;
```

### Moderator !chaos 10 — read the number from chat

Ready-to-paste file `examples/chaos-chat.cs`.

```csharp
    private static readonly string Route = "/v1/trigger";
    private const string Body = "{\"preset\":\"chaos-mode\"}";
    private static readonly string Multiplier = "chat";
    private const int FixedMultiplier = 1;
```

### 300 Bits Chaos — fixed multiplier of 1×

Ready-to-paste file `examples/chaos-fixed.cs`.

```csharp
    private static readonly string Route = "/v1/trigger";
    private const string Body = "{\"preset\":\"chaos-mode\"}";
    private static readonly string Multiplier = "fixed";
    private const int FixedMultiplier = 1;
```

### Moderator !nukem or 100 Bits — fixed multiplier of 1×

Ready-to-paste file `presets/nobelisk-chaos.cs`.

```csharp
    private static readonly string Route = "/v1/trigger";
    private const string Body = "{\"preset\":\"nobelisk-chaos\"}";
    private static readonly string Multiplier = "fixed";
    private const int FixedMultiplier = 1;
```


## Creature and Nobelisk variants

The ZIP includes a one-creature or one-Nobelisk action per variant under `variants/`. For a creature, use `POST /v1/mobs/NAME` with `qty`. You can also send `entityId`, a zero-based `variant` and `qty` to `POST /v1/trigger`. Nobelisks use the numeric route. Select fixed 1× for wildlife. Manta requests accept one at a time. Direct nuclear Nobelisk requests accept a base quantity of one.

| Entity ID | Variant numbers and names |
| --- | --- |
| `hog` | 0 `hog`, 1 `alpha-hog`, 2 `cliff-hog`, 3 `nuclear-hog`, 4 `jetpack-hog` |
| `spitter` | 0 `spitter`, 1 `spitter-red`, 2 `spitter-desert`, 3 `spitter-aquatic`, 4 `alpha-spitter`, 5 `alpha-spitter-red`, 6 `alpha-spitter-desert`, 7 `alpha-spitter-aquatic` |
| `stinger` | 0 `stinger`, 1 `big-stinger`, 2 `elite-stinger` |
| `hatcher` | 0 `crab-hatcher`, 1 `elite-hatcher` |
| `crab` | 0 `flying-crab` |
| `wildlife` | 0 `lizard-doggo`, 1 `bean`, 2 `flightless-bird`, 3 `beetle`, 4 `manta` |
| `nobelisk` | 0 `standard`, 1 `pulse`, 2 `gas`, 3 `cluster`, 4 `nuke` |


Use `GET /v1/mobs` to see which named routes are available in the current world, and `GET /v1/presets` for counts and cooldowns in the active bridge configuration. Both use the viewer `webhookToken`. For raw HTTP examples, see the [Factory Live webhook reference](https://lumi-con.com/factory-live/chaos/#webhook).

## Operator controls

Attach an action from `controls/` to a broadcaster-only command or hotkey. These scripts use the private `gameToken` and report the response to the Streamer.bot log. For a customized action, edit `Operation` near the top of `BridgeControl.cs`.

| File | Route | Result |
| --- | --- | --- |
| `controls/status.cs` | `GET /v1/status` | Read readiness, armed state and queue. |
| `controls/arm.cs` | `POST /v1/arm` | Enable new effects when the game is ready. |
| `controls/disarm.cs` | `POST /v1/disarm` | Stop new effects and clear queued work. |
| `controls/recover-mobs.cs` | `POST /v1/recover-mobs` | Clear the queue and remove tracked Factory Live mobs. On 0.9.8, recovery preserves the armed state. |

## Death alert

Create a repeating timer with a two-second interval and no minimum chat lines. Attach a **Timed Action** trigger to `DeathCounter.cs`. The script counts a new death ID once and posts `the pioneer has died X times`. Attach `ResetDeaths.cs` to a separate broadcaster-only reset action. Polling can miss deaths between reads or while offline. A recent death may be counted at startup.

[Timer setup](https://docs.streamer.bot/guide/core/timers)

## Troubleshooting

- If compilation fails on an assembly reference, click **Find Refs** and compile again.
- For a connection error or `409 game_not_armed_or_ready`, load a save as host and use `controls/status.cs`. Use `controls/arm.cs` if the bridge was disarmed.
- For `401 unauthorized`, run both apps under the same Windows account and use the current `link.json`.
- For `429 cooldown` or `queue_full`, wait for the previous effects to clear.
- For `400 stack_hostiles_only`, use a fixed multiplier of 1× for wildlife.
