const MAX_SPEED = 120
const MAX_REVERSE_SPEED = 24
const ACCEL = 8.5
const REVERSE_ACCEL = 30
const BRAKE = 96
const STEER_RATE = 4.0
const NATURAL_DECEL = 12.0
const CENTRIFUGAL = 0.25
const ROAD_HALF_WIDTH = 11.6
const STOP_CAPTURE_DISTANCE = 45
const STOP_MISS_DISTANCE = 150
const TARGET_PASSENGERS = 24
const INITIAL_MISSION_TIME = 90
const STAGE_STOP_TARGET = 3
const STRAIGHT_START_DISTANCE = 800

const SEGMENT_LENGTH = 5.2
const VISIBLE_SEGMENTS = 66
const BACK_VISIBLE_SEGMENTS = 15
const TRACK_RUN_DISTANCE = 30000

const DEFAULT_CURVE_ZONES = [
  { start: 0, end: STRAIGHT_START_DISTANCE, curve: 0.0 },
  { start: STRAIGHT_START_DISTANCE, end: 2500, curve: 0.0 }
]

let ACTIVE_CURVE_ZONES = DEFAULT_CURVE_ZONES

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function normalizeAngle(angle) {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function zoneCurve(distance) {
  for (const zone of ACTIVE_CURVE_ZONES) {
    if (distance >= zone.start && distance < zone.end) return zone.curve
  }
  return 0
}

function sampleCurve(distance) {
  if (distance < STRAIGHT_START_DISTANCE) return 0
  const base = zoneCurve(distance)
  const noise = Math.sin(distance * 0.01) * 0.05
  return clamp(base + noise, -1.2, 1.2)
}

function hash01(v) {
  const s = Math.sin(v * 127.1) * 43758.5453123
  return s - Math.floor(s)
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
  const zones = [{ start: 0, end: STRAIGHT_START_DISTANCE, curve: 0 }]
  let start = STRAIGHT_START_DISTANCE

  while (start < 10000) {
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

function generateTrack(runDistance = TRACK_RUN_DISTANCE) {
  const totalSegments = Math.ceil(runDistance / SEGMENT_LENGTH) + 3
  const track = new Array(totalSegments)

  let x = 0
  let dx = 0

  for (let i = 0; i < totalSegments; i += 1) {
    const distance = i * SEGMENT_LENGTH
    const curve = sampleCurve(distance)
    dx += curve
    x += dx * 0.18

    track[i] = {
      distance,
      x,
      z: distance,
      curve,
      heading: 0,
      rightX: 1,
      rightZ: 0
    }
  }

  for (let i = 0; i < totalSegments - 1; i += 1) {
    const current = track[i]
    const next = track[i + 1]
    const dxStep = next.x - current.x
    const dzStep = next.z - current.z
    const len = Math.hypot(dxStep, dzStep) || 1

    current.heading = Math.atan2(dxStep, dzStep)
    current.rightX = dzStep / len
    current.rightZ = -dxStep / len
  }

  const last = track[totalSegments - 1]
  const prev = track[totalSegments - 2]
  last.heading = prev.heading
  last.rightX = prev.rightX
  last.rightZ = prev.rightZ

  return track
}

function sampleTrackPoint(state, distance) {
  const track = state.track
  if (!track || track.length < 2) {
    return {
      centerX: 0,
      centerZ: distance,
      heading: 0,
      rightX: 1,
      rightZ: 0,
      curve: sampleCurve(distance),
      segmentIndex: Math.max(0, Math.floor(distance / SEGMENT_LENGTH))
    }
  }

  const maxIndex = track.length - 1
  const maxDistance = track[maxIndex].distance
  let d = distance

  if (d < 0) {
    const p0 = track[0]
    const p1 = track[1]
    const dxStep = p1.x - p0.x
    const dzStep = p1.z - p0.z
    const len = Math.hypot(dxStep, dzStep) || 1
    const forwardX = dxStep / len
    const forwardZ = dzStep / len

    return {
      centerX: p0.x + forwardX * d,
      centerZ: p0.z + forwardZ * d,
      heading: p0.heading,
      rightX: p0.rightX,
      rightZ: p0.rightZ,
      curve: p0.curve,
      segmentIndex: 0
    }
  }
  if (d > maxDistance) d = maxDistance

  const baseIndex = Math.min(maxIndex - 1, Math.max(0, Math.floor(d / SEGMENT_LENGTH)))
  const p0 = track[baseIndex]
  const p1 = track[baseIndex + 1]
  const span = Math.max(0.0001, p1.distance - p0.distance)
  const t = clamp((d - p0.distance) / span, 0, 1)

  const centerX = p0.x + (p1.x - p0.x) * t
  const centerZ = p0.z + (p1.z - p0.z) * t

  const dxStep = p1.x - p0.x
  const dzStep = p1.z - p0.z
  const len = Math.hypot(dxStep, dzStep) || 1

  return {
    centerX,
    centerZ,
    heading: Math.atan2(dxStep, dzStep),
    rightX: dzStep / len,
    rightZ: -dxStep / len,
    curve: p0.curve + (p1.curve - p0.curve) * t,
    segmentIndex: baseIndex
  }
}

function projectWorldToTrack(state, worldX, worldZ, hintDistance = 0) {
  const track = state.track
  if (!track || track.length < 2) {
    const point = sampleTrackPoint(state, hintDistance)
    const dx = worldX - point.centerX
    const dz = worldZ - point.centerZ
    return {
      ...point,
      distance: hintDistance,
      lateral: dx * point.rightX + dz * point.rightZ
    }
  }

  const maxSegmentIndex = track.length - 2
  const hintIndex = clamp(Math.floor(hintDistance / SEGMENT_LENGTH), 0, maxSegmentIndex)
  const searchRadius = 140
  const startIndex = Math.max(0, hintIndex - searchRadius)
  const endIndex = Math.min(maxSegmentIndex, hintIndex + searchRadius)

  let best = null
  let bestDistSq = Number.POSITIVE_INFINITY

  for (let i = startIndex; i <= endIndex; i += 1) {
    const p0 = track[i]
    const p1 = track[i + 1]
    const vx = p1.x - p0.x
    const vz = p1.z - p0.z
    const lenSq = vx * vx + vz * vz || 1

    const wx = worldX - p0.x
    const wz = worldZ - p0.z
    const t = clamp((wx * vx + wz * vz) / lenSq, 0, 1)

    const centerX = p0.x + vx * t
    const centerZ = p0.z + vz * t
    const dx = worldX - centerX
    const dz = worldZ - centerZ
    const distSq = dx * dx + dz * dz

    if (distSq < bestDistSq) {
      const len = Math.sqrt(lenSq) || 1
      bestDistSq = distSq
      best = {
        segmentIndex: i,
        distance: p0.distance + (p1.distance - p0.distance) * t,
        centerX,
        centerZ,
        heading: Math.atan2(vx, vz),
        rightX: vz / len,
        rightZ: -vx / len,
        curve: p0.curve + (p1.curve - p0.curve) * t
      }
    }
  }

  if (!best) {
    const point = sampleTrackPoint(state, hintDistance)
    const dx = worldX - point.centerX
    const dz = worldZ - point.centerZ
    return {
      ...point,
      distance: hintDistance,
      lateral: dx * point.rightX + dz * point.rightZ
    }
  }

  const lateral = (worldX - best.centerX) * best.rightX + (worldZ - best.centerZ) * best.rightZ
  return { ...best, lateral }
}

const samplePool = Array.from({ length: VISIBLE_SEGMENTS + BACK_VISIBLE_SEGMENTS + 12 }, () => ({
  i: 0,
  centerX: 0,
  centerZ: 0,
  curve: 0,
  z: 0,
  worldDistance: 0,
  segmentIndex: 0,
  heading: 0,
  rightX: 1,
  rightZ: 0
}))

export function buildRoadSamples(distance, state) {
  const samples = state && state.roadSamples ? state.roadSamples : []
  let index = 0

  for (let i = -BACK_VISIBLE_SEGMENTS; i < VISIBLE_SEGMENTS; i += 1) {
    const worldDistance = distance + i * SEGMENT_LENGTH
    const point = sampleTrackPoint(state, worldDistance)

    if (!samples[index]) samples[index] = { ...samplePool[0] }

    const s = samples[index]
    s.i = i
    s.centerX = point.centerX
    s.centerZ = point.centerZ
    s.curve = point.curve
    s.z = point.centerZ
    s.worldDistance = worldDistance
    s.segmentIndex = Math.max(0, point.segmentIndex)
    s.heading = point.heading
    s.rightX = point.rightX
    s.rightZ = point.rightZ

    index += 1
  }

  if (samples.length > index) samples.length = index
  return samples
}

const propPool = Array.from({ length: 150 }, () => ({
  kind: 'tree',
  x: 0,
  z: 0,
  scale: 1,
  heading: 0
}))

export function buildProps(samples, state) {
  const props = state && state.props ? state.props : []
  let propIdx = 0

  for (const s of samples) {
    if (s.i < 4) continue
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
      const offset = 24 + hash01(s.segmentIndex + 1) * 12

      if (!props[propIdx]) props[propIdx] = { ...propPool[0] }

      const p = props[propIdx]
      p.kind = type
      p.x = s.centerX + s.rightX * offset * side
      p.z = s.centerZ + s.rightZ * offset * side
      p.heading = s.heading
      p.scale = 1.0 + hash01(s.segmentIndex * 9) * 0.5 + (type === 'tower' ? 1.0 : 0)

      propIdx += 1
    }
  }

  if (props.length > propIdx) props.length = propIdx
  return props
}

export function buildStopMarker(state) {
  if (!state.roadSamples || state.roadSamples.length === 0) return null

  let best = null
  let minD = 9999

  for (const s of state.roadSamples) {
    const d = Math.abs(s.worldDistance - state.nextStopDistance)
    if (d < minD) {
      minD = d
      best = s
    }
  }

  if (!best || minD > 100) return null

  const side = 1
  const poleOffset = 15
  const zoneOffset = 5

  return {
    centerX: best.centerX,
    centerZ: best.centerZ,
    heading: best.heading,
    rightX: best.rightX,
    rightZ: best.rightZ,
    x: best.centerX + best.rightX * poleOffset * side,
    z: best.centerZ + best.rightZ * poleOffset * side,
    zoneX: best.centerX + best.rightX * zoneOffset * side,
    zoneZ: best.centerZ + best.rightZ * zoneOffset * side,
    side: side > 0 ? 'right' : 'left'
  }
}

export function createInitialState() {
  const firstStopGap = 380
  const track = generateTrack(TRACK_RUN_DISTANCE)
  const startPoint = sampleTrackPoint({ track }, 0)

  const state = {
    mode: 'menu',
    speed: 0,
    speedMax: MAX_SPEED,

    playerX: 0,
    lateralVel: 0,
    steeringValue: 0,
    carYaw: 0,
    carRoll: 0,
    pitch: 0,

    distance: 0,
    trackX: 0,
    curveNow: startPoint.curve,
    trackSegmentHint: 0,
    worldX: startPoint.centerX,
    worldZ: startPoint.centerZ,
    worldYaw: startPoint.heading,

    prevPlayerX: 0,
    prevLateralVel: 0,
    prevSteeringValue: 0,
    prevCarYaw: 0,
    prevCarRoll: 0,
    prevPitch: 0,
    prevDistance: 0,
    prevTrackX: 0,
    prevWorldX: startPoint.centerX,
    prevWorldZ: startPoint.centerZ,
    prevWorldYaw: startPoint.heading,

    routeSeed: 1,
    nextStopDistance: firstStopGap,
    stopIndex: 0,
    missedStops: 0,
    stopsServed: 0,
    stageStopsDone: 0,
    stageStopsTarget: STAGE_STOP_TARGET,

    passengers: 0,
    targetPassengers: TARGET_PASSENGERS,
    seats: new Array(TARGET_PASSENGERS).fill(false),

    doorOpen: false,
    doorAnim: 0,
    stopHoldTime: 0,

    roadSamples: [],
    props: [],
    stopMarker: null,
    track,

    hudLine: 'Space로 메뉴/도어 조작',
    stamp: '대기 중',
    toastMessage: '',
    toastSeq: 0,
    missionTime: INITIAL_MISSION_TIME,
    result: null
  }

  state.roadSamples = buildRoadSamples(0, state)
  state.props = buildProps(state.roadSamples, state)
  state.stopMarker = buildStopMarker(state)

  return state
}

export function startRun(state) {
  const seed = state.routeSeed
  ACTIVE_CURVE_ZONES = generateCurveZones(seed)

  state.track = generateTrack(TRACK_RUN_DISTANCE)
  const startPoint = sampleTrackPoint(state, 0)

  state.mode = 'running'
  state.speed = 0
  state.distance = 0
  state.nextStopDistance = 400
  state.stopIndex = 0
  state.missedStops = 0
  state.passengers = 0
  state.seats.fill(false)
  state.doorOpen = false
  state.steeringValue = 0
  state.carYaw = 0
  state.carRoll = 0
  state.pitch = 0
  state.stopHoldTime = 0

  state.playerX = 0
  state.lateralVel = 0
  state.trackX = 0
  state.curveNow = startPoint.curve
  state.trackSegmentHint = 0
  state.worldX = startPoint.centerX
  state.worldZ = startPoint.centerZ
  state.worldYaw = startPoint.heading

  state.prevPlayerX = 0
  state.prevLateralVel = 0
  state.prevSteeringValue = 0
  state.prevCarYaw = 0
  state.prevCarRoll = 0
  state.prevPitch = 0
  state.prevDistance = 0
  state.prevTrackX = 0
  state.prevWorldX = startPoint.centerX
  state.prevWorldZ = startPoint.centerZ
  state.prevWorldYaw = startPoint.heading

  state.missionTime = INITIAL_MISSION_TIME
  state.stopsServed = 0
  state.stageStopsDone = 0
  state.stageStopsTarget = STAGE_STOP_TARGET
  state.result = null

  state.hudLine = '출발: 정류장에서 정차하고 Space로 문 열기'
  pushToast(state, '운행 시작', 'info')

  state.roadSamples = buildRoadSamples(0, state)
  state.props = buildProps(state.roadSamples, state)
  state.stopMarker = buildStopMarker(state)
}

export function updateState(state, input, dt) {
  if (state.mode !== 'running') {
    return
  }

  state.prevPlayerX = state.playerX
  state.prevLateralVel = state.lateralVel
  state.prevSteeringValue = state.steeringValue
  state.prevCarYaw = state.carYaw
  state.prevCarRoll = state.carRoll
  state.prevPitch = state.pitch
  state.prevDistance = state.distance
  state.prevTrackX = state.trackX
  state.prevWorldX = state.worldX
  state.prevWorldZ = state.worldZ
  state.prevWorldYaw = state.worldYaw

  const step = Math.min(dt, 0.1)

  state.missionTime -= step
  if (state.missionTime <= 0) {
    state.missionTime = 0
    state.mode = 'ended'
    state.result = 'timeout'
    return
  }

  state.doorAnim += ((state.doorOpen ? 1 : 0) - state.doorAnim) * step * 5

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

  const doorInput = input.command === 'space'
  if (doorInput) {
    if (Math.abs(state.speed) < 0.01) {
      state.speed = 0
      state.doorOpen = !state.doorOpen
      state.hudLine = state.doorOpen ? '도어 개방' : 'W: 가속 | S: 브레이크 | R: 후진'
    } else {
      pushToast(state, '완전히 멈춘 후(속도 0) 문을 여세요', 'bad')
    }
  }

  const steerInput = input.left ? 1 : input.right ? -1 : 0
  state.steeringValue += (steerInput - state.steeringValue) * step * (STEER_RATE * 3)

  const speedAbs = Math.abs(state.speed)
  const projectionBefore = projectWorldToTrack(state, state.worldX, state.worldZ, state.distance)
  const dir = state.speed < -0.1 ? -1 : 1
  const steerAuthority = clamp((speedAbs - 0.4) / 3.6, 0, 1)
  const steerYawRate = state.steeringValue * (0.55 + speedAbs * 0.012) * dir * steerAuthority
  state.worldYaw = normalizeAngle(state.worldYaw + steerYawRate * step)

  const forwardX = Math.sin(state.worldYaw)
  const forwardZ = Math.cos(state.worldYaw)
  state.worldX += forwardX * state.speed * step
  state.worldZ += forwardZ * state.speed * step

  let projection = projectWorldToTrack(state, state.worldX, state.worldZ, projectionBefore.distance)

  const maxOffRoad = ROAD_HALF_WIDTH * 1.8
  const clampedOffset = clamp(projection.lateral, -maxOffRoad, maxOffRoad)
  if (clampedOffset !== projection.lateral) {
    state.worldX = projection.centerX + projection.rightX * clampedOffset
    state.worldZ = projection.centerZ + projection.rightZ * clampedOffset
    projection = projectWorldToTrack(state, state.worldX, state.worldZ, projection.distance)
  }

  state.playerX = clampedOffset
  state.lateralVel = (state.playerX - state.prevPlayerX) / Math.max(step, 0.0001)
  state.distance = projection.distance
  state.trackX = projection.centerX
  state.curveNow = projection.curve
  state.trackSegmentHint = projection.segmentIndex

  const slipAngle = normalizeAngle(state.worldYaw - projection.heading)
  state.carYaw = clamp(slipAngle, -0.45, 0.45)
  state.carRoll = clamp(-state.steeringValue * speedAbs * 0.0042, -0.24, 0.24)

  const deltaSpeed = state.speed - (state.prevSpeed || 0)
  state.pitch = -deltaSpeed * 0.05
  state.prevSpeed = state.speed

  const distToStop = state.nextStopDistance - state.distance

  if (Math.abs(distToStop) < STOP_CAPTURE_DISTANCE && Math.abs(state.speed) < 0.1 && state.doorOpen) {
    state.stopHoldTime += step
    const boardingDuration = 2.0

    if (state.stopHoldTime <= boardingDuration) {
      state.hudLine = `승객 탑승 중... ${(state.stopHoldTime / boardingDuration * 100).toFixed(0)}%`
      const seatsToFill = Math.floor((state.stopHoldTime / boardingDuration) * 3)
      for (let k = 0; k < seatsToFill; k += 1) {
        const idx = state.seats.findIndex((s) => !s)
        if (idx >= 0) state.seats[idx] = true
      }
    } else {
      state.stopsServed += 1
      state.passengers += 3

      for (let i = 0; i < 3; i += 1) {
        const idx = state.seats.findIndex((s) => !s)
        if (idx >= 0) state.seats[idx] = true
      }

      state.stopIndex += 1
      state.nextStopDistance += 400 + Math.random() * 200

      pushToast(state, '탑승 완료! 문을 닫고 출발하세요.', 'good')
      state.hudLine = 'Space로 문을 닫고 출발하세요'
      state.stopHoldTime = 0
    }
  }

  if (distToStop < -STOP_MISS_DISTANCE) {
    state.stopIndex += 1
    state.nextStopDistance += 400
    state.missedStops += 1
    pushToast(state, '정류장 놓침!', 'bad')
  }
}

export function renderGameToText(state) {
  return JSON.stringify({
    speed: state.speed.toFixed(1),
    passengers: state.passengers,
    door: state.doorOpen ? 'OPEN' : 'CLOSED',
    nextStop: `${(state.nextStopDistance - state.distance).toFixed(0)}m`,
    playerX: state.playerX.toFixed(2),
    worldTrackX: state.trackX.toFixed(2),
    distance: state.distance.toFixed(1),
    lateralVel: state.lateralVel.toFixed(2),
    worldX: state.worldX.toFixed(2),
    worldZ: state.worldZ.toFixed(2),
    worldYaw: state.worldYaw.toFixed(2),
    steeringValue: state.steeringValue.toFixed(2),
    carYaw: state.carYaw.toFixed(2),
    carRoll: state.carRoll.toFixed(2),
    pitch: state.pitch.toFixed(2)
  })
}
