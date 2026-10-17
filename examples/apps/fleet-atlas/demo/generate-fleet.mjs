// Generates the Fleet Atlas demo: three fictitious sites (a bottling plant, a
// battery module plant and a machining center) with about 350 Asset
// Administration Shells, packaged as one AASX per site with all their files.
//
// Every twin carries complete IDTA submodels: Digital Nameplate 3.0 (address,
// company logo, markings), Technical Data 1.2 (classification, properties with
// IEC 61360 concept descriptions, product image), Carbon Footprint 1.0 (life
// cycle phases), Handover Documentation 2.0 (VDI 2770 PDFs), Hierarchical
// Structures 1.1 and operational data with limits for the live lens. Product
// pictures, logos, markings and PDFs are rendered by media.mjs. Some values
// stay empty on purpose, so passport readiness has gaps to find and fix.
//
// Run with: pnpm testenv:demo (writes test-setup/fixtures/demo/*.aasx and starts
// the "demo" target on http://localhost:18084).

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { documentKinds, domainOf, families, machines, manufacturers, markings, properties, sites } from './catalog.mjs'
import { conformity, datasheet, manual, testReport } from './documents.mjs'
import { openRenderer } from './media.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rootRequire = createRequire(join(here, '..', '..', '..', '..', 'package.json'))
const { jsonization, verification, xmlization } = rootRequire('@aas-core-works/aas-core3.1-typescript')
const { NewPackaging } = rootRequire('aas-package3-typescript')
const output = join(here, '..', '..', '..', '..', 'test-setup', 'fixtures', 'demo')

// A seeded generator, so the demo is the same on every run.
let seed = 20_261_015
function random () {
  seed = (seed + 0x6D_2B_79_F5) % 4_294_967_296
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}
const r = {
  pick: items => items[Math.floor(random() * items.length)],
  between: (min, max) => min + random() * (max - min),
  round: (value, digits = 0) => Number(value.toFixed(digits)),
  chance: probability => random() < probability,
}
const slug = text => text.replaceAll(/([a-z\d])([A-Z])/g, '$1-$2').toLowerCase().replaceAll(/[^a-z\d]+/g, '-').replaceAll(/^-|-$/g, '')
const pad = (value, length = 2) => String(value).padStart(length, '0')

// ---------------------------------------------------------------------------
// AAS builders
// ---------------------------------------------------------------------------

const externalRef = value => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value }] })
const modelRef = (...keys) => ({ type: 'ModelReference', keys: keys.map(([type, value]) => ({ type, value })) })
const semantic = value => ({ semanticId: externalRef(value) })
const cdId = key => `https://demo.basyx-studio.example/cd/${key}`
const langs = (en, de) => [{ language: 'en', text: en }, ...(de ? [{ language: 'de', text: de }] : [])]

function prop (idShort, valueType, value, extra = {}) {
  return { ...(idShort ? { idShort } : {}), modelType: 'Property', valueType, ...([undefined, null, ''].includes(value) ? {} : { value: String(value) }), ...extra }
}
function mlp (idShort, en, de, extra = {}) {
  return { idShort, modelType: 'MultiLanguageProperty', ...(en ? { value: langs(en, de) } : {}), ...extra }
}
function file (idShort, path, contentType, extra = {}) {
  return { ...(idShort ? { idShort } : {}), modelType: 'File', contentType, ...(path ? { value: path } : {}), ...extra }
}
function smc (idShort, value, extra = {}) {
  return { ...(idShort ? { idShort } : {}), modelType: 'SubmodelElementCollection', ...extra, value }
}
function sml (idShort, typeValueListElement, value, extra = {}) {
  return { ...(idShort ? { idShort } : {}), modelType: 'SubmodelElementList', orderRelevant: true, typeValueListElement, ...extra, value }
}
const strings = (idShort, values) => sml(idShort, 'Property', values.map(value => prop(undefined, 'xs:string', value)), { valueTypeListElement: 'xs:string' })
const qualifier = (type, valueType, value) => ({ type, valueType, value: String(value) })
const submodel = (id, idShort, semanticId, submodelElements) => ({ modelType: 'Submodel', id, idShort, kind: 'Instance', ...semantic(semanticId), submodelElements })

