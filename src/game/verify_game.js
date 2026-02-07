import { createInitialState, startRun, updateState } from './state.js'

console.log('Running game verification...')

const state = createInitialState()
startRun(state)
console.log('Initial State:', { speed: state.speed, distance: state.distance, nextStop: state.nextStopDistance })

// 1. Acceleration Test
console.log('\n--- Acceleration Test ---')
for (let i = 0; i < 60; i++) {
    updateState(state, { accelerate: true }, 1 / 60)
}
console.log('After 1s accel:', { speed: state.speed.toFixed(2), distance: state.distance.toFixed(2) })

if (state.speed > 5) console.log('PASS: Speed increased')
else console.log('FAIL: Speed did not increase')

// 2. Biome Test
console.log('\n--- Biome Test ---')
// Advance to city distance
state.distance = 1500
// Update state to trigger prop rebuild
updateState(state, { accelerate: false }, 1 / 60)

// Check props
const props = state.props
const towers = props.filter(p => p.kind === 'tower').length
const trees = props.filter(p => p.kind === 'tree').length
console.log(`At 1500m (City): Towers=${towers}, Trees=${trees}`)

if (towers > trees) console.log('PASS: City biome has more towers')
else console.log('FAIL: City biome should have more towers')

// 3. Stop Interaction Test
console.log('\n--- Stop Logic Test ---')
// Reset to near stop
state.nextStopDistance = 2000
state.distance = 2000 - 10 // 10m before stop
state.speed = 0
state.doorOpen = false

console.log('Before stop:', { distToStop: state.nextStopDistance - state.distance, door: state.doorOpen })

// Open door with Space
updateState(state, { command: 'space' }, 1 / 60)
console.log('After space:', { door: state.doorOpen })

if (state.doorOpen) console.log('PASS: Door opened')
else console.log('FAIL: Door did not open')

// Board passengers
for (let i = 0; i < 30; i++) { // 0.5s hold time needed
    updateState(state, { command: null }, 1 / 60)
}

console.log('After hold:', { passengers: state.passengers, stopsServed: state.stopsServed })

if (state.passengers > 0) console.log('PASS: Passengers boarded')
else console.log('FAIL: Passengers not boarded')

// 4. Reverse Logic Test
console.log('\n--- Reverse Logic Test ---')
state.distance = state.nextStopDistance + 20 // Passed stop by 20m
console.log('Dist to stop:', state.nextStopDistance - state.distance)
updateState(state, { brake: true }, 1 / 60) // Back up
console.log('Passed stop by 20m. Hud Line:', state.hudLine)
console.log('Missed stops:', state.missedStops)

if (state.missedStops === 0) console.log('PASS: Did not fail instantly upon passing')
else console.log('FAIL: Instant fail triggered')
