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
  let propBuildAccumulator = 0
  const PROP_BUILD_INTERVAL = 0
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

  const onStartPointer = (event) => {
    if (state.mode !== 'menu') return
    if (event && typeof event.preventDefault === 'function') event.preventDefault()
    startRun(state)
  }

  const onStartOverlayClick = (event) => {
    if (state.mode !== 'menu') return
    event.preventDefault()
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

  function updateAndRender(dt, nowSeconds, controlsOverride = null) {
    resizeCanvasToDisplaySize(canvas, renderer.renderer || renderer)
    const controls = controlsOverride || input.read()
    const justPressedAccelerate = controls.accelerate && !prevControls.accelerate

    if (state.mode === 'menu' && (controls.accelerate || controls.left || controls.right || controls.brake)) {
      startRun(state)
    } else if (state.mode === 'ended' && justPressedAccelerate) {
      startRun(state)
    }

    updateState(state, controls, dt)
    state.roadSamples = buildRoadSamples(state.distance, state)
    propBuildAccumulator += dt
    state.props = buildProps(state.roadSamples, state)
    propBuildAccumulator = 0
    state.stopMarker = buildStopMarker(state)
    renderer.draw(state, nowSeconds)
    syncHud()
    prevControls = { ...controls }
  }

  function frame(now) {
    if (stopped) return

    let dt = (now - lastTime) / 1000
    if (dt > 0.12) dt = 0.12
    lastTime = now

    try {
      const controls = helpOpen
        ? { accelerate: false, brake: false, reverse: false, left: false, right: false, steerAxis: 0, command: null }
        : input.read()
      updateAndRender(dt, now / 1000, controls)

    } catch (error) {
      hud.reportError(error)
      // Keep controls/listeners alive so a transient render error does not
      // permanently block start/restart input.
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
    if (startButton) {
      startButton.removeEventListener('click', onStartClick)
      startButton.removeEventListener('pointerdown', onStartPointer)
      startButton.removeEventListener('mousedown', onStartPointer)
      startButton.removeEventListener('touchstart', onStartPointer)
    }
    if (startOverlay) {
      startOverlay.removeEventListener('click', onStartOverlayClick)
      startOverlay.removeEventListener('pointerdown', onStartPointer)
      startOverlay.removeEventListener('mousedown', onStartPointer)
      startOverlay.removeEventListener('touchstart', onStartPointer)
    }
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
  if (startButton) {
    startButton.addEventListener('click', onStartClick)
    startButton.addEventListener('pointerdown', onStartPointer)
    startButton.addEventListener('mousedown', onStartPointer)
    startButton.addEventListener('touchstart', onStartPointer)
  }
  if (startOverlay) {
    startOverlay.addEventListener('click', onStartOverlayClick)
    startOverlay.addEventListener('pointerdown', onStartPointer)
    startOverlay.addEventListener('mousedown', onStartPointer)
    startOverlay.addEventListener('touchstart', onStartPointer)
  }
  if (restartButton) restartButton.addEventListener('click', onRestartClick)

  window.render_game_to_text = () => renderGameToText(state)
  window.advanceTime = async (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)))
    const dt = ms / 1000 / steps
    for (let i = 0; i < steps; i += 1) {
      const controls = helpOpen
        ? { accelerate: false, brake: false, reverse: false, left: false, right: false, steerAxis: 0, command: null }
        : input.read()
      updateAndRender(dt, performance.now() / 1000, controls)
    }
  }

  rafId = requestAnimationFrame(frame)
  return stop
}
