// src/ui.tsx
import { useEffect, useRef, useState } from 'preact/hooks'
import { Divider, render, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'

// presets
import { BUILTIN_CSVS } from './csvs'
export type CsvPreset = { id: string; label: string; filename: string; contents: string }

// icons
import ChevronSvg from './icons/ExpandChevronDownArrow.svg'
import CheckSvg from './icons/CheckboxChecked.svg'
import EmptySvg from './icons/CheckboxEmpty.svg'
import IndeterminateSvg from './icons/CheckboxIndeterminate.svg'
import ResizeSvg from './icons/Resize.svg'
import SortAscSvg from './icons/SortAscendingArrow.svg'
import SortDescSvg from './icons/SortDescendingArrow.svg'

type CsvRow = Record<string, string>
type SortDir = 'asc' | 'desc' | null
type SortState = { by: string | null; dir: SortDir }

/* ---------------- CSV utils ---------------- */
function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

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

  const headers = splitLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const v = splitLine(line)
    const r: CsvRow = {}
    headers.forEach((h, i) => (r[h] = v[i] ?? ''))
    return r
  })
  return { headers, rows }
}

/* ---------------- Helpers ---------------- */

function prettyHeaderLabel(header: string) {
  return header.replace(/\s*\[[^\]]+\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

/* --------------- SourceSelect (presets + custom upload) --------------- */
type SourceSelectProps = {
  builtins: CsvPreset[]
  current: { kind: 'builtin'; id: string } | { kind: 'custom'; filename: string } | null
  onBuiltinPick: (preset: CsvPreset) => void
  onCustomPick: (file: File) => void
}

function SourceSelect({ builtins, current, onBuiltinPick, onCustomPick }: SourceSelectProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const label =
    current == null
      ? 'Select a source'
      : current.kind === 'builtin'
      ? builtins.find((b) => b.id === current.id)?.label || 'Preset'
      : current.filename

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
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node
      const insideMenu = !!menuRef.current && menuRef.current.contains(t)
      const insideAnchor = !!anchorRef.current && anchorRef.current.contains(t)
      if (!insideMenu && !insideAnchor) setOpen(false)
    }
    const onResize = () => measureAndOpen()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDocDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDocDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleUploadChoose = () => {
    setOpen(false)
    // allow the menu to close visually before opening the file dialog
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  const onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    input.value = '' // allow choosing same file again later
    if (f) onCustomPick(f)
  }

  const maxHeight = Math.max(160, window.innerHeight - ((menuRect?.top ?? 0) + 12))

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 12, color: '#7C7C7C', marginBottom: 6 }}>Source CSV</div>

      <button
        ref={anchorRef}
        type="button"
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
          cursor: 'pointer',
          fontSize: 12,
          color: '#111'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <img src={ChevronSvg} width={16} height={16} alt="" style={{ opacity: 0.8 }} />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFileChange}
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
            zIndex: 10000
          }}
        >
          {/* Presets */}
          <div style={{ padding: '6px 0' }}>
            {builtins.map((preset, i) => {
              const active = current?.kind === 'builtin' && current.id === preset.id
              const rowBg = hoverIdx === i ? 'rgba(0,0,0,0.10)' : 'transparent'
              return (
                <div
                  key={preset.id}
                  onClick={() => { onBuiltinPick(preset); setOpen(false) }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#111',
                    background: rowBg
                  }}
                  title={preset.filename}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <img src={active ? CheckSvg : EmptySvg} width={20} height={20} alt="" />
                    <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {preset.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ height: 1, background: '#E5E5E5' }} />

          {/* Upload custom… */}
          <div
            onClick={handleUploadChoose}
            onMouseEnter={() => setHoverIdx(999)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              color: '#111',
              background: hoverIdx === 999 ? 'rgba(0,0,0,0.10)' : 'transparent'
            }}
          >
            <img src={EmptySvg} width={20} height={20} alt="" />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Upload custom…</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------- Columns MultiSelect with sort affordance --------------- */
type MultiSelectProps = {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  sort: SortState
  onSortChange: (next: SortState) => void
}

function MultiSelect({ options, selected, onChange, disabled, sort, onSortChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

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
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node
      const insideMenu = !!menuRef.current && menuRef.current.contains(t)
      const insideAnchor = !!anchorRef.current && anchorRef.current.contains(t)
      if (!insideMenu && !insideAnchor) setOpen(false)
    }
    const onResize = () => measureAndOpen()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDocDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDocDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleAll = () => onChange(allSelected ? [] : options.slice())
  const toggleOne = (opt: string) => {
    const s = new Set(selected)
    s.has(opt) ? s.delete(opt) : s.add(opt)
    onChange(Array.from(s))
  }

  const cycleSort = (col: string) => {
    if (sort.by !== col) {
      onSortChange({ by: col, dir: 'asc' })
    } else if (sort.dir === 'asc') {
      onSortChange({ by: col, dir: 'desc' })
    } else if (sort.dir === 'desc') {
      onSortChange({ by: null, dir: null })
    } else {
      onSortChange({ by: col, dir: 'asc' })
    }
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
          zIndex: 10000
        }}
      >
          {/* Select All */}
          <div
            onClick={toggleAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              color: '#111',
              background: hoverIdx === -1 ? 'rgba(0,0,0,0.10)' : 'transparent'
            }}
            onMouseEnter={() => setHoverIdx(-1)}
            onMouseLeave={() => setHoverIdx(null)}
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
              const active = sort.by === opt && !!sort.dir
              const showHover = hoverIdx === i
              const iconSrc = sort.dir === 'desc' && active ? SortDescSvg : SortAscSvg
              const rowBg = showHover ? 'rgba(0,0,0,0.10)' : 'transparent'
              const display = prettyHeaderLabel(opt)

              return (
                <div
                  key={opt}
                  onClick={() => toggleOne(opt)}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#111',
                    background: rowBg
                  }}
                  title={opt}
                >
                  {/* left: checkbox + label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <img src={checked ? CheckSvg : EmptySvg} width={20} height={20} alt="" />
                    <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {display}
                    </span>
                  </div>

                  {/* right: sort icon button (hover shows at 20%, hover-on-icon 50%; stays visible when active) */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); cycleSort(opt) }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = active ? '1' : '0.5' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = active ? '1' : (showHover ? '0.2' : '0') }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      margin: 0,
                      width: 18,
                      height: 18,
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      opacity: active ? 1 : showHover ? 0.2 : 0
                    }}
                    title={!active ? 'Sort ascending' : sort.dir === 'asc' ? 'Sort descending' : 'Clear sort'}
                  >
                    <img src={iconSrc} width={18} height={18} alt="" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------- Row Count Select (styled dropdown) --------------- */
