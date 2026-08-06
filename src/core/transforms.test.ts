import { describe, expect, it } from 'vitest'
import { scaleSelectionUniformly } from './transforms'
import { createRect } from './elements'
import type { RectElement } from './types'

const fakeOptions = {
  stroke: '#1e1e1e',
  fill: null,
  strokeWidth: 1,
  brushSize: 1,
  brushShape: 'square' as const,
  radius: 0,
  opacity: 1,
  arrow: false,
  tolerance: 0,
  fontId: 'pv5x7' as const,
  fontScale: 1,
  letterSpacing: 1,
  lineSpacing: 1,
  align: 'left' as const,
  systemFamily: 'monospace',
  systemSize: 12,
  systemThreshold: 128,
  restrictPalette: null,
}

describe('scaleSelectionUniformly', () => {
  it('correctly scales a single rect element 2x in place', () => {
    // A rect at (10, 10) of size 10x10. Center is (15, 15)
    const rect = createRect({ x: 10, y: 10, w: 10, h: 10 }, fakeOptions) as RectElement

    const updates = scaleSelectionUniformly([rect], 2)
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe(rect.id)
    
    const patch = updates[0].patch as Partial<RectElement>
    // Center at (15, 15). New size: 20x20. New x/y should be 15 - 20/2 = 5
    expect(patch.x).toBe(5)
    expect(patch.y).toBe(5)
    expect(patch.w).toBe(20)
    expect(patch.h).toBe(20)
  })

  it('correctly scales multiple elements maintaining relative offset', () => {
    // Two elements:
    // rect1: (0, 0) size 10x10. Bounds: [0, 0] to [10, 10]
    // rect2: (10, 10) size 10x10. Bounds: [10, 10] to [20, 20]
    // Combined bounds: x=0, y=0, w=20, h=20. Center is (10, 10).
    const rect1 = createRect({ x: 0, y: 0, w: 10, h: 10 }, fakeOptions)
    const rect2 = createRect({ x: 10, y: 10, w: 10, h: 10 }, fakeOptions)

    const updates = scaleSelectionUniformly([rect1, rect2], 2)
    expect(updates).toHaveLength(2)

    const patch1 = updates.find(u => u.id === rect1.id)?.patch as Partial<RectElement>
    const patch2 = updates.find(u => u.id === rect2.id)?.patch as Partial<RectElement>

    expect(patch1).toBeDefined()
    expect(patch2).toBeDefined()

    if (patch1 && patch2) {
      // New combined bounds size: 40x40. Center is still (10, 10)
      // New combined bounds: x = 10 - 20 = -10, y = -10
      // rect1 new x/y = -10, new size = 20x20
      expect(patch1.x).toBe(-10)
      expect(patch1.y).toBe(-10)
      expect(patch1.w).toBe(20)
      expect(patch1.h).toBe(20)

      // rect2 new x/y = 10, new size = 20x20
      expect(patch2.x).toBe(10)
      expect(patch2.y).toBe(10)
      expect(patch2.w).toBe(20)
      expect(patch2.h).toBe(20)
    }
  })
})
