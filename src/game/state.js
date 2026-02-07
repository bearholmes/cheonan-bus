const MAX_SPEED = 120
const MAX_REVERSE_SPEED = 24
const ACCEL = 8.5
const REVERSE_ACCEL = 30
const BRAKE = 96
const DRAG = 9
const OFFROAD_DRAG = 2
const STEER_RATE = 4.0
const NATURAL_DECEL = 12.0 // 좀 더 강한 자연 감속
const CENTRIFUGAL = 0.25 // 원심력 하향
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

// [v7.2] Pre-generated Track for Stability
function generateTrack(runDistance = 15000) {
  const track = []
  let x = 0
  let dx = 0
  const totalSegments = Math.ceil(runDistance / SEGMENT_LENGTH) + VISIBLE_SEGMENTS + 50

  for (let i = 0; i < totalSegments; i++) {
    const d = i * SEGMENT_LENGTH
    const c = sampleCurve(d)
    dx += c
    x += dx * 0.18
    track.push({
      worldZ: d,
      centerX: x,
      curve: c,
      segmentIndex: i
    })
  }
  return track
}

// [v6.9] GC Optimization: Reuse objects
const samplePool = Array.from({ length: VISIBLE_SEGMENTS + BACK_VISIBLE_SEGMENTS + 10 }, () => ({
  i: 0, centerX: 0, curve: 0, z: 0, worldDistance: 0, segmentIndex: 0
}))

