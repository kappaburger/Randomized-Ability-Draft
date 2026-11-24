// Random Kits is an all-random take on Ability Draft. Players wait in a
// pre-game lobby and press Ready; the match is held, with no troopers or
// creeps and the clock stopped, until everyone is ready. Then each gets a
// random hero carrying three random signature abilities and a random ultimate
// from any hero's kit, and the match starts. Abilities that lean on their own
// hero's weapon or alternate fire stay on that hero: Danny keeps his whole
// kit, Violet her Living Ink, and Solomon's pieces and Healing Needles appear
// only on their own hero, in their own slot. /ready and /unready work in chat
// too, /kit repeats your kit, and /refund undoes an upgrade within 10 seconds.
// Everyone starts the match with 600 souls.
// After the deal, players look over their kits and ready up again; each may
// reroll their hero, keeping its abilities, or one ability, once.
import {
  abilityBarPresses,
  abilityDisplay,
  type AbilityRow,
  Buttons,
  Cast,
  command,
  cursorFree,
  findEntities,
  freeCursor,
  heroNamed,
  log,
  onFrame,
  onStart,
  onWorld,
  holdMatchClock,
  type Player,
  precache,
  readField,
  serverCommand,
  show,
  type Want,
} from 'modlock'

import { Lobby } from './lobby'
import {
  abilityImages,
  abilityTitles,
  heroKits,
  lockedSlots,
  regularAbilities,
  resources,
  tiedSlots,
  ultimates,
} from './pool.gen'

/** checkSeconds is how often each hero's abilities are compared with its kit. */
const checkSeconds = 0.5

/**
 * tiedChance is how often a hero keeps one of its own abilities that may sit
 * nowhere else, such as one of Solomon's pieces or Healing Needles.
 */
const tiedChance = 0.5

/**
 * seatSeconds is how long a player may sit off their dealt hero before they
 * are dealt another, as when the game refuses a Hero Labs hero.
 */
const seatSeconds = 10

/** startSouls is the souls every player holds when the match starts. */
const startSouls = 600

/** rerollsPerPlayer is how many rerolls each player gets with a dealt kit. */
const rerollsPerPlayer = 2

/** teamNames are the game's two teams by number. */
const teamNames: Readonly<Record<number, string>> = {
  2: 'Amber',
  3: 'Sapphire',
}

/** solomon is the hero whose alternate fire moves his pieces. */
const solomon = 'hero_chessmaster'

/** danny and violet are the heroes whose abilities the game finds by slot. */
const danny = 'hero_deadpack'
const violet = 'hero_artist'

/**
 * livingInk is Violet's Living Ink. Its Draw Ink, on alternate fire, finds it
 * in slot 1 on whoever holds it, so it works on any hero there.
 */
const livingInk = 'ability_artist_homingbrush'

/**
 * arsenal is Danny's Strix Salvo, Chimera Mk1 and Jettison Fuel, in slots 1
 * to 3. Each finds the others by slot on whoever holds them, so they work on
 * any hero together, in these slots; Chimera brings the heat they share.
 */
const arsenal = [
  'ability_deadpack_chargeblast',
  'ability_deadpack_rocketeer',
  'ability_deadpack_flamethrower',
] as const

/**
 * specialChance is how often a kit on any hero is dealt Danny's arsenal, and
 * again Living Ink. Danny and Violet keep their own at tiedChance.
 */
const specialChance = 0.04

/** refusedHeroes are heroes the game would not seat anyone on this session. */
const refusedHeroes = new Set<string>()

/** lobbyButtons are withheld while the lobby has the cursor up. */
const lobbyButtons = Buttons.attack | Buttons.altFire | Buttons.melee

/** Kit is one player's hero and the abilities in its slots 0 to 3. */
interface Kit {
  readonly hero: string
  readonly heroId: number
  readonly abilities: readonly string[]
  /**
   * blockAltFire withholds alternate fire when it has nothing to act on: a
   * Solomon without a piece to move, or a hero holding Draw Ink without the
   * Living Ink in slot 1 it draws for.
   */
  readonly blockAltFire: boolean
  /**
   * inkGone records that a reroll took Living Ink from this hero, whose Draw
   * Ink can stay behind on alternate fire.
   */
  readonly inkGone: boolean
}

