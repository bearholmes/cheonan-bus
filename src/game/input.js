const PREVENT_DEFAULT_CODES = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export function createInputController(target = window) {
  const pressed = new Set()

  function onKeyDown(event) {
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
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return {
    read() {
      return {
        accelerate: pressed.has('KeyW') || pressed.has('ArrowUp'),
        brake: pressed.has('KeyS') || pressed.has('ArrowDown'),
        left: pressed.has('KeyA') || pressed.has('ArrowLeft'),
        right: pressed.has('KeyD') || pressed.has('ArrowRight'),
        reverse: pressed.has('KeyR'),
        command: pressed.has('Space') ? 'space' : null
      }
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      pressed.clear()
    }
  }
}
