import type { StackComponentId } from '#shared/contract'

// The only images and components Studio starts (ADR 0033). The digests are
// the ones this Studio was tested with (`tested` channel); `latest` uses the
// tag. Update both with a Studio release after running the container
// integration test (test/integration/containers.test.ts).

export interface CatalogImage {
  repository: string
  tag: string
  digest: string
  /** Approximate compressed download in MB, for the review step. */
  downloadMb: number
}

export const catalogImages = {
  postgres: { repository: 'docker.io/library/postgres', tag: '18', digest: 'sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336', downloadMb: 160 },
  keycloak: { repository: 'docker.io/keycloak/keycloak', tag: '26.8.0', digest: 'sha256:27b3230fbabb8c9ff3c66c864cf09dcd8a41aca82e5100679d109ef0eeb05741', downloadMb: 280 },
  configuration: { repository: 'docker.io/eclipsebasyx/basyxconfigurationservice-go', tag: 'SNAPSHOT', digest: 'sha256:feb4bf67c326fa0feca0f04f20425219cbfde326446f3eaf0da61947dafc50ed', downloadMb: 30 },
  environment: { repository: 'docker.io/eclipsebasyx/aasenvironment-go', tag: 'SNAPSHOT', digest: 'sha256:180751fc46276d9e4a5e5951aff14a07a0c711d87af3cb3eeb29c90f35601d91', downloadMb: 45 },
  aasRegistry: { repository: 'docker.io/eclipsebasyx/aasregistry-go', tag: 'SNAPSHOT', digest: 'sha256:ec2a0df6387de2d77da29a495da3f8fd7403e49c0d390fb5e4ec1c11220c4a5a', downloadMb: 38 },
  submodelRegistry: { repository: 'docker.io/eclipsebasyx/submodelregistry-go', tag: 'SNAPSHOT', digest: 'sha256:f5ac3751f4288d2c08c9ac9bfc3fbcfcc896fbf19482757f66c8b2bd172d1900', downloadMb: 38 },
  discovery: { repository: 'docker.io/eclipsebasyx/aasdiscovery-go', tag: 'SNAPSHOT', digest: 'sha256:fc3df7b3ce291199d82943ab8a90b7036b39f8cd47a5038dcb12e179fa31b5f3', downloadMb: 33 },
} satisfies Record<string, CatalogImage>

export type CatalogImageId = keyof typeof catalogImages

/** The image each component runs. */
export const componentImages: Record<StackComponentId, CatalogImageId> = {
  database: 'postgres',
  schema: 'configuration',
  keycloak: 'keycloak',
  environment: 'environment',
  aasRegistry: 'aasRegistry',
  submodelRegistry: 'submodelRegistry',
  discovery: 'discovery',
}

/** The executable of each BaSyx Go component; their images default to a config file Studio does not provide. */
export const basyxCommands: Partial<Record<StackComponentId, string[]>> = {
  schema: ['/app/basyxconfigurationservice'],
  environment: ['/app/aasenvironmentservice'],
  aasRegistry: ['/app/aasregistryservice'],
  submodelRegistry: ['/app/submodelregistryservice'],
  discovery: ['/app/discoveryservice'],
}

/** Components that keep running (the schema setup exits when done). */
export const longRunning: readonly StackComponentId[] = ['database', 'keycloak', 'environment', 'aasRegistry', 'submodelRegistry', 'discovery']

/** BaSyx Go services that answer `/description`. */
export const basyxServices: readonly StackComponentId[] = ['environment', 'aasRegistry', 'submodelRegistry', 'discovery']

/** `repository@digest` for `tested`, `repository:tag` for `latest`. */
export function imageReference (image: CatalogImage, channel: 'tested' | 'latest'): string {
  return channel === 'tested' ? `${image.repository}@${image.digest}` : `${image.repository}:${image.tag}`
}

/** The port inside the container. */
export const containerPorts: Partial<Record<StackComponentId, number>> = {
  keycloak: 8080,
  environment: 5004,
  aasRegistry: 5004,
  submodelRegistry: 5004,
  discovery: 5004,
}
