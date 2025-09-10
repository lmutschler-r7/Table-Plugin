import { on, showUI } from '@create-figma-plugin/utilities'

/* ============================================================
   Window
============================================================ */
export default function () {
  showUI({ width: 360, height: 500, title: 'Leanders Tables' })
}

/* ============================================================
   Keys (variables & components)
============================================================ */
const TEXT_VAR_KEY       = '8d76832d854f9b5de5c63b72dd7c79f96d5f4974'     // semantic/text/primary
const DIVIDER_VAR_KEY    = '38ba50945fb164c3b8647f573cdfcba680511684'     // semantic/divider
const LINK_TEXT_VAR_KEY  = 'bffd7b005cfd848c11a4d4de7e57561bcd229ec1'     // semantic/text/link

const CHIP_COMPONENT_KEY    = '441c3a585ec17f2b8df3cea23534e2013c52d689'
const STATUS_COMPONENT_KEY  = '2cf7906934e7fb65b2bdf0a5c04665a8799d3abd'
const BOOLEAN_COMPONENT_KEY = '56f45b798f25a8d9aa2b473a21388cdf72f78eee'
const ICON_COMPONENT_KEY    = '01d64e52cc1ffc2be8c162efda6a08dd444e4363'   // NEW

/* ============================================================
   Types
============================================================ */
type CsvRow = Record<string, string>

type SortDir = 'asc' | 'desc' | null
type SortState = { by: string | null; dir: SortDir } | undefined

type CsvParsedPayload = {
  headers: string[]
  rows: CsvRow[]
  sort?: SortState
}

type CsvParsedEvent = {
  name: 'CSV_PARSED'
  handler: (payload: CsvParsedPayload) => void
}

type ResizeEvent = {
  name: 'RESIZE'
  handler: (payload: { width: number; height: number }) => void
}

/* ============================================================
   Helpers
============================================================ */
function prettyHeaderLabel(header: string): string {
  return header.replace(/\s*\[[^\]]+\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}
function headerHasChips(header: string): boolean {
  const m = header.match(/\[([^\]]+)\]/g)
  return !!m && m.some(s => /chip(s)?/i.test(s))
}
function headerHasStatus(header: string): boolean {
  const m = header.match(/\[([^\]]+)\]/g)
  return !!m && m.some(s => /status/i.test(s))
}
function headerHasBoolean(header: string): boolean {
  const m = header.match(/\[([^\]]+)\]/g)
  return !!m && m.some(s => /boolean/i.test(s))
}
// NEW: detect [icon]
function headerHasIcon(header: string): boolean {
  const m = header.match(/\[([^\]]+)\]/g)
  return !!m && m.some(s => /\bicon\b/i.test(s))
}
// NEW: detect [link]
function headerHasLink(header: string): boolean {
  const m = header.match(/\[([^\]]+)\]/g)
  return !!m && m.some(s => /link/i.test(s))
}

type Align = 'LEFT' | 'CENTER' | 'RIGHT'
function headerAlign(header: string): Align {
  const tags = header.match(/\[([^\]]+)\]/g)?.join(' ').toLowerCase() ?? ''
  if (/\b(r|right)\b/.test(tags)) return 'RIGHT'
  if (/\b(c|center|centre)\b/.test(tags)) return 'CENTER'
  return 'LEFT'
}

function alias(v: Variable | null): VariableAlias | undefined {
  return v ? { type: 'VARIABLE_ALIAS', id: v.id } : undefined
}

function variablePaint(v: Variable | null, fallbackRGB: RGB): Paint {
  const a = alias(v)
  return a
    ? { type: 'SOLID', opacity: 1, color: fallbackRGB, boundVariables: { color: a } }
    : { type: 'SOLID', color: fallbackRGB }
}
function getVariantInfoFromMaster(master: ComponentNode) {
  const set = master.parent && master.parent.type === 'COMPONENT_SET'
    ? (master.parent as ComponentSetNode)
    : null
  if (!set) return null
  // Old-but-still-present API: lists axes + allowed values
  const groups = set.variantGroupProperties as Record<string, { values: string[] }>
  const axes = Object.keys(groups || {})
  const allowed: Record<string, string[]> = {}
  axes.forEach(a => { allowed[a] = groups[a]?.values || [] })
  return { set, axes, allowed }
}

