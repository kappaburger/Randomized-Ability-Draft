// Random Kits is an all-random take on Ability Draft. Players type /ready,
// and when everyone is ready each gets a random hero carrying three random
// signature abilities and a random ultimate from any hero's kit, then a
// countdown starts the round. Abilities that lean on their own hero's weapon
// or alternate fire stay on that hero: Danny keeps his whole kit, Violet her
// Living Ink, and Solomon's pieces and Healing Needles appear only on their
// own hero, in their own slot. /unready takes a ready back, /kit repeats your
// kit in chat, and /newround sends everyone back to ready up for new kits.
import {
  abilityBarPresses,
  abilityDisplay,
  type AbilityRow,
  Buttons,
  Cast,
  command,
  heroNamed,
  log,
  onFrame,
  onStart,
  type Player,
  precache,
  sequence,
  type Want,
} from 'modlock'

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

/** countdownSeconds is how long heroes are held after the kits are dealt. */
const countdownSeconds = 5

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

/** solomon is the hero whose alternate fire moves his pieces. */
const solomon = 'hero_chessmaster'

/** refusedHeroes are heroes the game would not seat anyone on this session. */
const refusedHeroes = new Set<string>()

/** Kit is one player's hero and the abilities in its slots 0 to 3. */
interface Kit {
  readonly hero: string
  readonly heroId: number
  readonly abilities: readonly string[]
  /**
   * blockAltFire withholds alternate fire, as for a Solomon without a piece:
   * his alternate fire moves pieces and must not run without one.
   */
  readonly blockAltFire: boolean
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
}

let phase: 'waiting' | 'countdown' | 'live' = 'waiting'
let now = 0

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
    }
    // Clicks on a swapped ability's icon train it; the game sends nothing.
    abilityBarPresses(player, trainSlot)
    if (phase === 'waiting') {
      player.announce('Random Kits', 'Type /ready when you are set.')
      announceWaiting()
    } else {
      // A player who joins mid-round is dealt straight in.
      deal(member, takenHeroes())
      tellKit(member)
    }
    return member
  },
  leave: () => {
    if (phase === 'waiting') tryStart()
  },
  want: (member) => member.want,
})

onStart(() => {
  // Abilities from other heroes need those heroes, and the effects their
  // casts reach for, loaded with the world, or the game stalls on first use.
  precache({ heroes: Object.keys(heroKits), resources })
})

onFrame((frame) => {
  now = frame.timeSeconds
  cast.frame(now)
  for (const member of cast.members()) applyKit(member)
  showKits()
})

command('ready', (player) => setReady(player, true))
command('unready', (player) => setReady(player, false))

command('kit', (player) => {
  const member = cast.get(player)
  if (member?.kit) tellKit(member)
  else player.chat('No kit yet. Type /ready.')
})

command('newround', () => {
  if (phase === 'countdown') return
  phase = 'waiting'
  for (const member of cast.members()) {
    member.ready = false
    member.player.announce('New round', 'Type /ready for a new kit.')
  }
  announceWaiting()
})

// The game's upgrade commands look up the hero's own ability for a slot, so
// they miss a swapped one. Answer them with trainAbility, which trains
// whatever sits in the slot.
// Ctrl with an ability key, or a click on the ability bar, sends
// trainorupgradeability with the slot counted from 1. A click first sends
// upgrade_ability, which names a slot the native way and would train the
// wrong one; claiming it with no answer leaves the training to the
// trainorupgradeability that follows, as Ability Draft does.
command('trainorupgradeability', train)
command('upgrade_ability', ignore)
command('upgrade_ability_in_field', ignore)

/** setReady marks a player ready or not while the mode waits. */
function setReady(player: Player, ready: boolean): void {
  const member = cast.get(player)
  if (phase !== 'waiting' || member === undefined) return
  member.ready = ready
  if (!tryStart()) announceWaiting()
}

/** tryStart deals the kits and counts in when every human is ready. */
function tryStart(): boolean {
  const members = cast.members()
  if (phase !== 'waiting' || members.length === 0) return false
  if (members.some((member) => !member.ready)) return false

  // Deal everyone a different hero while the pool lasts.
  const taken = new Set<string>()
  for (const member of members) {
    deal(member, taken)
    taken.add(member.kit!.hero)
    tellKit(member)
  }
  countDown()
  return true
}

/** announceWaiting shows everyone how many players are not ready yet. */
function announceWaiting(): void {
  const members = cast.members()
  const missing = members.filter((member) => !member.ready).length
  for (const member of members) {
    const status = member.ready ? 'You are ready.' : 'Type /ready.'
    member.player.centerText(`Waiting for ${missing} more. ${status}`)
  }
}

/** countDown holds the heroes while their kits arrive, then starts the round. */
function countDown(): void {
  phase = 'countdown'
  sequence((run) => {
    const left = countdownSeconds + 1 - run
    for (const member of cast.members()) {
      // Freeze again each second: a hero that just changed is a new pawn.
      member.player.freeze(left > 0)
      if (left > 0) member.player.centerText(String(left))
      else member.player.announce('Fight!', 'Your kit is live.')
    }
    if (left > 0) return 1
    phase = 'live'
  })
}

/** deal gives member a random kit on a hero not in taken, if one is left. */
function deal(member: Member, taken: ReadonlySet<string>): void {
  const all = Object.keys(heroKits).filter((hero) => !refusedHeroes.has(hero))
  const free = all.filter((hero) => !taken.has(hero))
  const hero = pick(free.length > 0 ? free : all)
  const abilities = rollAbilities(hero)
  const own = heroKits[hero] ?? []
  const blockAltFire =
    hero === solomon &&
    !(tiedSlots[hero] ?? []).some((slot) => abilities[slot] === own[slot])
  const heroId = heroNamed(hero)?.id ?? 0
  member.kit = { hero, heroId, abilities, blockAltFire }
  member.want = { hero }
  member.upgrades = [0, 0, 0, 0]
  member.checkedAt = -Infinity
  member.offHeroSince = now
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
  for (let slot = 0; slot < 4; slot++) {
    const want = kit.abilities[slot]
    const have = owned.find((ability) => ability.slot === slot)
    if (have?.name === want) {
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
  player.trainAbility(slot)
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
