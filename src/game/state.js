const MAX_SPEED = 120
const MAX_REVERSE_SPEED = 24
const MIN_ACCEL_SPEED = 0
const MIN_ROLLING_SPEED = 0
const ACCEL = 8.5
const REVERSE_ACCEL = 30
const BRAKE = 96
const DRAG = 9
const OFFROAD_DRAG = 2
const STEER_RATE = 26
const NATURAL_DECEL = 7.8
const CENTRIFUGAL = 0.32
const OFFROAD_LIMIT = 140
const CURVE_DRIFT_START_SPEED = 28
const ROAD_HALF_WIDTH = 11.6
const STOP_APPROACH_DISTANCE = 70
const STOP_CAPTURE_DISTANCE = 24
const STOP_MISS_DISTANCE = 260
const STOP_HOLD_SECONDS = 0.45
const STOP_SPEED_REQUIRED = 18
const TARGET_PASSENGERS = 24
const INITIAL_MISSION_TIME = 90
const STAGE_STOP_TARGET = 3
const OFFROAD_FAIL_SECONDS = 2.4
const OFFROAD_TIME_PENALTY = 4
const LATERAL_DAMPING = 8.2
const FORWARD_SPEED_SCALE = 0.42

const SEGMENT_LENGTH = 5.2
const VISIBLE_SEGMENTS = 66
// Keep backward sample coverage beyond miss window so a passed stop remains visible while reversing.
const BACK_VISIBLE_SEGMENTS = Math.ceil(STOP_MISS_DISTANCE / SEGMENT_LENGTH) + 2

const DEFAULT_CURVE_ZONES = [
  { start: 0, end: 140, curve: 0.0 },
  { start: 140, end: 280, curve: 0.48 },
  { start: 280, end: 380, curve: 0.84 },
  { start: 380, end: 500, curve: -0.52 },
  { start: 500, end: 590, curve: -0.92 },
  { start: 590, end: 730, curve: 0.18 },
  { start: 730, end: 860, curve: 0.76 },
  { start: 860, end: 950, curve: -0.9 },
  { start: 950, end: 1110, curve: -0.38 },
  { start: 1110, end: 1250, curve: 0.66 },
  { start: 1250, end: 1350, curve: 0.92 },
  { start: 1350, end: 1500, curve: -0.46 },
  { start: 1500, end: 1610, curve: -0.86 },
  { start: 1610, end: 1760, curve: 0.34 },
  { start: 1760, end: 1900, curve: 0.8 },
  { start: 1900, end: 2010, curve: -0.7 },
  { start: 2010, end: 2110, curve: -0.96 },
  { start: 2110, end: 2270, curve: 0.46 },
  { start: 2270, end: 2380, curve: 0.88 },
  { start: 2380, end: 2520, curve: -0.26 },
  { start: 2520, end: 2660, curve: -0.88 },
  { start: 2660, end: 2820, curve: 0.0 }
]
let ACTIVE_CURVE_ZONES = DEFAULT_CURVE_ZONES

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function repeatDistance(distance) {
  const lap = ACTIVE_CURVE_ZONES[ACTIVE_CURVE_ZONES.length - 1].end
  let d = distance % lap
  if (d < 0) d += lap
  return d
}

