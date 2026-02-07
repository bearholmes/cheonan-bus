const MAX_SPEED = 120
const MAX_REVERSE_SPEED = 24
const ACCEL = 8.5
const REVERSE_ACCEL = 30
const BRAKE = 96
const DRAG = 9
const OFFROAD_DRAG = 2
const STEER_RATE = 4.0 // Slower direct steer for inertia
const NATURAL_DECEL = 7.8
const CENTRIFUGAL = 0.32
const ROAD_HALF_WIDTH = 11.6
const STOP_CAPTURE_DISTANCE = 45 // Expanded from 24
const STOP_MISS_DISTANCE = 150 // Allow reversing up to 150m
const STOP_HOLD_SECONDS = 0.2 // Reduced hold time requirement if door logic is used
const STOP_SPEED_REQUIRED = 1.0 // Must be almost stopped to open door
const TARGET_PASSENGERS = 24
const INITIAL_MISSION_TIME = 90
const STAGE_STOP_TARGET = 3

const STOP_MISS_PENALTY_DIST = 150
const SEGMENT_LENGTH = 5.2
const VISIBLE_SEGMENTS = 66
const BACK_VISIBLE_SEGMENTS = 15 // Check further back

// ... (Existing curve constants can stay or be optimized)
const DEFAULT_CURVE_ZONES = [
  { start: 0, end: 140, curve: 0.0 },
  { start: 140, end: 2500, curve: 0.0 } // Simplified default
]
let ACTIVE_CURVE_ZONES = DEFAULT_CURVE_ZONES

// ... (Helper functions like clamp, smoothstep, noise remain similar)

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function repeatDistance(distance) {
  // Simplified lap logic for linear route? 
  // Just keep it simple.
  const lap = ACTIVE_CURVE_ZONES[ACTIVE_CURVE_ZONES.length - 1].end || 20000
  let d = distance % lap
  if (d < 0) d += lap
  return d
}
// ... (Preserve curve/seed logic functions for now, assume they exist or I copy them back)
// Wait, REPLACE works by replacing the block. I need to be careful not to delete helpers unless I rewrite them.
// I will rewrite the necessary helpers.

function smoothstep(t) {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

function zoneCurve(distance) {
  // Simple lookup
  for (const zone of ACTIVE_CURVE_ZONES) {
    if (distance >= zone.start && distance < zone.end) return zone.curve
  }
  return 0
}

function sampleCurve(distance) {
  const base = zoneCurve(distance)
  // Add some noise
  const noise = Math.sin(distance * 0.01) * 0.05
  return clamp(base + noise, -1.2, 1.2)
}

function hash01(v) {
  const s = Math.sin(v * 127.1) * 43758.5453123
  return s - Math.floor(s)
}

function nextStopGapBySeed(seed) {
  return 320 + Math.floor(hash01(seed + 77) * 220)
}

function stopGapByIndex(routeSeed, stopIndex) {
  const base = hash01(routeSeed * 0.0001 + stopIndex * 0.731 + 13.7)
  return 300 + Math.floor(base * 210)
}

function pushToast(state, text, kind = 'info') {
  state.toastSeq += 1
  state.toastMessage = text
  state.toastKind = kind
}

function createRng(seed) {
  let s = (seed | 0) || 1
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0
    return ((s >>> 0) % 1000000) / 1000000
  }
}

function generateCurveZones(seed) {
  const rng = createRng(seed)
  const zones = [{ start: 0, end: 140, curve: 0 }]
  let start = 140
  let lastSign = rng() > 0.5 ? 1 : -1
  while (start < 10000) { // Longer route
    const straightChance = 0.2
    const makeStraight = rng() < straightChance
    const length = makeStraight ? 150 : 100 + rng() * 150
    let curve = 0
    if (!makeStraight) {
      curve = (0.2 + rng() * 0.6) * (rng() > 0.5 ? 1 : -1)
    }
    zones.push({ start, end: start + length, curve })
    start += length
  }
  return zones
}

// ... (buildRoadSamples/Props - I will assume I need to keep them or rewrite them slightly)
// For brevity in this Replace, I'll focus on State & Update logic.
// But I need to provide `buildRoadSamples` and `buildProps` if I replace the whole file or large chunks.
// The previous step messed up `buildRoadSamples` optimization.
// Let's restore/keep the standard `buildRoadSamples`.

