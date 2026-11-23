# Factory Live changelog

Factory Live 0.9.8 targets the Windows Steam client, build 520140, with SML 3.12.1 or a compatible 3.x release. These changes cover the builds after 0.9.0-chaos.22.

## 0.9.8

- Added `5x` and `20x` to Pioneer Pop. They launch at 7,250 and 29,000 cm/s respectively, up from 1,450 cm/s at Standard. A 20× landing can be fatal.
- The game log records the upward speed when a bounce fires.

## 0.9.7

- Give Factory Live mobs persistent actor identities and reconcile their alive or dead state before saving. If a previously killed actor with a matching identity appears on reload, retire it instead of letting it come back.
- Read Crab Hatcher health directly to detect deaths that the regular creature death event misses. Older saves without stable actor identities may still have mobs that cannot be matched reliably.

## 0.9.6

- Retry a blocked creature placement after five seconds or once the Pioneer moves ten metres. Keep the requested multiplier with the queued placement.

## 0.9.5

- Added Pioneer Pop in Small, Standard, and High. It keeps horizontal momentum and sets upward velocity when the Pioneer is ready and grounded. The bridge enforces a 12-second cooldown.

## 0.9.4

- In solo play, give full AI to up to 48 Factory Live hostile ground creatures by default. Prioritize the current 25-metre chunk, then nearby creatures within 70 metres. The others stay visible and damageable, with less frequent ticks and suspended pursuit and perception.
- Restore normal AI when another player joins. Hatchers, fliers, and peaceful wildlife use their normal AI handling.
- Log HUD OS show, close, and respawn timing. Release the queue hold three seconds after native respawn readiness if the HUD close callback never arrives.

## 0.9.3

- Give Nobelisks the first available spawn slot when mob work is also waiting. Keep each launched charge tracked until it detonates.
- Double the mob recovery budget from four to eight actor removals per pass, within a two-millisecond time slice.

## 0.9.2

- Mob recovery clears earlier queued effects and holds new redeems while cleanup runs. It keeps the bridge's armed setting and honors a manual disarm during cleanup.

## 0.9.1 · Chaos.24 previews

- Added `FactoryLive.RecoverMobs confirm` and authenticated `POST /v1/recover-mobs`. Recovery removes Factory Live's spawned mobs, corpses, and hatchlings in batches. It can continue after a save reload and leaves native wildlife alone.
- Keep pending effects through respawn and temporary game holds. Retry work the game has yet to acknowledge, retain blocked creature, Nobelisk, and player effects, and let an eligible lane proceed while another lane waits.
- Coalesce duplicate AI sense-filter changes during normal solo play as well as during respawn.

## 0.9.0-chaos.23 · Proximity previews

- Pause tracked hostile brains and ticks in batches during solo respawn. Release targets on the dead Pioneer, pause distant brains, and stagger their return. Defer duplicate sight rebuilds and run at most one native rebuild per frame during respawn.
- Preserve the armed preference when game heartbeats pause. Split oversized Nobelisk requests into batches that fit the available game capacity.
- Log native possession and respawn timings. Skip unneeded controller audio work in known keyboard-only solo sessions.
