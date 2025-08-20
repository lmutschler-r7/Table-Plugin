import { on, showUI } from '@create-figma-plugin/utilities'
import type { CsvParsedEvent } from './types'

export default function () {
  showUI({ width: 360, height: 500, title: 'Leanders Tables' })
}

/** Variable keys (yours) */
const TEXT_VAR_KEY    = '8d76832d854f9b5de5c63b72dd7c79f96d5f4974'     // semantic/text/primary
const DIVIDER_VAR_KEY = '38ba50945fb164c3b8647f573cdfcba680511684'     // semantic/divider

/** Component keys (yours) */
const CHIP_COMPONENT_KEY   = '441c3a585ec17f2b8df3cea23534e2013c52d689'
const STATUS_COMPONENT_KEY = '2cf7906934e7fb65b2bdf0a5c04665a8799d3abd'

/* ---------------- Helpers ---------------- */
function prettyHeaderLabel(header: string): string {
  return header.replace(/\s*\[[^\]]+\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}
function headerHasChips(header: string): boolean {
  const m = header.match(/\[([^\]]+)\]/g)
  if (!m) return false
  return m.some(s => /chip(s)?/i.test(s))
}
function headerHasStatus(header: string): boolean {
  const m = header.match(/\[([^\]]+)\]/g)
  if (!m) return false
  return m.some(s => /status/i.test(s))
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

/** Map raw cell text -> canonical status variant value */
function mapStatusVariant(raw: string): string {
  // take first token if comma/pipe separated
  const token = (raw || '').split(/[,|]/g).map(s => s.trim()).find(Boolean) || ''
  const s = token.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (s === 'critical') return 'Critical'
  if (s === 'high') return 'High'
  if (s === 'medium') return 'Medium'
  if (s === 'low') return 'Low'
  if (s === 'very low' || s === 'verylow') return 'Very Low'
  if (s === 'healthy') return 'Healthy'
  if (s === 'inactive') return 'Inactive'
  if (s === 'unspecified' || s === '') return 'Unspecified'
  return 'Unspecified'
}

/** Measuring helpers (guard against 0-width) */
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
  const gap = 8
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

/** Divider sized explicitly to avoid 0px width edge cases */
function createDivider(dividerVar: Variable | null, width: number): FrameNode {
  const d = figma.createFrame()
  d.name = 'divider'
  d.layoutAlign = 'STRETCH'
  d.primaryAxisSizingMode = 'FIXED'
  d.counterAxisSizingMode = 'FIXED'
  d.fills = [variablePaint(dividerVar, { r: 0.88, g: 0.90, b: 0.93 })]
  d.resize(Math.max(1, Math.round(width)), 1)
  return d
}

/** Chip creation (instance if we have a master; fallback pill otherwise) */
function createChipFromComponent(
  chipMaster: ComponentNode | null,
  label: string,
  textVar: Variable | null
): SceneNode {
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
      return inst
    }
  }
  // Fallback pill
  const chip = figma.createFrame()
  chip.name = `Chip / ${label}`
  chip.layoutMode = 'HORIZONTAL'
  chip.primaryAxisSizingMode = 'AUTO'
  chip.counterAxisSizingMode = 'AUTO'
  chip.paddingLeft = 8
  chip.paddingRight = 8
  chip.paddingTop = 4
  chip.paddingBottom = 4
  chip.itemSpacing = 6
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

/** Create a Status instance and set its `status` property. If no master, fallback to plain text. */
function createStatusNode(
  statusMaster: ComponentNode | null,
  raw: string
): SceneNode {
  const variant = mapStatusVariant(raw)
  if (statusMaster) {
    const inst = statusMaster.createInstance()
    inst.name = `Status / ${variant}`
    // Only set if property exists
    const props = (inst as any).componentProperties as Record<string, any> | undefined
    if (props && Object.prototype.hasOwnProperty.call(props, 'status')) {
      ;(inst as InstanceNode).setProperties({ status: variant })
    }
    return inst
  }
  // Fallback: plain text badge
  const t = figma.createText()
  t.fontName = { family: 'Inter', style: 'Medium' }
  t.fontSize = 12
  t.lineHeight = { value: 20, unit: 'PIXELS' }
  t.characters = variant
  t.textAutoResize = 'WIDTH_AND_HEIGHT'
  return t
}