/** Member is one human in the mode. */
interface Member {
  readonly player: Player
  readonly name: string
  ready: boolean
  kit?: Kit
  /** want is what Cast seats the member on, kept so Cast can compare it. */
  want: Want
  /** upgrades holds the bought tiers of slots 0 to 3, as last read. */
  upgrades: number[]
  /** checkedAt is when the hero's abilities were last compared with the kit. */
  checkedAt: number
  /** shown is the ability display last sent to this member, as a key. */
  shown: string
  /** blocked is whether alternate fire is withheld now. */
  blocked: boolean
  /** offHeroSince is when the member was last seen on the kit's hero. */
  offHeroSince: number
  /** bought lists the trainings the mod made, newest last, for /refund. */
  bought: Bought[]
  /** cursorAt is when the lobby last checked the member's cursor. */
  cursorAt: number
  /** lobbyShown is the lobby last shown to this member, as a key. */
  lobbyShown: string
  /** rerolls is how many rerolls the member has left this match. */
  rerolls: number
  /** team is the team, 2 or 3, the member chose, or undefined for any. */
  team?: number
  /** soulsDue is whether the member's souls still need setting at the start. */
  soulsDue: boolean
  /**
   * points and unlocks are the ability points and unlocks the hero held at
   * the last check, to price an upgrade the game's own keys bought.
   */
  points?: number
  unlocks?: number
}

/** Bought is one training the mod made, with what it spent. */
interface Bought {
  readonly slot: number
  readonly ability: string
  /** before and after are the ability's upgrade bits around the training. */
  readonly before: number
  readonly after: number
  readonly points: number
  readonly unlocks: number
  readonly at: number
}

/**
 * sellSeconds is how long after a training /refund may undo it, as the
 * game's citadel_ability_upgrade_sell_time allows its own sells.
 */
const sellSeconds = 10

let phase: 'lobby' | 'review' | 'live' = 'lobby'
let now = 0
/** rulesAt is when the game rules were last read. */
let rulesAt = -Infinity

const anyHero: Want = { hero: 'any' }

const cast = new Cast<Member>({
  join: ({ player, name }) => {
    const member: Member = {
      player,
      name,
      ready: false,
      want: anyHero,
      upgrades: [0, 0, 0, 0],
      checkedAt: -Infinity,
      shown: '',
      blocked: false,
      offHeroSince: now,
      bought: [],
      cursorAt: -Infinity,
      lobbyShown: '',
      rerolls: rerollsPerPlayer,
      soulsDue: false,
    }
    // Clicks on a swapped ability's icon train it; the game sends nothing.
    abilityBarPresses(player, barPress)
    if (phase === 'live') {
      // A player who joins mid-match is dealt straight in.
      deal(member, takenHeroes())
      tellKit(member)
    } else {
      player.blockInput(lobbyButtons)
      if (phase === 'review') {
        // A player who joins during the review is dealt in to review too.
        deal(member, takenHeroes())
        tellKit(member)
      }
    }
    return member
  },
  leave: () => {
    if (phase !== 'live') tryStart()
  },
  want: (member) => member.want,
})

onStart(() => {
  // No troopers or creeps until the lobby lets the match start.
  setSpawns(false)

  // Abilities from other heroes need those heroes, and the effects their
  // casts reach for, loaded with the world, or the game stalls on first use.
  precache({ heroes: Object.keys(heroKits), resources })
})

onWorld(() => {
  rules = undefined
  reported = ''
})

onFrame((frame) => {
  now = frame.timeSeconds
  cast.frame(now)
  const rulesDue = now - rulesAt >= checkSeconds
  if (rulesDue) rulesAt = now
  if (phase !== 'live') {
    if (rulesDue) holdLobby()
    drawLobby()
  }
  for (const member of cast.members()) {
    applyKit(member)
    if (member.soulsDue && phase === 'live') setStartSouls(member)
  }
  showKits()
  if (rulesDue) reportGame()
})

