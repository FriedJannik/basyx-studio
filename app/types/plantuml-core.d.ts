// Types of @plantuml/core (TeaVM build, no declarations of its own), as the
// BaSyx AAS Web UI declares them.
declare module '@plantuml/core' {
  export function render (lines: string[], targetId: string, options?: { dark?: boolean }): void
}

declare module '@plantuml/core/viz-global.js?url' {
  const url: string
  export default url
}
