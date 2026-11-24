# Random Kits

An all-random take on Ability Draft, as a Modlock mod that can be published to hyperline.gg.

1. Players join a pre-game lobby showing who's in and who's ready, and press **Ready** (or type `/ready`; `/unready` takes it back). Until everyone is ready, heroes are held, the clock stays at 0:00 and no troopers or creeps spawn.
2. When everyone is ready, each player gets a random hero (no two players share one) with three random signature abilities and a random ultimate, picked from every hero's kit.
3. **Kit review, 15 seconds:** the lobby shows your hero and abilities. You're seated on your hero, so you can hover your ability bar to read them. Each player has **one reroll**, used with the Reroll button next to the hero or an ability, or with `/reroll hero` or `/reroll 1`–`4`:
   - rerolling an ability gives that slot a new random one (an ult for slot 4);
   - rerolling your hero keeps your abilities on a new hero. Abilities that can only sit on their own hero (Danny's kit, Living Ink, Solomon's pieces, Healing Needles) get new random abilities when you move away from that hero. The new hero is never Danny or Violet, since they'd force their own abilities.
   Rerolls only work during the review, and ability training waits until the match starts.
4. The lobby closes, troopers and creeps start spawning, and the match runs as a normal Deadlock match. Kits last the whole match.

`/kit` repeats your kit in chat. A player who joins mid-match gets a kit straight away.

`/refund` undoes your latest ability upgrade within 10 seconds, the same window as the game's right-click refund, and gives the points back. `/refund 2` undoes the latest upgrade on ability 2. The game's own right-click refund can't find a swapped ability, so this replaces it. It's also a console command, so you can bind it to a key: `bind F5 refund`. A player who joins mid-round gets a kit straight away.

## Run it

The easiest setup is to make a TypeScript project with `modlock new`, so it gets its `node_modules/modlock`. Then copy these files over the generated ones and run `modlock dev` in that folder.

Publish with `modlock publish`.

## The pool

`pool.gen.ts` comes from the game's `heroes.vdata` / `abilities.vdata` and Ability Draft's `bans.json`, so its bans match the website's.

Some abilities depend on their own hero's weapon, jetpack or alt-fire. Ability Draft moves them to other heroes using native patches in its Deadworks helper, which a Hyperline mod can't use. So here they stay on their own hero:

- **Deadman Danny** always has his own full kit, because his weapon, heat gauge and jetpack read his other ability slots.
- **Violet** always has Living Ink in slot 1. Her other three slots are random. She's a Hero Labs hero in the current game data. If the game won't put a player on her, that player gets a different hero after 10 seconds.
- **Solomon** keeps each of his pieces (Bishop, Knight, Queen) half the time. When he has no piece, his alt-fire is blocked.
- **Nurse Harrow** keeps Healing Needles half the time.
- Leech Therapy, Adrenaline Rush, Nurse's ult, Fork Piece and Violet's other abilities are in the normal pool, so any hero can get them.

After a game patch, regenerate the pool. Get fresh copies of `heroes.vdata`, `abilities.vdata` and `citadel_heroes_english.txt` from SteamTracking/GameTracking-Deadlock, then run:

```sh
python3 tools/gen_kits.py heroes.vdata abilities.vdata <modlock>/js/src/heroes.ts \
  <ability-draft>/Data/Deadlock/bans.json \
  <ability-draft>/Integration/Gameplay/compatibility-resources.json \
  pool.gen.ts citadel_heroes_english.txt \
  <ability-draft>/Data/Deadlock/site_localisation_overrides.json
```
