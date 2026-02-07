import { createGL } from '../renderer/gl.js'
import { createSceneRenderer } from '../renderer/scene.js'
import { createHud } from './hud.js'
import { createInputController } from './input.js'
import { createInitialState, renderGameToText, startRun, updateState } from './state.js'

function resizeCanvasToDisplaySize(canvas, gl) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    gl.viewport(0, 0, width, height)
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

export function startGame({ canvas, hudRoot, startOverlay, endOverlay, startButton, restartButton, endSummary }) {
  const hud = createHud(hudRoot)
  const input = createInputController(window)

  let gl
  let renderer
  try {
    gl = createGL(canvas)
    renderer = createSceneRenderer(gl, (message) => hud.reportError(message))
  } catch (error) {
    hud.reportError(error)
    return () => { }
  }

  const state = createInitialState()
  let lastToastSeq = 0
  let prevControls = { accelerate: false, brake: false, left: false, right: false, handbrake: false }
  let stopped = false
  let lastTime = performance.now()
  let rafId = 0

  const onResize = () => resizeCanvasToDisplaySize(canvas, gl)
  const onWindowError = (event) => {
    hud.reportError(event.error || event.message)
  }
  const onUnhandledRejection = (event) => {
    hud.reportError(event.reason)
  }
  const onKeyDown = (event) => {
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
    hud.setTimer(state.missionTime, state.mode, 's')
    hud.setTelemetry({
      speed: state.speed,
      speedMax: state.speedMax,
      stopHold: state.stopHoldTime
    })
    hud.setSeats(state.seats)
    const stopDistance = state.nextStopDistance - state.distance
    const turn = state.curveNow > 0.18 ? 'RIGHT' : state.curveNow < -0.18 ? 'LEFT' : 'STRAIGHT'
    const urgency = stopDistance < 30 ? 'alert' : stopDistance < 90 ? 'approach' : 'normal'
    hud.setNav(turn, stopDistance, urgency)
    hud.setMessage(state.hudLine)
    hud.setStamp(`${state.stamp} · 구간 ${state.stageStopsDone}/${state.stageStopsTarget}`)
    if (state.toastSeq > lastToastSeq) {
      hud.showToast(state.toastMessage, state.toastKind)
      lastToastSeq = state.toastSeq
    }

    if (startOverlay) {
      startOverlay.classList.toggle('hidden', state.mode !== 'menu')
    }
    if (endOverlay) {
      endOverlay.classList.toggle('hidden', state.mode !== 'ended')
    }
    if (endSummary && state.mode === 'ended') {
      const label =
        state.result === 'success'
          ? '성공'
          : state.result === 'timeout'
            ? '시간 초과'
            : state.result === 'missed-stops'
              ? '미정차 누적'
              : state.result === 'offroad'
                ? '차량 이탈'
                : '종료'
      endSummary.textContent = `${label} · 승객 ${state.passengers}/${state.targetPassengers} · 정류장 ${state.stopsServed} · 미정차 ${state.missedStops ?? 0}`
    }
  }

  function updateAndRender(dt, nowSeconds) {
    resizeCanvasToDisplaySize(canvas, gl)
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

  function frame(now) {
    if (stopped) {
      return
    }

    const dt = Math.min((now - lastTime) / 1000, 1 / 20)
    lastTime = now

    try {
      updateAndRender(dt, now / 1000)
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

  resizeCanvasToDisplaySize(canvas, gl)
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
