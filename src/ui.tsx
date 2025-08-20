import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { render, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'

// icons
import UploadSvg from './icons/Upload.svg'
import ChevronSvg from './icons/ExpandChevronDownArrow.svg'
import CheckSvg from './icons/CheckboxChecked.svg'
import EmptySvg from './icons/CheckboxEmpty.svg'
import IndeterminateSvg from './icons/CheckboxIndeterminate.svg'
import ResizeSvg from './icons/Resize.svg'

type CsvRow = Record<string, string>

/* ---------------- CSV utils ---------------- */
function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean)
  const splitLine = (line: string) => {
    const out: string[] = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++ } else { q = !q }
      } else if (ch === ',' && !q) { out.push(cur); cur = '' }
      else { cur += ch }
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  const headers = lines.length ? splitLine(lines[0]) : []
  const rows = lines.slice(1).map((line) => {
    const v = splitLine(line)
    const r: CsvRow = {}
    headers.forEach((h, i) => (r[h] = v[i] ?? ''))
    return r
  })
  return { headers, rows }
}

/* --------- SVG dashed border that follows rounded corners --------- */
function DashedBorder({
  width,
  height,
  radius = 12,
  dash = 5,
  gap = 5
}: {
  width: number
  height: number
  radius?: number
  dash?: number
  gap?: number
}) {
  if (width <= 0 || height <= 0) return null
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <rect
        x="0.5"
        y="0.5"
        width={w - 1}
        height={h - 1}
        rx={radius}
        ry={radius}
        fill="none"
        stroke="#000"
        stroke-width="1"
        stroke-dasharray={`${dash} ${gap}`}
      />
    </svg>
  )
}

