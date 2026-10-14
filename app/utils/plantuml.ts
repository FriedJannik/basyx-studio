// Renders PlantUML in the browser with @plantuml/core (MVP-4 plan, T2),
// ported from the BaSyx AAS Web UI (aas-web-ui/src/utils/AAS/PlantUMLRenderer.ts
// and the SVG sanitizing of SubmodelElementUMLView.vue at 1a5b5557,
// https://github.com/eclipse-basyx/basyx-aas-web-ui), © the Eclipse BaSyx
// Authors, MIT License. The engine (7.8 MB) and its Graphviz runtime are
// loaded on first use only.

type PlantUmlRender = (lines: string[], targetId: string, options?: { dark?: boolean }) => void
type GlobalWithViz = typeof globalThis & { Viz?: { instance?: unknown } }

// SVG namespace identifiers use http by specification; this is not a network URL.
// eslint-disable-next-line unicorn/prefer-https
const svgNamespace = 'http://www.w3.org/2000/svg'
const renderTimeoutMs = 15_000

let corePromise: Promise<{ render: PlantUmlRender }> | null = null
let vizPromise: Promise<void> | null = null
let renderCounter = 0

/** The SVG of a PlantUML source, sanitized: no scripts, event handlers or external links. */
export async function renderPlantUmlToSvg (source: string): Promise<string> {
  const { render } = await loadCore()
  return sanitizeSvg(await renderToHiddenTarget(render, source.split(/\r\n|\r|\n/)))
}

async function loadCore () {
  await loadViz()
  corePromise ??= import('@plantuml/core')
  return corePromise
}

function hasViz (): boolean {
  return typeof (globalThis as GlobalWithViz).Viz?.instance === 'function'
}

/** PlantUML expects Graphviz as the global `Viz`, which its classic script provides. */
async function loadViz (): Promise<void> {
  if (hasViz()) {
    return
  }
  const url = (await import('@plantuml/core/viz-global.js?url')).default
  vizPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.async = true
    script.src = url
    script.addEventListener('load', () => (hasViz() ? resolve() : reject(new Error('The PlantUML Graphviz runtime did not initialize.'))), { once: true })
    script.addEventListener('error', () => reject(new Error('The PlantUML Graphviz runtime could not be loaded.')), { once: true })
    document.head.append(script)
  })
  return vizPromise
}

function isPlantUmlIssue (error: unknown, fileName = '', message = ''): boolean {
  const text = [message, fileName, error instanceof Error ? `${error.message}\n${error.stack}` : '', typeof error === 'string' ? error : ''].join('\n')
  return /plantuml|viz-global|\$jsException/i.test(text)
}

/** Renders into a hidden element, which the engine requires, and returns the SVG once it appears. */
function renderToHiddenTarget (render: PlantUmlRender, lines: string[]): Promise<string> {
  const target = document.createElement('div')
  target.id = `plantuml-render-${Date.now()}-${renderCounter++}`
  target.hidden = true
  document.body.append(target)

  return new Promise((resolve, reject) => {
    let settled = false
    const onError = (event: ErrorEvent) => {
      if (isPlantUmlIssue(event.error, event.filename, event.message)) {
        event.preventDefault()
        fail(new Error(event.message || 'PlantUML rendering failed.'))
      }
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isPlantUmlIssue(event.reason)) {
        event.preventDefault()
        fail(event.reason)
      }
    }
    const cleanup = () => {
      settled = true
      clearTimeout(timeout)
      observer.disconnect()
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      target.remove()
    }
    function fail (error: unknown) {
      if (!settled) {
        cleanup()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
    const read = () => {
      const svg = target.querySelector('svg')
      if (svg && !settled) {
        if (!svg.getAttribute('xmlns')) {
          svg.setAttribute('xmlns', svgNamespace)
        }
        const text = new XMLSerializer().serializeToString(svg)
        cleanup()
        resolve(text)
      }
    }
    const observer = new MutationObserver(read)
    const timeout = setTimeout(() => fail(new Error('PlantUML rendering timed out.')), renderTimeoutMs)
    observer.observe(target, { childList: true, subtree: true })
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    try {
      render(lines, target.id)
      read()
    } catch (error) {
      fail(error)
    }
  })
}

function isExternalLink (name: string, value: string): boolean {
  return ['href', 'xlink:href'].includes(name) && !value.startsWith('#')
}

/** Removes active content and external references from an SVG, and fixes its text style. */
export function sanitizeSvg (svg: string): string {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (document.querySelector('parsererror')) {
    return ''
  }
  for (const element of document.querySelectorAll('script, foreignObject, iframe, object, embed')) {
    element.remove()
  }
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || isExternalLink(name, attribute.value.trim())) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  const style = document.createElementNS(svgNamespace, 'style')
  style.textContent = 'text { font-family: Arial, Helvetica, sans-serif !important; font-size: 13px !important; }'
  document.documentElement.prepend(style)
  return new XMLSerializer().serializeToString(document.documentElement)
}