// ---------------------------------------------------------------------------
// Media: pictures per product family and machine type, logos, markings, PDFs
// ---------------------------------------------------------------------------

const media = new Map()
const renderer = await openRenderer()

async function asset (path, contentType, render) {
  if (!media.has(path)) {
    media.set(path, { contentType, bytes: new Uint8Array(await render()) })
  }
  return path
}

/** The companies running the sites; they "manufacture" the plants and lines. */
const operators = {
  rheinfeld: { name: 'Rheinfeld Getränke GmbH', short: 'Rheinfeld', color: '#C2185B', street: 'Brunnenallee 1', zip: '53359', city: 'Rheinbach', country: 'DE', phone: '+49 2226 9010 0' },
  nordhafen: { name: 'Celvia Energy Storage GmbH', short: 'Celvia', color: '#00A86B', street: 'Kaiserhafen 2', zip: '27568', city: 'Bremerhaven', country: 'DE', phone: '+49 471 9220 0' },
  lindental: { name: 'Lindental Präzisionsteile GmbH', short: 'Lindental', color: '#3949AB', street: 'Talstraße 18', zip: '78532', city: 'Tuttlingen', country: 'DE', phone: '+49 7461 7700 0' },
}

function makerOf (key) {
  const maker = manufacturers[key] ?? operators[key]
  return { ...maker, key, domain: domainOf(key === 'nordhafen' ? 'celvia' : key) }
}

const dataUrl = (path, type) => renderer.dataUrl(media.get(path).bytes, type)
const logo = maker => asset(`/aasx/files/logos/${maker.key}.png`, 'image/png', () => renderer.logo(maker))
const markingFile = key => asset(`/aasx/files/markings/${key}.png`, 'image/png', () => renderer.marking(key))
const picture = (key, icon, maker, model, dark) => asset(`/aasx/files/images/${key}.jpg`, 'image/jpeg', () => renderer.product({ icon, color: maker.color, brand: maker.short, model, dark }))

/** Pages need the logo and picture inline. */
const pageContext = (product, extra = {}) => ({ ...product, ...extra, logo: dataUrl(product.logoPath), image: dataUrl(product.imagePath, 'image/jpeg') })

/** The documents of a product family or machine type, shared by all its instances. */
async function familyDocuments (product) {
  const documents = []
  for (const kind of documentKinds) {
    const builder = { manual, datasheet, conformity }[kind.kind]
    const path = await asset(`/aasx/files/documents/${product.key}-${kind.key}.pdf`, 'application/pdf', () => renderer.pdf({ color: product.maker.color, pages: builder(pageContext(product)) }))
    documents.push({ ...kind, path, identifier: `${product.type}-${kind.classId.replace('-', '')}` })
  }
  return documents
}

/** The factory acceptance test report of one machine. */
async function factoryTest (product, record, site) {
  const path = await asset(`/aasx/files/documents/fat-${record.key}.pdf`, 'application/pdf', () => renderer.pdf({
    color: product.maker.color,
    pages: testReport(pageContext(product, { technical: record.technical }), { serial: record.serial, customer: operators[site.key].name, date: record.date }),
  }))
  return { title: 'Factory acceptance test report', classId: '03-04', className: 'Inspection, maintenance, testing', identifier: `FAT-${record.serial}`, path }
}

// ---------------------------------------------------------------------------
// Submodels
// ---------------------------------------------------------------------------

const nameplateFields = {
  URIOfTheProduct: '0112/2///61987#ABN590#002',
  ManufacturerName: '0112/2///61987#ABA565#009',
  ManufacturerProductDesignation: '0112/2///61987#ABA567#009',
  ManufacturerProductFamily: '0112/2///61987#ABP464#002',
  ManufacturerProductType: '0112/2///61987#ABA300#008',
  SerialNumber: '0112/2///61987#ABA951#009',
  YearOfConstruction: '0112/2///61987#ABP000#002',
  DateOfManufacture: '0112/2///61987#ABB757#007',
  CountryOfOrigin: '0112/2///61987#ABP462#001',
  HardwareVersion: '0112/2///61987#ABA926#008',
}
const np = key => semantic(nameplateFields[key])

