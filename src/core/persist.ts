import type { PixelBuffer, PVElement, Scene, ImageElement } from './types'
import { clearImageSources, putImageSource, usedImageSources } from './image/imageStore'

/** Ids de las imágenes que la escena realmente usa. */
function sceneImageIds(scene: Scene): string[] {
  return scene.elements.filter((e) => e.type === 'image').map((e) => e.srcId)
}

const DB_NAME = 'pixelvision'
const STORE = 'state'
const KEY = 'autosave'
const DB_VERSION = 1

export interface SavedState {
  scene: Scene
  images: Array<[string, PixelBuffer]>
}

// ---------------------------------------------------------------------------
// Autoguardado en IndexedDB
//
// localStorage no sirve acá: los búferes ráster de un lienzo mediano superan
// enseguida su límite de ~5 MB. IndexedDB además guarda los Uint8ClampedArray
// tal cual con structured clone, sin tener que serializarlos a texto.
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveAutosave(scene: Scene): Promise<void> {
  const db = await openDB()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const payload: SavedState = {
        scene: stripRuntime(scene),
        images: usedImageSources(sceneImageIds(scene)),
      }
      tx.objectStore(STORE).put(payload, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function loadAutosave(): Promise<Scene | null> {
  let db: IDBDatabase
  try {
    db = await openDB()
  } catch {
    return null
  }
  try {
    const saved = await new Promise<SavedState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result as SavedState | undefined)
      req.onerror = () => reject(req.error)
    })
    if (!saved?.scene) return null
    clearImageSources()
    for (const [id, buf] of saved.images ?? []) putImageSource(id, reviveBuffer(buf))
    return reviveScene(saved.scene)
  } catch {
    return null
  } finally {
    db.close()
  }
}

export async function clearAutosave(): Promise<void> {
  const db = await openDB()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Quita el estado que sólo vive en memoria antes de persistir. */
function stripRuntime(scene: Scene): Scene {
  return { canvas: { ...scene.canvas }, elements: scene.elements.map((e) => ({ ...e })) }
}

function reviveBuffer(b: PixelBuffer): PixelBuffer {
  return { w: b.w, h: b.h, data: new Uint8ClampedArray(b.data) }
}

function reviveScene(scene: Scene): Scene {
  return {
    canvas: { ...scene.canvas },
    elements: scene.elements.map((el) =>
      el.type === 'freedraw' ? { ...el, buf: reviveBuffer(el.buf) } : { ...el },
    ),
  }
}

// ---------------------------------------------------------------------------
// Proyecto en JSON (.pixelvision.json)
// ---------------------------------------------------------------------------

const FORMAT = 'pixelvision-project'
const FORMAT_VERSION = 1

interface SerializedBuffer {
  w: number
  h: number
  b64: string
}

interface ProjectFile {
  format: string
  version: number
  scene: {
    canvas: Scene['canvas']
    elements: Array<Record<string, unknown>>
  }
  images: Array<[string, SerializedBuffer]>
}

function bytesToBase64(bytes: Uint8ClampedArray): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8ClampedArray<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8ClampedArray(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function serializeBuffer(b: PixelBuffer): SerializedBuffer {
  return { w: b.w, h: b.h, b64: bytesToBase64(b.data) }
}

function deserializeBuffer(s: SerializedBuffer): PixelBuffer {
  return { w: s.w, h: s.h, data: base64ToBytes(s.b64) }
}

export function serializeProject(scene: Scene): string {
  const file: ProjectFile = {
    format: FORMAT,
    version: FORMAT_VERSION,
    scene: {
      canvas: { ...scene.canvas },
      elements: scene.elements.map((el) =>
        el.type === 'freedraw'
          ? { ...el, buf: serializeBuffer(el.buf) }
          : ({ ...el } as Record<string, unknown>),
      ),
    },
    images: usedImageSources(sceneImageIds(scene)).map(([id, buf]) => [id, serializeBuffer(buf)]),
  }
  return JSON.stringify(file)
}

export function deserializeProject(json: string): Scene {
  const file = JSON.parse(json) as ProjectFile
  if (file.format !== FORMAT) throw new Error('El archivo no es un proyecto de PixelVision')

  clearImageSources()
  for (const [id, buf] of file.images ?? []) putImageSource(id, deserializeBuffer(buf))

  const elements = file.scene.elements.map((raw) => {
    const el = { ...raw } as unknown as PVElement
    if (el.type === 'freedraw') {
      el.buf = deserializeBuffer(raw.buf as unknown as SerializedBuffer)
    }
    return el
  })
  return { canvas: { ...file.scene.canvas }, elements }
}

export interface SerializedElements {
  format: 'pixelvision-elements'
  version: number
  elements: Array<Record<string, unknown>>
  images: Array<[string, SerializedBuffer]>
}

export function serializeSelection(elements: PVElement[]): string {
  const imageIds = elements.filter((e) => e.type === 'image').map((e) => (e as ImageElement).srcId)
  const payload: SerializedElements = {
    format: 'pixelvision-elements',
    version: FORMAT_VERSION,
    elements: elements.map((el) =>
      el.type === 'freedraw'
        ? { ...el, buf: serializeBuffer(el.buf) }
        : ({ ...el } as Record<string, unknown>),
    ),
    images: usedImageSources(imageIds).map(([id, buf]) => [id, serializeBuffer(buf)]),
  }
  return JSON.stringify(payload)
}

export function deserializeSelection(json: string): { elements: PVElement[] } {
  const payload = JSON.parse(json) as SerializedElements
  if (payload.format !== 'pixelvision-elements') throw new Error('No es un portapapeles de PixelVision')

  for (const [id, buf] of payload.images ?? []) {
    putImageSource(id, deserializeBuffer(buf))
  }

  const elements = payload.elements.map((raw) => {
    const el = { ...raw } as unknown as PVElement
    if (el.type === 'freedraw') {
      el.buf = deserializeBuffer(raw.buf as unknown as SerializedBuffer)
    }
    return el
  })

  return { elements }
}

