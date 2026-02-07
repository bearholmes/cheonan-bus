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

export function createCylinderGeometry(radiusTop, radiusBottom, height, radialSegments, color) {
  const [r, g, b] = makeColorTriplet(color)
  const vertices = []
  const indices = []
  const halfHeight = height / 2

  // Side
  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2
    const sinTheta = Math.sin(theta)
    const cosTheta = Math.cos(theta)

    // Vertex
    vertices.push(
      radiusTop * cosTheta, halfHeight, radiusTop * sinTheta, r, g, b,
      radiusBottom * cosTheta, -halfHeight, radiusBottom * sinTheta, r, g, b
    )
  }

  const stride = 2 // 2 vertices per segment step
  for (let i = 0; i < radialSegments; i++) {
    const p1 = i * stride
    const p2 = p1 + 1
    const p3 = (i + 1) * stride
    const p4 = p3 + 1
    indices.push(p1, p3, p2, p2, p3, p4)
  }

  // Caps (simplified, just a center point fan would be better but for low poly flat shading is tricky without duplicating verts)
  // For this style, we often don't see caps of trees/poles. 
  // Let's rely on side for now or add simple caps if needed.
  // Adding caps:
  const baseIndex = (radialSegments + 1) * 2

  // Top Cap
  if (radiusTop > 0) {
    vertices.push(0, halfHeight, 0, r, g, b) // Top Center
    const topCenterIndex = vertices.length / 6 - 1
    for (let i = 0; i <= radialSegments; i++) {
      const theta = (i / radialSegments) * Math.PI * 2
      vertices.push(radiusTop * Math.cos(theta), halfHeight, radiusTop * Math.sin(theta), r, g, b)
    }
    for (let i = 0; i < radialSegments; i++) {
      indices.push(topCenterIndex, topCenterIndex + i + 1, topCenterIndex + i + 2)
    }
  }

  // Bottom Cap
  if (radiusBottom > 0) {
    vertices.push(0, -halfHeight, 0, r, g, b) // Bottom Center
    const botCenterIndex = vertices.length / 6 - 1
    for (let i = 0; i <= radialSegments; i++) {
      const theta = (i / radialSegments) * Math.PI * 2
      vertices.push(radiusBottom * Math.cos(theta), -halfHeight, radiusBottom * Math.sin(theta), r, g, b)
    }
    for (let i = 0; i < radialSegments; i++) {
      indices.push(botCenterIndex, botCenterIndex + i + 2, botCenterIndex + i + 1)
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices)
  }
}

export function createConeGeometry(radius, height, radialSegments, color) {
  return createCylinderGeometry(0, radius, height, radialSegments, color)
}