async function nameplate (id, twin) {
  const value = key => (twin.gaps.has(key) ? null : twin[key])
  const maker = twin.maker
  return submodel(id, 'Nameplate', 'https://admin-shell.io/idta/nameplate/3/0/Nameplate', [
    prop('URIOfTheProduct', 'xs:string', value('uri'), np('URIOfTheProduct')),
    mlp('ManufacturerName', value('manufacturer'), undefined, np('ManufacturerName')),
    mlp('ManufacturerProductDesignation', value('designation'), undefined, np('ManufacturerProductDesignation')),
    smc('AddressInformation', [
      mlp('Company', maker.name),
      mlp('Street', maker.street),
      mlp('Zipcode', maker.zip),
      mlp('CityTown', maker.city),
      mlp('NationalCode', maker.country),
      smc('Phone', [mlp('TelephoneNumber', maker.phone), prop('TypeOfTelephone', 'xs:string', 'office')]),
      smc('Email', [prop('EmailAddress', 'xs:string', `service@${maker.domain}`), prop('TypeOfEmailAddress', 'xs:string', 'office')]),
    ], semantic('https://admin-shell.io/zvei/nameplate/1/0/ContactInformations/AddressInformation')),
    mlp('ManufacturerProductRoot', twin.noun),
    mlp('ManufacturerProductFamily', twin.designation, undefined, np('ManufacturerProductFamily')),
    prop('ManufacturerProductType', 'xs:string', twin.type, np('ManufacturerProductType')),
    prop('OrderCodeOfManufacturer', 'xs:string', twin.orderCode),
    prop('ProductArticleNumberOfManufacturer', 'xs:string', twin.article),
    prop('SerialNumber', 'xs:string', value('serial'), np('SerialNumber')),
    prop('YearOfConstruction', 'xs:string', value('year'), np('YearOfConstruction')),
    prop('DateOfManufacture', 'xs:date', value('date'), np('DateOfManufacture')),
    prop('HardwareVersion', 'xs:string', twin.hardware, np('HardwareVersion')),
    prop('FirmwareVersion', 'xs:string', twin.firmware),
    prop('SoftwareVersion', 'xs:string', twin.software),
    prop('CountryOfOrigin', 'xs:string', value('country'), np('CountryOfOrigin')),
    file('CompanyLogo', await logo(maker), 'image/png'),
    sml('Markings', 'SubmodelElementCollection', await Promise.all(twin.markings.map(async marking => smc(undefined, [
      prop('MarkingName', 'xs:string', marking.name),
      prop('DesignationOfCertificateOrApproval', 'xs:string', marking.certificate),
      prop('IssueDate', 'xs:date', twin.issued),
      file('MarkingFile', await markingFile(marking.key), 'image/png'),
    ])))),
  ])
}

async function technicalData (id, twin) {
  return submodel(id, 'TechnicalData', 'https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2', [
    smc('GeneralInformation', [
      prop('ManufacturerName', 'xs:string', twin.maker.name),
      file('ManufacturerLogo', await logo(twin.maker), 'image/png'),
      mlp('ManufacturerProductDesignation', twin.designation),
      prop('ManufacturerArticleNumber', 'xs:string', twin.article),
      prop('ManufacturerOrderCode', 'xs:string', twin.orderCode),
      file('ProductImage', twin.imagePath, 'image/jpeg'),
    ], semantic('https://admin-shell.io/ZVEI/TechnicalData/GeneralInformation/1/1')),
    smc('ProductClassifications', [
      smc('ProductClassificationItem', [
        prop('ProductClassificationSystem', 'xs:string', 'BaSyx Demo Classification'),
        prop('ClassificationSystemVersion', 'xs:string', '1.0'),
        prop('ProductClassId', 'xs:string', `DEMO-${twin.category.toUpperCase()}`),
      ]),
    ], semantic('https://admin-shell.io/ZVEI/TechnicalData/ProductClassifications/1/1')),
    smc('TechnicalProperties', Object.entries(twin.technical).map(([key, entry]) => {
      const type = properties[key]?.type
      const valueType = type === 'STRING' ? 'xs:string' : (type === 'INTEGER_COUNT' ? 'xs:int' : 'xs:double')
      return prop(key, valueType, entry, semantic(cdId(key)))
    }), semantic('https://admin-shell.io/ZVEI/TechnicalData/TechnicalProperties/1/1')),
    smc('FurtherInformation', [
      mlp('TextStatement', 'Generated for the BaSyx Studio demo; the product is fictitious.', 'Für die BaSyx-Studio-Demo erzeugt; das Produkt ist fiktiv.'),
      prop('ValidDate', 'xs:date', '2026-01-01'),
    ], semantic('https://admin-shell.io/ZVEI/TechnicalData/FurtherInformation/1/1')),
  ])
}

