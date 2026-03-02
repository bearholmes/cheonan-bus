const MAX_SPEED = 120
const MAX_REVERSE_SPEED = 24
const ACCEL = 8.5
const REVERSE_ACCEL = 30
const BRAKE = 96
const STEER_RATE = 4.0
const STEER_YAW_SIGN = -1
const NATURAL_DECEL = 12.0
const CENTRIFUGAL = 0.25
const ROAD_HALF_WIDTH = 11.6
const STOP_SERVICE_RADIUS = 15
const STOP_ZONE_HALF_WIDTH = 4.4
const STOP_ZONE_HALF_LENGTH = 2.8
const STOP_ZONE_OFFSET = 5
const STOP_FLOW_INTERVAL = 0.55
const STOP_CLEAR_TIME_BONUS = 7
const MAX_MISSION_TIME = 150
const MISS_TIME_PENALTY = 9
const PERFECT_STOP_RADIUS = 1.5
const GOOD_STOP_RADIUS = 3.5
const STOP_MISS_DISTANCE = 150
const MAX_MISSED_STOPS = 3
const STOP_GAP_BASE = 400
const STOP_GAP_VARIATION = 200
const TARGET_PASSENGERS = 24
const INITIAL_ONBOARD_PASSENGERS = 8
const INITIAL_MISSION_TIME = 120
const STRAIGHT_START_DISTANCE = 70
const STOP_TARGET = 8
const SAFETY_START = 100
const SAFETY_PENALTY_PER_POINT = 14
const SAFE_SPEED_LIMIT = 68
const HARD_BRAKE_THRESHOLD = 55
const SHARP_STEER_THRESHOLD = 0.75
const IMPACT_SCORE_PENALTY = 220

const SEGMENT_LENGTH = 2.6
const VISIBLE_SEGMENTS = 132
const BACK_VISIBLE_SEGMENTS = 28
const TRACK_RUN_DISTANCE = 30000

const DEFAULT_CURVE_ZONES = [
  { start: 0, end: STRAIGHT_START_DISTANCE, curve: 0.0 },
  { start: STRAIGHT_START_DISTANCE, end: 2500, curve: 0.0 }
]

const STAGE_STOP_TARGET = STOP_TARGET

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

function applySafetyDelta(state, delta, scorePenalty = 0) {
  if (delta <= 0) return
  state.safety = Math.max(0, state.safety - delta)
  if (scorePenalty > 0) {
    state.score = Math.max(0, state.score - scorePenalty)
    state.safetyPenaltyTotal += scorePenalty
  }
}

function calcGrade(state) {
  const served = Number.isFinite(state.stopsServed) ? state.stopsServed : 0
  const missed = Number.isFinite(state.missedStops) ? state.missedStops : 0
  const attempted = served + missed
  const successRate = attempted > 0 ? served / attempted : 0
  const safety = Number.isFinite(state.safety) ? state.safety : 0
  const score = Number.isFinite(state.score) ? state.score : 0

  if (served >= STAGE_STOP_TARGET && successRate >= 0.9 && safety >= 85 && score >= 2200) return 'S'
  if (successRate >= 0.75 && safety >= 70 && score >= 1500) return 'A'
  if (successRate >= 0.5 && safety >= 50) return 'B'
  return 'C'
}

function boardOnePassenger(state) {
  if (state.passengers >= TARGET_PASSENGERS) return false
  const idx = state.seats.findIndex((taken) => !taken)
  if (idx < 0) return false
  state.seats[idx] = true
  state.passengers += 1
  return true
}

function dropOnePassenger(state) {
  if (state.passengers <= 0) return false
  const idx = state.seats.findIndex((taken) => taken)
  if (idx < 0) return false
  state.seats[idx] = false
  state.passengers = Math.max(0, state.passengers - 1)
  return true
}

function setInitialPassengers(state) {
  const onboard = clamp(INITIAL_ONBOARD_PASSENGERS, 0, TARGET_PASSENGERS)
  state.passengers = onboard
  state.seats.fill(false)
  for (let i = 0; i < onboard; i += 1) {
    state.seats[i] = true
  }
}

