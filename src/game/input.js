const PREVENT_DEFAULT_CODES = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export function createInputController(target = window) {
  const pressed = new Set()
  const commandQueue = []

  function onKeyDown(event) {
    if (!event.repeat && event.code === 'Space') {
      commandQueue.push('space')
    }
    pressed.add(event.code)
    if (PREVENT_DEFAULT_CODES.has(event.code)) {
      event.preventDefault()
    }
  }

  function onKeyUp(event) {
    pressed.delete(event.code)
  }

  function onBlur() {
    pressed.clear()
    commandQueue.length = 0
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return {
    read() {
      const left = pressed.has('KeyA') || pressed.has('ArrowLeft')
      const right = pressed.has('KeyD') || pressed.has('ArrowRight')
      return {
        accelerate: pressed.has('KeyW') || pressed.has('ArrowUp'),
        brake: pressed.has('KeyS') || pressed.has('ArrowDown'),
        left,
        right,
        steerAxis: (right ? 1 : 0) - (left ? 1 : 0),
        reverse: pressed.has('KeyR'),
        command: commandQueue.shift() ?? null
      }
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      pressed.clear()
      commandQueue.length = 0
    }
  }
}
