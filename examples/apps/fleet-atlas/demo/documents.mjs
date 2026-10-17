// HTML pages of the demo's PDF documents (rendered by media.mjs). The texts
// are generic but complete, so the documents read like real ones.

import { properties } from './catalog.mjs'
import { escape } from './media.mjs'

const directives = {
  machine: ['2006/42/EC Machinery Directive', '2014/30/EU Electromagnetic Compatibility', '2011/65/EU RoHS'],
  electrical: ['2014/35/EU Low Voltage Directive', '2014/30/EU Electromagnetic Compatibility', '2011/65/EU RoHS', '2009/125/EC Ecodesign (EU 2019/1781)'],
  pressure: ['2014/68/EU Pressure Equipment Directive', '2006/42/EC Machinery Directive', '2011/65/EU RoHS'],
  battery: ['(EU) 2023/1542 Batteries Regulation', '2014/30/EU Electromagnetic Compatibility'],
}

function header (product, documentNumber, title) {
  return `<div class="head"><img src="${product.logo}"><div class="meta"><b>${escape(title)}</b><br>${escape(documentNumber)} · Version 1.0</div></div>`
}

function footer (product) {
  const maker = product.maker
  return `<div class="foot"><span>${escape(maker.name)} · ${escape(maker.street)} · ${escape(maker.zip)} ${escape(maker.city)}</span><span>${escape(maker.phone)} · www.${escape(maker.domain)}</span></div>`
}

function specTable (product) {
  const rows = Object.entries(product.technical).map(([key, value]) => {
    const property = properties[key]
    return `<tr><td>${escape(property?.en ?? key)}</td><td><b>${escape(value)}</b> ${escape(property?.unit ?? '')}</td></tr>`
  }).join('')
  return `<table><tr><th>Property</th><th>Value</th></tr>${rows}</table>`
}

function directivesOf (product) {
  if (product.category === 'battery') {
    return directives.battery
  }
  if (product.assembly) {
    return directives.machine
  }
  return /pump|valve|compressor/i.test(product.title) ? directives.pressure : directives.electrical
}

/** Operating instructions: a cover page and a page of content. */
export function manual (product) {
  const number = `${product.type}-OI`
  return [
    `${header(product, number, 'Operating instructions')}
     <div class="hero"><img src="${product.image}"><div><h1>${escape(product.title)}</h1>
       <div class="subtitle">Operating instructions</div><p style="margin-top:6mm">Original instructions · English</p>
       <p>Type ${escape(product.type)}</p></div></div>
     <h2>About these instructions</h2>
     <p>These instructions describe the safe installation, commissioning, operation and maintenance of the ${escape(product.noun.toLowerCase())}.
     Read them completely before starting any work and keep them available at the place of use for the whole service life of the product.</p>
     <p>Pass them on to every subsequent owner or user. The illustrations show the standard version; your version may differ in details.</p>
     ${footer(product)}`,
    `${header(product, number, 'Operating instructions')}
     <h2>1 Safety</h2>
     <p>Only qualified personnel who have read and understood these instructions may work on the ${escape(product.noun.toLowerCase())}.
     Disconnect all energy supplies and secure them against being switched on again before installation or maintenance work.</p>
     <p>Do not operate the product outside the limits given in the technical data. Unauthorised modifications void the declaration of conformity.</p>
     <h2>2 Intended use</h2>
     <p>The ${escape(product.noun.toLowerCase())} is intended exclusively for industrial use in the applications described in the data sheet. Any other use is considered improper.</p>
     <h2>3 Technical data</h2>
     ${specTable(product)}
     <h2>4 Installation and commissioning</h2>
     <p>Check the delivery for transport damage. Mount the product on a level, vibration-free surface, connect it according to the wiring diagram and verify all protective earth connections before switching on.</p>
     <h2>5 Maintenance</h2>
     <p>Inspect the product every 2,000 operating hours. Replace wear parts with original spare parts only. Record all maintenance in the digital twin of the asset.</p>
     ${footer(product)}`,
  ]
}

export function datasheet (product) {
  return [
    `${header(product, `${product.type}-DS`, 'Data sheet')}
     <div class="hero"><img src="${product.image}"><div><h1>${escape(product.title)}</h1>
       <div class="subtitle">${escape(product.classification)}</div>
       <p style="margin-top:6mm">Type ${escape(product.type)} · Order code ${escape(product.orderCode)}</p></div></div>
     <h2>Technical data</h2>
     ${specTable(product)}
     <h2>Sustainability</h2>
     <p>Product carbon footprint (cradle to gate, A1–A3): <b>${escape(product.pcfText)}</b> per piece, calculated according to the GHG Protocol Product Standard.</p>
     ${footer(product)}`,
  ]
}

export function conformity (product) {
  const maker = product.maker
  return [
    `${header(product, `${product.type}-DOC`, 'EU declaration of conformity')}
     <h1>EU declaration of conformity</h1>
     <p>The manufacturer <b>${escape(maker.name)}</b>, ${escape(maker.street)}, ${escape(maker.zip)} ${escape(maker.city)}, declares under its sole responsibility that the product</p>
     <table><tr><th>Product</th><td>${escape(product.title)}</td></tr><tr><th>Type</th><td>${escape(product.type)}</td></tr><tr><th>Function</th><td>${escape(product.classification)}</td></tr></table>
     <p style="margin-top:5mm">is in conformity with the relevant Union harmonisation legislation:</p>
     <ul style="margin:2mm 0 0 6mm">${directivesOf(product).map(item => `<li>${escape(item)}</li>`).join('')}</ul>
     <p style="margin-top:5mm">Harmonised standards applied: EN ISO 12100:2010, EN 60204-1:2018, EN IEC 61000-6-2:2019, EN IEC 61000-6-4:2019.</p>
     <div class="sign"><div>${escape(maker.city)}, ${escape(product.issued)}<br>Place and date</div><div>Dr. M. Brandt, Head of Product Compliance<br>Signature</div></div>
     ${footer(product)}`,
  ]
}

/** Factory acceptance test report of one machine (instance document). */
export function testReport (product, instance) {
  const checks = ['Visual inspection and labelling', 'Protective earth continuity', 'Insulation resistance', 'Emergency stop circuit', 'Safety door interlocks', 'Functional test at nominal speed', `Output ${product.technical.Throughput ? `${product.technical.Throughput} units/h` : 'at nominal load'}`, 'Noise emission']
  return [
    `${header(product, `FAT-${instance.serial}`, 'Factory acceptance test')}
     <h1>Factory acceptance test report</h1>
     <div class="stamp">PASSED</div>
     <table><tr><th>Machine</th><td>${escape(product.title)}</td></tr><tr><th>Serial number</th><td>${escape(instance.serial)}</td></tr>
       <tr><th>Customer</th><td>${escape(instance.customer)}</td></tr><tr><th>Date of test</th><td>${escape(instance.date)}</td></tr></table>
     <h2>Results</h2>
     <table><tr><th>Test</th><th>Result</th></tr>${checks.map(check => `<tr><td>${escape(check)}</td><td class="pass">passed</td></tr>`).join('')}</table>
     <div class="sign"><div>Test engineer</div><div>Customer representative</div></div>
     ${footer(product)}`,
  ]
}