function carbonFootprint (id, twin) {
  const phases = [['A1-A3', 0.93, 'GHG Protocol'], ['A4', 0.04, 'ISO 14067'], ['C1-C4', 0.03, 'ISO 14067']]
  return submodel(id, 'CarbonFootprint', 'https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/1/0', [
    sml('ProductCarbonFootprints', 'SubmodelElementCollection', phases.map(([phase, share, method], index) => smc(undefined, [
      strings('PcfCalculationMethods', [method]),
      prop('PcfCO2eq', 'xs:double', index === 0 && twin.gaps.has('pcf') ? null : (twin.pcf * share).toFixed(1)),
      prop('ReferenceImpactUnitForCalculation', 'xs:string', 'piece'),
      prop('QuantityOfMeasureForCalculation', 'xs:double', '1'),
      strings('LifeCyclePhases', [phase]),
      prop('PublicationDate', 'xs:date', '2026-03-01'),
      prop('ExpirationDate', 'xs:date', '2029-03-01'),
      smc('GoodsHandoverAddress', [
        mlp('Street', twin.maker.street),
        mlp('ZipCode', twin.maker.zip),
        mlp('CityTown', twin.maker.city),
        prop('Country', 'xs:string', twin.maker.country),
      ]),
    ]))),
  ])
}

function documentation (id, twin) {
  return submodel(id, 'HandoverDocumentation', '0173-1#01-AHF578#003', [
    sml('Documents', 'SubmodelElementCollection', twin.documents.map(document => smc(undefined, [
      sml('DocumentIds', 'SubmodelElementCollection', [smc(undefined, [
        prop('DocumentDomainId', 'xs:string', twin.maker.domain),
        prop('DocumentIdentifier', 'xs:string', document.identifier),
        prop('DocumentIsPrimary', 'xs:boolean', 'true'),
      ])]),
      sml('DocumentClassifications', 'SubmodelElementCollection', [smc(undefined, [
        prop('ClassId', 'xs:string', document.classId),
        mlp('ClassName', document.className),
        prop('ClassificationSystem', 'xs:string', 'VDI2770:2020'),
      ])]),
      sml('DocumentVersions', 'SubmodelElementCollection', [smc(undefined, [
        strings('Languages', ['en']),
        prop('Version', 'xs:string', '1.0'),
        mlp('Title', `${document.title} – ${twin.designation}`),
        mlp('Description', `${document.title} of the ${twin.designation}.`),
        prop('StatusSetDate', 'xs:date', twin.issued),
        prop('StatusValue', 'xs:string', 'Released'),
        prop('OrganizationShortName', 'xs:string', twin.maker.short),
        prop('OrganizationOfficialName', 'xs:string', twin.maker.name),
        sml('DigitalFiles', 'File', [file(undefined, document.path, 'application/pdf')]),
      ])]),
    ]))),
  ])
}

/** Hierarchical Structures 1.1, archetype OneDown: the twin and its direct parts. */
function hierarchy (id, twin, parts) {
  const node = index => `Node${pad(index + 1)}`
  return submodel(id, 'HierarchicalStructures', 'https://admin-shell.io/idta/HierarchicalStructuresEnablingBoM/1/1/Submodel', [
    prop('ArcheType', 'xs:string', 'OneDown', semantic('https://admin-shell.io/idta/HierarchicalStructures/ArcheType/1/0')),
    {
      idShort: 'EntryNode',
      modelType: 'Entity',
      entityType: 'SelfManagedEntity',
      globalAssetId: twin.assetId,
      ...semantic('https://admin-shell.io/idta/HierarchicalStructures/EntryNode/1/0'),
      statements: [
        ...parts.map((part, index) => ({
          idShort: node(index),
          modelType: 'Entity',
          entityType: 'SelfManagedEntity',
          globalAssetId: part.assetId,
          ...semantic('https://admin-shell.io/idta/HierarchicalStructures/Node/1/0'),
        })),
        ...parts.map((_, index) => ({
          idShort: `HasPart${pad(index + 1)}`,
          modelType: 'RelationshipElement',
          ...semantic('https://admin-shell.io/idta/HierarchicalStructures/HasPart/1/0'),
          first: modelRef(['Submodel', id], ['Entity', 'EntryNode']),
          second: modelRef(['Submodel', id], ['Entity', 'EntryNode'], ['Entity', node(index)]),
        })),
      ],
    },
  ])
}

