export function createMesh(gl, geometry) {
  const vertexBuffer = gl.createBuffer()
  const indexBuffer = gl.createBuffer()
  if (!vertexBuffer || !indexBuffer) {
    throw new Error('Unable to allocate mesh buffers.')
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW)

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW)

  return {
    vertexBuffer,
    indexBuffer,
    indexCount: geometry.indices.length
  }
}

export function bindMesh(gl, mesh, positionLocation, colorLocation) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 24, 0)
  gl.enableVertexAttribArray(colorLocation)
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 24, 12)
}
export function createInstancedMesh(gl, geometry) {
  const mesh = createMesh(gl, geometry)
  return {
    ...mesh,
    instanceBuffers: {}
  }
}

export function createInstanceBuffer(gl, data, numComponents) {
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
  return {
    buffer,
    numComponents,
    count: data.length / numComponents
  }
}

export function bindInstancedMesh(gl, ext, mesh, positionLocation, colorLocation, instanceAttributes) {
  // Bind standard geometry
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer)

  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 24, 0)
  if (ext) ext.vertexAttribDivisorANGLE(positionLocation, 0)

  gl.enableVertexAttribArray(colorLocation)
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 24, 12)
  if (ext) ext.vertexAttribDivisorANGLE(colorLocation, 0)

  // Bind instance attributes (e.g., matrix columns)
  for (const attr of instanceAttributes) {
    gl.bindBuffer(gl.ARRAY_BUFFER, attr.buffer.buffer)
    for (let i = 0; i < attr.numComponents / 4; i++) {
      // Assuming Mat4 or Vec4s. If float, stride needs adjustment.
      // For this specific use case (Matrix4), we bind 4 vec4s.
      const loc = attr.location + i
      gl.enableVertexAttribArray(loc)
      const stride = attr.numComponents * 4 // 4 bytes per float
      const offset = i * 16 // 4 floats * 4 bytes
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, offset)
      if (ext) ext.vertexAttribDivisorANGLE(loc, 1)
    }
  }
}
