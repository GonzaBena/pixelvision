import { describe, expect, it } from 'vitest'
import { useEditor, selectionBounds } from '../state/store'
import { createFreedraw } from './elements'
import { expandBuffer, bufferBounds, cropBuffer, setPixel } from './pixels'

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
})
