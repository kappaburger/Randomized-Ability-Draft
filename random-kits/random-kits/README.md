# Random Kits

An all-random take on Ability Draft, as a Modlock mod that can be published to hyperline.gg.

1. Everyone types `/ready` (and `/unready` to take it back).
2. When every player is ready, each gets a random hero (no two players share one) with three random signature abilities and a random ultimate, picked from every hero's kit.
3. Heroes are frozen through a 5-second countdown while the kits go in, then the round starts.

Other commands: `/kit` repeats your kit in chat, and `/newround` sends everyone back to ready up for new kits. A player who joins mid-round gets a kit straight away.

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