command('ready', (player) => setReady(player, true))
command('team', (player) => switchTeam(player))
command('reroll', (player, args) => {
  const word = args.toLowerCase().split(/\s+/)[0] ?? ''
  if (word === 'hero') reroll(player, 'hero')
  else if (/^[1-4]$/.test(word)) reroll(player, Number(word) - 1)
  else if (word === 'ult') reroll(player, 3)
  else player.chat('Type /reroll hero, or /reroll 1, 2, 3 or 4 for an ability.')
})
command('unready', (player) => setReady(player, false))

command('kit', (player) => {
  const member = cast.get(player)
  if (member?.kit) tellKit(member)
  else player.chat('No kit yet. Press Ready in the lobby.')
})

// The game's own right-click refund sells by the hero's own ability, so it
// misses a swapped one, and claiming its sellitem command would stop item
// sales too. /refund, or refund bound to a key, undoes instead.
command('refund', (player, args) => refund(player, args))

// The game's upgrade commands look up the hero's own ability for a slot, so
// they miss a swapped one. Ctrl with an ability key, or a click on the
// ability bar, sends trainorupgradeability with the slot counted from 1. A
// click first sends upgrade_ability, which names a slot the native way and
// would train the wrong one; claiming it with no answer leaves the training
// to the trainorupgradeability that follows, as Ability Draft does.
command('trainorupgradeability', train)
command('upgrade_ability', ignore)
command('upgrade_ability_in_field', ignore)

/**
 * setStartSouls sets the member's souls to startSouls, adding or taking the
 * difference, once their hero is there to hold them.
 */
function setStartSouls(member: Member): void {
  const pawn = cast.pawn(member.player)
  if (!pawn) return
  const delta = startSouls - pawn.souls
  if (delta === 0 || member.player.adjustSouls(delta, true)) {
    member.soulsDue = false
    log(`${member.name} starts with ${startSouls} souls`)
  }
}

/** teamOf is the member's team: chosen, else the one their hero is on. */
function teamOf(member: Member): number | undefined {
  const team = member.team ?? cast.pawn(member.player)?.team
  return team === 2 || team === 3 ? team : undefined
}

/**
 * switchTeam moves the player to the other team before the match starts.
 * Cast seats them there, on the same hero, within a second or so.
 */
function switchTeam(player: Player): void {
  const member = cast.get(player)
  if (!member) return
  if (phase === 'live') {
    player.chat('Teams can only be changed in the lobby.')
    return
  }
  const team = teamOf(member) === 2 ? 3 : 2
  member.team = team
  member.want = { ...member.want, team }
  log(`${member.name} switched to team ${team}`)
  player.chat(`You're on ${teamNames[team] ?? `team ${team}`} now.`)
}

/** setReady marks a player ready or not while the lobby waits. */
function setReady(player: Player, ready: boolean): void {
  const member = cast.get(player)
  if (phase === 'live' || member === undefined) return
  member.ready = ready
  tryStart()
}

/** tryStart deals the kits and counts in when every human is ready. */
function tryStart(): void {
  const members = cast.members()
  if (phase === 'live' || members.length === 0) return
  if (members.some((member) => !member.ready)) return
  if (phase === 'review') {
    startMatch()
    return
  }

  // Deal everyone a different hero while the pool lasts.
  const taken = new Set<string>()
  for (const member of members) {
    deal(member, taken)
    taken.add(member.kit!.hero)
    member.rerolls = rerollsPerPlayer
    // Everyone readies up again once they have looked over their kit.
    member.ready = false
    tellKit(member)
    member.player.chat(
      `You have ${rerollsPerPlayer} rerolls: press Reroll, or type /reroll hero or /reroll 1-4. Press Ready when you are set.`,
    )
  }
  phase = 'review'
}

/**
 * drawLobby shows every member the lobby, and puts the cursor up again for
 * one who put it away, since the lobby is all there is to do.
 */
