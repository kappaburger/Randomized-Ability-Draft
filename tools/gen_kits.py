"""Builds pool.gen.ts for the random-kits mod from the game's heroes.vdata and
abilities.vdata, Modlock's released-hero list, and the Ability Draft's bans.

usage: python3 -I gen_kits.py heroes.vdata abilities.vdata heroes.ts bans.json resources.json out.ts english.txt overrides.json
"""

import json
import re
import sys

heroes_path, abilities_path, modlock_heroes, bans_path, resources_path, out_path, english_path, overrides_path = sys.argv[1:9]

# Abilities that lean on their own hero's weapon or alternate fire. The
# Ability Draft gets them working on other heroes with native patches and
# generated definitions, which a sandboxed Modlock mod cannot apply, so each
# may only sit on its own hero, in its own slot.
TIED = ("ability_nurse_healing_needles", "ability_chessmaster_throwbishop",
        "ability_chessmaster_knightbuff", "ability_chessmaster_queen")

# Abilities the game finds by slot on whoever holds them, so they work on any
# hero in the slot it looks in: Living Ink in slot 1, and Danny's Strix,
# Chimera and Jettison Fuel together in slots 1 to 3. The mod deals these
# itself, so they stay out of the shared pool.
SLOT_BOUND = ("ability_artist_homingbrush", "ability_deadpack_chargeblast",
              "ability_deadpack_rocketeer", "ability_deadpack_flamethrower")

LOCKED = {}

# Hero Labs heroes dealt anyway. The game data marks Violet in development;
# if the game refuses to seat a player on her, the mod deals another hero.
LABS_ALLOWED = {"hero_artist"}


def top_blocks(text):
    """Yields (key, body) for each top-level block of a KV3 file."""
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        m = re.match(r"^\t([A-Za-z0-9_]+) = ?$", lines[i])
        if m and i + 1 < len(lines) and lines[i + 1] == "\t{":
            j = i + 2
            while j < len(lines) and lines[j] != "\t}":
                j += 1
            yield m.group(1), "\n".join(lines[i + 2 : j])
            i = j
        i += 1


def scalar(body, key, depth=2):
    m = re.search(r"^" + "\t" * depth + key + r' = (?:[a-z_]+:)?"?([^"\n]*)"?$', body, re.M)
    return m.group(1).strip() if m else None


bans = json.load(open(bans_path, encoding="utf-8-sig"))
banned_heroes = set(bans["bannedHeroes"])
banned_abilities = set(bans["bannedAbilities"]) - set(bans.get("unbannedAbilities", []))

released = re.findall(r"name: '(hero_[a-z0-9_]+)'", open(modlock_heroes, encoding="utf-8").read())

hero_kits = {}
for key, body in top_blocks(open(heroes_path, encoding="utf-8").read()):
    if key not in released or key in banned_heroes:
        continue
    if scalar(body, "m_bDisabled") == "true" or (scalar(body, "m_bInDevelopment") == "true" and key not in LABS_ALLOWED):
        continue
    m = re.search(r"^\t\tm_mapBoundAbilities = ?\n\t\t\{\n(.*?)\n\t\t\}", body, re.M | re.S)
    if not m:
        continue
    slots = [scalar(m.group(1), f"ESlot_Signature_{n}", 3) for n in range(1, 5)]
    # A hero whose locked slot holds a banned ability cannot be dealt.
    if all(slots) and all(slots[i] not in banned_abilities for i in LOCKED.get(key, [])):
        hero_kits[key] = slots

images, bases = {}, {}
for key, body in top_blocks(open(abilities_path, encoding="utf-8").read()):
    image = scalar(body, "m_strAbilityImage")
    if image:
        images[key] = image
    base = scalar(body, "_base")
    if base:
        bases[key] = base


def image_of(name):
    seen = set()
    while name and name not in seen:
        seen.add(name)
        if name in images:
            return images[name]
        name = bases.get(name)
    return ""


def tied(ability):
    return ability.startswith(TIED)


def allowed(ability):
    return ability not in banned_abilities and not tied(ability) and ability not in SLOT_BOUND


