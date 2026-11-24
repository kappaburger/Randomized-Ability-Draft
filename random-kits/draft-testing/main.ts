import { command, onPlayerJoin, onStart, setRespawnDelay } from 'modlock'
import { apply } from 'modlock/console'

// Set the server up when the mod starts: no troopers in the lanes or creeps
// in the jungle, and any number of players on the same hero.
onStart(() => {
  apply({
    citadel_trooper_spawn_enabled: false,
    citadel_neutral_spawn_enabled: false,
    citadel_allow_duplicate_heroes: true,
  })
})

// Bring a fallen hero back after 3 seconds.
setRespawnDelay(3)

// Give each player who joins a hero on the smaller team, skipping the game's
// team and hero screens, and welcome them. hero: 'haze' names the hero and
// team: 2 the team.
onPlayerJoin(({ connection }) => {
  connection.player.seat({ hero: 'any' })
  connection.player.announce('Draft Testing', 'Welcome, ' + connection.name + '.')
})

// Greet each player who types /hello in chat.
command('hello', (player) => {
  player.chat('Hello from Draft Testing!')
})