function drawLobby(): void {
  const members = cast.members()
  const roster = members
    .map(
      (m) => `${m.player.slot}:${m.name}:${m.ready ? 1 : 0}:${teamOf(m) ?? ''}`,
    )
    .join(';')
  for (const member of members) {
    // show sends only changes, but each call is still a host call.
    const kit = member.kit
    const key = `${phase}|${roster}|${member.ready ? 1 : 0}|${kit?.hero ?? ''}:${kit?.abilities.join(',') ?? ''}|${member.rerolls}`
    if (member.lobbyShown !== key) {
      member.lobbyShown = key
      const locked = new Set(kit ? (lockedSlots[kit.hero] ?? []) : [])
      show(
        member.player,
        Lobby({
          entries: members.map((other) => ({
            name: other.name,
            ready: other.ready,
            own: other === member,
            team: teamOf(other),
          })),
          ready: member.ready,
          onReady: (player) => setReady(player, !member.ready),
          kit:
            phase === 'review' && kit
              ? {
                  hero: heroNamed(kit.hero)?.title ?? kit.hero,
                  abilities: kit.abilities.map((name, slot) => ({
                    title: abilityTitles[name] ?? name,
                    rerollable: !locked.has(slot),
                  })),
                }
              : undefined,
          rerolls: member.rerolls,
          team: teamOf(member),
          onSwitchTeam: (player) => switchTeam(player),
          onReroll: (player, target) => reroll(player, target),
        }),
      )
    }
    if (now - member.cursorAt > 2) {
      member.cursorAt = now
      if (cursorFree(member.player) !== true) freeCursor(member.player, true)
    }
  }
}

/** startMatch closes the lobby and lets the match run. */
function startMatch(): void {
  phase = 'live'
  releaseLobby()
  for (const member of cast.members()) {
    member.soulsDue = true
    // Someone who joined during the review is dealt in now.
    if (!member.kit) {
      deal(member, takenHeroes())
      tellKit(member)
    }
    show(member.player, null)
    member.lobbyShown = ''
    freeCursor(member.player, false)
    member.player.blockInput(0n)
    // The kit's own block, as Solomon's, goes back on with the next check.
    member.blocked = false
    member.player.announce('Fight!', 'Your kit is live.')
  }
}

/** rules is the citadel_gamerules proxy of this world, once found. */
let rules: number | undefined

/** gameRules finds the game rules' proxy, which reads CCitadelGameRules. */
function gameRules(): number | undefined {
  rules ??= findEntities('citadel_gamerules')[0]
  return rules
}

/** rulesNumber reads one number field of the game rules. */
function rulesNumber(
  field: string,
  type: 'uint32' | 'int32' | 'float32',
): number | undefined {
  const proxy = gameRules()
  if (proxy === undefined) return undefined
  const value = readField(proxy, 'CCitadelGameRules', field, type)
  return typeof value === 'number' ? value : undefined
}

/**
 * holdLobby keeps the match from starting while the lobby is open: the
 * clock stays at zero, no troopers or creeps spawn, and the heroes are held.
 * It writes nothing of the game's own match state, which every player's game
 * reads, so a player loading in sees an ordinary match.
 */
function holdLobby(): void {
  holdMatchClock(0)
  for (const member of cast.members()) member.player.freeze(true)
}

/** releaseLobby lets the match run. */
function releaseLobby(): void {
  holdMatchClock()
  setSpawns(true)
  for (const member of cast.members()) member.player.freeze(false)
}

/** setSpawns turns lane troopers and jungle creeps on or off. */
function setSpawns(on: boolean): void {
  const value = on ? '1' : '0'
  serverCommand(`citadel_trooper_spawn_enabled ${value}`)
  serverCommand(`citadel_neutral_spawn_enabled ${value}`)
}

/** reported is the game's state as last logged. */
let reported = ''

/** reportGame logs the game's mode and state when they change. */
function reportGame(): void {
  const mode = rulesNumber('m_eGameMode', 'uint32')
  const state = rulesNumber('m_eGameState', 'uint32')
  const line = `game mode ${mode}, game state ${state}, lobby ${phase}`
  if (line === reported) return
  reported = line
  log(line)
}

/** deal gives member a random kit on a hero not in taken, if one is left. */
function deal(member: Member, taken: ReadonlySet<string>): void {
  const all = Object.keys(heroKits).filter((hero) => !refusedHeroes.has(hero))
  const free = all.filter((hero) => !taken.has(hero))
  const hero = pick(free.length > 0 ? free : all)
  member.kit = makeKit(hero, rollAbilities(hero))
  member.want = { hero, team: member.team }
  member.upgrades = [0, 0, 0, 0]
  member.checkedAt = -Infinity
  member.offHeroSince = now
  member.bought = []
}

