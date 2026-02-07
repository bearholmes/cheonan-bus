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
