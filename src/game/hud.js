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
  const messageElement = rootElement.querySelector('[data-role="message"]')
  const stampElement = rootElement.querySelector('[data-role="stamp"]')
  const speedElement = rootElement.querySelector('[data-role="speed"]')
  const speedFillElement = rootElement.querySelector('[data-role="speed-fill"]')
  const stopDistanceElement = rootElement.querySelector('[data-role="stop-distance"]')
  const stopFillElement = rootElement.querySelector('[data-role="stop-fill"]')
  const toastElement = rootElement.querySelector('[data-role="toast"]')
  const errorsElement = rootElement.querySelector('[data-role="errors"]')
  const errors = []
  let toastHandle = 0

  if (
    !timerElement ||
    !turnElement ||
    !navElement ||
    !messageElement ||
    !stampElement ||
    !speedElement ||
    !speedFillElement ||
    !stopDistanceElement ||
    !stopFillElement ||
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
    if (stopDistanceElement) stopDistanceElement.textContent = `${distance.toString().padStart(3, '0')}m`
    const stopPct = clamp(1 - distance / 260, 0, 1)
    if (stopFillElement) {
      stopFillElement.style.width = `${Math.round(stopPct * 100)}%`
      stopFillElement.classList.toggle('stop-close', distance <= 40)
    }
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
    if (stopFillElement) {
      stopFillElement.classList.toggle('stop-hold', stopHold > 0.01)
    }
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
    toastElement.classList.remove('hidden', 'toast-info', 'toast-good', 'toast-bad')
    toastElement.classList.add(kind === 'good' ? 'toast-good' : kind === 'bad' ? 'toast-bad' : 'toast-info')
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

  function setSeats(seats) {
    let seatingElement = rootElement.querySelector('[data-role="seating"]')

    if (!seatingElement) {
      seatingElement = document.createElement('div')
      seatingElement.className = 'hud-seating'
      seatingElement.dataset.role = 'seating'
      const msgParams = rootElement.querySelector('[data-role="message"]')
      if (msgParams) rootElement.insertBefore(seatingElement, msgParams)
      else rootElement.appendChild(seatingElement)
    }

    if (seatingElement.dataset.ui !== 'compact') {
      seatingElement.innerHTML = ''
      seatingElement.dataset.ui = 'compact'

      const head = document.createElement('div')
      head.className = 'seating-head'
      const title = document.createElement('span')
      title.className = 'seating-title'
      title.textContent = '좌석'
      const count = document.createElement('span')
      count.className = 'seating-count'
      count.dataset.role = 'seat-count'
      head.append(title, count)

      const meter = document.createElement('div')
      meter.className = 'seating-meter'
      const meterFill = document.createElement('div')
      meterFill.className = 'seating-fill'
      meterFill.dataset.role = 'seat-fill'
      meter.appendChild(meterFill)

      const meta = document.createElement('div')
      meta.className = 'seating-meta'
      const left = document.createElement('span')
      left.className = 'seating-left'
      left.dataset.role = 'seat-left'
      const load = document.createElement('span')
      load.className = 'seating-load'
      load.dataset.role = 'seat-load'
      meta.append(left, load)

      const strip = document.createElement('div')
      strip.className = 'seating-strip'
      for (let i = 0; i < seats.length; i += 1) {
        const seat = document.createElement('div')
        seat.className = 'seat-dot'
        seat.dataset.index = String(i)
        strip.appendChild(seat)
      }

      seatingElement.append(head, meter, meta, strip)
    }

    const seatNodes = seatingElement.querySelectorAll('.seat-dot')
    const occupied = seats.reduce((acc, seated) => acc + (seated ? 1 : 0), 0)
    const total = Math.max(1, seats.length)
    const fillPct = clamp(occupied / total, 0, 1)
    const countNode = seatingElement.querySelector('[data-role="seat-count"]')
    const fillNode = seatingElement.querySelector('[data-role="seat-fill"]')
    const leftNode = seatingElement.querySelector('[data-role="seat-left"]')
    const loadNode = seatingElement.querySelector('[data-role="seat-load"]')

    if (countNode) countNode.textContent = `${occupied}/${total}`
    if (fillNode) fillNode.style.width = `${Math.round(fillPct * 100)}%`
    if (leftNode) leftNode.textContent = `빈좌석 ${Math.max(0, total - occupied)}석`
    if (loadNode) loadNode.textContent = `탑승률 ${Math.round(fillPct * 100)}%`

    seats.forEach((isOccupied, i) => {
      if (seatNodes[i]) {
        seatNodes[i].classList.toggle('occupied', isOccupied === true)
      }
    })
  }

  return {
    setTimer,
    setNav,
    setTelemetry,
    setSeats,
    setMessage,
    setStamp,
    showToast,
    reportError
  }
}