const signalUnits = new Map()
function operationalData (id, signals) {
  return submodel(id, 'OperationalData', 'urn:basyx:studio:demo:OperationalData:1:0', signals.map(signal => {
    signalUnits.set(signal.idShort, signal.unit)
    return prop(signal.idShort, 'xs:double', (signal.base + (random() - 0.5) * signal.swing).toFixed(signal.digits), {
      ...semantic(cdId(signal.idShort)),
      qualifiers: [
        qualifier('Unit', 'xs:string', signal.unit),
        ...(signal.warn === undefined ? [] : [qualifier('WarningAbove', 'xs:double', signal.warn)]),
        ...(signal.alarm === undefined ? [] : [qualifier('AlarmAbove', 'xs:double', signal.alarm)]),
        ...(signal.warnBelow === undefined ? [] : [qualifier('WarningBelow', 'xs:double', signal.warnBelow)]),
        ...(signal.alarmBelow === undefined ? [] : [qualifier('AlarmBelow', 'xs:double', signal.alarmBelow)]),
      ],
    })
  }))
}

const signalNames = {
  WindingTemperature: ['Winding temperature', 'Wicklungstemperatur'],
  Vibration: ['Vibration velocity', 'Schwinggeschwindigkeit'],
  Speed: ['Speed', 'Drehzahl'],
  HeatsinkTemperature: ['Heatsink temperature', 'Kühlkörpertemperatur'],
  DischargePressure: ['Discharge pressure', 'Förderdruck'],
  CpuLoad: ['CPU load', 'CPU-Auslastung'],
  OutletPressure: ['Outlet pressure', 'Austrittsdruck'],
  OilTemperature: ['Oil temperature', 'Öltemperatur'],
  CycleTime: ['Cycle time', 'Taktzeit'],
  JointTemperature: ['Joint temperature', 'Gelenktemperatur'],
  CoolantTemperature: ['Coolant temperature', 'Kühlmitteltemperatur'],
  SupplyTemperature: ['Supply temperature', 'Vorlauftemperatur'],
  SpindleLoad: ['Spindle load', 'Spindelauslastung'],
  BearingTemperature: ['Bearing temperature', 'Lagertemperatur'],
  BatteryLevel: ['Battery level', 'Ladezustand'],
}

function conceptDescriptions () {
  const iec61360 = (key, en, de, unit, dataType, definition) => ({
    modelType: 'ConceptDescription',
    id: cdId(key),
    idShort: key,
    embeddedDataSpecifications: [{
      dataSpecification: externalRef('https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIec61360/3/0'),
      dataSpecificationContent: {
        modelType: 'DataSpecificationIec61360',
        preferredName: langs(en, de),
        ...(unit ? { unit } : {}),
        dataType,
        definition: langs(definition),
      },
    }],
  })
  return [
    ...Object.entries(properties).map(([key, property]) => iec61360(key, property.en, property.de, property.unit, property.type, property.definition)),
    ...[...signalUnits].filter(([key]) => !properties[key]).map(([key, unit]) => {
      const [en, de] = signalNames[key] ?? [key]
      return iec61360(key, en, de, unit, 'REAL_MEASURE', `Measured ${en.toLowerCase()} during operation.`)
    }),
  ]
}

// ---------------------------------------------------------------------------
// Twins
// ---------------------------------------------------------------------------

const countries = ['DE', 'DE', 'DE', 'AT', 'CH', 'IT', 'FR', 'NL', 'CZ', 'SE', 'FI', 'PL']
const categories = { batteryModule: 'battery', agv: 'agv', camera: 'camera', laser: 'laser', hmi: 'hmi', spindle: 'spindle' }
const typeCounters = {}

