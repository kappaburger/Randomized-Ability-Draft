// The pre-game lobby every player sees until the match starts: who is in,
// who is ready, and a button to ready up or take it back. Once everyone is
// ready it turns into the kit review: the player's hero and abilities, each
// with a button to spend their one reroll on it, and everyone readies up
// again to start the match.
import type { Player } from 'modlock'

/** gold marks the viewer's own row and the title. */
const gold = '#ffd34d'

/** green marks a ready player. */
const green = '#7ee081'

/** LobbyEntry is one player's line in the lobby. */
export interface LobbyEntry {
  readonly name: string
  readonly ready: boolean
  readonly own: boolean
  /** team is the player's team, 2 or 3, once they have one. */
  readonly team?: number
}

/** teams are the game's two teams, by number, with their names and colors. */
const teams = [
  { team: 2, name: 'Amber', color: '#f0a43a' },
  { team: 3, name: 'Sapphire', color: '#5a9cf0' },
] as const

/** ShownKit is the viewer's dealt kit as the review shows it. */
export interface ShownKit {
  readonly hero: string
  /** abilities are slots 0 to 3; rerollable is false for a locked slot. */
  readonly abilities: readonly { title: string; rerollable: boolean }[]
}

/** LobbyProps is what one player's lobby shows. */
export interface LobbyProps {
  readonly entries: readonly LobbyEntry[]
  /** ready is whether the viewer is ready. */
  readonly ready: boolean
  readonly onReady: (player: Player) => void
  /** kit is the viewer's kit during the review. */
  readonly kit?: ShownKit
  /** rerolls is how many rerolls the viewer has left. */
  readonly rerolls: number
  /** team is the viewer's team, 2 or 3, once they have one. */
  readonly team?: number
  readonly onSwitchTeam: (player: Player) => void
  readonly onReroll: (player: Player, target: 'hero' | number) => void
}

/** slotNames label the four ability slots. */
const slotNames = ['1', '2', '3', 'Ult']

/** Lobby is one player's lobby panel. */
export function Lobby(props: LobbyProps) {
  const { entries, ready } = props
  const readyCount = entries.filter((entry) => entry.ready).length
  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'center',
        verticalAlign: 'center',
        padding: 24,
        width: 420,
        background: '#101820e8',
        borderRadius: 8,
      }}
    >
      <label style={{ fontSize: 30, bold: true, color: gold }}>
        Random Kits
      </label>
      <label style={{ margin: [6, 0, 14, 0], color: '#c8d0d8' }}>
        {props.kit
          ? `Look over your kit · ${readyCount} of ${entries.length} ready to start`
          : `${readyCount} of ${entries.length} ready`}
      </label>
      {props.kit ? (
        <Review
          kit={props.kit}
          rerolls={props.rerolls}
          onReroll={props.onReroll}
        />
      ) : null}
      {teams.map(({ team, name, color }) => {
        const members = entries.filter((entry) => entry.team === team)
        return (
          <panel style={{ flow: 'down', width: 'fill', margin: [12, 0, 0, 0] }}>
            <label style={{ color, bold: true }}>
              {`${name} · ${members.length}`}
            </label>
            {members.map((entry) => (
              <Entry entry={entry} />
            ))}
          </panel>
        )
      })}
      {entries
        .filter((entry) => entry.team === undefined)
        .map((entry) => (
          <Entry entry={entry} />
        ))}
      <button
        onPress={props.onSwitchTeam}
        style={{
          margin: [12, 0, 0, 0],
          padding: [6, 16],
          horizontalAlign: 'center',
          background: '#3a4450',
          borderRadius: 4,
          fontSize: 16,
        }}
      >
        {props.team === 2
          ? 'Switch to Sapphire'
          : props.team === 3
            ? 'Switch to Amber'
            : 'Switch team'}
      </button>
      <button
        onPress={props.onReady}
        style={{
          margin: [18, 0, 0, 0],
          padding: [10, 24],
          horizontalAlign: 'center',
          background: ready ? '#3a4450' : '#2e7d32',
          borderRadius: 6,
          fontSize: 22,
          bold: true,
        }}
      >
        {ready ? 'Not ready' : 'Ready'}
      </button>
      <label style={{ margin: [12, 0, 0, 0], fontSize: 14, color: '#8a949e' }}>
        {props.kit
          ? props.rerolls <= 0
            ? 'No rerolls left. Hover your ability bar to read your abilities.'
            : `${props.rerolls} reroll${props.rerolls === 1 ? '' : 's'} left: a new hero keeps your abilities, except Solomon's pieces and Healing Needles.`
          : 'Everyone gets a random hero, three random abilities and a random ult.'}
      </label>
    </panel>
  )
}

/** Review is the viewer's kit, with a reroll button on each part. */
function Review(props: {
  kit: ShownKit
  rerolls: number
  onReroll: (player: Player, target: 'hero' | number) => void
}) {
  const { kit, rerolls, onReroll } = props
  const rerolled = rerolls <= 0
  return (
    <panel style={{ flow: 'down', width: 'fill' }}>
      <KitRow
        label="Hero"
        title={kit.hero}
        canReroll={!rerolled}
        onReroll={(player) => onReroll(player, 'hero')}
      />
      {kit.abilities.map((ability, slot) => (
        <KitRow
          label={slotNames[slot] ?? ''}
          title={ability.title}
          canReroll={!rerolled && ability.rerollable}
          onReroll={(player) => onReroll(player, slot)}
        />
      ))}
    </panel>
  )
}

/** KitRow is one part of the kit and its reroll button. */
function KitRow(props: {
  label: string
  title: string
  canReroll: boolean
  onReroll: (player: Player) => void
}) {
  return (
    <panel
      style={{
        flow: 'right',
        width: 'fill',
        margin: [4, 0, 0, 0],
        verticalAlign: 'center',
      }}
    >
      <label style={{ width: 48, color: '#8a949e' }}>{props.label}</label>
      <label style={{ width: 'fill', color: '#ffffff', bold: true }}>
        {props.title}
      </label>
      {props.canReroll ? (
        <button
          onPress={props.onReroll}
          style={{
            padding: [4, 12],
            background: '#5a3d8a',
            borderRadius: 4,
            fontSize: 16,
          }}
        >
          Reroll
        </button>
      ) : null}
    </panel>
  )
}

/** Entry is one player's name and whether they are ready. */
function Entry(props: { entry: LobbyEntry }) {
  const { entry } = props
  return (
    <panel style={{ flow: 'right', width: 'fill', margin: [3, 0, 0, 0] }}>
      <label style={{ width: 'fill', color: entry.own ? gold : '#ffffff' }}>
        {entry.name}
      </label>
      <label
        style={{
          width: 110,
          textAlign: 'right',
          color: entry.ready ? green : '#8a949e',
        }}
      >
        {entry.ready ? 'Ready' : 'Not ready'}
      </label>
    </panel>
  )
}