/**
 * makeKit puts abilities on hero, withholding alternate fire from a Solomon
 * left without a piece to move.
 */
function makeKit(hero: string, abilities: string[], inkGone = false): Kit {
  const own = heroKits[hero] ?? []
  const noPiece =
    hero === solomon &&
    !(tiedSlots[hero] ?? []).some((slot) => abilities[slot] === own[slot])
  const strayInk = (hero === violet || inkGone) && abilities[0] !== livingInk
  return {
    hero,
    heroId: heroNamed(hero)?.id ?? 0,
    abilities,
    blockAltFire: noPiece || strayInk,
    inkGone,
  }
}

/**
 * stuckTo reports whether the ability in slot of hero's kit may only sit on
 * that hero: one of hero's own locked or tied abilities, in its own slot.
 */
function stuckTo(hero: string, slot: number, ability: string): boolean {
  const own = heroKits[hero] ?? []
  const fixed = [...(lockedSlots[hero] ?? []), ...(tiedSlots[hero] ?? [])]
  return fixed.includes(slot) && own[slot] === ability
}

/** freshAbility draws a pool ability for slot that abilities do not hold. */
function freshAbility(slot: number, abilities: readonly string[]): string {
  const pool = slot < 3 ? regularAbilities : ultimates
  return pick(pool.filter((ability) => !abilities.includes(ability)))
}

/**
 * reroll spends the player's one reroll during the kit review: target is
 * 'hero' for a new hero that keeps the abilities, or a slot, 0 to 3, for a
 * new ability there. A refused reroll is not spent.
 */
function reroll(player: Player, target: 'hero' | number): void {
  const member = cast.get(player)
  const kit = member?.kit
  if (!member || !kit) return
  if (phase !== 'review') {
    player.chat(
      'Rerolls can only be used during the kit review before the match.',
    )
    return
  }
  if (member.rerolls <= 0) {
    player.chat('You have no rerolls left.')
    return
  }

  if (target === 'hero') {
    const taken = takenHeroes()
    const heroes = Object.keys(heroKits).filter(
      (hero) =>
        hero !== kit.hero && !taken.has(hero) && !refusedHeroes.has(hero),
    )
    if (heroes.length === 0) {
      player.chat('No other hero is free to reroll to.')
      return
    }
    const hero = pick(heroes)

    // The new hero's locked slots, as all of Danny's or Violet's Living Ink,
    // bring the hero's own abilities. Abilities that may only sit on the old
    // hero are replaced. Every other ability is kept.
    const own = heroKits[hero] ?? []
    const locked = lockedSlots[hero] ?? []
    const abilities = [...kit.abilities]
    const lost: string[] = []
    for (const slot of locked) {
      const ability = abilities[slot] ?? ''
      if (ability !== own[slot]) lost.push(abilityTitles[ability] ?? ability)
      abilities[slot] = own[slot] ?? ability
    }
    for (let slot = 0; slot < 4; slot++) {
      const ability = abilities[slot] ?? ''
      if (locked.includes(slot) || !stuckTo(kit.hero, slot, ability)) continue
      abilities[slot] = freshAbility(slot, abilities)
      lost.push(abilityTitles[ability] ?? ability)
    }
    member.rerolls--
    member.kit = makeKit(hero, abilities)
    member.want = { hero, team: member.team }
    member.upgrades = [0, 0, 0, 0]
    member.checkedAt = -Infinity
    member.offHeroSince = now
    refundAll(member)
    log(`${member.name} rerolled hero ${kit.hero} -> ${hero}`)
    if (lost.length > 0) {
      player.chat(
        `Only their own hero can use ${lost.join(', ')}, so those were rerolled.`,
      )
    }
  } else {
    if ((lockedSlots[kit.hero] ?? []).includes(target)) {
      player.chat(
        `${heroNamed(kit.hero)?.title ?? kit.hero} must keep that ability. Reroll your hero instead.`,
      )
      return
    }
    const abilities = [...kit.abilities]
    const old = abilities[target] ?? ''
    // Danny's arsenal only works together, so rerolling one rerolls all.
    const slots = (arsenal as readonly string[]).includes(old)
      ? [0, 1, 2]
      : [target]
    for (const slot of slots) {
      abilities[slot] = ''
      abilities[slot] = freshAbility(slot, abilities)
    }
    member.rerolls--
    member.kit = makeKit(kit.hero, abilities, kit.inkGone || old === livingInk)
    member.checkedAt = -Infinity
    for (const slot of slots) {
      member.upgrades[slot] = 0
      refundAll(member, slot)
    }
    if (slots.length > 1) {
      player.chat(
        'Strix Salvo, Chimera Mk1 and Jettison Fuel only work together, so all three were rerolled.',
      )
    }
    log(
      `${member.name} rerolled slot ${target + 1}: ${old} -> ${abilities[target]}`,
    )
  }
  tellKit(member)
}