tied_slots, locked_slots = {}, {}
for hero, slots in hero_kits.items():
    locked = LOCKED.get(hero, [])
    if locked:
        locked_slots[hero] = locked
    loose = [i for i, a in enumerate(slots) if tied(a) and a not in banned_abilities and i not in locked]
    if loose:
        tied_slots[hero] = loose


regular, ultimate = [], []
for slots in hero_kits.values():
    for a in slots[:3]:
        if allowed(a) and a not in regular:
            regular.append(a)
    if allowed(slots[3]) and slots[3] not in ultimate:
        ultimate.append(slots[3])
regular.sort()
ultimate.sort()

titles = dict(re.findall(r'^\s*"([A-Za-z0-9_]+)"\s+"([^"]*)"', open(english_path, encoding="utf-8").read(), re.M))
overrides = json.load(open(overrides_path, encoding="utf-8-sig"))
for value in overrides.values():
    if isinstance(value, dict):
        titles.update({k: v for k, v in value.items() if isinstance(v, str)})


def title_of(name):
    seen = set()
    while name and name not in seen:
        seen.add(name)
        if titles.get(name):
            return titles[name]
        name = bases.get(name)
    return ""


resources = sorted(r for r in json.load(open(resources_path)) if r.endswith((".vpcf", ".vmdl")))

every = sorted(set(regular + ultimate + [a for slots in hero_kits.values() for a in slots]))

with open(out_path, "w", encoding="utf-8") as out:
    out.write("// Generated by gen_kits.py from the game's heroes.vdata and abilities.vdata,\n")
    out.write("// Modlock's released heroes and the Ability Draft's bans. Do not edit by hand.\n\n")
    out.write("/** heroKits maps each hero in the pool to its own signature abilities, slots 0 to 3. */\n")
    out.write("export const heroKits: Readonly<Record<string, readonly string[]>> = {\n")
    for hero in sorted(hero_kits):
        out.write(f"  {hero}: {json.dumps(hero_kits[hero])},\n")
    out.write("}\n\n")
    out.write("/** regularAbilities are the signature abilities a kit draws its slots 0 to 2 from. */\n")
    out.write(f"export const regularAbilities: readonly string[] = {json.dumps(regular, indent=2)}\n\n")
    out.write("/** ultimates are the abilities a kit draws its slot 3 from. */\n")
    out.write(f"export const ultimates: readonly string[] = {json.dumps(ultimate, indent=2)}\n\n")
    out.write("/**\n * lockedSlots are the slots of heroKits a hero always keeps, as the game\n * reads them by slot: all of Danny's, and Violet's Living Ink.\n */\n")
    out.write(f"export const lockedSlots: Readonly<Record<string, readonly number[]>> = {json.dumps(locked_slots)}\n\n")
    out.write("/**\n * tiedSlots are the slots of heroKits whose ability may only sit on its own\n * hero in that slot, such as Solomon's pieces and Healing Needles.\n */\n")
    out.write(f"export const tiedSlots: Readonly<Record<string, readonly number[]>> = {json.dumps(tied_slots)}\n\n")
    out.write("/** abilityImages maps each pooled ability to its icon in the game's content. */\n")
    out.write("export const abilityImages: Readonly<Record<string, string>> = {\n")
    for a in every:
        out.write(f"  {a}: {json.dumps(image_of(a))},\n")
    out.write("}\n\n")
    out.write("/** abilityTitles maps each pooled ability to the name players read. */\n")
    out.write("export const abilityTitles: Readonly<Record<string, string>> = {\n")
    for a in every:
        out.write(f"  {a}: {json.dumps(title_of(a) or a)},\n")
    out.write("}\n\n")
    out.write("/** resources are effects and models cross-hero casts load that the heroes alone do not. */\n")
    out.write(f"export const resources: readonly string[] = {json.dumps(resources, indent=2)}\n")

print(f"heroes={len(hero_kits)} regular={len(regular)} ultimates={len(ultimate)} resources={len(resources)}")
print("missing images:", [a for a in every if not image_of(a)])
print("missing titles:", [a for a in every if not title_of(a)])
print("locked:", locked_slots, "tied:", tied_slots)