/** A product (family or machine type) with its shared picture, logo and documents. */
const products = new Map()
async function productOf (key, spec, assembly) {
  if (!products.has(key)) {
    const maker = makerOf(spec.maker)
    const title = assembly ? `${maker.short} ${spec.noun}` : spec.name
    const type = `${maker.short.slice(0, 3).toUpperCase()}-${slug(key).replaceAll('-', '').slice(0, 5).toUpperCase()}${Math.floor(r.between(100, 999))}`
    const product = {
      key: slug(key),
      maker,
      title,
      noun: spec.noun,
      type,
      assembly,
      category: spec.category,
      classification: spec.classification ?? spec.noun,
      orderCode: `${type}-${Math.floor(r.between(10, 99))}`,
      technical: spec.technical ?? {},
      pcfText: spec.pcfText ?? '',
      logoPath: await logo(maker),
      imagePath: await picture(slug(key), spec.icon, maker, title, assembly),
    }
    product.documents = await familyDocuments(product)
    products.set(key, product)
  }
  return products.get(key)
}

/** Creates one twin and its submodels; returns its asset ID and footprint. */
async function twin ({ site, key, name, product, technical, pcf, signals, parts = [], level }) {
  const maker = product.maker
  typeCounters[product.type] = (typeCounters[product.type] ?? 0) + 1
  const serial = `${maker.short.slice(0, 2).toUpperCase()}${Math.floor(r.between(10_000_000, 99_999_999))}`
  const year = Math.floor(r.between(level === 'component' ? 2009 : 2012, 2026))
  const record = {
    key,
    maker,
    noun: product.noun,
    category: product.category,
    designation: product.title,
    type: product.type,
    orderCode: product.orderCode,
    article: `${product.type}-${pad(typeCounters[product.type], 3)}`,
    assetId: `https://${maker.domain}/assets/${slug(product.type)}/${serial.toLowerCase()}`,
    manufacturer: maker.name,
    serial,
    year: String(year),
    date: `${year}-${pad(Math.floor(r.between(1, 13)))}-${pad(Math.floor(r.between(1, 29)))}`,
    issued: `${year}-${pad(Math.floor(r.between(1, 13)))}-15`,
    country: maker.country === 'DE' ? r.pick(countries) : maker.country,
    uri: `https://www.${maker.domain}/products/${product.key}`,
    hardware: `${Math.floor(r.between(1, 5))}.${Math.floor(r.between(0, 10))}`,
    firmware: `${Math.floor(r.between(2, 6))}.${Math.floor(r.between(0, 20))}.${Math.floor(r.between(0, 9))}`,
    software: `${Math.floor(r.between(1, 4))}.${Math.floor(r.between(0, 12))}`,
    markings: product.category === 'battery' ? [markings[0], markings[2], markings[3]] : (r.chance(0.5) ? markings.slice(0, 3) : [markings[0], markings[2]]),
    technical,
    pcf,
    imagePath: product.imagePath,
    documents: product.documents,
    gaps: new Set(),
  }
  // Passport gaps: assemblies are documented better than their parts.
  const gapRate = level === 'component' ? 1 : 0.35
  for (const [gap, rate] of [['country', 0.16], ['serial', 0.1], ['year', 0.08], ['uri', 0.06], ['manufacturer', 0.03], ['pcf', 0.1]]) {
    if (r.chance(rate * gapRate)) {
      record.gaps.add(gap)
    }
  }
  if (level === 'machine') {
    record.documents = [...product.documents, await factoryTest(product, record, site)]
  }

  const submodels = []
  const add = async (suffix, build) => {
    submodels.push(await build(`https://${site.key}.example/ids/sm/${key}/${suffix}`))
  }
  await add('nameplate', id => nameplate(id, record))
  if (Object.keys(technical).length > 0 && r.chance(level === 'component' ? 0.9 : 0.97)) {
    await add('technical-data', id => technicalData(id, record))
  }
  if (pcf > 0 && r.chance(level === 'component' ? 0.8 : 0.92)) {
    await add('carbon-footprint', id => carbonFootprint(id, record))
  }
  if (r.chance(level === 'component' ? 0.75 : 0.95)) {
    await add('documentation', id => documentation(id, record))
  }
  if (parts.length > 0) {
    await add('hierarchy', id => hierarchy(id, record, parts))
  }
  if (signals?.length) {
    await add('operational-data', id => operationalData(id, signals))
  }

  site.shells.push({
    modelType: 'AssetAdministrationShell',
    id: `https://${site.key}.example/ids/aas/${key}`,
    idShort: name.replaceAll(/[^A-Z\d]+/gi, ' ').trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('').replace(/^(\d)/, 'Asset$1'),
    displayName: langs(name),
    description: langs(`${product.title} by ${maker.name}, serial number ${serial}, at the ${site.name}.`),
    assetInformation: {
      assetKind: 'Instance',
      globalAssetId: record.assetId,
      specificAssetIds: [
        { name: 'manufacturerPartId', value: product.type },
        { name: 'serialNumber', value: serial },
      ],
      assetType: `https://${maker.domain}/types/${slug(product.type)}`,
      defaultThumbnail: { path: product.imagePath, contentType: 'image/jpeg' },
    },
    submodels: submodels.map(item => modelRef(['Submodel', item.id])),
  })
  site.submodels.push(...submodels)
  return { assetId: record.assetId, pcf }
}

