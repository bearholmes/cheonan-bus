const GL_ERROR_NAMES = {
  0x0500: 'INVALID_ENUM',
  0x0501: 'INVALID_VALUE',
  0x0502: 'INVALID_OPERATION',
  0x0505: 'OUT_OF_MEMORY',
  0x0506: 'INVALID_FRAMEBUFFER_OPERATION',
  0x9242: 'CONTEXT_LOST_WEBGL'
}

function withLineNumbers(source) {
  return source
    .split('\n')
    .map((line, index) => `${index + 1}: ${line}`)
    .join('\n')
}

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  })
  if (!gl) {
    throw new Error('WebGL context creation failed. Your browser/GPU may not support WebGL.')
  }
  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)
  gl.clearColor(0.04, 0.07, 0.1, 1)
  return gl
}

export function compileShader(gl, type, source, label) {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error(`Unable to allocate shader object for ${label}.`)
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'No compiler log provided.'
    gl.deleteShader(shader)
    throw new Error(`Shader compile failed (${label}): ${log}\n${withLineNumbers(source)}`)
  }

  return shader
}

export function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource, 'vertex shader')
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, 'fragment shader')

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error('Unable to allocate WebGL program object.')
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  const linked = gl.getProgramParameter(program, gl.LINK_STATUS)
  const log = gl.getProgramInfoLog(program)

  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!linked) {
    gl.deleteProgram(program)
    throw new Error(`Program link failed: ${log || 'No linker log provided.'}`)
  }

  if (log && log.trim()) {
    console.warn('Program linker log:', log)
  }

  return program
}

export function drainGLErrors(gl) {
  const errors = []
  for (let i = 0; i < 16; i += 1) {
    const code = gl.getError()
    if (code === gl.NO_ERROR) {
      break
    }
    const name = GL_ERROR_NAMES[code] || `0x${code.toString(16)}`
    errors.push(name)
  }
  return errors
}

export function assertNoGLError(gl, where) {
  const errors = drainGLErrors(gl)
  if (errors.length > 0) {
    throw new Error(`WebGL error at ${where}: ${errors.join(', ')}`)
  }
}
