import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { render, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'

// icons
import ChevronSvg from './icons/ExpandChevronDownArrow.svg'
import CheckSvg from './icons/CheckboxChecked.svg'
import EmptySvg from './icons/CheckboxEmpty.svg'
import IndeterminateSvg from './icons/CheckboxIndeterminate.svg'
import ResizeSvg from './icons/Resize.svg'

// presets
import { BUILTIN_CSVS, type CsvPreset } from './csvs'

/* ---------------- types ---------------- */
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
        if (q && line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          q = !q
        }
      } else if (ch === ',' && !q) {
        out.push(cur)
        cur = ''
      } else {
        cur += ch
      }
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

/* ---------------- helpers ---------------- */
function prettyHeaderLabel(header: string) {
  // remove any [metadata] segments for UI display only
  return header.replace(/\s*\[[^\]]+\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

/* =========================
   Reusable anchored menu
   ========================= */
function useAnchoredMenu(open: boolean) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const setOpenRef = useRef<null | ((v: boolean) => void)>(null)

  const measureAndOpen = () => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (!r) return
    const pad = 8
    const width = Math.round(r.width)
    const left = Math.min(Math.max(pad, r.left), Math.max(pad, window.innerWidth - width - pad))
    const top = r.bottom + 6
    setMenuRect({ top, left, width })
  }

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      const insideMenu = !!menuRef.current && menuRef.current.contains(t)
      const insideAnchor = !!anchorRef.current && anchorRef.current.contains(t)
      if (!insideMenu && !insideAnchor) setOpenRef.current?.(false)
    }
    const onResize = () => measureAndOpen()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenRef.current?.(false)

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { anchorRef, menuRef, menuRect, measureAndOpen, setOpenRef }
}

/* =========================
   Source CSV Select (custom)
   ========================= */
type SourceSelectProps = {
  builtins: CsvPreset[]
  currentLabel: string | null
  onPickBuiltin: (b: CsvPreset) => void
  onPickCustomFile: (f: File) => void
}

