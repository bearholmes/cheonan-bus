function formatError(error) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function createHud(rootElement) {
  const timerElement = rootElement.querySelector('[data-role="timer"]')
  const turnElement = rootElement.querySelector('[data-role="turn"]')
  const navElement = rootElement.querySelector('[data-role="nav"]')
  const doorElement = rootElement.querySelector('[data-role="door"]')
  const messageElement = rootElement.querySelector('[data-role="message"]')
  const stampElement = rootElement.querySelector('[data-role="stamp"]')
  const speedElement = rootElement.querySelector('[data-role="speed"]')
  const speedFillElement = rootElement.querySelector('[data-role="speed-fill"]')
  const toastElement = rootElement.querySelector('[data-role="toast"]')
  const errorsElement = rootElement.querySelector('[data-role="errors"]')
  const errors = []
  let toastHandle = 0

  if (
    !timerElement ||
    !navElement ||
    !stampElement ||
    !speedElement ||
    !speedFillElement ||
    !toastElement ||
    !errorsElement
  ) {
    throw new Error('HUD root is missing required nodes.')
  }

  function syncErrors() {
    errorsElement.textContent = errors.length > 0 ? `Errors: ${errors.join(' | ')}` : ''
  }

  function setTimer(value, mode, unit = 's', label = '') {
    const whole = Math.max(0, Math.round(value))
    const prefix = label ? `${label} ` : ''
    timerElement.textContent = `${prefix}${whole.toString().padStart(2, '0')} ${unit}`
    timerElement.classList.toggle('timer-alert-10', unit === 's' && whole <= 10)
    timerElement.classList.toggle('timer-alert-5', unit === 's' && whole <= 5)
    timerElement.classList.toggle('timer-freeze', mode !== 'running')
  }

  function setNav(turn, stopDistance, urgency) {
    const icon = turn === 'LEFT' ? 'LEFT' : turn === 'RIGHT' ? 'RIGHT' : ''
    const distance = Math.round(Math.max(0, stopDistance))
    if (turnElement) turnElement.textContent = icon
    if (navElement) navElement.textContent = `정류장까지 ${distance}m`
    if (navElement) {
      navElement.classList.toggle('nav-approach', urgency === 'approach')
      navElement.classList.toggle('nav-alert', urgency === 'alert')
    }
    if (turnElement) {
      turnElement.classList.toggle('turn-approach', urgency === 'approach')
      turnElement.classList.toggle('turn-alert', urgency === 'alert')
    }
  }

  function setTelemetry({ speed, speedMax, stopHold }) {
    const speedAbs = Math.max(0, Math.round(speed))
    const speedCap = Math.max(1, Math.round(speedMax || 1))
    speedElement.textContent = speedAbs.toString().padStart(3, '0')
    const speedPct = clamp(speedAbs / speedCap, 0, 1)
    speedFillElement.style.width = `${Math.round(speedPct * 100)}%`
    speedFillElement.classList.toggle('speed-high', speedPct >= 0.82)
  }

  function setDoorState(doorOpen) {
    if (!doorElement) return
    doorElement.textContent = doorOpen ? 'OPEN' : 'CLOSED'
    doorElement.classList.toggle('door-open', doorOpen)
    doorElement.classList.toggle('door-closed', !doorOpen)
  }

  function setMessage(line) {
    if (messageElement) messageElement.textContent = line
  }

  function setStamp(line) {
    if (stampElement) stampElement.textContent = line
  }

  function showToast(text, kind = 'info') {
    if (!text || !toastElement) return
    toastElement.textContent = text
    toastElement.classList.remove('hidden', 'toast-info', 'toast-good', 'toast-bad', 'toast-alert')
    toastElement.classList.add(
      kind === 'good'
        ? 'toast-good'
        : kind === 'bad'
          ? 'toast-bad'
          : kind === 'alert'
            ? 'toast-alert'
            : 'toast-info'
    )
    if (toastHandle) {
      clearTimeout(toastHandle)
    }
    toastHandle = window.setTimeout(() => {
      toastElement.classList.add('hidden')
    }, 1400)
  }

  function reportError(errorLike) {
    const message = formatError(errorLike)
    if (errors[errors.length - 1] === message) {
      return
    }

    errors.push(message)
    if (errors.length > 4) {
      errors.shift()
    }
    syncErrors()
    console.error('[HUD]', errorLike)
  }

  syncErrors()

  return {
    setTimer,
    setNav,
    setTelemetry,
    setDoorState,
    setMessage,
    setStamp,
    showToast,
    reportError
  }
}