/**
 * refundAll gives back every upgrade the member bought, in one slot or all,
 * as a reroll takes those abilities away.
 */
function refundAll(member: Member, slot?: number): void {
  let points = 0
  let unlocks = 0
  member.bought = member.bought.filter((b) => {
    if (slot !== undefined && b.slot !== slot) return true
    points += b.points
    unlocks += b.unlocks
    return false
  })
  if (points > 0 || unlocks > 0) {
    member.player.adjustAbilityPoints(points, unlocks)
    if (member.points !== undefined) member.points += points
    if (member.unlocks !== undefined) member.unlocks += unlocks
  }
}

/**
 * rollAbilities deals hero's four slots. A locked slot keeps the hero's own
 * ability, a tied slot keeps it half the time, and every other slot draws
 * from the shared pool: slots 0 to 2 from the signatures and slot 3 from the
 * ultimates.
 */
function rollAbilities(hero: string): string[] {
  const own = heroKits[hero] ?? []
  const slots: (string | undefined)[] = [
    undefined,
    undefined,
    undefined,
    undefined,
  ]
  for (const slot of lockedSlots[hero] ?? []) slots[slot] = own[slot]

  // Danny's arsenal or Living Ink, in the slots the game finds them in: often
  // on their own hero, now and then on anyone.
  const roll = Math.random()
  if (hero === danny ? roll < tiedChance : roll < specialChance) {
    arsenal.forEach((ability, slot) => {
      slots[slot] = ability
    })
  } else if (hero === violet ? roll < tiedChance : roll < 2 * specialChance) {
    slots[0] = livingInk
  }

  for (const slot of tiedSlots[hero] ?? []) {
    if (slots[slot] === undefined && Math.random() < tiedChance) {
      slots[slot] = own[slot]
    }
  }
  const used = new Set(slots)
  const regulars = shuffle(regularAbilities.filter((a) => !used.has(a)))
  for (let slot = 0; slot < 3; slot++) slots[slot] ??= regulars.pop()
  slots[3] ??= pick(ultimates.filter((a) => !used.has(a)))
  return slots.map((ability) => ability ?? '')
}

/** takenHeroes lists the heroes already dealt. */
function takenHeroes(): Set<string> {
  const taken = new Set<string>()
  for (const member of cast.members()) {
    if (member.kit) taken.add(member.kit.hero)
  }
  return taken
}

/** tellKit writes member's kit in their chat. */
function tellKit(member: Member): void {
  const kit = member.kit
  if (!kit) return
  const hero = heroNamed(kit.hero)?.title ?? kit.hero
  const names = kit.abilities.map((a) => abilityTitles[a] ?? a)
  member.player.chat(`Your kit: ${hero}`)
  member.player.chat(
    `1: ${names[0]}   2: ${names[1]}   3: ${names[2]}   Ult: ${names[3]}`,
  )
}

/**
 * applyKit puts the kit's abilities in any slot that lacks them once the
 * member sits on the kit's hero. A respawn keeps them, but a hero change or
 * reset gives the hero its own back, and this puts the kit in again.
 */