function pickIconAxis(axes: string[]): string | null {
  if (axes.length === 0) return null
  // Prefer an axis that sounds like it chooses the icon
  const pref = axes.find(a => /^(icon|name|type|category|state|level|platform)$/i.test(a))
  return pref || axes[0]
}

function canon(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Map common synonyms to increase hit rate
function normalizeMeaning(s: string): string {
  let c = canon(s)
  if (c === 'onpremise' || c === 'onpremises' || c === 'onprem') c = 'onprem'
  if (c === 'saas') c = 'cloud'
  // Typo seen in your list
  if (c === 'critival') c = 'critical'
  return c
}

function resolveAllowedValue(raw: string, allowed: string[]): string {
  if (allowed.length === 0) return raw
  const rawLower = raw.toLowerCase().trim()
  const rawCanon = normalizeMeaning(raw)

  // 1) strict case-insensitive
  let hit = allowed.find(v => v.toLowerCase().trim() === rawLower)
  if (hit) return hit

  // 2) canonical (ignore spaces/dashes; normalize synonyms)
  hit = allowed.find(v => normalizeMeaning(v) === rawCanon)
  if (hit) return hit

  // 3) fallback to first allowed
  return allowed[0]
}


/* ---------- Status value mapping ---------- */
function mapStatusVariant(raw: string): string {
  const token = (raw || '').split(/[,|]/g).map(s => s.trim()).find(Boolean) || ''
  const s = token.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

  if (s === 'critical' || s === 'critival') return 'Critical'
  if (s === 'error') return 'Error'
  if (s === 'high') return 'High'
  if (s === 'medium') return 'Medium'
  if (s === 'low') return 'Low'
  if (s === 'very low' || s === 'verylow') return 'Very Low'
  if (s === 'unresponsive' || s === 'not responding') return 'Unresponsive'
  if (s === 'bad') return 'Bad'
  if (s === 'poor') return 'Poor'
  if (s === 'inactive') return 'Inactive'
  if (s === 'not monitored' || s === 'unmonitored') return 'Not Monitored'
  if (s === 'idle') return 'Idle'
  if (s === 'healthy') return 'Healthy'
  if (s === 'good') return 'Good'
  if (s === 'online') return 'Online'
  if (s === 'unspecified' || s === '') return 'Unspecified'
  return 'Unspecified'
}

/* ---------- Icon value mapping (to variant names) ---------- */
function mapIconVariant(raw: string): string {
  const token = (raw || '').split(/[,|]/g).map(s => s.trim()).find(Boolean) || ''
  const s = token.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (s === 'on prem' || s === 'onprem' || s === 'on premise' || s === 'on premises') return 'On Prem'
  if (s === 'cloud' || s === 'saas') return 'Cloud'
  if (s === 'critical' || s === 'critival') return 'Critical'
  if (s === 'high') return 'High'
  if (s === 'medium') return 'Medium'
  if (s === 'low') return 'Low'
  // default to something safe your set supports
  return 'Low'
}

/* Status rank for smart sorting */
const STATUS_RANK: Record<string, number> = {
  'Critical': 0, 'Error': 0, 'High': 1, 'Medium': 2, 'Low': 3, 'Very Low': 4,
  'Unresponsive': 5, 'Bad': 6, 'Poor': 7, 'Inactive': 8, 'Not monitored': 9,
  'Idle': 10, 'Healthy': 11, 'Good': 12, 'Online': 13, 'Unspecified': 14
}

/* ---------- Content-aware sorting helpers ---------- */
function firstToken(s: string): string {
  return (s || '').split(/[,|]/g).map(t => t.trim()).find(Boolean) || ''
}
function parseBooleanLike(s: string): boolean | null {
  const v = (s || '').trim().toLowerCase()
  if (['true','yes','y','1'].includes(v)) return true
  if (['false','no','n','0'].includes(v)) return false
  return null
}
function parseNumeric(s: string): number | null {
  const n = Number((s || '').replace(/[, ]+/g, ''))
  return Number.isFinite(n) ? n : null
}
function parseDurationSeconds(s: string): number | null {
  const m = (s || '').trim().toLowerCase().match(/(\d+(?:\.\d+)?)\s*(years?|yrs?|y|months?|mos?|mo|weeks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/)
  if (!m) return null
  const qty = parseFloat(m[1])
  const unit = m[2]
  if (!Number.isFinite(qty)) return null
  let sec = 0
  if (/^y/.test(unit)) sec = qty * 365 * 24 * 3600
  else if (/^mo(nth)?|^mo$/.test(unit)) sec = qty * 30 * 24 * 3600
  else if (/^w/.test(unit)) sec = qty * 7 * 24 * 3600
  else if (/^d/.test(unit)) sec = qty * 24 * 3600
  else if (/^h/.test(unit)) sec = qty * 3600
  else if (/^m(?!o)/.test(unit)) sec = qty * 60
  else if (/^s/.test(unit)) sec = qty
  return sec
}
function parseDateMillis(s: string): number | null {
  const t = (s || '').trim()
  if (!t) return null
  let m = t.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?\s*$/i)
  if (m) {
    let [ , mm, dd, yyyy, hh = '0', mi = '0', ss = '0', ap ] = m
    let H = parseInt(hh, 10)
    if (ap) {
      const ampm = ap.toUpperCase()
      if (ampm === 'AM') { if (H === 12) H = 0 } else { if (H !== 12) H += 12 }
    }
    const date = new Date(parseInt(yyyy,10), parseInt(mm,10)-1, parseInt(dd,10), H, parseInt(mi,10), parseInt(ss,10), 0)
    const ms = date.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  const ms = Date.parse(t)
  return Number.isFinite(ms) ? ms : null
}

/* ---------- Measurement helpers ---------- */
async function measureTextWidth(textValue: string, opts: { header?: boolean } = {}): Promise<number> {
  const n = figma.createText()
  n.characters = textValue
  n.textAutoResize = 'WIDTH_AND_HEIGHT'
  n.fontName = { family: 'Inter', style: opts.header ? 'Medium' : 'Regular' }
  n.fontSize = opts.header ? 14 : 12
  n.lineHeight = { value: opts.header ? 24 : 20, unit: 'PIXELS' }
  figma.currentPage.appendChild(n)
  const w = Math.ceil(n.width)
  n.remove()
  return Math.max(4, w)
}
async function measureChipGroupWidth(raw: string): Promise<number> {
  const tokens = raw.split(/[,|]/g).map(s => s.trim()).filter(Boolean)
  if (tokens.length === 0) return 0
  const chipHPad = 16
  const gap = 4
  let sum = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = figma.createText()
    t.characters = tokens[i]
    t.textAutoResize = 'WIDTH_AND_HEIGHT'
    t.fontName = { family: 'Inter', style: 'Regular' }
    t.fontSize = 11
    t.lineHeight = { value: 16, unit: 'PIXELS' }
    figma.currentPage.appendChild(t)
    sum += Math.ceil(t.width) + chipHPad + (i > 0 ? gap : 0)
    t.remove()
  }
  return Math.max(4, sum)
}

/* ---------- Divider ---------- */
function createDivider(dividerVar: Variable | null, width: number): FrameNode {
  const d = figma.createFrame()
  d.name = 'divider'
  d.primaryAxisSizingMode = 'FIXED'
  d.counterAxisSizingMode = 'FIXED'
  d.fills = [variablePaint(dividerVar, { r: 0.88, g: 0.90, b: 0.93 })]
  d.resize(Math.max(1, Math.round(width)), 1)
  return d
}

/* ---------- Chip / Status / Boolean / Icon ---------- */
function createChipFromComponent(chipMaster: ComponentNode | null, label: string, textVar: Variable | null): SceneNode {
  if (chipMaster) {
    const inst = chipMaster.createInstance()
    inst.name = `Chip / ${label}`
    const labelNode =
      (inst.findOne(n => n.type === 'TEXT' && n.name.toLowerCase().includes('label')) as TextNode | null) ||
      (inst.findOne(n => n.type === 'TEXT') as TextNode | null)
    if (labelNode) {
      labelNode.fontName = { family: 'Inter', style: 'Regular' }
      labelNode.fontSize = 11
      labelNode.lineHeight = { value: 16, unit: 'PIXELS' }
      labelNode.characters = label
      labelNode.fills = [variablePaint(textVar, { r: 0.10, g: 0.10, b: 0.12 })]
    }
    return inst
  }
  const chip = figma.createFrame()
  chip.name = `Chip / ${label}`
  chip.layoutMode = 'HORIZONTAL'
  chip.primaryAxisSizingMode = 'AUTO'
  chip.counterAxisSizingMode = 'AUTO'
  chip.paddingLeft = 8
  chip.paddingRight = 8
  chip.paddingTop = 4
  chip.paddingBottom = 4
  chip.itemSpacing = 4
  chip.cornerRadius = 6
  chip.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }]
  chip.strokes = [{ type: 'SOLID', color: { r: 0.84, g: 0.84, b: 0.84 } }]
  chip.strokeAlign = 'INSIDE'
  const txt = figma.createText()
  txt.fontName = { family: 'Inter', style: 'Regular' }
  txt.fontSize = 11
  txt.lineHeight = { value: 16, unit: 'PIXELS' }
  txt.characters = label
  txt.textAutoResize = 'WIDTH_AND_HEIGHT'
  txt.fills = [variablePaint(textVar, { r: 0.10, g: 0.10, b: 0.12 })]
  chip.appendChild(txt)
  return chip
}
function createStatusNode(statusMaster: ComponentNode | null, raw: string): SceneNode {
  const variant = mapStatusVariant(raw)
  if (statusMaster) {
    const inst = statusMaster.createInstance()
    inst.name = `Status / ${variant}`
    const props = (inst as any).componentProperties as Record<string, any> | undefined
    if (props && Object.prototype.hasOwnProperty.call(props, 'status')) {
      ;(inst as InstanceNode).setProperties({ status: variant })
    }
    return inst
  }
  const t = figma.createText()
  t.fontName = { family: 'Inter', style: 'Medium' }
  t.fontSize = 12
  t.lineHeight = { value: 20, unit: 'PIXELS' }
  t.characters = variant
  t.textAutoResize = 'WIDTH_AND_HEIGHT'
  return t
}
function createBooleanNode(booleanMaster: ComponentNode | null, raw: string): SceneNode {
  if (booleanMaster) {
    const inst = booleanMaster.createInstance()
    inst.name = `Boolean`
    const norm = (raw || '').trim().toLowerCase()
    const value = norm === 'true' || norm === 'yes' || norm === '1'
    const props = (inst as any).componentProperties as Record<string, any> | undefined
    if (props && Object.prototype.hasOwnProperty.call(props, 'boolean')) {
      ;(inst as InstanceNode).setProperties({ boolean: value ? 'true' : 'false' })
    }
    return inst
  }
  const t = figma.createText()
  t.fontName = { family: 'Inter', style: 'Regular' }
  t.fontSize = 12
  t.lineHeight = { value: 20, unit: 'PIXELS' }
  t.characters = (raw || '').trim()
  t.textAutoResize = 'WIDTH_AND_HEIGHT'
  return t
}