type RowCountSelectProps = {
  value: number
  onChange: (n: number) => void
  options?: number[]
}

function RowCountSelect({ value, onChange, options = [5, 10, 25, 50, 100] }: RowCountSelectProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

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
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node
      const insideMenu = !!menuRef.current && menuRef.current.contains(t)
      const insideAnchor = !!anchorRef.current && anchorRef.current.contains(t)
      if (!insideMenu && !insideAnchor) setOpen(false)
    }
    const onResize = () => measureAndOpen()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDocDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDocDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const maxHeight = Math.max(160, window.innerHeight - ((menuRect?.top ?? 0) + 12))

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 12, color: '#7C7C7C', marginBottom: 6 }}>Rows</div>

      <button
        ref={anchorRef}
        type="button"
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
          cursor: 'pointer',
          fontSize: 12,
          color: '#111'
        }}
      >
        <span>{value}</span>
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
            width: menuRect.width,
            maxHeight,
            background: '#FFFFFF',
            border: '1px solid #D0D0D0',
            borderRadius: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            overflowY: 'auto',
            zIndex: 10000
          }}
        >
          <div style={{ padding: '6px 0' }}>
            {options.map((n, i) => {
              const active = value === n
              const rowBg = hoverIdx === i ? 'rgba(0,0,0,0.10)' : 'transparent'
              return (
                <div
                  key={n}
                  onClick={() => { onChange(n); setOpen(false) }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#111',
                    background: rowBg
                  }}
                >
                  <img src={active ? CheckSvg : EmptySvg} width={20} height={20} alt="" />
                  <span style={{ fontSize: 12 }}>{n}</span>
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
  const [source, setSource] = useState<{ kind: 'builtin'; id: string } | { kind: 'custom'; filename: string } | null>(
    BUILTIN_CSVS.length ? { kind: 'builtin', id: BUILTIN_CSVS[0].id } : null
  )
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [selectedHeaders, setSelectedHeaders] = useState<string[]>([])
  const [sort, setSort] = useState<SortState>({ by: null, dir: null })
  const [rowLimit, setRowLimit] = useState<number>(50)
  const [includeCheckboxes, setIncludeCheckboxes] = useState<boolean>(true)
  const [placeWithinCard, setPlaceWithinCard] = useState<boolean>(true)

  // NEW: Place within page (default unchecked)
  const [placeWithinPage, setPlaceWithinPage] = useState<boolean>(false)

  const ready = headers.length > 0

  // Initial preset load (if any)
  useEffect(() => {
    if (!source) return
    if (source.kind === 'builtin') {
      const preset = BUILTIN_CSVS.find((b) => b.id === source.id)
      if (preset) {
        setCsvText(preset.contents)
        setFileName(preset.filename)
        const { headers: h, rows: r } = parseCsv(preset.contents)
        setHeaders(h)
        setRows(r)
        setSelectedHeaders(h.slice())
      }
    }
  }, [])

  // When source changes
  useEffect(() => {
    if (!source) return
    if (source.kind === 'builtin') {
      const preset = BUILTIN_CSVS.find((b) => b.id === source.id)
      if (!preset) return
      setCsvText(preset.contents)
      setFileName(preset.filename)
      const { headers: h, rows: r } = parseCsv(preset.contents)
      setHeaders(h)
      setRows(r)
      setSelectedHeaders(h.slice())
      setSort({ by: null, dir: null })
    }
  }, [source?.kind === 'builtin' ? source?.id : source?.filename])

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
      setSort({ by: null, dir: null })
    }
    reader.readAsText(file)
  }

  // Fit window height to content + rAF-throttled resize messages
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
  useEffect(() => {
    resizeToFit()
  }, [fileName, headers.length, source && ('kind' in source ? (source.kind === 'builtin' ? source.id : source.filename) : ''), rowLimit])

  // Resize handle
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
      const sx = e.clientX
      const sy = e.clientY
      const sw = window.innerWidth
      const sh = window.innerHeight
      resizing = true

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
    return () => { el.removeEventListener('pointerdown', onPointerDown) }
  }, [])

  function onGenerate() {
    if (!csvText.trim() || selectedHeaders.length === 0) return
    const filteredRows = rows.slice(0, rowLimit).map((r) => {
      const o: CsvRow = {}
      selectedHeaders.forEach((h) => (o[h] = r[h] ?? ''))
      return o
    })
    emit('CSV_PARSED', {headers: selectedHeaders, rows: filteredRows, sort, rowLimit, includeCheckboxes, placeWithinCard, placeWithinPage, fileName: fileName ?? 'Table'})
  }

  return (
    <div style={{ padding: 16, fontSize: 12, position: 'relative', minHeight: 290 }}>
      {/* Source picker */}
      <SourceSelect
        builtins={BUILTIN_CSVS}
        current={source}
        onBuiltinPick={(preset) => setSource({ kind: 'builtin', id: preset.id })}
        onCustomPick={(file) => {
          setSource({ kind: 'custom', filename: file.name })
          handleFile(file)
        }}
      />

      <VerticalSpace space="large" />
      <Divider></Divider>
      <VerticalSpace space="large" />


      {/* Columns picker with sort */}
      <MultiSelect
        options={headers}
        selected={selectedHeaders}
        onChange={setSelectedHeaders}
        disabled={!ready}
        sort={sort}
        onSortChange={setSort}
      />

      <VerticalSpace space="small" />

      {/* Row count picker */}
      <RowCountSelect value={rowLimit} onChange={setRowLimit} />

      <VerticalSpace space="small" />

      <Divider />
      <VerticalSpace space="small" />
            <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}} onClick={() => setIncludeCheckboxes(v => !v)}>
        <img src={includeCheckboxes ? CheckSvg : EmptySvg} width={20} height={20} alt="" style={{opacity: includeCheckboxes ? 1 : 0.7}} />
        <span style={{fontSize:12}}>Include checkbox</span>
      </label>
      <VerticalSpace space="small" />

<label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}} onClick={() => setPlaceWithinCard(v => !v)}>
        <img src={placeWithinCard ? CheckSvg : EmptySvg} width={20} height={20} alt="" style={{opacity: placeWithinCard ? 1 : 0.7}} />
        <span style={{fontSize:12}}> Place within card</span>
      </label>
      <VerticalSpace space="small" />

      <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}} onClick={() => setPlaceWithinPage(v => !v)}>
        <img src={placeWithinPage ? CheckSvg : EmptySvg} width={20} height={20} alt="" style={{opacity: placeWithinPage ? 1 : 0.7}} />
        <span style={{fontSize:12}}> Place within page</span>
      </label>
      <VerticalSpace space="small" />


      {/* Generate button */}
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
          width: '100%',
          borderRadius: 8,
          background: '#242B2E',
          border: 'none',
          outline: 'none',
          cursor: 'pointer',
          color: '#FFF',
          fontFamily: 'Inter, sans-serif',
          fontSize: 14,
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