function resetStopDemand(state) {
  state.stopDemandStopIndex = -1
  state.stopDropPending = 0
  state.stopBoardPending = 0
  state.stopDropInitial = 0
  state.stopBoardInitial = 0
  state.stopFlowTimer = 0
  state.stopHoldTime = 0
}

function nextStopGap(state, stopIndex) {
  const seed = (state.activeRouteSeed || state.routeSeed || 1) * 0.001 + stopIndex * 17.31
  return STOP_GAP_BASE + hash01(seed) * STOP_GAP_VARIATION
}

function ensureStopDemand(state) {
  if (state.stopDemandStopIndex === state.stopIndex) return

  const seed = (state.activeRouteSeed || state.routeSeed || 1) + state.stopIndex * 37
  const requestedDrop = 1 + Math.floor(hash01(seed + 1) * 4)
  const requestedBoard = 2 + Math.floor(hash01(seed + 2) * 7)
  const dropCount = Math.min(state.passengers, requestedDrop)
  const availableCapacity = TARGET_PASSENGERS - state.passengers + dropCount
  const boardCount = Math.min(requestedBoard, Math.max(0, availableCapacity))

  state.stopDemandStopIndex = state.stopIndex
  state.stopDropPending = dropCount
  state.stopBoardPending = boardCount
  state.stopDropInitial = dropCount
  state.stopBoardInitial = boardCount
  state.stopFlowTimer = 0
  state.stopHoldTime = 0
}

function advanceStop(state) {
  state.stopIndex += 1
  state.nextStopDistance += nextStopGap(state, state.stopIndex)
  resetStopDemand(state)
}

function computeStopInteraction(state) {
  const stopPoint = sampleTrackPoint(state, state.nextStopDistance)
  const zoneX = stopPoint.centerX + stopPoint.rightX * STOP_ZONE_OFFSET
  const zoneZ = stopPoint.centerZ + stopPoint.rightZ * STOP_ZONE_OFFSET
  const dx = state.worldX - zoneX
  const dz = state.worldZ - zoneZ
  const forwardX = Math.sin(stopPoint.heading)
  const forwardZ = Math.cos(stopPoint.heading)

  const localRight = dx * stopPoint.rightX + dz * stopPoint.rightZ
  const localForward = dx * forwardX + dz * forwardZ
  const radialDistance = Math.hypot(dx, dz)
  const insideBox = Math.abs(localRight) <= STOP_ZONE_HALF_WIDTH && Math.abs(localForward) <= STOP_ZONE_HALF_LENGTH
  const withinRadius = radialDistance <= STOP_SERVICE_RADIUS

  return {
    radialDistance,
    insideBox,
    withinRadius,
    canService: insideBox && withinRadius
  }
}