// NEW: Icon node from your Icon component (variant-based)
function findVariantPropKey(inst: InstanceNode): string | null {
  const props = (inst as any).componentProperties as Record<string, any> | undefined
  if (!props) return null
  const keys = Object.keys(props)
  // First try obvious names
  const preferred = keys.find(k => /icon/i.test(k)) || keys.find(k => /variant/i.test(k))
  if (preferred) return preferred
  // Else if there is exactly one VARIANT property, use it
  const variantOnly = keys.filter(k => props[k]?.type === 'VARIANT')
  if (variantOnly.length === 1) return variantOnly[0]
  return null
}

function createIconNode(iconMaster: ComponentNode | null, raw: string): SceneNode {
  if (iconMaster) {
    const inst = iconMaster.createInstance()
    inst.name = 'Icon'

    const info = getVariantInfoFromMaster(iconMaster)
    const props = (inst as any).componentProperties as Record<string, any> | undefined

    if (info && props) {
      const axis = pickIconAxis(info.axes)
      if (axis) {
        const allowed = info.allowed[axis] || []
        const value = resolveAllowedValue(raw, allowed)

        // Keep all current variant axis values, only change our picked axis
        const toSet: Record<string, string> = {}
        for (const k of Object.keys(props)) {
          if (props[k]?.type === 'VARIANT' && typeof props[k]?.value === 'string') {
            toSet[k] = props[k].value
          }
        }
        toSet[axis] = value

        try {
          ;(inst as InstanceNode).setProperties(toSet)
        } catch {
          // Silently fall through – you’ll still get the instance with its default variant
        }
      }
    }
    return inst
  }

  // Fallback text if master missing
  const t = figma.createText()
  t.fontName = { family: 'Inter', style: 'Regular' }
  t.fontSize = 12
  t.lineHeight = { value: 20, unit: 'PIXELS' }
  t.characters = raw.trim()
  t.textAutoResize = 'WIDTH_AND_HEIGHT'
  return t
}


