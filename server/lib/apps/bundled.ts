const retiredBundledAppPackages = new Set(['basyx-docker.zip'])

/** Retired packages can remain in incremental build output and must never be reinstalled. */
export function isRetiredBundledAppPackage (name: string): boolean {
  return retiredBundledAppPackages.has(name.split('/').at(-1) ?? name)
}