/* ---------------- Build table ---------------- */
on<CsvParsedEvent>('CSV_PARSED', async ({ headers, rows }) => {
  try {
    // Fonts
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' })

    // Variables + components
    const textVar    = await figma.variables.importVariableByKeyAsync(TEXT_VAR_KEY).catch(() => null)
    const dividerVar = await figma.variables.importVariableByKeyAsync(DIVIDER_VAR_KEY).catch(() => null)
    const chipMaster   = await figma.importComponentByKeyAsync(CHIP_COMPONENT_KEY).catch(() => null)
    const statusMaster = await figma.importComponentByKeyAsync(STATUS_COMPONENT_KEY).catch(() => null)

    const headerHeight = 56
    const rowHeight = 40
    const cellHPad = 10

    const isChipsCol  = headers.map(h => headerHasChips(h))
    const isStatusCol = headers.map(h => headerHasStatus(h))
    const prettyHeaders = headers.map(h => prettyHeaderLabel(h))

    // Pre-measure a status instance width (if we have a master)
    let statusWidth = 0
    if (statusMaster) {
      const inst = statusMaster.createInstance()
      figma.currentPage.appendChild(inst)
      // set a representative variant so width is realistic
      if ((inst as any).componentProperties && 'status' in (inst as any).componentProperties) {
        ;(inst as InstanceNode).setProperties({ status: 'Unspecified' })
      }
      statusWidth = Math.ceil(inst.width)
      inst.remove()
    }

    // Column widths
    const colWidths = new Array(headers.length).fill(0) as number[]
    for (let c = 0; c < headers.length; c++) {
      const hw = await measureTextWidth(prettyHeaders[c], { header: true })
      colWidths[c] = Math.max(colWidths[c], hw)

      if (isChipsCol[c]) {
        for (let r = 0; r < rows.length; r++) {
          const raw = (rows[r][headers[c]] ?? '').trim()
          if (!raw) continue
          const w = await measureChipGroupWidth(raw)
          colWidths[c] = Math.max(colWidths[c], w)
        }
      } else if (isStatusCol[c]) {
        // Use measured status instance width (fallback to text width if master missing)
        if (statusWidth > 0) {
          colWidths[c] = Math.max(colWidths[c], statusWidth)
        } else {
          // fallback: measure text of mapped variant
          for (let r = 0; r < rows.length; r++) {
            const tv = mapStatusVariant(rows[r][headers[c]] ?? '')
            const w = await measureTextWidth(tv)
            colWidths[c] = Math.max(colWidths[c], w)
          }
        }
      } else {
        for (let r = 0; r < rows.length; r++) {
          const tv = (rows[r][headers[c]] ?? '')
          const w = await measureTextWidth(tv)
          colWidths[c] = Math.max(colWidths[c], w)
        }
      }

      colWidths[c] = Math.max(colWidths[c], 8) // guard
    }

    // Table width for reliable divider sizing
    const tableWidth = colWidths.reduce((sum, w) => sum + w + cellHPad * 2, 0)

    // Table root
    const table = figma.createFrame()
    table.name = 'table'
    table.layoutMode = 'VERTICAL'
    table.primaryAxisSizingMode = 'AUTO'
    table.counterAxisSizingMode = 'AUTO'
    table.itemSpacing = 0
    table.fills = []

    // Row builder
    const buildRow = (values: string[], opts: { header: boolean }) => {
      const row = figma.createFrame()
      row.name = opts.header ? 'header' : 'row'
      row.layoutMode = 'HORIZONTAL'
      row.primaryAxisSizingMode = 'AUTO'
      row.counterAxisSizingMode = 'AUTO'
      row.itemSpacing = 0
      row.fills = []

      values.forEach((val, c) => {
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
        cell.primaryAxisAlignItems = 'CENTER'
        cell.resize(colWidths[c] + cellHPad * 2, opts.header ? headerHeight : rowHeight)

        if (opts.header) {
          const t = figma.createText()
          t.fontName = { family: 'Inter', style: 'Medium' }
          t.fontSize = 14
          t.lineHeight = { value: 24, unit: 'PIXELS' }
          t.textAutoResize = 'HEIGHT'
          t.characters = prettyHeaderLabel(val)
          t.fills = [variablePaint(textVar, { r: 0.12, g: 0.14, b: 0.20 })]
          cell.appendChild(t)
          t.resize(Math.max(4, colWidths[c]), t.height)
        } else if (isChipsCol[c]) {
          const wrap = figma.createFrame()
          wrap.layoutMode = 'HORIZONTAL'
          wrap.primaryAxisSizingMode = 'AUTO'
          wrap.counterAxisSizingMode = 'AUTO'
          wrap.itemSpacing = 8
          wrap.fills = []
          const tokens = val.split(/[,|]/g).map(s => s.trim()).filter(Boolean)
          tokens.forEach(token => wrap.appendChild(createChipFromComponent(chipMaster, token, textVar)))
          cell.appendChild(wrap)
        } else if (isStatusCol[c]) {
          const node = createStatusNode(statusMaster, val)
          cell.appendChild(node)
        } else {
          const t = figma.createText()
          t.fontName = { family: 'Inter', style: 'Regular' }
          t.fontSize = 12
          t.lineHeight = { value: 20, unit: 'PIXELS' }
          t.textAutoResize = 'HEIGHT'
          t.characters = val
          t.fills = [variablePaint(textVar, { r: 0.16, g: 0.18, b: 0.22 })]
          cell.appendChild(t)
          t.resize(Math.max(4, colWidths[c]), t.height)
        }

        row.appendChild(cell)
      })

      return row
    }

    // Header + divider + rows
    const headerRow = buildRow(headers, { header: true })
    table.appendChild(headerRow)
    table.appendChild(createDivider(dividerVar, tableWidth))

    rows.forEach((r, i) => {
      const vals = headers.map(h => (r[h] ?? '').trim())
      const rowNode = buildRow(vals, { header: false })
      table.appendChild(rowNode)
      if (i < rows.length - 1) table.appendChild(createDivider(dividerVar, tableWidth))
    })

    // Place
    const { x, y } = figma.viewport.center
    table.x = x
    table.y = y
    figma.currentPage.appendChild(table)
    figma.currentPage.selection = [table]
    figma.viewport.scrollAndZoomIntoView([table])
    figma.notify('Table created')
  } catch (err) {
    console.error(err)
    figma.notify('Failed to create table. See console.')
  }
})

/* --------- RESIZE from UI --------- */
const MIN_WIDTH = 360
const MIN_HEIGHT = 290
type ResizeEvent = { name: 'RESIZE'; handler: (payload: { width: number; height: number }) => void }
on<ResizeEvent>('RESIZE', ({ width, height }) => {
  const w = Math.max(MIN_WIDTH, Math.round(width))
  const h = Math.max(MIN_HEIGHT, Math.round(height))
  figma.ui.resize(w, h)
})