/* ---------- Sort icon SVGs + node helper ---------- */
const SVG_ASC = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4V20M12 4C13.3176 4.00001 16.9998 8.99996 16.9998 8.99996M12 4C10.6824 3.99999 6.99979 9 6.99979 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const SVG_DESC = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 20V4M12 20C13.3176 20 17 15.0001 17 15.0001M12 20C10.6824 20 6.99997 15.0001 6.99997 15.0001" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`

function createSortIconNode(dir: 'asc' | 'desc', textVar: Variable | null): FrameNode {
  const node = figma.createNodeFromSvg(dir === 'desc' ? SVG_DESC : SVG_ASC)
  node.name = dir === 'desc' ? 'Sort / Desc' : 'Sort / Asc'
  const paint: Paint = textVar
    ? { type: 'SOLID', opacity: 1, color: { r: 0.12, g: 0.14, b: 0.20 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: textVar.id } } }
    : { type: 'SOLID', color: { r: 0.12, g: 0.14, b: 0.20 } }
  node.findAll(n => 'strokes' in n).forEach(n => { (n as GeometryMixin).strokes = [paint] })
  node.resize(18, 18)
  return node
}

/* ============================================================
   Selected container or page center
============================================================ */
function getSelectedContainer(): (BaseNode & ChildrenMixin) | null {
  const sel = figma.currentPage.selection[0]
  if (!sel) return null
  if ('appendChild' in sel) return sel as BaseNode & ChildrenMixin
  return null
}