function applyKit(member: Member): void {
  const kit = member.kit
  if (!kit || now - member.checkedAt < checkSeconds) return
  member.checkedAt = now
  const pawn = cast.pawn(member.player)

  // A player the game will not seat on the dealt hero gets another kit.
  // A player with no pawn, as a spectator, says nothing about the hero.
  if (!pawn || pawn.hero === kit.heroId) {
    member.offHeroSince = now
  } else if (now - member.offHeroSince > seatSeconds) {
    log(`could not seat ${member.name} on ${kit.hero}; dealing another hero`)
    refusedHeroes.add(kit.hero)
    deal(member, takenHeroes())
    tellKit(member)
    return
  }
  if (!pawn || pawn.hero !== kit.heroId || pawn.health <= 0) return

  // Alternate fire with nothing to act on stays withheld.
  if (member.blocked !== kit.blockAltFire) {
    member.blocked = kit.blockAltFire
    member.player.blockInput(kit.blockAltFire ? Buttons.altFire : 0n)
  }

  const owned = member.player.abilities()
  const bought: {
    slot: number
    ability: string
    before: number
    after: number
  }[] = []
  for (let slot = 0; slot < 4; slot++) {
    const want = kit.abilities[slot]
    const have = owned.find((ability) => ability.slot === slot)
    if (have?.name === want) {
      const before = member.upgrades[slot] ?? 0
      if (have.upgrades !== before && (have.upgrades & before) === before) {
        bought.push({ slot, ability: want, before, after: have.upgrades })
      }
      if (member.upgrades[slot] !== have.upgrades) {
        // Logged so a bar that shows no upgrades can be told from a read
        // that sees none: the bar draws exactly these bits.
        log(
          `${member.name} slot ${slot + 1} upgrades ${have.upgrades.toString(2)}`,
        )
      }
      member.upgrades[slot] = have.upgrades
      continue
    }
    member.upgrades[slot] = 0
    if (!member.player.replaceAbility(slot, want)) {
      log(`could not give ${member.name} ${want} in slot ${slot}`)
    }
  }

  // An upgrade the game's own keys bought, as by holding an ability key, is
  // priced by what the hero's points and unlocks fell since the last check.
  // A level gained in the same half second can hide some of the price, so a
  // refund then gives back less, never more.
  const [one] = bought
  if (
    one &&
    bought.length === 1 &&
    member.points !== undefined &&
    member.unlocks !== undefined
  ) {
    member.bought.push({
      ...one,
      points: Math.max(0, member.points - pawn.abilityPoints),
      unlocks: Math.max(0, member.unlocks - pawn.abilityUnlocks),
      at: now,
    })
  }
  member.points = pawn.abilityPoints
  member.unlocks = pawn.abilityUnlocks
}

/**
 * showKits draws every dealt kit on the Tab screen and each player's own on
 * their ability bar, since the game draws the hero's standard icons there.
 */
function showKits(): void {
  const rows: AbilityRow[] = []
  for (const member of cast.members()) {
    const kit = member.kit
    const pawn = cast.pawn(member.player)
    if (!kit || !pawn || pawn.hero !== kit.heroId) continue
    rows.push({
      player: member.player,
      abilities: kit.abilities.map((name, slot) => ({
        name,
        image: abilityImages[name] ?? '',
        upgrades: member.upgrades[slot],
      })),
    })
  }
  const key = rows
    .map(
      (row) =>
        `${row.player.slot}:${row.abilities.map((a) => `${a?.name}/${a?.upgrades}`).join(',')}`,
    )
    .join(';')
  for (const viewer of cast.members()) {
    if (viewer.shown === key) continue
    viewer.shown = key
    abilityDisplay(viewer.player, rows)
  }
}

/** loggedTrains counts the upgrade commands logged, to check their form. */
let loggedTrains = 0

/**
 * dedupeSeconds is how long one slot stays trained before the same player
 * may train it again, since one click can arrive both as a bar press and as
 * trainorupgradeability.
 */
const dedupeSeconds = 0.25

/** trainedAt holds when each player last trained each slot, by player slot. */
const trainedAt = new Map<number, number[]>()

/**
 * train answers trainorupgradeability, whose argument is the ability slot
 * counted from 1, as 1 to 4 for the four ability keys.
 */
function train(player: Player, args: string): void {
  if (loggedTrains < 5) {
    loggedTrains++
    log(`trainorupgradeability from slot ${player.slot}: "${args}"`)
  }
  const word = args.split(/\s+/)[0] ?? ''
  if (!/^[1-4]$/.test(word)) return
  trainSlot(player, Number(word) - 1)
}