function completeCurrentStop(state, toastText) {
  const movedDrop = state.stopDropInitial - state.stopDropPending
  const movedBoard = state.stopBoardInitial - state.stopBoardPending
  const movedTotal = Math.max(0, movedDrop + movedBoard)
  const precision = Number.isFinite(state.stopBestPrecision) ? state.stopBestPrecision : (Number.isFinite(state.stopRadialDistance) ? state.stopRadialDistance : 99)
  let quality = 'bad'
  let precisionBonus = 0
  let timeBonus = 0

  if (precision <= PERFECT_STOP_RADIUS) {
    quality = 'perfect'
    precisionBonus = 260
    timeBonus = 4
  } else if (precision <= GOOD_STOP_RADIUS) {
    quality = 'good'
    precisionBonus = 80
  }

  const comboMultiplier = 1 + state.stopCombo * 0.18
  const baseScore = 180 + movedTotal * 24 + precisionBonus
  const gainedScore = Math.max(0, Math.round(baseScore * comboMultiplier))
  state.score += gainedScore
  state.lastStopScore = gainedScore
  state.lastStopQuality = quality
  state.stopCombo += 1
  state.bestStopCombo = Math.max(state.bestStopCombo, state.stopCombo)

  state.stopsServed += 1
  state.stageStopsDone = Math.min(state.stageStopsTarget, state.stageStopsDone + 1)
  state.missionTime = Math.min(MAX_MISSION_TIME, state.missionTime + STOP_CLEAR_TIME_BONUS + timeBonus)
  state.stopBestPrecision = Infinity

  if (state.stageStopsDone >= state.stageStopsTarget) {
    resetStopDemand(state)
    state.mode = 'ended'
    state.result = 'success'
    state.grade = calcGrade(state)
    state.hudLine = '운행 성공! 목표 정차를 모두 완료했습니다.'
    pushToast(state, '운행 목표 달성!', 'good')
    return true
  }

  advanceStop(state)

  if (toastText) {
    const qualityText = quality === 'perfect' ? 'Perfect' : quality === 'good' ? 'Good' : 'Bad'
    pushToast(state, `${qualityText} 정차 · ${toastText} · +${gainedScore}점`, quality === 'bad' ? 'info' : 'good')
  }
  state.hudLine = `정차 완료 +${gainedScore}점 · 문 닫고 출발`
  return false
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
    const straightChance = 0.05
    const makeStraight = rng() < straightChance
    const length = makeStraight ? 65 : 70 + rng() * 120
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
      else type = 'tree'
    } else if (biome === 'suburb') {
      density = 0.4
      if (h2 > 0.8) type = 'tower'
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

  return {
    centerX: best.centerX,
    centerZ: best.centerZ,
    heading: best.heading,
    rightX: best.rightX,
    rightZ: best.rightZ,
    x: best.centerX + best.rightX * poleOffset * side,
    z: best.centerZ + best.rightZ * poleOffset * side,
    zoneX: best.centerX + best.rightX * STOP_ZONE_OFFSET * side,
    zoneZ: best.centerZ + best.rightZ * STOP_ZONE_OFFSET * side,
    side: side > 0 ? 'right' : 'left'
  }
}

export function createInitialState() {
  const firstStopGap = 380
  const initialSeed = ((Date.now() ^ ((Math.random() * 0x7fffffff) | 0)) & 0x7fffffff) || 1
  const track = generateTrack(TRACK_RUN_DISTANCE)
  const startPoint = sampleTrackPoint({ track }, 0)

  const state = {
    mode: 'menu',
    speed: 35,
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

    routeSeed: initialSeed,
    activeRouteSeed: initialSeed,
    nextStopDistance: firstStopGap,
    stopIndex: 0,
    missedStops: 0,
    stopsServed: 0,
    stageStopsDone: 0,
    stageStopsTarget: STAGE_STOP_TARGET,
    score: 0,
    stopCombo: 0,
    bestStopCombo: 0,
    lastStopScore: 0,
    lastStopQuality: 'good',
    safety: SAFETY_START,
    safetyPenaltyTotal: 0,
    stopBestPrecision: Infinity,
    impactCount: 0,
    impactCooldown: 0,

    passengers: INITIAL_ONBOARD_PASSENGERS,
    targetPassengers: TARGET_PASSENGERS,
    seats: new Array(TARGET_PASSENGERS).fill(false),

    doorOpen: false,
    doorAnim: 0,
    stopHoldTime: 0,
    stopFlowTimer: 0,
    stopDemandStopIndex: -1,
    stopDropPending: 0,
    stopBoardPending: 0,
    stopDropInitial: 0,
    stopBoardInitial: 0,
    stopInsideBox: false,
    stopWithinRadius: false,
    stopCanService: false,
    stopRadialDistance: Infinity,

    roadSamples: [],
    props: [],
    stopMarker: null,
    track,

    hudLine: 'Space로 메뉴/도어 조작',
    stamp: '대기 중',
    toastMessage: '',
    toastSeq: 0,
    missionTime: INITIAL_MISSION_TIME,
    result: null,
    grade: 'C'
  }

  state.roadSamples = buildRoadSamples(0, state)
  state.props = buildProps(state.roadSamples, state)
  state.stopMarker = buildStopMarker(state)
  setInitialPassengers(state)

  return state
}