/* ============================================================
   Smart comparator (content-aware)
============================================================ */
function makeComparator(
  headers: string[],
  colIndex: number,
  isStatus: boolean,
  isBoolean: boolean,
  isChips: boolean,
  dir: 'asc' | 'desc'
) {
  const header = headers[colIndex]
  const mul = dir === 'desc' ? -1 : 1

  return (a: CsvRow, b: CsvRow) => {
    const av = (a[header] ?? '').trim()
    const bv = (b[header] ?? '').trim()

    if (isStatus) {
      const ar = STATUS_RANK[mapStatusVariant(av)] ?? 999
      const br = STATUS_RANK[mapStatusVariant(bv)] ?? 999
      if (ar !== br) return (ar - br) * mul
    }

    if (isBoolean) {
      const ab = parseBooleanLike(av)
      const bb = parseBooleanLike(bv)
      if (ab !== null && bb !== null) {
        if (ab === bb) return 0
        return ((ab ? 1 : 0) - (bb ? 1 : 0)) * mul
      }
    }

    const adur = parseDurationSeconds(av)
    const bdur = parseDurationSeconds(bv)
    if (adur !== null && bdur !== null && Number.isFinite(adur) && Number.isFinite(bdur)) {
      if (adur !== bdur) return (adur - bdur) * mul
    }

    const adt = parseDateMillis(av)
    const bdt = parseDateMillis(bv)
    if (adt !== null && bdt !== null && Number.isFinite(adt) && Number.isFinite(bdt)) {
      if (adt !== bdt) return (adt - bdt) * mul
    }

    const an = parseNumeric(av)
    const bn = parseNumeric(bv)
    if (an !== null && bn !== null) {
      if (an !== bn) return (an - bn) * mul
    }

    if (isChips) {
      const at = firstToken(av).toLowerCase()
      const bt = firstToken(bv).toLowerCase()
      if (at !== bt) return at.localeCompare(bt) * mul
    }

    const as = av.toLowerCase()
    const bs = bv.toLowerCase()
    return as.localeCompare(bs) * mul
  }
}