function SourceSelect({ builtins, currentLabel, onPickBuiltin, onPickCustomFile }: SourceSelectProps) {
  const [open, setOpen] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [hoveredUpload, setHoveredUpload] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { anchorRef, menuRef, menuRect, measureAndOpen, setOpenRef } = useAnchoredMenu(open)
  setOpenRef.current = setOpen

  const maxHeight = Math.max(160, window.innerHeight - ((menuRect?.top ?? 0) + 12))

  function triggerCustomUpload() {
    fileInputRef.current?.click()
  }
  function onCustomFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    if (f) onPickCustomFile(f)
    if (input) input.value = ''
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 12, color: '#7C7C7C', marginBottom: 6 }}>Source CSV</div>

      <button
        ref={anchorRef}
        type="button"
        onClick={() => (open ? setOpen(false) : (measureAndOpen(), setOpen(true)))}
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
          cursor: 'pointer',
          fontSize: 12
        }}
      >
        <span style={{ color: '#111' }}>{currentLabel || 'Choose a source'}</span>
        <img src={ChevronSvg} width={16} height={16} alt="" style={{ opacity: 0.8 }} />
      </button>

      {/* hidden input for "Upload custom…" */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onCustomFileChange}
        style={{ display: 'none' }}
      />

      {open && menuRect && (
        <div
          ref={menuRef}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: menuRect.top,
            left: menuRect.left,
            width: menuRect.width,
            maxHeight,
            background: '#FFFFFF',
            border: '1px solid #D0D0D0',
            borderRadius: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            overflowY: 'auto',
            zIndex: 9999
          }}
        >
          <div style={{ padding: '6px 0' }}>
            {builtins.map((item, i) => (
              <div
                key={item.id}
                onClick={() => (onPickBuiltin(item), setOpen(false))}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: '#111',
                  background: hoveredIndex === i ? 'rgba(0,0,0,0.10)' : 'transparent',
                  transition: 'background 120ms ease'
                }}
                title={item.filename}
              >
                <span style={{ fontSize: 12 }}>{item.label}</span>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: '#E5E5E5' }} />

          <div
            onClick={triggerCustomUpload}
            onMouseEnter={() => setHoveredUpload(true)}
            onMouseLeave={() => setHoveredUpload(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              color: '#111',
              background: hoveredUpload ? 'rgba(0,0,0,0.10)' : 'transparent',
              transition: 'background 120ms ease'
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>Upload custom…</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================
   Columns MultiSelect (custom)
   ========================= */
type MultiSelectProps = {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

function MultiSelect({ options, selected, onChange, disabled }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const allSelected = options.length > 0 && selected.length === options.length
  const noneSelected = selected.length === 0
  const someSelected = !allSelected && !noneSelected
  const label = allSelected ? 'All' : `${selected.length} selected`

  const { anchorRef, menuRef, menuRect, measureAndOpen, setOpenRef } = useAnchoredMenu(open)
  setOpenRef.current = setOpen

  const toggleAll = () => onChange(allSelected ? [] : options.slice())
  const toggleOne = (opt: string) => {
    const s = new Set(selected)
    s.has(opt) ? s.delete(opt) : s.add(opt)
    onChange(Array.from(s))
  }

  const maxHeight = Math.max(160, window.innerHeight - ((menuRect?.top ?? 0) + 12))

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 12, color: '#7C7C7C', marginBottom: 6 }}>Columns</div>

      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => (disabled ? null : open ? setOpen(false) : (measureAndOpen(), setOpen(true)))}
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
          onPointerDown={(e) => e.stopPropagation()}
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
            onMouseEnter={() => setHoveredIndex(-1)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              color: '#111',
              background: hoveredIndex === -1 ? 'rgba(0,0,0,0.10)' : 'transparent',
              transition: 'background 120ms ease'
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
            {options.map((opt, i) => {
              const checked = selected.includes(opt)
              const display = prettyHeaderLabel(opt)
              return (
                <div
                  key={opt}
                  onClick={() => toggleOne(opt)}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#111',
                    background: hoveredIndex === i ? 'rgba(0,0,0,0.10)' : 'transparent',
                    transition: 'background 120ms ease'
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

/* =========================
   Main UI
   ========================= */
function Plugin() {
  const [fileLabel, setFileLabel] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [selectedHeaders, setSelectedHeaders] = useState<string[]>([])
  const ready = headers.length > 0

  // Fit window height to content
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
  useEffect(() => {
    requestAnimationFrame(resizeToFit)
  }, [])
  useEffect(() => {
    resizeToFit()
  }, [fileLabel, headers.length])

  // Source handlers
  function loadFromText(label: string, text: string) {
    setFileLabel(label)
    setCsvText(text)
    const { headers: h, rows: r } = parseCsv(text)
    setHeaders(h)
    setRows(r)
    setSelectedHeaders(h.slice())
  }

  function onPickBuiltin(b: CsvPreset) {
    loadFromText(b.label, b.contents)
  }

  function onPickCustomFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      loadFromText(file.name, text)
    }
    reader.readAsText(file)
  }

  // Generate
  function onGenerate() {
    if (!csvText.trim() || selectedHeaders.length === 0) return
    const filteredRows = rows.map((r) => {
      const o: CsvRow = {}
      selectedHeaders.forEach((h) => (o[h] = r[h] ?? ''))
      return o
    })
    emit('CSV_PARSED', { headers: selectedHeaders, rows: filteredRows })
  }

  // Resize handle
  const handleRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el = handleRef.current
    if (!el) return

    let rafId: number | null = null
    let nextW = 0,
      nextH = 0
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

      const move = (ev: PointerEvent) => {
        if (!resizing) return
        onPointerMove(ev, sx, sy, sw, sh)
      }
      const up = (ev: PointerEvent) => {
        resizing = false
        try {
          el.releasePointerCapture(ev.pointerId)
        } catch {}
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

  return (
    <div style={{ padding: 16, fontSize: 12, position: 'relative', minHeight: 290 }}>
      {/* Source CSV */}
      <SourceSelect
        builtins={BUILTIN_CSVS}
        currentLabel={fileLabel}
        onPickBuiltin={onPickBuiltin}
        onPickCustomFile={onPickCustomFile}
      />

      <VerticalSpace space="small" />

      {/* Columns */}
      <MultiSelect options={headers} selected={selectedHeaders} onChange={setSelectedHeaders} disabled={!headers.length} />

      <VerticalSpace space="small" />

      {/* Generate button with hover overlay */}
      <button
        onClick={onGenerate}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.boxShadow = 'inset 0 0 0 9999px rgba(255,255,255,0.06)')
        }
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
