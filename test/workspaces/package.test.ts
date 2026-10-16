import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NewPackaging } from 'aas-package3-typescript'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { isSafeEntryName } from '~~/server/lib/workspaces/archive'
import { readPackage, writePackage } from '~~/server/lib/workspaces/package'

const fixture = fileURLToPath(new URL('../../test-setup/fixtures/open/IESEDriveMotorDM3000.aasx', import.meta.url))
const edgeCases = fileURLToPath(new URL('../../test-setup/fixtures/open/studio-edge-cases.json', import.meta.url))

/** A JSON-spec package of the edge-case environment with one supplementary file. */
async function edgeCasePackage (): Promise<Uint8Array> {
  const pkg = await NewPackaging().Create(join(await mkdtemp(join(tmpdir(), 'studio-package-')), 'edge-cases.aasx'))
  try {
    const spec = await pkg.PutPart(new URL('https://package.local/aasx/edge-cases/edge-cases.json'), 'application/json', new Uint8Array(await readFile(edgeCases)))
    await pkg.MakeSpec(spec)
    const manual = await pkg.PutPart(new URL('https://package.local/aasx-suppl/edge-cases/manual.pdf'), 'application/pdf', randomBytes(4096))
    await pkg.RelateSupplementaryToSpec(manual, spec)
    // A part no relationship targets, as in the IDTA-01005 example package.
    await pkg.PutPart(new URL('https://package.local/aasx-suppl/edge-cases/unrelated.txt'), 'text/plain', strToU8('not related'))
    return await pkg.Flush()
  } finally {
    pkg.Close()
  }
}

const relationshipTypes = 'http://admin-shell.io/aasx/relationships'

/**
 * A package as some vendor tools write it: entry names with a literal space
 * instead of `%20`, referenced by relationship targets with the same space.
 */