export function buildRoadSamples(distance, state) {
  const scrollOffset = ((distance % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH

  // Use pool or state.roadSamples if available
  const samples = state && state.roadSamples ? state.roadSamples : []

  // Ensure capacity logic (simple fixed size for arcade feel)
  if (samples.length === 0) {
    for (let i = 0; i < 40; i++) samples.push({ ...samplePool[i] })
  }

  let x = 0
  let dx = 0
  let index = 0

  for (let i = -BACK_VISIBLE_SEGMENTS; i < VISIBLE_SEGMENTS; i++) {
    const d = distance + i * SEGMENT_LENGTH
    const c = sampleCurve(d)
    dx += c
    x += dx * 0.18

    // Expand if needed (shouldn't happen often with fixed view)
    if (!samples[index]) samples[index] = { ...samplePool[0] }

    const s = samples[index]
    s.i = i
    s.centerX = x
    s.curve = c
    s.z = 14 + scrollOffset - i * SEGMENT_LENGTH
    s.worldDistance = d
    s.segmentIndex = Math.floor(d / SEGMENT_LENGTH)

    index++
  }

  // Truncate
  if (samples.length > index) samples.length = index

  const busIdx = BACK_VISIBLE_SEGMENTS
  const offset = samples[busIdx] ? samples[busIdx].centerX : 0

  for (let k = 0; k < index; k++) {
    samples[k].centerX -= offset
  }

  return samples
}

const propPool = Array.from({ length: 150 }, () => ({
  kind: 'tree', x: 0, z: 0, scale: 1
}))

export function buildProps(samples, state) {
  // Reuse state.props array
  const props = state && state.props ? state.props : []
  let propIdx = 0

  for (const s of samples) {
    if (s.segmentIndex % 2 !== 0) continue

    const dist = s.worldDistance
    let biome = 'suburb'
    if (dist > 1200 && dist < 2400) biome = 'city'
    if (dist >= 2400) biome = 'nature'

    const h = hash01(s.segmentIndex)
    const h2 = hash01(s.segmentIndex + 13)

    let type = 'tree'
    let density = 0.3

    if (biome === 'city') {
      density = 0.6
      if (h2 > 0.3) type = 'tower'
      else type = 'sign'
    } else if (biome === 'suburb') {
      density = 0.4
      if (h2 > 0.8) type = 'tower'
      else if (h2 > 0.7) type = 'sign'
      else type = 'tree'
    } else {
      density = 0.5
      type = 'tree'
    }

    if (h < density) {
      const side = hash01(s.segmentIndex + 7) > 0.5 ? 1 : -1
      const offset = 14 + hash01(s.segmentIndex + 1) * 10

      // Alloc / Reuse
      if (!props[propIdx]) props[propIdx] = { ...propPool[0] }

      const p = props[propIdx]
      p.kind = type
      p.x = s.centerX + side * offset
      p.z = s.z
      p.scale = 1.0 + hash01(s.segmentIndex * 9) * 0.5 + (type === 'tower' ? 1.0 : 0)

      propIdx++
    }
  }

  // Truncate logic to hide unused props
  if (props.length > propIdx) props.length = propIdx

  return props
}

export function buildStopMarker(state) {
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

    // Interpolation (Prev State)
    prevPlayerX: 0,
    prevLateralVel: 0,
    prevSteeringValue: 0,
    prevCarYaw: 0,
    prevCarRoll: 0,
    prevPitch: 0,
    prevDistance: 0,
    prevTrackX: 0,

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
    track: generateTrack(15000), // Generate fixed track

    hudLine: 'Space로 메뉴/도어 조작',
    stamp: '대기 중',
    toastMessage: '',
    toastSeq: 0,
    missionTime: INITIAL_MISSION_TIME
  }

  state.roadSamples = buildRoadSamples(0, state)
  state.props = buildProps(state.roadSamples, state)
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
  state.mode = 'running'
  state.distance = 0
  state.speed = 0
  state.doorOpen = false // 출발 시에는 문을 닫은 상태로 시작하여 즉시 가속 가능하게 함
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

  // [v7.7] State Backup for Interpolation
  state.prevPlayerX = state.playerX
  state.prevLateralVel = state.lateralVel
  state.prevSteeringValue = state.steeringValue
  state.prevCarYaw = state.carYaw
  state.prevCarRoll = state.carRoll
  state.prevPitch = state.pitch
  state.prevDistance = state.distance
  state.prevTrackX = state.trackX

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

  // 1. 가속 및 감속 로직 (v6.4: 확실한 반응성)
  const accel = input.accelerate && !state.doorOpen
  const brake = input.brake
  const reverse = input.reverse && !state.doorOpen

  if (state.doorOpen && (input.accelerate || input.reverse)) {
    if (Math.round(state.distance * 10) % 10 === 0) {
      pushToast(state, '문을 닫아야 출발할 수 있습니다 (Space)', 'alert')
    }
  }

  let targetSpeed = state.speed
  if (accel) {
    targetSpeed += ACCEL * step
  } else if (reverse) {
    targetSpeed -= REVERSE_ACCEL * step
  }

  // 브레이크 로직
  if (brake) {
    const brakeForce = BRAKE * step
    if (state.speed > 0.1) {
      targetSpeed -= brakeForce
      if (targetSpeed < 0) targetSpeed = 0
    } else if (state.speed < -0.1) {
      targetSpeed += brakeForce
      if (targetSpeed > 0) targetSpeed = 0
    } else {
      targetSpeed = 0
    }
  }

  // 자연 감속
  if (!accel && !brake && !reverse) {
    const drag = NATURAL_DECEL * step
    if (state.speed > 0) {
      targetSpeed -= drag
      if (targetSpeed < 0) targetSpeed = 0
    } else if (state.speed < 0) {
      targetSpeed += drag
      if (targetSpeed > 0) targetSpeed = 0
    }
  }

  state.speed = clamp(targetSpeed, -MAX_REVERSE_SPEED, MAX_SPEED)
  if (Math.abs(state.speed) < 0.05) state.speed = 0

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

  // 2. 조향 및 상대 좌표 물리 (v6.4 Final)
  const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  state.steeringValue += (steerInput - state.steeringValue) * step * 12.0

  const currentCurve = sampleCurve(state.distance)

  // 조향력 강화: 커브에서도 충분히 안쪽으로 파고들 수 있게 함
  const isMoving = Math.abs(state.speed) > 0.05
  const steerPower = isMoving ? (38.0 + Math.abs(state.speed) * 0.45) : 0

  state.lateralVel = state.steeringValue * steerPower
  state.playerX += state.lateralVel * step

  // 원심력: 사용자가 조작하지 않을 때만 밀려나는 느낌을 주도록 하향 조정
  const centrifugalForce = currentCurve * state.speed * step * CENTRIFUGAL * 1.5
  state.playerX -= centrifugalForce

  // 도로 경계 제한 (상대 좌표)
  const maxOffRoad = ROAD_HALF_WIDTH * 1.8
  state.playerX = clamp(state.playerX, -maxOffRoad, maxOffRoad)

  // 3. 차체 회전 동기화 (Yaw & Roll)
  const headingAngle = Math.atan2(state.lateralVel, Math.abs(state.speed) + 2.0)

  // [v6.5] 후진 시 차체 회전 방향 반전 (User Feedback Fix)
  const dir = state.speed < -0.1 ? -1 : 1

  // 차체 Yaw: 진행 방향 + 도로 곡률
  // 후진 시에는 headingAngle을 반대로 적용해야 엉덩이가 진행 방향으로 돌아가는 느낌
  state.carYaw = -(headingAngle * 2.0 * dir) // [v6.6] Auto-Yaw 제거: 오직 물리적 이동 방향만 반영
  state.carRoll = -state.steeringValue * state.speed * 0.005

  // Pitch & PrevSpeed
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

  if (distToStop < -STOP_MISS_DISTANCE) {
    state.stopIndex++
    state.nextStopDistance += 400
    state.missedStops++
    pushToast(state, '정류장 놓침!', 'bad')
  }

  // Render Generation handled in Game Loop with Interpolation
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