/* ---------------- Helpers ---------------- */
function prettyHeaderLabel(header: string) {
  return header.replace(/\s*\[[^\]]+\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

/* --------------- MultiSelect --------------- */
type MultiSelectProps = {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

function MultiSelect({ options, selected, onChange, disabled }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const allSelected = options.length > 0 && selected.length === options.length
  const noneSelected = selected.length === 0
  const someSelected = !allSelected && !noneSelected
  const label = allSelected ? 'All' : `${selected.length} selected`

  function measureAndOpen() {
    const r = anchorRef.current?.getBoundingClientRect()
    if (!r) return
    const pad = 8
    const width = Math.round(r.width)
    const left = Math.min(Math.max(pad, r.left), Math.max(pad, window.innerWidth - width - pad))
    const top = r.bottom + 6
    setMenuRect({ top, left, width })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return

    // Bubble-phase outside click
    const onOutsidePointerDown = (e: PointerEvent) => {
      const path = (e.composedPath?.() || []) as Node[]
      const inMenu = menuRef.current ? path.includes(menuRef.current) : false
      const inAnchor = anchorRef.current ? path.includes(anchorRef.current) : false
      if (!inMenu && !inAnchor) setOpen(false)
    }
    const onResize = () => measureAndOpen()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }

    window.addEventListener('pointerdown', onOutsidePointerDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onOutsidePointerDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleAll = () => onChange(allSelected ? [] : options.slice())
  const toggleOne = (opt: string) => {
    const s = new Set(selected)
    s.has(opt) ? s.delete(opt) : s.add(opt)
    onChange(Array.from(s))
    // keep open
  }

  const maxHeight = Math.max(160, window.innerHeight - ((menuRect?.top ?? 0) + 12))

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 12, color: '#7C7C7C', marginBottom: 6 }}>Columns</div>

      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : measureAndOpen())}
        style={{
          width: '100%',
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderRadius: 8,
          border: '1px solid #D0D0D0',
          background: '#FFFFFF',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 12
        }}
      >
        <span style={{ color: '#111' }}>{label || 'All'}</span>
        <img src={ChevronSvg} width={16} height={16} alt="" style={{ opacity: 0.8 }} />
      </button>

      {open && menuRect && (
        <div
          ref={menuRef}
          // ensure internal clicks never bubble to outside listener
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: menuRect.top,
            left: menuRect.left,
            width: menuRect.width, // match input width
            maxHeight,
            background: '#FFFFFF',
            border: '1px solid #D0D0D0',
            borderRadius: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            overflowY: 'auto',
            zIndex: 9999
          }}
        >
          {/* Select All */}
          <div
            onClick={toggleAll}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              color: '#111'
            }}
          >
            <img
              src={allSelected ? CheckSvg : someSelected ? IndeterminateSvg : EmptySvg}
              width={20}
              height={20}
              alt=""
            />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Select All</span>
          </div>

          <div style={{ height: 1, background: '#E5E5E5' }} />

          {/* Options */}
          <div style={{ padding: '6px 0' }}>
            {options.map((opt) => {
              const checked = selected.includes(opt)
              const display = prettyHeaderLabel(opt)
              return (
                <div
                  key={opt}
                  onClick={() => toggleOne(opt)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#111'
                  }}
                  title={opt}
                >
                  <img src={checked ? CheckSvg : EmptySvg} width={20} height={20} alt="" />
                  <span style={{ fontSize: 12 }}>{display}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Main UI ----------------- */
function Plugin() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [selectedHeaders, setSelectedHeaders] = useState<string[]>([])
  const [hoverPick, setHoverPick] = useState(false)

  // Fit window height to content (initial + when content changes)
  const lastSent = useRef<{ w: number; h: number } | null>(null)
  const sendResize = (w: number, h: number) => {
    const W = Math.max(360, Math.round(w))
    const H = Math.max(290, Math.round(h))
    const prev = lastSent.current
    if (!prev || prev.w !== W || prev.h !== H) {
      lastSent.current = { w: W, h: H }
      emit('RESIZE', { width: W, height: H })
    }
  }
  const resizeToFit = () => {
    const h = Math.ceil(document.documentElement.scrollHeight) + 1
    sendResize(window.innerWidth, Math.max(290, h))
  }
  useEffect(() => { requestAnimationFrame(resizeToFit) }, [])
  useEffect(() => { resizeToFit() }, [fileName, headers.length])

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setCsvText(text)
      const { headers: h, rows: r } = parseCsv(text)
      setHeaders(h)
      setRows(r)
      setSelectedHeaders(h.slice())
    }
    reader.readAsText(file)
  }
  function onInputChange(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files && input.files[0]) handleFile(input.files[0])
  }

  // Drop zone & measured size for SVG border
  const dropRef = useRef<HTMLDivElement>(null)
  const [dropSize, setDropSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const RO = (window as any).ResizeObserver
    if (RO) {
      const ro = new RO((entries: any) => {
        const cr = entries[0].contentRect
        setDropSize({ w: Math.round(cr.width), h: Math.round(cr.height) })
      })
      ro.observe(el)
      setDropSize({ w: el.clientWidth, h: el.clientHeight })
      return () => ro.disconnect()
    } else {
      // fallback
      const onWinResize = () => setDropSize({ w: el.clientWidth, h: el.clientHeight })
      window.addEventListener('resize', onWinResize)
      onWinResize()
      return () => window.removeEventListener('resize', onWinResize)
    }
  }, [])

  // drag & drop
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation() }
    const onDrop = (e: DragEvent) => {
      prevent(e)
      const f = e.dataTransfer?.files?.[0]
      if (f) handleFile(f)
    }
    el.addEventListener('dragenter', prevent)
    el.addEventListener('dragover', prevent)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', prevent)
      el.removeEventListener('dragover', prevent)
      el.removeEventListener('drop', onDrop)
    }
  }, [])

  function onGenerate() {
    if (!csvText.trim() || selectedHeaders.length === 0) return
    const filteredRows = rows.map((r) => {
      const o: CsvRow = {}
      selectedHeaders.forEach((h) => (o[h] = r[h] ?? ''))
      return o
    })
    emit('CSV_PARSED', { headers: selectedHeaders, rows: filteredRows })
  }

  // bottom-right resize handle (pointer-captured, throttled)
  const handleRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el = handleRef.current
    if (!el) return

    let rafId: number | null = null
    let nextW = 0, nextH = 0
    let resizing = false

    const schedule = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        sendResize(nextW, nextH)
        rafId = null
      })
    }

    const onPointerMove = (e: PointerEvent, sx: number, sy: number, sw: number, sh: number) => {
      nextW = Math.max(360, Math.round(sw + (e.clientX - sx)))
      nextH = Math.max(290, Math.round(sh + (e.clientY - sy)))
      schedule()
    }

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      resizing = true
      const sx = e.clientX
      const sy = e.clientY
      const sw = window.innerWidth
      const sh = window.innerHeight

      const move = (ev: PointerEvent) => { if (resizing) onPointerMove(ev, sx, sy, sw, sh) }
      const up = (ev: PointerEvent) => {
        resizing = false
        try { el.releasePointerCapture(ev.pointerId) } catch {}
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        window.removeEventListener('blur', blurStop)
      }
      const blurStop = () => up(e)

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      window.addEventListener('blur', blurStop)
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('dragstart', (e) => e.preventDefault())
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  const helperText = useMemo(
    () => (fileName ? fileName : 'Select a file or drag and drop here.'),
    [fileName]
  )

  return (
    <div style={{ padding: 16, fontSize: 12, position: 'relative', minHeight: 290 }}>
      {/* Drop Zone */}
      <div
        ref={dropRef}
        style={{
          position: 'relative',
          borderRadius: 12,
          height: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 10,
          color: '#666',
          background: '#FFFFFF'
        }}
      >
        <DashedBorder width={dropSize.w} height={dropSize.h} radius={12} dash={5} gap={5} />

        <div style={{ width: 48, height: 48, display: 'grid', placeItems: 'center' }}>
          <img src={UploadSvg} width={48} height={48} alt="" style={{ display: 'block' }} draggable={false} />
        </div>

        <div style={{ textAlign: 'center', lineHeight: 1.4, color: '#111' }}>{helperText}</div>

        <label>
          <input type="file" accept=".csv,text/csv" onChange={onInputChange} style={{ display: 'none' }} />
          <span
            onMouseEnter={() => setHoverPick(true)}
            onMouseLeave={() => setHoverPick(false)}
            style={{
              display: 'flex',
              height: 26,
              padding: '4px 7px',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              borderRadius: 8,
              background: hoverPick ? 'rgba(24,29,31,0.15)' : 'rgba(24,29,31,0.06)',
              cursor: 'pointer',
              color: '#000',
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              fontStyle: 'normal',
              fontWeight: 500,
              lineHeight: '18px',
              letterSpacing: '0.46px'
            }}
          >
            Select File
          </span>
        </label>
      </div>

      <VerticalSpace space="small" />

      <MultiSelect
        options={headers}
        selected={selectedHeaders}
        onChange={setSelectedHeaders}
        disabled={headers.length === 0}
      />

      <VerticalSpace space="small" />

      {/* Generate button with hover overlay */}
      <button
        onClick={onGenerate}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = 'inset 0 0 0 9999px rgba(255,255,255,0.06)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = 'none')}
        style={{
          display: 'flex',
          height: 32,
          padding: '6px 12px',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'stretch',
          width: '100%',
          borderRadius: '8px',
          background: '#242B2E',
          border: 'none',
          outline: 'none',
          cursor: 'pointer',
          color: '#FFF',
          fontFamily: 'Inter, sans-serif',
          fontSize: 14,
          fontStyle: 'normal',
          fontWeight: 300,
          lineHeight: '20px',
          letterSpacing: '0.4px'
        }}
      >
        Generate Table
      </button>

      {/* Bottom-right resize handle */}
      <button
        ref={handleRef}
        id="resize-corner-handle"
        title="Resize"
        style={{
          position: 'fixed',
          right: 6,
          bottom: 6,
          width: 16,
          height: 16,
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'nwse-resize',
          display: 'grid',
          placeItems: 'center'
        }}
      >
        <img src={ResizeSvg} width={14} height={14} alt="" draggable={false} />
      </button>
    </div>
  )
}

export default render(Plugin)