function smoothstep(t) {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

function zoneCurve(distance) {
  const d = repeatDistance(distance)
  for (let i = 0; i < ACTIVE_CURVE_ZONES.length; i += 1) {
    const zone = ACTIVE_CURVE_ZONES[i]
    if (d >= zone.start && d < zone.end) {
      const prev = ACTIVE_CURVE_ZONES[(i - 1 + ACTIVE_CURVE_ZONES.length) % ACTIVE_CURVE_ZONES.length]
      const next = ACTIVE_CURVE_ZONES[(i + 1) % ACTIVE_CURVE_ZONES.length]
      const sharpness = Math.max(Math.abs(zone.curve), Math.abs(prev.curve), Math.abs(next.curve))
      const blendWindow = Math.min(sharpness > 0.95 ? 72 : 88, (zone.end - zone.start) * (sharpness > 0.95 ? 0.44 : 0.4))
      const fromStart = d - zone.start
      const toEnd = zone.end - d
      if (fromStart < blendWindow) {
        return prev.curve + (zone.curve - prev.curve) * smoothstep(fromStart / blendWindow)
      }
      if (toEnd < blendWindow) {
        return zone.curve + (next.curve - zone.curve) * smoothstep(1 - toEnd / blendWindow)
      }
      return zone.curve
    }
  }
  return 0
}

function sampleCurve(distance) {
  const d = repeatDistance(distance)
  const base = zoneCurve(d)
  const waveA = Math.sin(d * 0.013) * 0.008
  const waveB = Math.sin(d * 0.029 + 1.1) * 0.005
  return clamp(base + waveA + waveB, -1.02, 1.02)
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
  while (start < 2500) {
    const straightChance = 0.2
    const makeStraight = rng() < straightChance
    const isHairpin = !makeStraight && rng() < 0.08
    const length = makeStraight
      ? 90 + Math.floor(rng() * 120)
      : isHairpin
      ? 82 + Math.floor(rng() * 54)
      : 96 + Math.floor(rng() * 105)
    let curve = 0
    if (!makeStraight) {
      const intensity = isHairpin ? 0.72 + rng() * 0.16 : 0.32 + rng() * 0.28
      const sign = rng() < 0.58 ? -lastSign : lastSign
      lastSign = sign
      curve = Number((intensity * sign).toFixed(2))
    }
    zones.push({ start, end: Math.min(2500, start + length), curve })
    start += length
  }
  zones.push({ start: 2500, end: 2760, curve: 0 })
  return zones
}

function buildRoadSamples(distance, trackBaseX = 0) {
  const samples = []
  let centerX = trackBaseX
  let smoothCenterX = trackBaseX
  const scrollOffset = ((distance % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH

  for (let i = -BACK_VISIBLE_SEGMENTS; i <= VISIBLE_SEGMENTS; i += 1) {
    const sampleDist = distance + i * SEGMENT_LENGTH
    const curve = sampleCurve(sampleDist)
    centerX += curve * 1.2
    smoothCenterX += (centerX - smoothCenterX) * 0.28

    samples.push({
      i,
      centerX: smoothCenterX,
      curve,
      z: 14 + scrollOffset - i * SEGMENT_LENGTH,
      worldDistance: sampleDist,
      segmentIndex: Math.floor(sampleDist / SEGMENT_LENGTH)
    })
  }

  return samples
}

function buildProps(samples) {
  const props = []
  for (let i = 2; i < samples.length; i += 1) {
    const sample = samples[i]
    if (sample.i < 0) {
      continue
    }
    // Use world segment index for stable culling to avoid frame-to-frame flicker.
    if (sample.segmentIndex % 2 === 0) {
      continue
    }

    const r = hash01(sample.segmentIndex)
    if (r < 0.52) {
      continue
    }

    const side = r > 0.75 ? 1 : -1
    const kindSeed = hash01(sample.segmentIndex + 13)
    const kind = kindSeed > 0.66 ? 'tower' : kindSeed > 0.33 ? 'tree' : 'sign'

    props.push({
      kind,
      x: sample.centerX + side * (ROAD_HALF_WIDTH + 2.8 + hash01(sample.segmentIndex + 27) * 1.8),
      z: sample.z,
      side,
      scale: 1.05 + hash01(sample.segmentIndex + 41) * 0.95
    })
  }
  return props
}

export function createInitialState() {
  const firstStopGap = 380
  const state = {
    mode: 'menu',
    speed: 0,
    speedMax: MAX_SPEED,
    playerX: 0,
    lateralVel: 0,
    noSteerTimer: 0,
    wrongSteerTimer: 0,
    carYaw: 0,
    carRoll: 0,
    distance: 0,
    trackX: 0,
    lap: 1,
    curveNow: 0,
    missionTime: INITIAL_MISSION_TIME,
    missionTimerMax: INITIAL_MISSION_TIME,
    missionCooldown: 0,
    routeSeed: 1,
    nextStopDistance: firstStopGap,
    stopIndex: 0,
    lastStopDistance: 0,
    stopHoldTime: 0,
    stopPassedTime: 0,
    stopsServed: 0,
    stageStopsDone: 0,
    stageStopsTarget: STAGE_STOP_TARGET,
    missedStops: 0,
    passengers: 0,
    targetPassengers: TARGET_PASSENGERS,
    lastBoarded: 0,
    boardingFxTime: 0,
    stopMarker: null,
    offroadTimer: 0,
    offroadPenaltyCooldown: 0,
    roadHalfWidth: ROAD_HALF_WIDTH,
    roadSamples: [],
    props: [],
    hudLine: 'Enter 또는 START로 운행 시작',
    stamp: '스쿨버스 준비 완료',
    result: 'pending',
    toastSeq: 0,
    toastMessage: '',
    toastKind: 'info'
  }

  state.roadSamples = buildRoadSamples(state.distance)
  state.props = buildProps(state.roadSamples)
  return state
}

export function startRun(state) {
  const prevSeed = state.routeSeed || 1
  let nextSeed = Math.floor(Math.random() * 2147483646) + 1
  if (nextSeed === prevSeed) {
    nextSeed = (nextSeed % 2147483646) + 1
  }
  state.routeSeed = nextSeed
  ACTIVE_CURVE_ZONES = generateCurveZones(state.routeSeed)
  state.mode = 'running'
  state.speed = 0
  state.playerX = 0
  state.trackX = 0
  state.lateralVel = 0
  state.carYaw = 0
  state.carRoll = 0
  state.distance = 0
  state.lap = 1
  state.curveNow = 0
  state.missionTime = state.missionTimerMax
  state.missionCooldown = 0
  state.nextStopDistance = 380 + nextStopGapBySeed(state.routeSeed)
  state.stopIndex = 0
  state.lastStopDistance = 0
  state.stopHoldTime = 0
  state.stopPassedTime = 0
  state.stopsServed = 0
  state.stageStopsDone = 0
  state.missedStops = 0
  state.offroadTimer = 0
  state.offroadPenaltyCooldown = 0
  state.passengers = 0
  state.lastBoarded = 0
  state.boardingFxTime = 0
  state.hudLine = '노선 시작: 정류장에서 정차 후 승객 탑승'
  state.stamp = `운행 시작 · 1구간 목표 정류장 ${state.stageStopsTarget}개`
  state.result = 'pending'
  state.toastMessage = ''
  state.toastKind = 'info'
  pushToast(state, '운행 시작: 정류장 3개를 처리하세요', 'info')
  state.roadSamples = buildRoadSamples(state.distance)
  state.props = buildProps(state.roadSamples)
  state.stopMarker = buildStopMarker(state)
}

export function updateState(state, input, dt) {
  const step = clamp(dt, 0, 1 / 30)
  if (state.mode === 'menu' || state.mode === 'ended') {
    state.roadSamples = buildRoadSamples(state.distance)
    state.props = buildProps(state.roadSamples)
    state.stopMarker = buildStopMarker(state)
    return
  }
  state.boardingFxTime = Math.max(0, state.boardingFxTime - step)
  state.offroadPenaltyCooldown = Math.max(0, state.offroadPenaltyCooldown - step)

  const trackCurve = sampleCurve(state.distance)
  const aheadCurve = sampleCurve(state.distance + 46)
  const handlingCurve = trackCurve
  const handlingAheadCurve = aheadCurve
  state.curveNow = handlingCurve

  if (state.mode === 'running') {
    state.missionTime = Math.max(0, state.missionTime - step)
  }

  const braking = input.brake
  const accelerating = input.accelerate && !braking

  if (accelerating) {
    if (state.speed < 0) {
      state.speed += BRAKE * 0.85 * step
    } else {
      const accelNorm = clamp(state.speed / MAX_SPEED, 0, 1)
      const accelFalloff = 1 - Math.pow(accelNorm, 1.8)
      const launchLimiter = 0.35 + accelNorm * 0.65
      state.speed += ACCEL * accelFalloff * launchLimiter * step
    }
    if (state.speed > 0) {
      state.speed = Math.max(state.speed, MIN_ACCEL_SPEED)
    }
  }
  if (braking) {
    if (state.speed > 8) {
      state.speed -= BRAKE * step
    } else {
      state.speed -= REVERSE_ACCEL * step * 0.8
    }
  }
  if (!accelerating && !braking) {
    if (state.speed > 0) {
      const coast = NATURAL_DECEL + state.speed * 0.013
      state.speed = Math.max(0, state.speed - coast * step)
      if (state.speed > 0) {
        state.speed = Math.max(MIN_ROLLING_SPEED, state.speed)
      }
    } else if (state.speed < 0) {
      state.speed = Math.min(0, state.speed + DRAG * step * 1.45)
    }
  }

  const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const speedNorm = state.speed / MAX_SPEED
  const speedAbsNorm = Math.abs(speedNorm)
  const speedFactor = clamp(speedAbsNorm, 0, 1)
  const reverseSteer = state.speed < -1 ? -1 : 1
  const steerAuthority = 0.85 + speedFactor * 0.55
  const targetLateralVel = steerInput * reverseSteer * steerAuthority * 3.6
  const previousPlayerX = state.playerX
  if (steerInput !== 0) {
    // Steering should react immediately and never feel dead at low speed.
    state.lateralVel += (targetLateralVel - state.lateralVel) * Math.min(1, step * 10)
  } else {
    state.lateralVel *= Math.max(0, 1 - step * (LATERAL_DAMPING + 1.8))
  }
  const lateralMax = 2.2 + speedFactor * 2.2
  state.lateralVel = clamp(state.lateralVel, -lateralMax, lateralMax)
  state.playerX += state.lateralVel * step * 1.35
  if (steerInput !== 0 && steerInput * state.playerX < 0) {
    state.playerX *= 1 - step * (1.2 + (1 - speedFactor) * 1.4)
  }
  state.lateralVel = clamp((state.playerX - previousPlayerX) / Math.max(step, 0.0001), -lateralMax, lateralMax)

  let laneOffset = state.playerX
  const absLane = Math.abs(laneOffset)
  const offroad = absLane > ROAD_HALF_WIDTH * 0.96
  if (offroad) {
    const overshoot = absLane - ROAD_HALF_WIDTH * 0.96
    const offroadPenalty = OFFROAD_DRAG + overshoot * 0.08
    if (state.speed > OFFROAD_LIMIT) {
      state.speed -= offroadPenalty * step
    }
    state.lateralVel *= Math.max(0.72, 1 - step * 2.8)
    state.offroadTimer = Math.min(10, state.offroadTimer + step)
  } else {
    state.offroadTimer = Math.max(0, state.offroadTimer - step * 1.8)
  }

  if (!input.brake && state.speed < 0) {
    state.speed = 0
  }

  if (absLane > ROAD_HALF_WIDTH * 1.45) {
    state.speed = Math.min(state.speed, MAX_SPEED)
  }

  laneOffset = clamp(laneOffset, -ROAD_HALF_WIDTH * 1.7, ROAD_HALF_WIDTH * 1.7)
  state.playerX = laneOffset
  if (Math.abs(state.playerX) >= ROAD_HALF_WIDTH * 1.66 && Math.sign(state.lateralVel) === Math.sign(state.playerX)) {
    state.lateralVel *= 0.45
  }
  state.trackX = 0
  state.speed = clamp(state.speed, -MAX_REVERSE_SPEED, MAX_SPEED)
  const distanceStep = state.speed * step * FORWARD_SPEED_SCALE

  state.distance += distanceStep
  const lapLength = ACTIVE_CURVE_ZONES[ACTIVE_CURVE_ZONES.length - 1].end
  state.lap = Math.floor(state.distance / lapLength) + 1

  state.carYaw = clamp(-(steerInput * 0.13 + handlingCurve * 0.06 + handlingAheadCurve * 0.03), -0.22, 0.22)
  state.carRoll = clamp(steerInput * 0.01 + handlingCurve * 0.004, -0.02, 0.02)

  state.roadSamples = buildRoadSamples(state.distance)
  state.props = buildProps(state.roadSamples)
  state.stopMarker = buildStopMarker(state)

  const stopDistance = state.nextStopDistance - state.distance
  const inStopWindow = Math.abs(stopDistance) <= STOP_CAPTURE_DISTANCE
  const onLane = Math.abs(laneOffset) < ROAD_HALF_WIDTH * 0.9

  if (state.mode === 'running' && inStopWindow && onLane && state.speed <= STOP_SPEED_REQUIRED) {
    state.stopHoldTime += step
    state.stopPassedTime = 0
    state.hudLine = `정류장 정차 중... ${Math.ceil(Math.max(0, STOP_HOLD_SECONDS - state.stopHoldTime))}`
    if (state.stopHoldTime >= STOP_HOLD_SECONDS) {
      state.stopsServed += 1
      state.stageStopsDone += 1
      state.lastStopDistance = state.distance
      const traveled = Math.max(140, state.nextStopDistance - state.lastStopDistance)
      const timeBonus = Math.max(12, Math.min(30, Math.round(traveled / 16)))
      state.missionTime = Math.min(120, state.missionTime + timeBonus)
      const boarded = 1 + Math.floor(hash01(state.routeSeed + state.stopsServed * 17 + state.distance) * 4)
      state.lastBoarded = boarded
      state.passengers += boarded
      state.boardingFxTime = 1.25
      state.stopIndex += 1
      state.nextStopDistance += stopGapByIndex(state.routeSeed, state.stopIndex)
      state.stopHoldTime = 0
      state.hudLine = `정류장 성공: 승객 ${boarded}명 탑승 (+${timeBonus}초)`
      state.stamp = `정류장 ${state.stopsServed} · 누적 ${state.passengers}/${state.targetPassengers}명`
      pushToast(state, `정차 성공 +${timeBonus}초`, 'good')

      if (state.stageStopsDone >= state.stageStopsTarget) {
        state.mode = 'ended'
        state.speed = 0
        state.hudLine = '구간 성공 · 운행 완료'
        state.stamp = `성공 · 정류장 ${state.stopsServed}개 처리`
        state.result = 'success'
        pushToast(state, '구간 성공! 운행 완료', 'good')
      }
    }
  } else if (state.mode === 'running' && state.missionTime <= 0) {
    state.mode = 'ended'
    state.speed = 0
    state.stopHoldTime = 0
    state.hudLine = 'GAME OVER · 시간 초과'
    state.stamp = `실패 · 정류장 ${state.stopsServed}개`
    state.result = 'timeout'
    pushToast(state, '시간 초과: 운행 종료', 'bad')
  } else if (state.mode === 'running' && stopDistance < 0) {
    state.stopPassedTime += step
    const movingForwardFast = state.speed > 6
    if (state.stopPassedTime < 2.8 || !movingForwardFast || stopDistance >= -STOP_MISS_DISTANCE) {
      state.hudLine = '정류장 지나침: 후진하면 정차 가능'
      state.stamp = '경고 · 정류장 복귀'
    } else {
      state.stopIndex += 1
      state.nextStopDistance += stopGapByIndex(state.routeSeed, state.stopIndex)
      state.stopHoldTime = 0
      state.stopPassedTime = 0
      state.missedStops += 1
      state.missionTime = Math.max(0, state.missionTime - 8)
      state.hudLine = `정류장 미정차 -8초 (${state.missedStops}/3)`
      state.stamp = `정류장 실패 · 승객 ${state.passengers}/${state.targetPassengers}명`
      pushToast(state, '정류장 미정차 -8초', 'bad')
    }
  } else if (state.mode === 'running') {
    state.stopPassedTime = 0
    if (Math.abs(stopDistance) < STOP_APPROACH_DISTANCE && state.speed > STOP_SPEED_REQUIRED + 12) {
      state.hudLine = '정류장 접근: 감속 후 정차'
    } else if (Math.abs(stopDistance) < STOP_APPROACH_DISTANCE) {
      state.hudLine = '정류장 접근: 우측 차선 유지'
    } else if (absLane > ROAD_HALF_WIDTH * 1.45) {
      state.hudLine = '차선 이탈 경고: 즉시 복귀'
    } else if (offroad) {
      state.hudLine = '비포장 감속: 도로 복귀'
    } else if (Math.abs(handlingCurve) > 0.54) {
      state.hudLine = handlingCurve > 0 ? '급우회전 구간' : '급좌회전 구간'
    } else if (Math.abs(handlingCurve) > 0.28) {
      state.hudLine = handlingCurve > 0 ? '우회전 구간' : '좌회전 구간'
    } else {
      state.hudLine = '차선 유지 · 정류장 거리 확인'
    }
  }

  if (state.mode === 'running' && state.distance - state.lastStopDistance > 90) {
    state.stamp = `승객 ${state.passengers}/${state.targetPassengers} · ${Math.round(state.speed)}km/h`
  }

  if (state.mode === 'running' && state.passengers >= state.targetPassengers) {
    state.mode = 'ended'
    state.speed = 0
    state.hudLine = '노선 달성 · 운행 완료'
    state.stamp = `성공 · 승객 ${state.passengers}/${state.targetPassengers}`
    state.result = 'success'
    pushToast(state, '승객 목표 달성', 'good')
  } else if (state.mode === 'running' && state.missedStops >= 3) {
    state.mode = 'ended'
    state.speed = 0
    state.hudLine = '정류장 미정차 누적 · 운행 종료'
    state.stamp = '실패 · 정차 규칙 위반'
    state.result = 'missed-stops'
    pushToast(state, '미정차 누적: 운행 종료', 'bad')
  } else if (state.mode === 'running' && state.offroadTimer >= OFFROAD_FAIL_SECONDS && state.offroadPenaltyCooldown <= 0) {
    state.missionTime = Math.max(0, state.missionTime - OFFROAD_TIME_PENALTY)
    state.offroadPenaltyCooldown = 2.2
    state.offroadTimer = OFFROAD_FAIL_SECONDS * 0.55
    state.hudLine = `도로 이탈 페널티 -${OFFROAD_TIME_PENALTY}초`
    state.stamp = `주의 · 도로 복귀 유지`
    pushToast(state, `도로 이탈 -${OFFROAD_TIME_PENALTY}초`, 'bad')
  }
}

export function renderGameToText(state) {
  const payload = {
    mode: state.mode,
    coordinateSystem: 'world x right+, z forward is negative on screen, camera fixed behind car',
    player: {
      x: Number(state.playerX.toFixed(2)),
      speed: Number(state.speed.toFixed(1)),
      lateralVel: Number(state.lateralVel.toFixed(2)),
      yaw: Number(state.carYaw.toFixed(2)),
      roll: Number(state.carRoll.toFixed(2))
    },
    track: {
      distance: Number(state.distance.toFixed(1)),
      roadHalfWidth: state.roadHalfWidth,
      curveNow: Number(state.curveNow.toFixed(2)),
      upcomingCurve: Number((state.roadSamples[10]?.curve ?? 0).toFixed(2)),
      nextStopIn: Number(Math.max(0, state.nextStopDistance - state.distance).toFixed(1))
    },
    objective: {
      current: '정류장 정차 후 승객 태우기',
      stopDistance: Number((state.nextStopDistance - state.distance).toFixed(1)),
      stopHold: Number(state.stopHoldTime.toFixed(2)),
      stopHoldRequired: STOP_HOLD_SECONDS,
      stopSpeedRequired: STOP_SPEED_REQUIRED,
      passengers: state.passengers,
      targetPassengers: state.targetPassengers
    },
    mission: {
      timeLeft: Number(state.missionTime.toFixed(2)),
      stopsServed: state.stopsServed,
      missedStops: state.missedStops,
      passengers: state.passengers,
      targetPassengers: state.targetPassengers,
      boardingFxTime: Number(state.boardingFxTime.toFixed(2)),
      offroadTimer: Number(state.offroadTimer.toFixed(2)),
      mode: state.mode,
      result: state.result
    },
    propsAhead: state.props.slice(0, 6).map((p) => ({
      kind: p.kind,
      x: Number(p.x.toFixed(2)),
      z: Number(p.z.toFixed(2))
    })),
    hud: {
      line: state.hudLine,
      stamp: state.stamp,
      lastBoarded: state.lastBoarded
    }
  }
  return JSON.stringify(payload)
}

function buildStopMarker(state) {
  if (!state.roadSamples || state.roadSamples.length === 0) {
    return null
  }

  let best = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const sample of state.roadSamples) {
    const d = Math.abs(sample.worldDistance - state.nextStopDistance)
    if (d < bestDist) {
      bestDist = d
      best = sample
    }
  }
  if (!best || bestDist > SEGMENT_LENGTH * 4) {
    return null
  }

  const side = hash01(state.routeSeed + state.nextStopDistance * 0.1) > 0.5 ? 'right' : 'left'
  return {
    x: best.centerX + (side === 'right' ? ROAD_HALF_WIDTH + 3.4 : -ROAD_HALF_WIDTH - 3.4),
    zoneX: best.centerX + (side === 'right' ? ROAD_HALF_WIDTH * 0.35 : -ROAD_HALF_WIDTH * 0.35),
    centerX: best.centerX,
    z: best.z,
    side
  }
}
