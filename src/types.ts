import type { EventHandler } from '@create-figma-plugin/utilities'

export type CsvRow = Record<string, string>

export interface CsvParsedEvent extends EventHandler {
  name: 'CSV_PARSED'
  handler: (payload: { headers: string[]; rows: CsvRow[] }) => void
}
