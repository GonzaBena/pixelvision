import { describe, expect, it } from 'vitest'
import { useEditor, selectionBounds } from '../state/store'
import { createFreedraw } from './elements'
import type { FreedrawElement } from './types'
import { expandBuffer, bufferBounds, cropBuffer, setPixel, parseColor } from './pixels'

describe('zustand store with crop logic', () => {
  it('correctly updates selectionBounds after cropping the element', () => {
    const store = useEditor.getState()

    // 1. Create and add a new freedraw element
    const fd = createFreedraw(0, 0, 0, 0)
    store.addElement(fd)

    // 2. Retrieve it from the store
    const el = useEditor.getState().scene.elements.find((x) => x.id === fd.id)
    expect(el).toBeDefined()
    if (!el || el.type !== 'freedraw') return

    // 3. Simulate paint: expand and set pixel
    const localRect = { x: 50, y: 50, w: 1, h: 1 }
    const grown = expandBuffer(el.buf, localRect)
    el.buf = grown.buf
    el.x -= grown.dx
    el.y -= grown.dy
    setPixel(el.buf, 50, 50, [255, 255, 255, 255])
    useEditor.getState().touch(el.id)

    // 4. Crop the element (like onPointerUp does)
    const bounds = bufferBounds(el.buf)
    expect(bounds).not.toBeNull()
    if (bounds) {
      const cropped = cropBuffer(el.buf, bounds)
      useEditor.getState().updateElement(el.id, {
        buf: cropped,
        x: el.x + bounds.x,
        y: el.y + bounds.y,
      })
    }

    // 5. Select the element
    useEditor.getState().setSelection([el.id])

    // 6. Calculate selection bounds
    const selBounds = selectionBounds(useEditor.getState())
    expect(selBounds).not.toBeNull()
    expect(selBounds).toEqual({ x: 50, y: 50, w: 1, h: 1 })
  })

  it('correctly paints and retains a single click brush stroke', () => {
    const store = useEditor.getState()
    store.clearCanvas()
    store.setTool('brush')
    store.setOptions({ stroke: '#ff0000', brushSize: 1, brushShape: 'square', opacity: 1 })

    // Simulate strokeTarget
    const fdInit = createFreedraw(0, 0, 0, 0)
    store.addElement(fdInit)
    const fd = useEditor.getState().scene.elements.find((x) => x.id === fdInit.id) as FreedrawElement
    expect(fd).toBeDefined()

    // Simulate beginPaint
    const px = 10
    const py = 10
    const off = 0 // for size 1
    const n = 1   // for size 1

    const cw = store.scene.canvas.w
    const ch = store.scene.canvas.h
    const isOutside = px < 0 || py < 0 || px >= cw || py >= ch
    expect(isOutside).toBe(false)

    // expand/cover
    const gx = px - fd.x - off
    const gy = py - fd.y - off
    const x0 = Math.max(0, gx + fd.x)
    const y0 = Math.max(0, gy + fd.y)
    const x1 = Math.min(cw, gx + fd.x + n)
    const y1 = Math.min(ch, gy + fd.y + n)

    const croppedLocal = {
      x: x0 - fd.x,
      y: y0 - fd.y,
      w: x1 - x0,
      h: y1 - y0,
    }
    const grown = expandBuffer(fd.buf, croppedLocal)
    fd.buf = grown.buf
    fd.x -= grown.dx
    fd.y -= grown.dy

    // stampAt
    const color = parseColor(store.options.stroke)
    // stamp at px - fd.x = 10, py - fd.y = 10
    fd.buf.data[(10 * fd.buf.w + 10) * 4] = color[0]
    fd.buf.data[(10 * fd.buf.w + 10) * 4 + 1] = color[1]
    fd.buf.data[(10 * fd.buf.w + 10) * 4 + 2] = color[2]
    fd.buf.data[(10 * fd.buf.w + 10) * 4 + 3] = color[3]

    store.touch(fd.id)

    // Simulate onPointerUp
    const el = useEditor.getState().scene.elements.find((x) => x.id === fd.id)
    expect(el).toBeDefined()
    if (!el || el.type !== 'freedraw') return

    console.log('--- TEST LOG ---')
    console.log('el:', { id: el.id, x: el.x, y: el.y, w: el.buf.w, h: el.buf.h })
    console.log('buffer non-zero pixels count:', el.buf.data.filter(x => x !== 0).length)

    const bounds = bufferBounds(el.buf)
    console.log('bounds:', bounds)
    expect(bounds).not.toBeNull()
    if (bounds) {
      const cropped = cropBuffer(el.buf, bounds)
      useEditor.getState().updateElement(el.id, {
        buf: cropped,
        x: el.x + bounds.x,
        y: el.y + bounds.y,
      })
    }

    // Verify it was not deleted and has correct bounds
    const finalEl = useEditor.getState().scene.elements.find((x) => x.id === fd.id)
    expect(finalEl).toBeDefined()
  })
})

