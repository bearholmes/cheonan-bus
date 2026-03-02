import { createSceneRenderer } from '../renderer/scene.js'
import { createHud } from './hud.js'
import { createInputController } from './input.js'
import { createInitialState, renderGameToText, startRun, updateState, buildRoadSamples, buildProps, buildStopMarker } from './state.js'

function resizeCanvasToDisplaySize(canvas, renderer) {
  const dpr = 1.0 // Window.devicePixelRatio를 쓸 수도 있으나, 고질적인 성능 문제를 위해 1.0 고정 (혹은 옵션화)
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr))

  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false)
  }
}

function tryToggleFullscreen(canvas) {
  if (!document.fullscreenElement) {
    if (canvas.requestFullscreen) {
      canvas.requestFullscreen().catch(() => { })
    }
    return
  }
  if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => { })
  }
}

export function startGame({ canvas, hudRoot, startOverlay, helpOverlay, endOverlay, startButton, restartButton }) {
  const hud = createHud(hudRoot)
  const input = createInputController(window)

  let renderer
  try {
    renderer = createSceneRenderer(canvas, (message) => hud.reportError(message))
  } catch (error) {
    hud.reportError(error)
    return () => { }
  }

  const state = createInitialState()
  let lastToastSeq = 0
  let prevControls = { accelerate: false, brake: false, left: false, right: false, handbrake: false }
  let stopped = false
  let helpOpen = false
  let lastTime = performance.now()
  let rafId = 0
  const helpStopsElement = helpOverlay ? helpOverlay.querySelector('[data-role="help-stops"]') : null
  const helpMissedElement = helpOverlay ? helpOverlay.querySelector('[data-role="help-missed"]') : null
  const helpScoreElement = helpOverlay ? helpOverlay.querySelector('[data-role="help-score"]') : null
  const helpPassengersElement = helpOverlay ? helpOverlay.querySelector('[data-role="help-passengers"]') : null
  const endTitleElement = endOverlay ? endOverlay.querySelector('[data-role="end-title"]') : null
  const endReasonElement = endOverlay ? endOverlay.querySelector('[data-role="end-reason"]') : null
  const endScoreElement = endOverlay ? endOverlay.querySelector('[data-role="end-score"]') : null
  const endStopsElement = endOverlay ? endOverlay.querySelector('[data-role="end-stops"]') : null
  const endMissedElement = endOverlay ? endOverlay.querySelector('[data-role="end-missed"]') : null
  const endPassengersElement = endOverlay ? endOverlay.querySelector('[data-role="end-passengers"]') : null

  const onResize = () => resizeCanvasToDisplaySize(canvas, renderer.renderer || renderer)
  const onWindowError = (event) => {
    hud.reportError(event.error || event.message)
  }
  const onUnhandledRejection = (event) => {
    hud.reportError(event.reason)
  }
  const onKeyDown = (event) => {
    if (event.code === 'Escape') {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => { })
        return
      }
      event.preventDefault()
      helpOpen = !helpOpen
      if (helpOverlay) {
        helpOverlay.classList.toggle('hidden', !helpOpen)
      }
      return
    }
    if (event.code === 'KeyF') {
      event.preventDefault()
      tryToggleFullscreen(canvas)
    }
    // Prevent immediate accidental restarts from held steering/throttle keys.
    // Explicit start/restart keys only.
    const startKeys = new Set(['Enter', 'Space'])
    if (!event.repeat && startKeys.has(event.code) && (state.mode === 'menu' || state.mode === 'ended')) {
      event.preventDefault()
      startRun(state)
    }
  }

  const onStartClick = () => {
    startRun(state)
  }

  const onRestartClick = () => {
    startRun(state)
  }

  function syncHud() {
    if (hudRoot) {
      hudRoot.classList.toggle('hidden', state.mode === 'menu')
    }
    hud.setTimer(state.missionTime, state.mode, 's')
    hud.setTelemetry({
      speed: Math.abs(state.speed),
      speedMax: state.speedMax,
      stopHold: state.stopHoldTime
    })
    const stopDistance = state.nextStopDistance - state.distance
    const urgency = stopDistance < 30 ? 'alert' : stopDistance < 90 ? 'approach' : 'normal'

    // 텍스트 네비게이션(TURN)은 시인성을 위해 생략하거나 간소화함
    hud.setNav('', stopDistance, urgency)
    const stageDone = Number.isFinite(state.stageStopsDone) ? state.stageStopsDone : 0
    const stageTarget = Number.isFinite(state.stageStopsTarget) ? state.stageStopsTarget : 0
    const missedStops = Number.isFinite(state.missedStops) ? state.missedStops : 0
    const score = Number.isFinite(state.score) ? Math.max(0, Math.round(state.score)) : 0
    const passengers = Number.isFinite(state.passengers) ? Math.max(0, state.passengers) : 0
    const capacity = Number.isFinite(state.targetPassengers) ? Math.max(1, state.targetPassengers) : 24
    hud.setStamp(`점수 ${score} · 승객 ${passengers}/${capacity} · 정차 ${stageDone}/${stageTarget} · 미정차 ${missedStops}/3`)
    hud.setDoorState(state.doorOpen)
    if (state.toastSeq > lastToastSeq) {
      hud.showToast(state.toastMessage, state.toastKind)
      lastToastSeq = state.toastSeq
    }

    if (startOverlay) {
      startOverlay.classList.toggle('hidden', state.mode !== 'menu')
    }
    if (helpOverlay) {
      helpOverlay.classList.toggle('hidden', !helpOpen)
    }
    if (helpStopsElement) helpStopsElement.textContent = `정차 ${stageDone}/${stageTarget}`
    if (helpMissedElement) helpMissedElement.textContent = `미정차 ${missedStops}/3`
    if (helpScoreElement) helpScoreElement.textContent = `점수 ${score}`
    if (helpPassengersElement) helpPassengersElement.textContent = `승객 ${passengers}/${capacity}`
    if (endOverlay) {
      endOverlay.classList.toggle('hidden', state.mode !== 'ended')
    }
    if (state.mode === 'ended') {
      const reason =
        state.result === 'success'
          ? '목표 달성'
          : state.result === 'timeout'
            ? '시간 초과'
            : state.result === 'missed-stops'
              ? '미정차 3회 누적'
              : state.result === 'offroad'
                ? '차량 이탈'
                : '운행 종료'
      if (endTitleElement) endTitleElement.textContent = state.result === 'success' ? '운행 성공' : '운행 실패'
      if (endReasonElement) endReasonElement.textContent = reason
      if (endScoreElement) endScoreElement.textContent = String(score)
      if (endStopsElement) endStopsElement.textContent = `${stageDone}/${stageTarget}`
      if (endMissedElement) endMissedElement.textContent = `${missedStops}/3`
      if (endPassengersElement) endPassengersElement.textContent = `${passengers}/${capacity}`
    }
  }

  function updateAndRender(dt, nowSeconds) {
    resizeCanvasToDisplaySize(canvas, renderer.renderer || renderer)
    const controls = input.read()
    const justPressedAccelerate = controls.accelerate && !prevControls.accelerate
    // Auto-start only from menu.
    // Do not auto-restart from ended while keys are still held, which looks like an unexpected reset.
    if (state.mode === 'menu' && (controls.accelerate || controls.left || controls.right || controls.brake)) {
      startRun(state)
    } else if (state.mode === 'ended' && justPressedAccelerate) {
      // Allow intuitive restart with up key, but only on key edge.
      startRun(state)
    }
    updateState(state, controls, dt)
    renderer.draw(state, nowSeconds)
    syncHud()
    prevControls = { ...controls }
  }

  // [v7.7] Helper for interpolation
  function lerp(a, b, t) {
    return a + (b - a) * t
  }

  function lerpAngle(a, b, t) {
    let d = b - a
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return a + d * t
  }

  // [v7.5] Fixed Timestep Loop (60Hz Physics)
  const FIXED_STEP = 1 / 60
  let accumulator = 0

  function frame(now) {
    if (stopped) return

    let dt = (now - lastTime) / 1000
    if (dt > 0.25) dt = 0.25
    lastTime = now

    accumulator += dt

    try {
      while (accumulator >= FIXED_STEP) {
        const controls = helpOpen
          ? { accelerate: false, brake: false, reverse: false, left: false, right: false, steerAxis: 0, command: null }
          : input.read()

        if (state.mode === 'menu' && (controls.accelerate || controls.left || controls.right || controls.brake)) {
          startRun(state)
        } else if (state.mode === 'ended' && controls.accelerate && !prevControls.accelerate) {
          startRun(state)
        }
        prevControls = { ...controls }

        updateState(state, controls, FIXED_STEP)
        accumulator -= FIXED_STEP
      }

      const alpha = accumulator / FIXED_STEP

      // [v7.7] Interpolation Logic
      // Create a temporary render state object with interpolated values
      // Note: We don't modify the actual state, just pass a view object
      const renderState = { ...state }

      if (state.mode === 'running' || state.mode === 'ended') {
        renderState.playerX = lerp(state.prevPlayerX, state.playerX, alpha)
        renderState.lateralVel = lerp(state.prevLateralVel, state.lateralVel, alpha)
        renderState.steeringValue = lerp(state.prevSteeringValue, state.steeringValue, alpha)
        renderState.carYaw = lerp(state.prevCarYaw, state.carYaw, alpha)
        renderState.carRoll = lerp(state.prevCarRoll, state.carRoll, alpha)
        renderState.pitch = lerp(state.prevPitch, state.pitch, alpha)
        renderState.distance = lerp(state.prevDistance, state.distance, alpha)
        renderState.trackX = lerp(state.prevTrackX || 0, state.trackX, alpha)
        renderState.worldX = lerp(state.prevWorldX, state.worldX, alpha)
        renderState.worldZ = lerp(state.prevWorldZ, state.worldZ, alpha)
        renderState.worldYaw = lerpAngle(state.prevWorldYaw, state.worldYaw, alpha)
        renderState.renderTrackX = renderState.trackX
        renderState.renderPlayerX = renderState.playerX
        renderState.renderSteeringValue = renderState.steeringValue
        renderState.renderCarYaw = renderState.carYaw
        renderState.renderCarRoll = renderState.carRoll
        renderState.renderPitch = renderState.pitch
        renderState.renderDistance = renderState.distance
        renderState.renderWorldX = renderState.worldX
        renderState.renderWorldZ = renderState.worldZ
        renderState.renderWorldYaw = renderState.worldYaw
      }

      const roadSamples = buildRoadSamples(renderState.distance, renderState)
      const props = buildProps(roadSamples, renderState)
      const stopMarker = buildStopMarker(renderState)

      renderState.roadSamples = roadSamples
      renderState.props = props
      renderState.stopMarker = stopMarker
      state.roadSamples = roadSamples
      state.props = props
      state.stopMarker = stopMarker

      resizeCanvasToDisplaySize(canvas, renderer.renderer || renderer)
      renderer.draw(renderState, now / 1000)
      syncHud()

    } catch (error) {
      hud.reportError(error)
      stop()
      return
    }

    rafId = requestAnimationFrame(frame)
  }

  function stop() {
    if (stopped) {
      return
    }
    stopped = true
    if (rafId) {
      cancelAnimationFrame(rafId)
    }
    input.dispose()
    window.removeEventListener('resize', onResize)
    window.removeEventListener('error', onWindowError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    window.removeEventListener('keydown', onKeyDown)
    if (startButton) startButton.removeEventListener('click', onStartClick)
    if (restartButton) restartButton.removeEventListener('click', onRestartClick)
    delete window.render_game_to_text
    delete window.advanceTime
  }

  resizeCanvasToDisplaySize(canvas, renderer.renderer || renderer)
  syncHud()

  window.addEventListener('resize', onResize)
  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  window.addEventListener('keydown', onKeyDown)
  if (startButton) startButton.addEventListener('click', onStartClick)
  if (restartButton) restartButton.addEventListener('click', onRestartClick)

  window.render_game_to_text = () => renderGameToText(state)
  window.advanceTime = async (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)))
    const dt = ms / 1000 / steps
    for (let i = 0; i < steps; i += 1) {
      updateAndRender(dt, performance.now() / 1000)
    }
  }

  rafId = requestAnimationFrame(frame)
  return stop
}
