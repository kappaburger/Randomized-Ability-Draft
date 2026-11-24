# Random Kits

An all-random take on Ability Draft, as a Modlock mod that can be published to hyperline.gg.

1. Players join a pre-game lobby showing each team and who's ready. **Switch team** (or `/team`) moves you to the other team, in the lobby or the review. Press **Ready** (or type `/ready`; `/unready` takes it back). Until everyone is ready, heroes are held, the clock stays at 0:00 and no troopers or creeps spawn.
2. When everyone is ready, each player gets a random hero (no two players share one) with three random signature abilities and a random ultimate, picked from every hero's kit.
3. **Kit review:** the lobby shows your hero and abilities, and everyone presses Ready again once they've looked them over; the match starts when all are ready. You're seated on your hero, so you can hover your ability bar to read them. Each player has **two rerolls**, used with the Reroll button next to the hero or an ability, or with `/reroll hero` or `/reroll 1`–`4`:
   - rerolling an ability gives that slot a new random one (an ult for slot 4);
   - rerolling your hero keeps your abilities on a new hero, which can be any hero. Only Solomon's pieces and Healing Needles can't move, so those get new random abilities when you leave their hero;
   - rerolling one of Danny's Strix Salvo, Chimera Mk1 or Jettison Fuel rerolls all three, since they only work together.
   Rerolls only work during the review, and ability training waits until the match starts.
4. The lobby closes, everyone's souls are set to 600, troopers and creeps start spawning, and the match runs as a normal Deadlock match. Kits last the whole match.

`/kit` repeats your kit in chat. A player who joins mid-match gets a kit straight away.

`/refund` undoes your latest ability upgrade within 10 seconds, the same window as the game's right-click refund, and gives the points back. `/refund 2` undoes the latest upgrade on ability 2. The game's own right-click refund can't find a swapped ability, so this replaces it. It's also a console command, so you can bind it to a key: `bind F5 refund`. A player who joins mid-round gets a kit straight away.

## Run it

The easiest setup is to make a TypeScript project with `modlock new`, so it gets its `node_modules/modlock`. Then copy these files over the generated ones and run `modlock dev` in that folder.

Publish with `modlock publish`.

## The pool

`pool.gen.ts` comes from the game's `heroes.vdata` / `abilities.vdata` and Ability Draft's `bans.json`, so its bans match the website's.

Some abilities are found by the game by slot number, so they only work in particular slots:

- **Danny's Strix Salvo, Chimera Mk1 and Jettison Fuel** always come together, in slots 1, 2 and 3, on **any** hero. Danny gets them about half the time, anyone else about 4% of the time. On another hero they work, but that hero's HUD has no heat bar. Danny's ult, Close The Deal, is in the normal ult pool.
- **Living Ink** always goes in slot 1, on **any** hero (Violet about half the time, anyone else about 4%). Its Draw Ink goes on alt-fire. Violet without Living Ink has her alt-fire blocked, since Draw Ink would have nothing to draw for. Violet is a Hero Labs hero in the current game data. If the game won't put a player on her, that player gets a different hero after 10 seconds.
- **Solomon's pieces** (Bishop, Knight, Queen) and **Healing Needles** still only appear on their own hero, in their own slot, about half the time. Solomon's alt-fire is blocked when he has no piece.
- Danny and Violet themselves get random kits like any other hero.

After a game patch, regenerate the pool. Get fresh copies of `heroes.vdata`, `abilities.vdata` and `citadel_heroes_english.txt` from SteamTracking/GameTracking-Deadlock, then run:

```sh
python3 tools/gen_kits.py heroes.vdata abilities.vdata <modlock>/js/src/heroes.ts \
  <ability-draft>/Data/Deadlock/bans.json \
  <ability-draft>/Integration/Gameplay/compatibility-resources.json \
  pool.gen.ts citadel_heroes_english.txt \
  <ability-draft>/Data/Deadlock/site_localisation_overrides.json
```
