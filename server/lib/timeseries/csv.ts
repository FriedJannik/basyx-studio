// CSV of ExternalSegments: a header row with the record idShorts, then one
// row per point. RFC 4180 quoting, including quoted line breaks, which the
// BaSyx AAS Web UI's comma split does not handle.

export function parseCsv (text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = text.startsWith('﻿') ? text.slice(1) : text
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    switch (char) {
      case '"': {
        quoted = true

        break
      }
      case ',': {
        row.push(field)
        field = ''

        break
      }
      case '\n':
      case '\r': {
        if (char === '\r' && source[index + 1] === '\n') {
          index++
        }
        row.push(field)
        rows.push(row)
        row = []
        field = ''

        break
      }
      default: {
        field += char
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter(cells => cells.some(cell => cell.trim() !== ''))
}