export function startRun(state) {
  const seed = state.routeSeed
  state.activeRouteSeed = seed
  state.routeSeed = ((seed + 1) & 0x7fffffff) || 1
  ACTIVE_CURVE_ZONES = generateCurveZones(seed)

  state.track = generateTrack(TRACK_RUN_DISTANCE)
  const startPoint = sampleTrackPoint(state, 0)

  state.mode = 'running'
  state.speed = 0
  state.distance = 0
  state.nextStopDistance = STOP_GAP_BASE
  state.stopIndex = 0
  state.missedStops = 0
  setInitialPassengers(state)
  state.doorOpen = false
  state.steeringValue = 0
  state.carYaw = 0
  state.carRoll = 0
  state.pitch = 0
  state.stopHoldTime = 0
  state.stopFlowTimer = 0
  state.stopInsideBox = false
  state.stopWithinRadius = false
  state.stopCanService = false
  state.stopRadialDistance = Infinity

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
  state.score = 0
  state.stopCombo = 0
  state.bestStopCombo = 0
  state.lastStopScore = 0
  state.lastStopQuality = 'good'
  state.safety = SAFETY_START
  state.safetyPenaltyTotal = 0
  state.stopBestPrecision = Infinity
  state.impactCount = 0
  state.impactCooldown = 0
  state.result = null
  state.grade = 'C'
  resetStopDemand(state)

  state.hudLine = `목표: ${INITIAL_MISSION_TIME}초 내 정류장 ${STAGE_STOP_TARGET}개 처리`
  pushToast(state, '운행 시작', 'info')

  state.roadSamples = buildRoadSamples(0, state)
  state.props = buildProps(state.roadSamples, state)
  state.stopMarker = buildStopMarker(state)
}