function literalSpacePackage (manual: Uint8Array): Uint8Array {
  const relationships = (...entries: string[]) => strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.join('')}</Relationships>`)
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="pdf" ContentType="application/pdf"/><Override PartName="/aasx/aasx-origin" ContentType="text/plain"/></Types>'),
    '_rels/.rels': relationships(`<Relationship Type="${relationshipTypes}/aasx-origin" Target="/aasx/aasx-origin" Id="R1"/>`),
    'aasx/aasx-origin': strToU8('Intentionally empty.'),
    'aasx/_rels/aasx-origin.rels': relationships(`<Relationship Type="${relationshipTypes}/aas-spec" Target="/aasx/my data.json" Id="R2"/>`),
    'aasx/my data.json': strToU8(JSON.stringify({ assetAdministrationShells: [], submodels: [], conceptDescriptions: [] })),
    'aasx/_rels/my data.json.rels': relationships(`<Relationship Type="${relationshipTypes}/aas-suppl" Target="/aasx/suppl/User manual.pdf" Id="R3"/>`),
    'aasx/suppl/User manual.pdf': manual,
  })
}

/** Every part of a package except its AAS spec, which Studio re-serializes on save. */
async function partsOf (bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const { pkg, spec } = await readPackage(bytes)
  const parts = new Map<string, Uint8Array>()
  for (const part of await pkg.Parts()) {
    if (part.URI.pathname !== spec.URI.pathname) {
      parts.set(part.URI.pathname, part.ReadAllBytes())
    }
  }
  return parts
}

describe('AASX packages', () => {
  it('opens the fixture as AAS 3.1 XML', async () => {
    const opened = await readPackage(new Uint8Array(await readFile(fixture)))
    expect(opened.format).toBe('xml')
    const shells = opened.environment.assetAdministrationShells as Array<{ idShort: string }>
    expect(shells.map(shell => shell.idShort)).toEqual(['IESEDriveMotorDM3000'])
  })

  it('round-trips without changes: same AAS content, identical supplementary files', async () => {
    const original = new Uint8Array(await readFile(fixture))
    const opened = await readPackage(original)
    const saved = await writePackage(opened, opened.environment)
    const reopened = await readPackage(saved)

    expect(reopened.environment).toEqual(opened.environment)
    const before = await partsOf(original)
    const after = await partsOf(saved)
    expect([...after.keys()].toSorted()).toEqual([...before.keys()].toSorted())
    expect(before.size).toBeGreaterThan(0)
    for (const [path, bytes] of before) {
      expect(Buffer.from(after.get(path)!).equals(Buffer.from(bytes)), path).toBe(true)
    }
  })

  it('round-trips a JSON package with every element kind', async () => {
    const original = await edgeCasePackage()
    const opened = await readPackage(original)
    expect(opened.format).toBe('json')
    const saved = await writePackage(opened, opened.environment)
    expect((await readPackage(saved)).environment).toEqual(opened.environment)
    const before = await partsOf(original)
    const after = await partsOf(saved)
    expect([...before.keys()].toSorted()).toEqual(['/aasx-suppl/edge-cases/manual.pdf', '/aasx-suppl/edge-cases/unrelated.txt', '/aasx/aasx-origin'])
    expect([...after.keys()].toSorted()).toEqual([...before.keys()].toSorted())
    for (const [path, bytes] of before) {
      expect(Buffer.from(after.get(path)!).equals(Buffer.from(bytes)), path).toBe(true)
    }
  })

  it('finds and round-trips parts stored under names with a literal space', async () => {
    const manual = randomBytes(2048)
    const opened = await readPackage(literalSpacePackage(manual))
    // File values name the part by path; URL turns the space into %20.
    const part = await opened.pkg.FindPart(new URL('/aasx/suppl/User manual.pdf', opened.spec.URI))
    expect(part && Buffer.from(part.ReadAllBytes()).equals(manual)).toBe(true)

    const reopened = await readPackage(await writePackage(opened, opened.environment))
    const [relationship] = await reopened.pkg.SupplementaryRelationships()
    expect(relationship && Buffer.from(relationship.Supplementary.ReadAllBytes()).equals(manual)).toBe(true)
  })

  it('keeps an edit across save and reopen', async () => {
    const opened = await readPackage(new Uint8Array(await readFile(fixture)))
    const environment = structuredClone(opened.environment)
    const shells = environment.assetAdministrationShells as Array<Record<string, unknown>>
    shells[0]!.idShort = 'Renamed'
    const reopened = await readPackage(await writePackage(opened, environment))
    expect((reopened.environment.assetAdministrationShells as Array<{ idShort: string }>)[0]!.idShort).toBe('Renamed')
  })
})

describe('AASX safety checks (DATA-006)', () => {
  const origin = { '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>') }

  it('accepts ordinary entry names and rejects unsafe ones', () => {
    expect(isSafeEntryName('aasx/xml/content.xml')).toBe(true)
    expect(isSafeEntryName('[Content_Types].xml')).toBe(true)
    for (const name of ['../evil', 'a/../../evil', '/etc/passwd', 'C:/evil', String.raw`a\b`, 'a//b', './a', 'a\u0000b', '']) {
      expect(isSafeEntryName(name), name).toBe(false)
    }
  })

  it.each([
    ['path traversal', { ...origin, '../evil.txt': strToU8('x') }, /unsafe entry name/],
    ['absolute path', { ...origin, '/abs.txt': strToU8('x') }, /unsafe entry name/],
    ['a decompression bomb', { ...origin, 'bomb.bin': new Uint8Array(64 * 1024 * 1024) }, /compressed suspiciously well/],
    ['too many entries', Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [`f/${index}`, strToU8('x')])), /more than 10000 entries/],
  ])('rejects %s', async (_, files, message) => {
    const bytes = zipSync(files as Record<string, Uint8Array>, { level: 9 })
    await expect(readPackage(bytes)).rejects.toMatchObject({ code: 'package_rejected', message: expect.stringMatching(message) })
  })

  it('rejects files that are not packages', async () => {
    await expect(readPackage(strToU8('not a zip'))).rejects.toMatchObject({ code: 'package_rejected' })
    await expect(readPackage(zipSync(origin))).rejects.toMatchObject({ code: 'package_rejected' })
  })

  it('rejects invalid AAS XML in a well-formed package', async () => {
    const opened = await readPackage(new Uint8Array(await readFile(fixture)))
    await opened.pkg.PutPart(opened.spec.URI, opened.spec.ContentType, strToU8('<aas:environment xmlns:aas="https://admin-shell.io/aas/3/1"><broken'))
    await expect(readPackage(await opened.pkg.Flush())).rejects.toMatchObject({ code: 'package_rejected', message: expect.stringMatching(/AAS XML is invalid/) })
  })
})
