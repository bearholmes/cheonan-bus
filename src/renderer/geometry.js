function makeColorTriplet(color) {
  return [color[0], color[1], color[2]]
}

export function createCubeGeometry(width, height, depth, color) {
  const [r, g, b] = makeColorTriplet(color)
  const x = width / 2
  const y = height / 2
  const z = depth / 2

  const vertices = new Float32Array([
    -x, -y, z, r, g, b, x, -y, z, r, g, b, x, y, z, r, g, b, -x, y, z, r, g, b,
    x, -y, -z, r, g, b, -x, -y, -z, r, g, b, -x, y, -z, r, g, b, x, y, -z, r, g, b,
    x, -y, z, r, g, b, x, -y, -z, r, g, b, x, y, -z, r, g, b, x, y, z, r, g, b,
    -x, -y, -z, r, g, b, -x, -y, z, r, g, b, -x, y, z, r, g, b, -x, y, -z, r, g, b,
    -x, y, z, r, g, b, x, y, z, r, g, b, x, y, -z, r, g, b, -x, y, -z, r, g, b,
    -x, -y, -z, r, g, b, x, -y, -z, r, g, b, x, -y, z, r, g, b, -x, -y, z, r, g, b
  ])

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23
  ])

  return { vertices, indices }
}

export function createPlaneGeometry(width, depth, y, color) {
  const [r, g, b] = makeColorTriplet(color)
  const x = width / 2
  const z = depth / 2
  const vertices = new Float32Array([
    -x, y, -z, r, g, b,
    x, y, -z, r, g, b,
    x, y, z, r, g, b,
    -x, y, z, r, g, b
  ])
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3])
  return { vertices, indices }
}