export function updateState(state, input, dt) {
  if (state.mode !== 'running' && state.mode !== 'menu') {
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
  const isMenu = state.mode === 'menu'

  if (!isMenu) {
    state.missionTime -= step
    if (state.missionTime <= 0) {
      state.missionTime = 0
      state.mode = 'ended'
      state.result = 'timeout'
      state.grade = calcGrade(state)
      return
    }
    state.impactCooldown = Math.max(0, (state.impactCooldown || 0) - step)
  }

  state.doorAnim += ((state.doorOpen ? 1 : 0) - state.doorAnim) * step * 5

  const accel = isMenu ? (state.speed < 45) : (input.accelerate && !state.doorOpen)
  const brake = isMenu ? false : input.brake
  const reverse = isMenu ? false : (input.reverse && !state.doorOpen)

  if (!isMenu && state.doorOpen && (input.accelerate || input.reverse)) {
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

  const doorInput = isMenu ? false : input.command === 'space'
  if (doorInput) {
    if (Math.abs(state.speed) < 0.01) {
      state.speed = 0
      state.doorOpen = !state.doorOpen
      state.stopHoldTime = 0
      state.stopFlowTimer = 0
      state.stopBestPrecision = Infinity
      state.hudLine = state.doorOpen
        ? '도어 개방: 정류장 박스+15m에서만 승하차 가능'
        : 'W: 가속 | S: 브레이크 | R: 후진'
    } else {
      pushToast(state, '완전히 멈춘 후(속도 0) 문을 여세요', 'bad')
    }
  }

  const speedAbs = Math.abs(state.speed)

  if (isMenu) {
    const proj = projectWorldToTrack(state, state.worldX, state.worldZ, state.distance)
    state.worldX = proj.centerX
    state.worldZ = proj.centerZ
    state.worldYaw = proj.heading
    state.steeringValue = 0
  } else {
    let steerInput = 0
    if (input.left && !input.right) steerInput = -1
    else if (input.right && !input.left) steerInput = 1
    state.steeringValue += (steerInput - state.steeringValue) * step * (STEER_RATE * 3)

    const dir = state.speed < -0.1 ? -1 : 1
    const steerAuthority = clamp((speedAbs - 0.4) / 3.6, 0, 1)
    const steerYawRate = state.steeringValue * (0.55 + speedAbs * 0.012) * dir * steerAuthority * STEER_YAW_SIGN
    state.worldYaw = normalizeAngle(state.worldYaw + steerYawRate * step)
  }

  const projectionBefore = projectWorldToTrack(state, state.worldX, state.worldZ, state.distance)

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

  if (!isMenu) {
    const accelRate = Math.abs(deltaSpeed) / Math.max(step, 0.0001)
    let safetyLoss = 0

    if (speedAbs > SAFE_SPEED_LIMIT) {
      safetyLoss += step * (speedAbs - SAFE_SPEED_LIMIT) * 0.08
    }
    if (brake && speedAbs > 12 && accelRate > HARD_BRAKE_THRESHOLD) {
      safetyLoss += step * 7.5
    }
    if (speedAbs > 22 && Math.abs(state.steeringValue) > SHARP_STEER_THRESHOLD) {
      safetyLoss += step * 5.5
    }
    if (safetyLoss > 0) {
      applySafetyDelta(state, safetyLoss, Math.round(safetyLoss * SAFETY_PENALTY_PER_POINT))
    }

    const severeBrakeImpact = brake && speedAbs > 25 && accelRate > HARD_BRAKE_THRESHOLD * 1.25
    const roadEdgeImpact = Math.abs(state.playerX) > ROAD_HALF_WIDTH * 1.55 && speedAbs > 28
    if ((severeBrakeImpact || roadEdgeImpact) && state.impactCooldown <= 0) {
      state.impactCooldown = 1.1
      state.impactCount += 1
      state.stopCombo = 0
      state.score = Math.max(0, state.score - IMPACT_SCORE_PENALTY)
      state.safetyPenaltyTotal += IMPACT_SCORE_PENALTY
      pushToast(state, '충격! 콤보 리셋 · 점수 페널티', 'bad')
    }
  }

  const distToStop = state.nextStopDistance - state.distance
  const stopInteraction = computeStopInteraction(state)
  state.stopInsideBox = stopInteraction.insideBox
  state.stopWithinRadius = stopInteraction.withinRadius
  state.stopCanService = stopInteraction.canService
  state.stopRadialDistance = stopInteraction.radialDistance
  let stopHandledThisStep = false

  if (isMenu && distToStop < -STOP_MISS_DISTANCE) {
    advanceStop(state)
  } else if (!isMenu) {
    if (state.doorOpen && speedAbs < 0.1) {
      if (stopInteraction.canService) {
        ensureStopDemand(state)
        state.stopHoldTime += step
        state.stopBestPrecision = Math.min(state.stopBestPrecision, stopInteraction.radialDistance)

        state.stopFlowTimer += step
        let flowInterval = STOP_FLOW_INTERVAL
        if (state.stopBestPrecision <= PERFECT_STOP_RADIUS) {
          flowInterval = STOP_FLOW_INTERVAL * 0.55
        } else if (state.stopBestPrecision > GOOD_STOP_RADIUS) {
          flowInterval = STOP_FLOW_INTERVAL * 1.35
        }

        while (state.stopFlowTimer >= flowInterval) {
          state.stopFlowTimer -= flowInterval

          if (state.stopDropPending > 0) {
            const dropped = dropOnePassenger(state)
            state.stopDropPending -= dropped ? 1 : state.stopDropPending
            continue
          }

          if (state.stopBoardPending > 0) {
            const boarded = boardOnePassenger(state)
            state.stopBoardPending -= boarded ? 1 : state.stopBoardPending
            continue
          }
        }

        const droppedNow = state.stopDropInitial - state.stopDropPending
        const boardedNow = state.stopBoardInitial - state.stopBoardPending
        const stillPending = state.stopDropPending + state.stopBoardPending

        if (stillPending > 0) {
          state.hudLine = `승하차 진행 하차 ${droppedNow}/${state.stopDropInitial} | 탑승 ${boardedNow}/${state.stopBoardInitial}`
        } else {
          stopHandledThisStep = true
          const totalDemand = state.stopDropInitial + state.stopBoardInitial
          const stopMessage = totalDemand > 0 ? '정차 완료' : '승하차 없음 정차 확인'
          if (completeCurrentStop(state, stopMessage)) return
        }
      } else {
        state.stopHoldTime = 0
        state.stopFlowTimer = 0
        state.stopBestPrecision = Infinity
        state.hudLine = stopInteraction.withinRadius
          ? '정류장 박스 안에 정확히 정차해야 승하차됩니다'
          : '승하차 불가: 정류장 박스 + 15m 이내에서만 가능'
      }
    } else {
      state.stopHoldTime = 0
      state.stopFlowTimer = 0
      state.stopBestPrecision = Infinity
      if (!state.doorOpen && stopInteraction.canService && speedAbs < 0.1) {
        state.hudLine = '정류장 도착: Space로 문 열기'
      } else if (!state.doorOpen && stopInteraction.withinRadius && !stopInteraction.insideBox && speedAbs < 2.5) {
        state.hudLine = '정류장 박스 안쪽으로 더 붙여 정차하세요'
      }
    }

    if (!stopHandledThisStep && distToStop < -STOP_MISS_DISTANCE) {
      advanceStop(state)
      state.missedStops += 1
      state.stopCombo = 0
      state.missionTime = Math.max(0, state.missionTime - MISS_TIME_PENALTY)
      pushToast(state, `정류장 놓침! (${state.missedStops}/${MAX_MISSED_STOPS})`, 'bad')

      if (state.missionTime <= 0) {
        state.mode = 'ended'
        state.result = 'timeout'
        state.grade = calcGrade(state)
        state.hudLine = '시간 소진으로 운행 실패'
        return
      }

      if (state.missedStops >= MAX_MISSED_STOPS) {
        state.mode = 'ended'
        state.result = 'missed-stops'
        state.grade = calcGrade(state)
        state.hudLine = '미정차 누적 한도 초과로 운행 실패'
      }
    }
  }
}

export function renderGameToText(state) {
  return JSON.stringify({
    mode: state.mode,
    speed: state.speed.toFixed(1),
    passengers: state.passengers,
    door: state.doorOpen ? 'OPEN' : 'CLOSED',
    nextStop: `${(state.nextStopDistance - state.distance).toFixed(0)}m`,
    stops: `${state.stageStopsDone}/${state.stageStopsTarget}`,
    missedStops: state.missedStops,
    score: state.score,
    combo: state.stopCombo,
    bestCombo: state.bestStopCombo,
    safety: Number.isFinite(state.safety) ? state.safety.toFixed(1) : '0.0',
    impacts: state.impactCount,
    grade: state.grade,
    stopCanService: state.stopCanService,
    stopInsideBox: state.stopInsideBox,
    stopRadius: Number.isFinite(state.stopRadialDistance) ? state.stopRadialDistance.toFixed(2) : 'INF',
    stopDropPending: state.stopDropPending,
    stopBoardPending: state.stopBoardPending,
    playerX: state.playerX.toFixed(2),
    worldTrackX: state.trackX.toFixed(2),
    distance: state.distance.toFixed(1),
    lateralVel: state.lateralVel.toFixed(2),
    worldX: state.worldX.toFixed(2),
    worldZ: state.worldZ.toFixed(2),
    worldYaw: state.worldYaw.toFixed(2),
    routeSeed: state.activeRouteSeed ?? state.routeSeed,
    steeringValue: state.steeringValue.toFixed(2),
    carYaw: state.carYaw.toFixed(2),
    carRoll: state.carRoll.toFixed(2),
    pitch: state.pitch.toFixed(2)
  })
}