async function component (site, familyKey, key, name, live = true) {
  const spec = families[familyKey]
  const example = spec.technical(r)
  const product = await productOf(familyKey, { ...spec, category: categories[familyKey] ?? familyKey, technical: example, pcfText: `${spec.pcf(example).toFixed(1)} kg CO₂e` }, false)
  const technical = spec.technical(r)
  return twin({ site, key, name, product, technical, pcf: spec.pcf(technical) * r.between(0.9, 1.1), signals: live ? spec.signals : undefined, level: 'component' })
}

/** An assembly without technical data of its own (plant, line, fleet, store, pallet). */
async function group (site, key, name, spec, parts, level = 'line') {
  const product = await productOf(key, { ...spec, category: 'machine' }, true)
  return twin({ site, key, name, product, technical: {}, pcf: 0, parts, level })
}

for (const site of sites) {
  site.shells = []
  site.submodels = []
  const lineRefs = []
  for (const line of site.lines) {
    const seen = {}
    const machineRefs = []
    for (const machineKey of line.machines) {
      const spec = machines[machineKey]
      seen[machineKey] = (seen[machineKey] ?? 0) + 1
      const repeated = line.machines.filter(item => item === machineKey).length > 1
      const key = `${site.key}-${line.key}-${slug(machineKey)}${repeated ? `-${seen[machineKey]}` : ''}`
      const name = `${line.key.toUpperCase()} ${spec.noun}${repeated ? ` ${seen[machineKey]}` : ''}`
      const used = {}
      const parts = []
      for (const familyKey of spec.parts) {
        used[familyKey] = (used[familyKey] ?? 0) + 1
        const count = spec.parts.filter(item => item === familyKey).length
        parts.push(await component(site, familyKey, `${key}-${slug(familyKey)}-${used[familyKey]}`, `${name} · ${families[familyKey].noun}${count > 1 ? ` ${used[familyKey]}` : ''}`))
      }
      const weight = 900 + spec.parts.length * 240
      const technical = { RatedPower: r.round(parts.length * 3.2 + r.between(4, 30), 1), ...(spec.throughput ? { Throughput: spec.throughput } : {}), Weight: weight }
      const product = await productOf(machineKey, { ...spec, category: 'machine', technical, pcfText: 'see the machine’s carbon footprint' }, true)
      machineRefs.push(await twin({ site, key, name, product, technical, parts, level: 'machine', pcf: weight * 3.3 + parts.reduce((sum, part) => sum + part.pcf, 0) * 0.15 }))
    }
    lineRefs.push(await group(site, `${site.key}-${line.key}`, line.name, { noun: 'Production line', maker: site.key, icon: 'mdi-transit-connection-horizontal', classification: 'Production line' }, machineRefs))
  }
  if (site.mobile) {
    const fleet = []
    for (let index = 1; index <= site.mobile.count; index++) {
      fleet.push(await component(site, site.mobile.family, `${site.key}-amr-${index}`, `AMR ${pad(index)} · ${families[site.mobile.family].noun}`))
    }
    lineRefs.push(await group(site, `${site.key}-fleet`, site.mobile.name, { noun: 'Intralogistics fleet', maker: 'mobilis', icon: 'mdi-forklift', classification: 'Fleet of autonomous mobile robots' }, fleet))
  }
  if (site.goods) {
    const pallets = []
    for (let pallet = 1; pallet <= site.goods.pallets; pallet++) {
      const modules = []
      for (let index = 1; index <= site.goods.perPallet; index++) {
        modules.push(await component(site, site.goods.family, `${site.key}-pallet-${pallet}-module-${pad(index)}`, `P-${1040 + pallet} · Battery module ${pad(index)}`, false))
      }
      pallets.push(await group(site, `${site.key}-pallet-${pallet}`, `${site.goods.name} P-${1040 + pallet}`, { noun: 'Dispatch pallet', maker: 'celvia', icon: 'mdi-shipping-pallet', classification: 'Shipping unit of battery modules' }, modules))
    }
    lineRefs.push(await group(site, `${site.key}-goods`, 'Finished goods', { noun: 'Finished goods store', maker: site.key, icon: 'mdi-warehouse', classification: 'Warehouse area' }, pallets))
  }
  await group(site, `${site.key}-plant`, site.name, { noun: 'Plant', maker: site.key, icon: site.icon, classification: 'Production site' }, lineRefs, 'plant')
  for (const [index, familyKey] of site.spares.entries()) {
    await component(site, familyKey, `${site.key}-spare-${pad(index + 1)}`, `Spare · ${families[familyKey].name}`, false)
  }
}