/** trainSlot trains the ability in slot, 0 to 3, once per click. */
function trainSlot(player: Player, slot: number): void {
  const times = trainedAt.get(player.slot) ?? [
    -Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ]
  trainedAt.set(player.slot, times)
  if (now - (times[slot] ?? -Infinity) < dedupeSeconds) return
  times[slot] = now
  // A reroll during the review replaces abilities, so training waits.
  if (phase !== 'live') return

  // Read what the training spends, so /refund can give back exactly that.
  const member = cast.get(player)
  const before = player.pawn()
  const held = player.abilities().find((ability) => ability.slot === slot)
  if (!player.trainAbility(slot)) return
  const after = player.pawn()
  const trained = player.abilities().find((ability) => ability.slot === slot)
  if (!member || !before || !after || !held || !trained) return
  if (trained.name !== held.name || trained.upgrades === held.upgrades) return
  member.upgrades[slot] = trained.upgrades
  member.points = after.abilityPoints
  member.unlocks = after.abilityUnlocks
  member.bought.push({
    slot,
    ability: trained.name,
    before: held.upgrades,
    after: trained.upgrades,
    points: before.abilityPoints - after.abilityPoints,
    unlocks: before.abilityUnlocks - after.abilityUnlocks,
    at: now,
  })
}

/** loggedPresses counts the ability bar clicks logged. */
let loggedPresses = 0

/** barPress trains the slot of a click on the ability bar. */
function barPress(player: Player, slot: number): void {
  if (loggedPresses < 5) {
    loggedPresses++
    log(`ability bar click from slot ${player.slot}: ability ${slot + 1}`)
  }
  trainSlot(player, slot)
}

/**
 * refund undoes the player's latest training the mod made in the last
 * sellSeconds, or the latest in one slot, 1 to 4, and gives back what it
 * spent.
 */
function refund(player: Player, args: string): void {
  const member = cast.get(player)
  if (!member) return
  const word = args.split(/\s+/)[0] ?? ''
  const slot = /^[1-4]$/.test(word) ? Number(word) - 1 : undefined
  member.bought = member.bought.filter((b) => now - b.at <= sellSeconds)
  const index = member.bought.findLastIndex(
    (b) => slot === undefined || b.slot === slot,
  )
  const last = member.bought[index]
  if (!last) {
    player.chat(
      `Nothing to refund: upgrades can be refunded for ${sellSeconds} seconds.`,
    )
    return
  }
  member.bought.splice(index, 1)

  // Undo only the newest step, and only if the ability still holds it.
  const held = player.abilities().find((ability) => ability.slot === last.slot)
  if (held?.name !== last.ability || held.upgrades !== last.after) {
    player.chat('That upgrade has changed since; nothing refunded.')
    return
  }
  const title = abilityTitles[last.ability] ?? last.ability
  if (!player.setAbility({ ability: last.ability, upgrades: last.before })) {
    log(`refund of ${last.ability} for ${member.name}: setAbility refused`)
    player.chat(`Could not refund ${title}: the game refused.`)
    return
  }
  const paid = player.adjustAbilityPoints(last.points, last.unlocks)
  log(
    `refunded ${last.ability} for ${member.name}: upgrades ${last.after.toString(2)} -> ${last.before.toString(2)}, gave back ${last.points} points and ${last.unlocks} unlocks${paid ? '' : ' (refused)'}`,
  )
  member.upgrades[last.slot] = last.before
  if (member.points !== undefined) member.points += last.points
  if (member.unlocks !== undefined) member.unlocks += last.unlocks
  const back = [
    last.points > 0
      ? `${last.points} point${last.points === 1 ? '' : 's'}`
      : '',
    last.unlocks > 0 ? 'the unlock' : '',
  ]
    .filter(Boolean)
    .join(' and ')
  player.chat(`Refunded ${title}${back ? `: ${back} back` : ''}.`)
}

/** ignore claims a game command and does nothing with it. */
function ignore(): void {}

/** pick returns a random entry of list. */
function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

/** shuffle shuffles list in place and returns it. */
function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}
