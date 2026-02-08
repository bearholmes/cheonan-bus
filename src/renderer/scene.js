import { mat4, vec3 } from '../math/mat.js'
import { assertNoGLError, createProgram, drainGLErrors, getInstancedExt } from './gl.js'
import { createCubeGeometry, createPlaneGeometry, createCylinderGeometry, createConeGeometry } from './geometry.js'
import { bindMesh, createMesh, createInstanceBuffer, bindInstancedMesh } from './mesh.js'

const VERTEX_SHADER_SOURCE = `
attribute vec3 a_pos;
attribute vec3 a_col;
uniform mat4 u_mvp;
varying vec3 v_col;

void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_col = a_col;
}
`

const VERTEX_SHADER_INSTANCED_SOURCE = `
attribute vec3 a_pos;
attribute vec3 a_col;
attribute mat4 a_model;
uniform mat4 u_vp;
varying vec3 v_col;

void main() {
  gl_Position = u_vp * a_model * vec4(a_pos, 1.0);
  v_col = a_col;
}
`

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
varying vec3 v_col;

void main() {
  gl_FragColor = vec4(v_col, 1.0);
}
`

const BUS_X = 0
const BUS_Z = 8.1

const RUMBLE_RED = [0.88, 0.18, 0.18]
const RUMBLE_WHITE = [0.93, 0.93, 0.9]

function createRibbon(gl, maxSegments, defaultColor) {
  const vertexCapacity = (maxSegments + 1) * 2
  const vertices = new Float32Array(vertexCapacity * 6)
  const indices = new Uint16Array(maxSegments * 6)

  for (let i = 0; i < maxSegments; i += 1) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    const idx = i * 6

    indices[idx + 0] = a
    indices[idx + 1] = c
    indices[idx + 2] = b
    indices[idx + 3] = b
    indices[idx + 4] = c
    indices[idx + 5] = d
  }

  const vertexBuffer = gl.createBuffer()
  const indexBuffer = gl.createBuffer()
  if (!vertexBuffer || !indexBuffer) {
    throw new Error('Unable to allocate ribbon buffers.')
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW)

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

  return {
    vertexBuffer,
    indexBuffer,
    vertices,
    defaultColor,
    indexCount: 0
  }
}

function updateRibbonGeometry(gl, ribbon, samples, offsetA, offsetB, y) {
  if (!samples || samples.length < 2) {
    ribbon.indexCount = 0
    return
  }

  const [r, g, b] = ribbon.defaultColor

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]
    const ax = s.x + s.rightX * offsetA
    const az = s.z + s.rightZ * offsetA
    const bx = s.x + s.rightX * offsetB
    const bz = s.z + s.rightZ * offsetB

    const base = i * 12
    ribbon.vertices[base + 0] = ax
    ribbon.vertices[base + 1] = y
    ribbon.vertices[base + 2] = az
    ribbon.vertices[base + 3] = r
    ribbon.vertices[base + 4] = g
    ribbon.vertices[base + 5] = b

    ribbon.vertices[base + 6] = bx
    ribbon.vertices[base + 7] = y
    ribbon.vertices[base + 8] = bz
    ribbon.vertices[base + 9] = r
    ribbon.vertices[base + 10] = g
    ribbon.vertices[base + 11] = b
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, ribbon.vertexBuffer)
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribbon.vertices.subarray(0, samples.length * 12))
  ribbon.indexCount = (samples.length - 1) * 6
}

function updateRumbleGeometry(gl, ribbon, samples, offsetA, offsetB, y) {
  if (!samples || samples.length < 2) {
    ribbon.indexCount = 0
    return
  }

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]
    const ax = s.x + s.rightX * offsetA
    const az = s.z + s.rightZ * offsetA
    const bx = s.x + s.rightX * offsetB
    const bz = s.z + s.rightZ * offsetB

    const useRed = Math.floor(s.segmentIndex / 4) % 2 === 0
    const [r, g, b] = useRed ? RUMBLE_RED : RUMBLE_WHITE

    const base = i * 12
    ribbon.vertices[base + 0] = ax
    ribbon.vertices[base + 1] = y
    ribbon.vertices[base + 2] = az
    ribbon.vertices[base + 3] = r
    ribbon.vertices[base + 4] = g
    ribbon.vertices[base + 5] = b

    ribbon.vertices[base + 6] = bx
    ribbon.vertices[base + 7] = y
    ribbon.vertices[base + 8] = bz
    ribbon.vertices[base + 9] = r
    ribbon.vertices[base + 10] = g
    ribbon.vertices[base + 11] = b
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, ribbon.vertexBuffer)
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribbon.vertices.subarray(0, samples.length * 12))
  ribbon.indexCount = (samples.length - 1) * 6
}

function drawRibbon(gl, ribbon, positionLocation, colorLocation) {
  if (ribbon.indexCount <= 0) return

  gl.bindBuffer(gl.ARRAY_BUFFER, ribbon.vertexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribbon.indexBuffer)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 24, 0)
  gl.enableVertexAttribArray(colorLocation)
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 24, 12)

  gl.drawElements(gl.TRIANGLES, ribbon.indexCount, gl.UNSIGNED_SHORT, 0)
}

function normalize2(x, z) {
  const len = Math.hypot(x, z) || 1
  return [x / len, z / len]
}

function toLocal(worldX, worldZ, originX, originZ, forwardX, forwardZ, rightX, rightZ) {
  const dx = worldX - originX
  const dz = worldZ - originZ

  const x = dx * rightX + dz * rightZ
  const forward = dx * forwardX + dz * forwardZ
  const z = BUS_Z - forward

  return [x, z]
}

function isVisibleLocal(x, z) {
  return z < 35 && z > -300 && Math.abs(x) < 140
}

export function createSceneRenderer(gl, reportError) {
  const ext = getInstancedExt(gl)
  if (!ext) {
    console.warn('ANGLE_instanced_arrays not supported, performance may suffer.')
  }

  const program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE)
  const positionLocation = gl.getAttribLocation(program, 'a_pos')
  const colorLocation = gl.getAttribLocation(program, 'a_col')
  const mvpLocation = gl.getUniformLocation(program, 'u_mvp')

  const programInstanced = createProgram(gl, VERTEX_SHADER_INSTANCED_SOURCE, FRAGMENT_SHADER_SOURCE)
  const positionLocI = gl.getAttribLocation(programInstanced, 'a_pos')
  const colorLocI = gl.getAttribLocation(programInstanced, 'a_col')
  const modelLocI = gl.getAttribLocation(programInstanced, 'a_model')
  const vpLocI = gl.getUniformLocation(programInstanced, 'u_vp')

  if (positionLocation < 0 || colorLocation < 0 || !mvpLocation) {
    throw new Error('Shader attribute/uniform lookup failed.')
  }

  function createBatch(mesh, initialCapacity = 256) {
    const data = new Float32Array(initialCapacity * 16)
    const instanceBuffer = createInstanceBuffer(gl, data, 16)
    const attributes = [{ buffer: instanceBuffer, location: modelLocI, numComponents: 16 }]

    return {
      mesh,
      data,
      count: 0,
      instanceBuffer,
      attributes,
      ensureCapacity(needed) {
        if (this.data.length / 16 < needed) {
          const newData = new Float32Array(Math.max(needed, this.data.length * 2) * 16)
          newData.set(this.data)
          this.data = newData
        }
      },
      add(modelMatrix) {
        if (this.count * 16 + 16 > this.data.length) {
          this.ensureCapacity(this.count + 64)
        }
        this.data.set(modelMatrix, this.count * 16)
        this.count += 1
      },
      flush(viewProjectionMatrix) {
        if (this.count === 0) return

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer.buffer)
        gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * 16), gl.DYNAMIC_DRAW)

        bindInstancedMesh(gl, ext, this.mesh, positionLocI, colorLocI, this.attributes)
        gl.uniformMatrix4fv(vpLocI, false, viewProjectionMatrix)

        if (ext) {
          ext.drawElementsInstancedANGLE(gl.TRIANGLES, this.mesh.indexCount, gl.UNSIGNED_SHORT, 0, this.count)
        }

        this.count = 0
      }
    }
  }

  const roadWidth = 19.2
  const rumbleWidth = 2.1
  const shoulderWidth = 7.4
  const grassWidth = 32

  const roadHalf = roadWidth / 2
  const rumbleOuter = roadHalf + rumbleWidth
  const shoulderOuter = rumbleOuter + shoulderWidth
  const grassOuter = shoulderOuter + grassWidth

  const maxSegments = 120
  const ribbonRoad = createRibbon(gl, maxSegments, [0.2, 0.21, 0.23])
  const ribbonShoulderLeft = createRibbon(gl, maxSegments, [0.84, 0.81, 0.72])
  const ribbonShoulderRight = createRibbon(gl, maxSegments, [0.84, 0.81, 0.72])
  const ribbonRumbleLeft = createRibbon(gl, maxSegments, RUMBLE_RED)
  const ribbonRumbleRight = createRibbon(gl, maxSegments, RUMBLE_RED)
  const ribbonGrassLeft = createRibbon(gl, maxSegments, [0.17, 0.47, 0.2])
  const ribbonGrassRight = createRibbon(gl, maxSegments, [0.17, 0.47, 0.2])

  const groundMesh = createMesh(gl, createPlaneGeometry(160, 110, -0.1, [0.14, 0.39, 0.17]))
  const laneDashMesh = createMesh(gl, createPlaneGeometry(0.25, 2.4, 0.08, [0.95, 0.95, 0.9]))

  const treeTrunkMesh = createMesh(gl, createCylinderGeometry(0.3, 0.4, 1.2, 6, [0.3, 0.2, 0.1]))
  const treeLeavesMesh = createMesh(gl, createConeGeometry(2.2, 3.5, 7, [0.15, 0.45, 0.18]))
  const towerMesh = createMesh(gl, createCubeGeometry(1.4, 5.1, 1.4, [0.38, 0.56, 0.7]))
  const signMesh = createMesh(gl, createCubeGeometry(2.6, 1.3, 0.26, [0.82, 0.9, 0.98]))
  const signPoleMesh = createMesh(gl, createCylinderGeometry(0.12, 0.12, 1.8, 6, [0.18, 0.22, 0.27]))

  const stopPoleMesh = createMesh(gl, createCylinderGeometry(0.1, 0.1, 1.95, 6, [0.17, 0.2, 0.24]))
  const stopBoardMesh = createMesh(gl, createCubeGeometry(0.68, 0.72, 0.1, [0.95, 0.86, 0.23]))
  const stopBenchMesh = createMesh(gl, createCubeGeometry(1.25, 0.2, 0.42, [0.44, 0.3, 0.18]))
  const stopBenchLegMesh = createMesh(gl, createCubeGeometry(0.12, 0.34, 0.12, [0.26, 0.22, 0.18]))
  const stopZoneMesh = createMesh(gl, createPlaneGeometry(5.2, 7.8, 0.015, [0.95, 0.93, 0.35]))
  const stopZoneStripeMesh = createMesh(gl, createPlaneGeometry(4.8, 6.9, 0.02, [0.1, 0.13, 0.16]))
  const stopBeaconMesh = createMesh(gl, createCubeGeometry(0.6, 0.6, 0.6, [1, 0.84, 0.34]))
  const stopBeamMesh = createMesh(gl, createCubeGeometry(0.95, 8.4, 0.95, [0.98, 0.35, 0.25]))
  const stopPillarMesh = createMesh(gl, createCylinderGeometry(0.14, 0.14, 2.4, 6, [0.12, 0.16, 0.2]))

  const busBody = createMesh(gl, createCubeGeometry(3.2, 1.22, 7.05, [0.2, 0.62, 0.28]))
  const busUpper = createMesh(gl, createCubeGeometry(3.05, 1.04, 5.9, [0.13, 0.28, 0.2]))
  const busRoof = createMesh(gl, createCubeGeometry(2.88, 0.22, 6.45, [0.78, 0.82, 0.84]))
  const busWindshield = createMesh(gl, createCubeGeometry(2.56, 0.72, 0.16, [0.53, 0.82, 0.95]))
  const busBumper = createMesh(gl, createCubeGeometry(2.86, 0.28, 0.34, [0.14, 0.16, 0.2]))
  const wheel = createMesh(gl, createCylinderGeometry(0.45, 0.45, 0.45, 16, [0.06, 0.06, 0.07]))

  const treeTrunkBatch = createBatch(treeTrunkMesh)
  const treeLeavesBatch = createBatch(treeLeavesMesh)
  const towerBatch = createBatch(towerMesh)
  const signPoleBatch = createBatch(signPoleMesh)
  const signBatch = createBatch(signMesh)

  const projectionMatrix = mat4.create()
  const viewMatrix = mat4.create()
  const viewProjectionMatrix = mat4.create()
  const modelMatrix = mat4.create()
  const mvpMatrix = mat4.create()
  const busBaseMatrix = mat4.create()
  const partMatrix = mat4.create()

  const eye = vec3.fromValues(0, 5.0, 26.0)
  const target = vec3.fromValues(0, 0.8, -35.0)
  const up = vec3.fromValues(0, 1, 0)

  let smoothLookX = 0

  const localSamples = []

  function ensureLocalSamples(size) {
    while (localSamples.length < size) {
      localSamples.push({ x: 0, z: 0, rightX: 1, rightZ: 0, heading: 0, segmentIndex: 0, i: 0 })
    }
    if (localSamples.length > size) {
      localSamples.length = size
    }
  }

  function drawMesh(mesh, model) {
    bindMesh(gl, mesh, positionLocation, colorLocation)
    mat4.multiply(mvpMatrix, viewProjectionMatrix, model)
    gl.uniformMatrix4fv(mvpLocation, false, mvpMatrix)
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0)
  }

  function buildLocalSamples(state) {
    const samples = state.roadSamples || []
    if (samples.length < 2) return null

    let busIndex = samples.findIndex((s) => s.i === 0)
    if (busIndex < 0) busIndex = Math.min(15, samples.length - 1)

    const busSample = samples[busIndex]
    const laneOffset = state.renderPlayerX ?? state.playerX ?? 0

    const busWorldX = busSample.centerX + busSample.rightX * laneOffset
    const busWorldZ = busSample.centerZ + busSample.rightZ * laneOffset

    const forwardX = Math.sin(busSample.heading)
    const forwardZ = Math.cos(busSample.heading)
    const rightX = busSample.rightX
    const rightZ = busSample.rightZ

    ensureLocalSamples(samples.length)

    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i]
      const [x, z] = toLocal(s.centerX, s.centerZ, busWorldX, busWorldZ, forwardX, forwardZ, rightX, rightZ)
      const out = localSamples[i]
      out.x = x
      out.z = z
      out.segmentIndex = s.segmentIndex
      out.i = s.i
      out.heading = 0
      out.rightX = 1
      out.rightZ = 0
    }

    for (let i = 0; i < localSamples.length - 1; i += 1) {
      const curr = localSamples[i]
      const next = localSamples[i + 1]
      const fx = next.x - curr.x
      const fz = next.z - curr.z
      const [nfx, nfz] = normalize2(fx, fz)
      curr.rightX = -nfz
      curr.rightZ = nfx
      curr.heading = Math.atan2(nfx, -nfz)
    }

    const last = localSamples[localSamples.length - 1]
    const prev = localSamples[localSamples.length - 2]
    last.rightX = prev.rightX
    last.rightZ = prev.rightZ
    last.heading = prev.heading

    return {
      busSample,
      busWorldX,
      busWorldZ,
      forwardX,
      forwardZ,
      rightX,
      rightZ,
      samples: localSamples
    }
  }

  function queueLocalProp(prop, basis) {
    const [x, z] = toLocal(prop.x, prop.z, basis.busWorldX, basis.busWorldZ, basis.forwardX, basis.forwardZ, basis.rightX, basis.rightZ)
    if (!isVisibleLocal(x, z)) return

    const scale = prop.scale

    if (prop.kind === 'tree') {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [x, 0.6 * scale, z])
      mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
      treeTrunkBatch.add(modelMatrix)

      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [x, 2.2 * scale, z])
      mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
      treeLeavesBatch.add(modelMatrix)
      return
    }

    if (prop.kind === 'tower') {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [x, 2.2 * scale, z])
      mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
      towerBatch.add(modelMatrix)
      return
    }

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [x, 0.95 * scale, z])
    mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
    signPoleBatch.add(modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [x, 1.9 * scale, z])
    mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
    signBatch.add(modelMatrix)
  }

  function drawLocalStopMarker(stopMarker, basis, distanceToStop) {
    if (!stopMarker) return

    const [poleX, poleZ] = toLocal(stopMarker.x, stopMarker.z, basis.busWorldX, basis.busWorldZ, basis.forwardX, basis.forwardZ, basis.rightX, basis.rightZ)
    if (!isVisibleLocal(poleX, poleZ)) return

    const [zoneX, zoneZ] = toLocal(stopMarker.zoneX ?? stopMarker.centerX, stopMarker.zoneZ ?? stopMarker.centerZ, basis.busWorldX, basis.busWorldZ, basis.forwardX, basis.forwardZ, basis.rightX, basis.rightZ)

    const localHeading = (stopMarker.heading || 0) - (basis.busSample.heading || 0)
    const rightLX = Math.cos(localHeading)
    const rightLZ = -Math.sin(localHeading)

    const near = Math.abs(distanceToStop) < 60
    const flash = near ? 1.2 : 1

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 0.02, zoneZ])
    mat4.rotateY(modelMatrix, modelMatrix, localHeading)
    drawMesh(stopZoneMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 0.025, zoneZ])
    mat4.rotateY(modelMatrix, modelMatrix, localHeading)
    drawMesh(stopZoneStripeMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [poleX, 1.0, poleZ])
    drawMesh(stopPoleMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 1.25, zoneZ - 0.4])
    drawMesh(stopPillarMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [poleX, 2.15, poleZ])
    drawMesh(stopBoardMesh, modelMatrix)

    const benchSide = stopMarker.side === 'right' ? -1.1 : 1.1
    const benchX = poleX + rightLX * benchSide
    const benchZ = poleZ + rightLZ * benchSide

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [benchX, 0.45, benchZ + 0.2])
    mat4.rotateY(modelMatrix, modelMatrix, localHeading)
    drawMesh(stopBenchMesh, modelMatrix)

    for (const leg of [-0.45, 0.45]) {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [benchX + leg * Math.cos(localHeading), 0.22, benchZ + leg * Math.sin(localHeading) + 0.2])
      drawMesh(stopBenchLegMesh, modelMatrix)
    }

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [poleX, 2.75, poleZ])
    mat4.scale(modelMatrix, modelMatrix, [flash, flash, flash])
    drawMesh(stopBeaconMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 4.5, zoneZ])
    mat4.scale(modelMatrix, modelMatrix, [near ? 1.3 : 1, 1, near ? 1.3 : 1])
    drawMesh(stopBeamMesh, modelMatrix)
  }

  function draw(state) {
    const basis = buildLocalSamples(state)
    if (!basis) return

    const local = basis.samples
    const aspect = gl.canvas.width / gl.canvas.height
    mat4.perspective(projectionMatrix, (45 * Math.PI) / 180, aspect, 0.1, 400)

    const nearSample = local[Math.min(3, local.length - 1)]
    const farSample = local[Math.min(14, local.length - 1)]
    const roadLook = nearSample && farSample ? (farSample.x - nearSample.x) * 0.12 : 0
    const steeringLook = (state.renderSteeringValue ?? state.steeringValue ?? 0) * 10.0
    const desiredLookX = roadLook + steeringLook
    smoothLookX += (desiredLookX - smoothLookX) * 0.08

    target[0] = smoothLookX
    target[1] = 0.8
    target[2] = -35.0

    mat4.lookAt(viewMatrix, eye, target, up)
    mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix)

    gl.useProgram(program)
    gl.clearColor(0.36, 0.67, 0.93, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [0, -0.05, -10])
    drawMesh(groundMesh, modelMatrix)

    updateRibbonGeometry(gl, ribbonGrassLeft, local, -grassOuter, -shoulderOuter, 0)
    updateRibbonGeometry(gl, ribbonGrassRight, local, shoulderOuter, grassOuter, 0)
    updateRibbonGeometry(gl, ribbonShoulderLeft, local, -shoulderOuter, -rumbleOuter, 0)
    updateRibbonGeometry(gl, ribbonShoulderRight, local, rumbleOuter, shoulderOuter, 0)
    updateRibbonGeometry(gl, ribbonRoad, local, -roadHalf, roadHalf, 0)
    updateRumbleGeometry(gl, ribbonRumbleLeft, local, -rumbleOuter, -roadHalf, 0.08)
    updateRumbleGeometry(gl, ribbonRumbleRight, local, roadHalf, rumbleOuter, 0.08)

    mat4.identity(modelMatrix)
    mat4.multiply(mvpMatrix, viewProjectionMatrix, modelMatrix)
    gl.uniformMatrix4fv(mvpLocation, false, mvpMatrix)

    drawRibbon(gl, ribbonGrassLeft, positionLocation, colorLocation)
    drawRibbon(gl, ribbonGrassRight, positionLocation, colorLocation)
    drawRibbon(gl, ribbonShoulderLeft, positionLocation, colorLocation)
    drawRibbon(gl, ribbonShoulderRight, positionLocation, colorLocation)
    drawRibbon(gl, ribbonRoad, positionLocation, colorLocation)
    drawRibbon(gl, ribbonRumbleLeft, positionLocation, colorLocation)
    drawRibbon(gl, ribbonRumbleRight, positionLocation, colorLocation)

    for (let i = 0; i < local.length; i += 1) {
      const s = local[i]
      if (s.i > 2 && s.segmentIndex % 5 !== 0) {
        mat4.identity(modelMatrix)
        mat4.translate(modelMatrix, modelMatrix, [s.x, 0.08, s.z])
        mat4.rotateY(modelMatrix, modelMatrix, s.heading)
        drawMesh(laneDashMesh, modelMatrix)
      }
    }

    for (const prop of state.props || []) {
      queueLocalProp(prop, basis)
    }

    gl.useProgram(programInstanced)
    treeTrunkBatch.flush(viewProjectionMatrix)
    treeLeavesBatch.flush(viewProjectionMatrix)
    towerBatch.flush(viewProjectionMatrix)
    signPoleBatch.flush(viewProjectionMatrix)
    signBatch.flush(viewProjectionMatrix)

    gl.useProgram(program)
    drawLocalStopMarker(state.stopMarker, basis, state.nextStopDistance - state.distance)

    const carYaw = (state.renderCarYaw ?? state.carYaw ?? 0) * 0.45
    const carRoll = (state.renderCarRoll ?? state.carRoll ?? 0) * 0.16
    const carPitch = (state.renderPitch ?? state.pitch ?? 0) * 0.04

    mat4.identity(busBaseMatrix)
    mat4.translate(busBaseMatrix, busBaseMatrix, [BUS_X, 0.58, BUS_Z])
    mat4.rotateY(busBaseMatrix, busBaseMatrix, carYaw)
    mat4.rotateZ(busBaseMatrix, busBaseMatrix, carRoll)
    mat4.rotateX(busBaseMatrix, busBaseMatrix, carPitch)

    drawMesh(busBody, busBaseMatrix)

    function drawPart(mesh, offset, scale = [1, 1, 1], rotate = [0, 0, 0]) {
      mat4.copy(partMatrix, busBaseMatrix)
      mat4.translate(partMatrix, partMatrix, offset)
      if (rotate[0]) mat4.rotateX(partMatrix, partMatrix, rotate[0])
      if (rotate[1]) mat4.rotateY(partMatrix, partMatrix, rotate[1])
      if (rotate[2]) mat4.rotateZ(partMatrix, partMatrix, rotate[2])
      mat4.scale(partMatrix, partMatrix, scale)
      drawMesh(mesh, partMatrix)
    }

    drawPart(busUpper, [0, 0.87, 0.1])
    drawPart(busRoof, [0, 1.44, 0.05])
    drawPart(busWindshield, [0, 0.74, -3.78])
    drawPart(busBumper, [0, -0.08, -3.72])

    const wheelY = -0.15
    const wheelSpin = (state.renderDistance ?? state.distance ?? 0) * 0.45
    const steeringValue = state.renderSteeringValue ?? state.steeringValue ?? 0

    for (const side of [-1, 1]) {
      const frontSteer = steeringValue * 0.65
      drawPart(wheel, [side * 1.45, wheelY, -2.4], [1, 1, 1], [wheelSpin, frontSteer, Math.PI / 2])
      for (const dPos of [-0.2, 0.22]) {
        drawPart(wheel, [side * 1.25 + side * dPos, wheelY, 2.2], [1, 1, 1], [wheelSpin, 0, Math.PI / 2])
      }
    }

    const drawErrors = drainGLErrors(gl)
    if (drawErrors.length > 0) {
      reportError(`WebGL draw error: ${drawErrors.join(', ')}`)
    }
  }

  assertNoGLError(gl, 'scene initialization')

  return {
    draw,
    roadWidth: 13.2,
    roadLength: 5.2 * 80
  }
}