// ---------------------------------------------------------------------------
// Verify and package
// ---------------------------------------------------------------------------

/** Every file path a File element or thumbnail refers to. */
function filesOf (value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      filesOf(item, found)
    }
  } else if (value && typeof value === 'object') {
    if (value.modelType === 'File' && value.value) {
      found.add(value.value)
    }
    if (typeof value.path === 'string' && value.contentType) {
      found.add(value.path)
    }
    for (const item of Object.values(value)) {
      filesOf(item, found)
    }
  }
  return found
}

mkdirSync(output, { recursive: true })
for (const name of readdirSync(output)) {
  rmSync(join(output, name), { force: true })
}
const descriptions = conceptDescriptions()
let shellCount = 0
for (const [index, site] of sites.entries()) {
  const environment = {
    assetAdministrationShells: site.shells,
    submodels: site.submodels,
    // The concept descriptions once, in the first package.
    ...(index === 0 ? { conceptDescriptions: descriptions } : {}),
  }
  const parsed = jsonization.environmentFromJsonable(environment)
  if (parsed.error !== null) {
    throw new Error(`${site.key}: deserialization failed at ${parsed.error.path}: ${parsed.error.message}`)
  }
  const errors = [...verification.verify(parsed.mustValue())]
  if (errors.length > 0) {
    throw new Error(`${site.key}:\n${errors.slice(0, 20).map(error => `${error.path}: ${error.message}`).join('\n')}`)
  }

  let stored = new Uint8Array(0)
  const pkg = await NewPackaging().CreateInStream({
    readAll: () => stored,
    writeAll: data => {
      stored = data
    },
  })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlization.toXmlString(parsed.mustValue())}`
  const spec = await pkg.PutPart(new URL(`file:///aasx/xml/${site.key}.aas.xml`), 'text/xml', new TextEncoder().encode(xml))
  await pkg.MakeSpec(spec)
  const used = [...filesOf(environment)].toSorted()
  for (const path of used) {
    const entry = media.get(path)
    if (!entry) {
      throw new Error(`${site.key}: no content for ${path}`)
    }
    await pkg.RelateSupplementaryToSpec(await pkg.PutPart(new URL(`file://${path}`), entry.contentType, entry.bytes), spec)
  }
  const plant = site.shells.find(item => item.id.endsWith(`/${site.key}-plant`))
  await pkg.SetThumbnail(await pkg.PutPart(new URL('file:///thumbnail.jpg'), 'image/jpeg', media.get(plant.assetInformation.defaultThumbnail.path).bytes))
  const bytes = await pkg.Flush()
  writeFileSync(join(output, `${site.key}.aasx`), bytes)
  shellCount += site.shells.length
  console.info(`${site.key}.aasx: ${site.shells.length} shells, ${site.submodels.length} submodels, ${used.length} files, ${(bytes.length / 1024 / 1024).toFixed(1)} MB`)
}
await renderer.close()
console.info(`${shellCount} shells, ${descriptions.length} concept descriptions, ${media.size} media files in ${output}`)
