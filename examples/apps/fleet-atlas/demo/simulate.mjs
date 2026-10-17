// Animates the operational data of the demo fleet (pnpm testenv:demo:live), so
// Fleet Atlas' live lens has something to show: every signal drifts around
// its normal value, and the main drive of the rotary filler slowly overheats,
// crosses its warning and alarm limits and cools down again.
//
//   node simulate.mjs [base URL, default http://localhost:18084] [interval ms, default 2000]

const baseUrl = (process.argv[2] ?? 'http://localhost:18084').replace(/\/$/, '')
const interval = Number(process.argv[3] ?? 2000)
const encode = id => Buffer.from(id).toString('base64url')

async function json (path, init) {
  const response = await fetch(`${baseUrl}${path}`, init)
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`)
  }
  return response.status === 204 ? null : response.json()
}

const signals = []
let cursor
do {
  const page = await json(`/submodels?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
  for (const submodel of page.result) {
    if (submodel.semanticId?.keys?.[0]?.value !== 'urn:basyx:studio:demo:OperationalData:1:0') {
      continue
    }
    for (const element of submodel.submodelElements ?? []) {
      const qualifier = type => Number(element.qualifiers?.find(entry => entry.type === type)?.value)
      const value = Number(element.value)
      const warn = qualifier('WarningAbove')
      signals.push({
        submodelId: submodel.id,
        idShort: element.idShort,
        // A value left above its warning limit (an earlier run's incident) is not normal.
        normal: Number.isFinite(warn) && value >= warn ? warn * 0.78 : value,
        warn,
        alarm: qualifier('AlarmAbove'),
        digits: String(element.value).split('.', 2)[1]?.length ?? 0,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }
  cursor = page.paging_metadata?.cursor
} while (cursor)

// The demo's incident: the winding temperature of the rotary filler's first motor.
const incident = signals.find(signal => signal.submodelId.endsWith('/rheinfeld-l1-filler-motor-ie4-1/operational-data') && signal.idShort === 'WindingTemperature')
console.info(`animating ${signals.length} signals every ${interval} ms; incident on ${incident?.submodelId ?? 'none'} (Ctrl+C stops)`)

let tick = 0
async function step () {
  tick++
  // A cycle of 200 s: normal for 20 s, heating up past warning and alarm for
  // 70 s, an alarm for 60 s, cooling down for 50 s.
  const cycle = (tick * interval / 1000) % 200
  let heat = 1
  if (cycle < 20) {
    heat = 0
  } else if (cycle < 90) {
    heat = (cycle - 20) / 70
  } else if (cycle >= 150) {
    heat = Math.max(0, 1 - (cycle - 150) / 50)
  }
  await Promise.all(signals.map(async signal => {
    let value = signal.normal * (1 + 0.04 * Math.sin(tick / 6 + signal.phase) + 0.015 * (Math.random() - 0.5))
    if (signal === incident) {
      value = signal.normal + heat * (signal.alarm + 6 - signal.normal)
    }
    const path = `/submodels/${encode(signal.submodelId)}/submodel-elements/${signal.idShort}/$value`
    await json(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value.toFixed(signal.digits)) })
      .catch(error => console.warn(error.message))
  }))
}

for (;;) {
  const started = Date.now()
  await step()
  await new Promise(resolve => setTimeout(resolve, Math.max(0, interval - (Date.now() - started))))
}