/* ============================================================
   Table builder
============================================================ */
on<CsvParsedEvent>('CSV_PARSED', async ({ headers, rows, sort }) => {
  try {
    // Fonts
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' })

    // Variables / components
    const textVar       = await figma.variables.importVariableByKeyAsync(TEXT_VAR_KEY).catch(() => null)
    const dividerVar    = await figma.variables.importVariableByKeyAsync(DIVIDER_VAR_KEY).catch(() => null)
    const linkTextVar   = await figma.variables.importVariableByKeyAsync(LINK_TEXT_VAR_KEY).catch(() => null)

    const chipMaster    = await figma.importComponentByKeyAsync(CHIP_COMPONENT_KEY).catch(() => null)
    const statusMaster  = await figma.importComponentByKeyAsync(STATUS_COMPONENT_KEY).catch(() => null)
    const booleanMaster = await figma.importComponentByKeyAsync(BOOLEAN_COMPONENT_KEY).catch(() => null)
    const iconMaster    = await figma.importComponentByKeyAsync(ICON_COMPONENT_KEY).catch(() => null) // NEW

    const headerHeight = 56
    const rowHeight = 40
    const cellHPad = 10

    const isChipsCol     = headers.map(h => headerHasChips(h))
    const isStatusCol    = headers.map(h => headerHasStatus(h))
    const isBooleanCol   = headers.map(h => headerHasBoolean(h))
    const isIconCol      = headers.map(h => headerHasIcon(h))   // NEW
    const isLinkCol      = headers.map(h => headerHasLink(h))   // NEW
    const aligns: Align[] = headers.map(h => headerAlign(h))
    const prettyHeaders  = headers.map(h => prettyHeaderLabel(h))

    // Representative widths
    let statusRepWidth = 0
    if (statusMaster) {
      const inst = statusMaster.createInstance()
      figma.currentPage.appendChild(inst)
      const props = (inst as any).componentProperties as Record<string, any> | undefined
      if (props && Object.prototype.hasOwnProperty.call(props, 'status')) {
        ;(inst as InstanceNode).setProperties({ status: 'Unspecified' })
      }
      statusRepWidth = Math.ceil(inst.width)
      inst.remove()
    }
    let booleanRepWidth = 0
    if (booleanMaster) {
      const inst = booleanMaster.createInstance()
      figma.currentPage.appendChild(inst)
      const props = (inst as any).componentProperties as Record<string, any> | undefined
      if (props && Object.prototype.hasOwnProperty.call(props, 'boolean')) {
        ;(inst as InstanceNode).setProperties({ boolean: 'true' })
      }
      booleanRepWidth = Math.ceil(inst.width)
      inst.remove()
    }
    let iconRepWidth = 0
if (iconMaster) {
  const inst = iconMaster.createInstance()
  figma.currentPage.appendChild(inst)
  const info = getVariantInfoFromMaster(iconMaster)
  const props = (inst as any).componentProperties as Record<string, any> | undefined
  if (info && props) {
    const axis = pickIconAxis(info.axes)
    const firstAllowed = axis ? (info.allowed[axis] || [])[0] : undefined
    if (axis && firstAllowed) {
      const toSet: Record<string, string> = {}
      for (const k of Object.keys(props)) {
        if (props[k]?.type === 'VARIANT' && typeof props[k]?.value === 'string') {
          toSet[k] = props[k].value
        }
      }
      toSet[axis] = firstAllowed
      try { (inst as InstanceNode).setProperties(toSet) } catch {}
    }
  }
  iconRepWidth = Math.ceil(inst.width)
  inst.remove()
}


    // Column widths
    const colWidths = new Array(headers.length).fill(0) as number[]
    for (let c = 0; c < headers.length; c++) {
      const hw = await measureTextWidth(prettyHeaders[c], { header: true })
      const sortReserve = sort && sort.by === headers[c] && (sort.dir === 'asc' || sort.dir === 'desc') ? 22 : 0
      colWidths[c] = Math.max(colWidths[c], hw + sortReserve)

      if (isChipsCol[c]) {
        for (let r = 0; r < rows.length; r++) {
          const raw = (rows[r][headers[c]] ?? '').trim()
          if (!raw) continue
          const w = await measureChipGroupWidth(raw)
          colWidths[c] = Math.max(colWidths[c], w)
        }
      } else if (isStatusCol[c]) {
        if (statusRepWidth > 0) colWidths[c] = Math.max(colWidths[c], statusRepWidth)
        else {
          for (let r = 0; r < rows.length; r++) {
            const w = await measureTextWidth(mapStatusVariant(rows[r][headers[c]] ?? ''))
            colWidths[c] = Math.max(colWidths[c], w)
          }
        }
      } else if (isBooleanCol[c]) {
        if (booleanRepWidth > 0) colWidths[c] = Math.max(colWidths[c], booleanRepWidth)
        else {
          for (let r = 0; r < rows.length; r++) {
            const w = await measureTextWidth((rows[r][headers[c]] ?? '').trim())
            colWidths[c] = Math.max(colWidths[c], w)
          }
        }
      } else if (isIconCol[c]) { // NEW
        if (iconRepWidth > 0) colWidths[c] = Math.max(colWidths[c], iconRepWidth)
        else {
          // if we somehow couldn't measure, fall back to text width
          for (let r = 0; r < rows.length; r++) {
            const w = await measureTextWidth(rows[r][headers[c]] ?? '')
            colWidths[c] = Math.max(colWidths[c], w)
          }
        }
      } else {
        for (let r = 0; r < rows.length; r++) {
          const w = await measureTextWidth(rows[r][headers[c]] ?? '')
          colWidths[c] = Math.max(colWidths[c], w)
        }
      }

      colWidths[c] = Math.max(colWidths[c], 8)
    }

    // Smart sorting
    let finalRows = rows
    const sortColIndex = sort && sort.by && sort.dir ? headers.findIndex(h => h === sort.by) : -1
    if (sortColIndex >= 0 && (sort!.dir === 'asc' || sort!.dir === 'desc')) {
      const cmp = makeComparator(
        headers,
        sortColIndex,
        isStatusCol[sortColIndex],
        isBooleanCol[sortColIndex],
        isChipsCol[sortColIndex],
        sort!.dir!
      )
      finalRows = rows.slice().sort(cmp)
    }

    const tableWidth = colWidths.reduce((sum, w) => sum + w + cellHPad * 2, 0)

    // Root table frame
    const table = figma.createFrame()
    table.name = 'table'
    table.layoutMode = 'VERTICAL'
    table.primaryAxisSizingMode = 'AUTO'
    table.counterAxisSizingMode = 'AUTO'
    table.itemSpacing = 0
    table.fills = []

    // Build a row
    const buildRow = (values: string[], opts: { header: boolean }) => {
      const row = figma.createFrame()
      row.name = opts.header ? 'header' : 'row'
      row.layoutMode = 'HORIZONTAL'
      row.primaryAxisSizingMode = 'AUTO'
      row.counterAxisSizingMode = 'AUTO'
      row.itemSpacing = 0
      row.fills = []

      for (let c = 0; c < values.length; c++) {
        const val = values[c]
        const align = aligns[c]
        const cell = figma.createFrame()
        cell.name = opts.header ? 'header cell' : 'cell'
        cell.layoutMode = 'VERTICAL'
        cell.primaryAxisSizingMode = 'FIXED'
        cell.counterAxisSizingMode = 'AUTO'
        cell.paddingLeft = cellHPad
        cell.paddingRight = cellHPad
        cell.paddingTop = opts.header ? 0 : 10
        cell.paddingBottom = opts.header ? 0 : 10
        cell.fills = []
        cell.counterAxisAlignItems = align === 'LEFT' ? 'MIN' : align === 'RIGHT' ? 'MAX' : 'CENTER'
        cell.primaryAxisAlignItems = 'CENTER'
        cell.resize(colWidths[c] + cellHPad * 2, opts.header ? headerHeight : rowHeight)

        if (opts.header) {
          const hWrap = figma.createFrame()
          hWrap.name = 'Header Content'
          hWrap.layoutMode = 'HORIZONTAL'
          hWrap.primaryAxisSizingMode = 'AUTO'
          hWrap.counterAxisSizingMode = 'AUTO'
          hWrap.itemSpacing = 4
          hWrap.counterAxisAlignItems = 'CENTER'
          hWrap.fills = []

          const t = figma.createText()
          t.fontName = { family: 'Inter', style: 'Medium' }
          t.fontSize = 14
          t.lineHeight = { value: 24, unit: 'PIXELS' }
          t.textAutoResize = 'WIDTH_AND_HEIGHT'
          t.characters = prettyHeaderLabel(val)
          t.fills = [variablePaint(textVar, { r: 0.12, g: 0.14, b: 0.20 })]
          hWrap.appendChild(t)

          if (sort && sort.by === headers[c] && (sort.dir === 'asc' || sort.dir === 'desc')) {
            hWrap.appendChild(createSortIconNode(sort.dir, textVar))
          }

          cell.appendChild(hWrap)
        } else if (isChipsCol[c]) {
          const wrap = figma.createFrame()
          wrap.layoutMode = 'HORIZONTAL'
          wrap.primaryAxisSizingMode = 'AUTO'
          wrap.counterAxisSizingMode = 'AUTO'
          wrap.itemSpacing = 4
          wrap.fills = []
          const tokens = val.split(/[,|]/g).map(s => s.trim()).filter(Boolean)
          for (const token of tokens) wrap.appendChild(createChipFromComponent(chipMaster, token, textVar))
          cell.appendChild(wrap)
        } else if (isStatusCol[c]) {
          cell.appendChild(createStatusNode(statusMaster, val))
        } else if (isBooleanCol[c]) {
          cell.appendChild(createBooleanNode(booleanMaster, val))
        } else if (isIconCol[c]) { // NEW
          cell.appendChild(createIconNode(iconMaster, val))
        } else {
          const t = figma.createText()
          t.fontName = { family: 'Inter', style: 'Regular' }
          t.fontSize = 12
          t.lineHeight = { value: 20, unit: 'PIXELS' }
          t.textAutoResize = 'WIDTH_AND_HEIGHT'
          t.characters = val
          t.fills = [
            variablePaint(
              isLinkCol[c] ? linkTextVar : textVar,
              isLinkCol[c] ? { r: 0.12, g: 0.39, b: 0.96 } : { r: 0.16, g: 0.18, b: 0.22 }
            )
          ]
          cell.appendChild(t)
        }

        row.appendChild(cell)
      }
      return row
    }

    // Header + divider + rows
    const headerRow = buildRow(headers, { header: true })
    table.appendChild(headerRow)
    table.appendChild(createDivider(dividerVar, tableWidth))

    for (let i = 0; i < finalRows.length; i++) {
      const vals = headers.map(h => (finalRows[i][h] ?? '').trim())
      const rowNode = buildRow(vals, { header: false })
      table.appendChild(rowNode)
      if (i < finalRows.length - 1) table.appendChild(createDivider(dividerVar, tableWidth))
    }

    // Place table
    const container = getSelectedContainer()
    if (container) {
      container.appendChild(table)
      if ('layoutMode' in container && container.layoutMode !== 'NONE') {
        table.layoutAlign = 'MIN'
      } else {
        table.x = 0
        table.y = 0
      }
    } else {
      const { x, y } = figma.viewport.center
      table.x = x
      table.y = y
      figma.currentPage.appendChild(table)
    }

    figma.currentPage.selection = [table]
    figma.viewport.scrollAndZoomIntoView([table])
    figma.notify('Table created')
  } catch (err) {
    console.error(err)
    figma.notify('Failed to create table. See console.')
  }
})

/* ============================================================
   UI-driven resize
============================================================ */
const MIN_WIDTH = 360
const MIN_HEIGHT = 290

on<ResizeEvent>('RESIZE', ({ width, height }) => {
  const w = Math.max(MIN_WIDTH, Math.round(width))
  const h = Math.max(MIN_HEIGHT, Math.round(height))
  figma.ui.resize(w, h)
})