function buildRoadSamples(distance) {
  const samples = []
  let centerX = 0 // Simplify track X integration for now to avoid drifting error without persistent state
  // To do continuous variation properly without full integration, we usually use a functional approach or cached segments.
  // For this prototype, functional approximation:

  const scrollOffset = ((distance % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH

  // We need to integrate curve from "Something". 
  // In `state.trackX` we store the accumulated world X.
  // Relative to `state.playerX`, but for rendering we need World Coordinates.

  // Let's just generate local curvature for visual bending.
  // The previous implementation used a local accumulator `smoothCenterX`.
  // It works for "infinite straight road with curves", but not for a persistent map unless we integrate from 0.
  // But since the user wants a seeded map, let's stick to the visual illusion approach which is standard for pseudo-3D/outrun.

  let x = 0
  let dx = 0
  for (let i = -BACK_VISIBLE_SEGMENTS; i < VISIBLE_SEGMENTS; i++) {
    const d = distance + i * SEGMENT_LENGTH
    const c = sampleCurve(d)
    dx += c
    // Reduce curvature accumulation drastically to make curves gentle and drivable
    // 0.1 was too sharp for the steering physics. 0.015 should be gentle.
    x += dx * 0.015

    samples.push({
      i,
      centerX: x,
      curve: c,
      z: 14 + scrollOffset - i * SEGMENT_LENGTH,
      worldDistance: d,
      segmentIndex: Math.floor(d / SEGMENT_LENGTH)
    })
  }
  return samples
}

function buildProps(samples) {
  const props = []
  for (const s of samples) {
    if (s.segmentIndex % 2 !== 0) continue // Skip every other segment to reduce clutter

    const dist = s.worldDistance
    // Biome Logic
    // 0-1200: Suburbs (Trees mixed with some Towers)
    // 1200-2400: City (Dense Towers)
    // 2400+: Nature (Trees)

    let biome = 'suburb'
    if (dist > 1200 && dist < 2400) biome = 'city'
    if (dist >= 2400) biome = 'nature'

    const h = hash01(s.segmentIndex)
    const h2 = hash01(s.segmentIndex + 13)

    let type = 'tree'
    let density = 0.3

    if (biome === 'city') {
      density = 0.6
      if (h2 > 0.3) type = 'tower' // Mostly towers
      else type = 'sign'
    } else if (biome === 'suburb') {
      density = 0.4
      if (h2 > 0.8) type = 'tower'
      else if (h2 > 0.7) type = 'sign'
      else type = 'tree'
    } else {
      // Nature
      density = 0.5
      type = 'tree'
    }

    if (h < density) {
      const side = hash01(s.segmentIndex + 7) > 0.5 ? 1 : -1
      const offset = 14 + hash01(s.segmentIndex + 1) * 10
      props.push({
        kind: type,
        x: s.centerX + side * offset,
        z: s.z,
        scale: 1.0 + hash01(s.segmentIndex * 9) * 0.5 + (type === 'tower' ? 1.0 : 0) // Taller towers
      })
    }
  }
  return props
}

function buildStopMarker(state) {
  // Similar to previous
  if (!state.roadSamples) return null
  let best = null
  let minD = 9999
  for (const s of state.roadSamples) {
    const d = Math.abs(s.worldDistance - state.nextStopDistance)
    if (d < minD) { minD = d; best = s; }
  }
  if (!best || minD > 100) return null
  return {
    x: best.centerX + 15,
    z: best.z,
    zoneX: best.centerX + 5
  }
}


export function createInitialState() {
  const firstStopGap = 380
  const state = {
    mode: 'menu',
    speed: 0,
    speedMax: MAX_SPEED,

    // Physics
    playerX: 0,
    lateralVel: 0,
    steeringValue: 0,
    carYaw: 0,
    carRoll: 0,
    pitch: 0,

    distance: 0,
    trackX: 0,

    // Game
    routeSeed: 1,
    nextStopDistance: firstStopGap,
    stopIndex: 0,
    missedStops: 0,
    stopsServed: 0,
    stageStopsDone: 0,
    stageStopsTarget: STAGE_STOP_TARGET,

    passengers: 0,
    targetPassengers: TARGET_PASSENGERS,
    seats: new Array(TARGET_PASSENGERS).fill(false), // For UI

    // Interaction
    doorOpen: false,
    doorAnim: 0,
    stopHoldTime: 0,

    // Rendering
    roadSamples: [],
    props: [],
    stopMarker: null,

    hudLine: 'Space로 메뉴/도어 조작',
    stamp: '대기 중',
    toastMessage: '',
    toastSeq: 0
  }

  state.roadSamples = buildRoadSamples(0)
  state.props = buildProps(state.roadSamples)
  return state
}

export function startRun(state) {
  const seed = (state.routeSeed + 1) % 9999
  state.routeSeed = seed
  ACTIVE_CURVE_ZONES = generateCurveZones(seed)

  state.mode = 'running'
  state.speed = 0
  state.distance = 0
  state.nextStopDistance = 400
  state.stopIndex = 0
  state.missedStops = 0
  state.passengers = 0
  state.seats.fill(false)
  state.doorOpen = false
  state.doorAnim = 0
  state.playerX = 0
  state.lateralVel = 0
  state.steeringValue = 0
  state.carYaw = 0
  state.carRoll = 0
  state.pitch = 0
  state.stopHoldTime = 0

  state.missionTime = INITIAL_MISSION_TIME
  state.stopsServed = 0

  // Fix "undefined" in HUD
  state.stageStopsDone = 0
  state.stageStopsTarget = STAGE_STOP_TARGET

  state.hudLine = '출발: 정류장에서 정차하고 Space로 문 열기'
  pushToast(state, '운행 시작', 'info')
}

export function updateState(state, input, dt) {
  if (state.mode !== 'running') {
    // Menu logic
    return
  }

  // Physics
  const step = Math.min(dt, 0.1)

  // Update To mission time
  // Wait, missionTime needs to decrease? Or just use it for display?
  // User said "Timer NAN". Usually timers count down.
  if (state.mode === 'running') {
    state.missionTime -= step
    if (state.missionTime <= 0) {
      state.missionTime = 0
      state.mode = 'ended'
      state.result = 'timeout'
    }
  }

  state.doorAnim += ((state.doorOpen ? 1 : 0) - state.doorAnim) * step * 5

  // Drive Logic - Split Brake and Reverse
  const accel = input.accelerate && !state.doorOpen
  const brake = input.brake
  const reverse = input.reverse && !state.doorOpen // dedicated reverse key

  if (state.doorOpen && (accel || reverse)) {
    pushToast(state, '문이 열려있습니다!', 'alert')
  }

  // Speed Physics with Brake/Reverse Logic
  let targetSpeed = state.speed

  if (accel) {
    if (state.speed < -0.1) {
      // Braking from reverse
      targetSpeed += BRAKE * step
      if (targetSpeed > 0) targetSpeed = 0
    } else {
      // Accelerating forward
      targetSpeed += ACCEL * step
    }
  } else if (reverse) {
    // Reverse Logic
    if (state.speed > 0.1) {
      // Braking from forward should be S, but if R is pressed?
      // Let's assume R means "want to go back".
      targetSpeed -= BRAKE * step
    } else {
      // Actually reversing
      targetSpeed -= REVERSE_ACCEL * step
    }
  }

  // S Key is strictly Brake/Stop now
  if (brake) {
    if (state.speed > 0.1) {
      targetSpeed -= BRAKE * step
      if (targetSpeed < 0) targetSpeed = 0 // Snap to 0
    } else if (state.speed < -0.1) {
      targetSpeed += BRAKE * step
      if (targetSpeed > 0) targetSpeed = 0 // Snap to 0
    } else {
      targetSpeed = 0 // Hold 0
    }
  }

  if (!accel && !brake && !reverse) {
    targetSpeed *= 0.98 // Friction
    if (Math.abs(targetSpeed) < 0.05) targetSpeed = 0
  }

  // Apply changes directly 
  state.speed = targetSpeed

  // Force strict 0 for door logic comfort
  if (Math.abs(state.speed) < 0.05) state.speed = 0

  state.speed = clamp(state.speed, -MAX_REVERSE_SPEED, MAX_SPEED)

  // Door Logic (Moved after speed update to use latest speed)
  // Check input.command again just in case, or reuse variable?
  // Input read is constant per frame.
  let doorInput = input.command === 'space'

  // STRICT REQUIREMENT: ZERO SPEED
  if (doorInput) {
    if (Math.abs(state.speed) < 0.01) {
      state.speed = 0 // Ensure it is exactly 0
      state.doorOpen = !state.doorOpen
      state.hudLine = state.doorOpen ? '도어 개방' : 'W: 가속 | S: 브레이크 | R: 후진'
    } else {
      pushToast(state, '완전히 멈춘 후(속도 0) 문을 여세요', 'bad')
    }
  }

  // Steering
  const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  // Increase interpolation speed for snappier steering
  state.steeringValue += (steerInput - state.steeringValue) * step * 6.0

  // Increase coefficient: 0.08 -> 0.35 for realistic lane change speed (approx 10m/s at max speed)
  // Also enable turning at lower speeds smoothly
  const turnSpeedFactor = Math.abs(state.speed) > 2.0 ? state.speed : (Math.abs(state.speed) > 0.1 ? Math.sign(state.speed) * 2.0 : 0)

  state.lateralVel = state.steeringValue * turnSpeedFactor * 0.35
  state.playerX += state.lateralVel * step

  // Car Body Physics
  state.carYaw = -state.steeringValue * 0.5 // Much stronger body rotation (visual only)
  state.carRoll = -state.steeringValue * state.speed * 0.006 // Stronger roll (leaning)
  // Pitch from accel
  const deltaSpeed = state.speed - (state.prevSpeed || 0)
  state.pitch = -deltaSpeed * 0.05
  state.prevSpeed = state.speed

  // Movement
  state.distance += state.speed * step

  // Stop Logic
  const distToStop = state.nextStopDistance - state.distance

  if (Math.abs(distToStop) < STOP_CAPTURE_DISTANCE && Math.abs(state.speed) < 0.1 && state.doorOpen) {
    state.stopHoldTime += step
    const boardingDuration = 2.0 // Wait 2 seconds for boarding

    if (state.stopHoldTime <= boardingDuration) {
      state.hudLine = `승객 탑승 중... ${(state.stopHoldTime / boardingDuration * 100).toFixed(0)}%`
      // Fill seats visually during boarding
      const seatsToFill = Math.floor((state.stopHoldTime / boardingDuration) * 3)
      for (let k = 0; k < seatsToFill; k++) {
        const idx = state.seats.findIndex(s => !s)
        if (idx >= 0) state.seats[idx] = true
      }
    } else {
      // Boarding Complete
      state.stopsServed++
      state.passengers += 3
      // Ensure 3 seats are marked filled (in case of frame skips)
      for (let i = 0; i < 3; i++) {
        const idx = state.seats.findIndex(s => !s)
        if (idx >= 0) state.seats[idx] = true
      }

      state.stopIndex++
      state.nextStopDistance += 400 + Math.random() * 200

      // Do NOT auto close. Let user close.
      // state.doorOpen = false 

      pushToast(state, '탑승 완료! 문을 닫고 출발하세요.', 'good')
      state.hudLine = 'Space로 문을 닫고 출발하세요'

      // Reset hold time? No, otherwise it loops logic because next stop is far?
      // Actually once nextStopDistance updates, distToStop becomes ~400.
      // So this block won't run again.
      state.stopHoldTime = 0
    }
  }

  // Miss logic
  if (distToStop < -STOP_MISS_DISTANCE) {
    state.stopIndex++
    state.nextStopDistance += 400
    state.missedStops++
    pushToast(state, '정류장 놓침!', 'bad')
  }

  // Render Gen
  state.roadSamples = buildRoadSamples(state.distance)
  state.props = buildProps(state.roadSamples)
  state.stopMarker = buildStopMarker(state)
}

export function renderGameToText(state) {
  return JSON.stringify({
    speed: state.speed.toFixed(1),
    passengers: state.passengers,
    door: state.doorOpen ? 'OPEN' : 'CLOSED',
    nextStop: (state.nextStopDistance - state.distance).toFixed(0) + 'm',
    playerX: state.playerX.toFixed(2),
    lateralVel: state.lateralVel.toFixed(2),
    steeringValue: state.steeringValue.toFixed(2),
    carYaw: state.carYaw.toFixed(2),
    carRoll: state.carRoll.toFixed(2),
    pitch: state.pitch.toFixed(2)
  })
}
