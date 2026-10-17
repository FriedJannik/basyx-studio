import type { StackComponentId, StackSpec, StackUrls } from '#shared/contract'
import type { CreateContainerConfig } from './engine'
import type { StackSecrets } from './security'
import { componentPortOffsets } from '#shared/contract'
import { basyxCommands, catalogImages, componentImages, containerPorts, imageReference } from './catalog'
import { accessRules, issuerOf, keycloakAdminUser, realmDocument, rebacAdministrators, trustList } from './security'

// Turns a stack spec into networks, volumes and containers (ADR 0033). The
// same plan drives the engine (containers, archive uploads) and the export
// (compose file, config folder), so both start the same thing.

export const stackLabel = 'org.eclipse.basyx.studio.stack'
export const componentLabel = 'org.eclipse.basyx.studio.component'
export const nameLabel = 'org.eclipse.basyx.studio.name'

/** Hostnames inside the stack's network. */
export const serviceNames: Record<StackComponentId, string> = {
  database: 'database',
  schema: 'schema',
  keycloak: 'keycloak',
  environment: 'environment',
  aasRegistry: 'aas-registry',
  submodelRegistry: 'submodel-registry',
  discovery: 'discovery',
}

const databaseUser = 'basyx'
const databaseName = 'basyx'

/** Secret values are referenced by name, so the export can move them to `.env`. */
export type EnvValue = string | { secret: 'POSTGRES_PASSWORD' | 'KEYCLOAK_ADMIN_PASSWORD' }

/** A file copied into the container: generated text, or an AASX file the user chose. */
export interface PlannedFile {
  /** An existing directory of the image; the archive is extracted there. */
  directory: string
  /** Path below `directory`. */
  path: string
  content: { kind: 'text', text: string } | { kind: 'aasx', name: string }
  /** Path of the file in an export, below its root. */
  exportPath: string
}

export interface PlannedContainer {
  component: StackComponentId
  name: string
  image: string
  command: string[] | null
  env: Record<string, EnvValue>
  port: { host: number, container: number, hostIp: string } | null
  volume: { name: string, target: string } | null
  files: PlannedFile[]
  healthcheck: { test: string[], intervalSeconds: number, retries: number } | null
  restart: 'no' | 'unless-stopped'
  dependsOn: Array<{ component: StackComponentId, condition: 'service_healthy' | 'service_completed_successfully' | 'service_started' }>
}

export interface StackIdentity {
  id: string
  /** Lowercase slug of the name, used in container names. */
  slug: string
}

export interface StackDetails {
  network: string
  volumes: string[]
  containers: PlannedContainer[]
  urls: StackUrls
  labels: Record<string, string>
}

/** `Demo Line!` → `demo-line`; never empty. */
export function slugOf (name: string): string {
  const slug = name.toLowerCase().normalize('NFKD').replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '')
  return slug || 'basyx'
}

/** The components a spec runs, in start order. */
export function componentsOf (spec: StackSpec): StackComponentId[] {
  const components: StackComponentId[] = ['database', 'schema']
  if (spec.security.mode === 'keycloak') {
    components.push('keycloak')
  }
  components.push('environment')
  if (spec.topology === 'separate') {
    components.push('aasRegistry', 'submodelRegistry', 'discovery')
  }
  return components
}

export function portOf (spec: StackSpec, component: StackComponentId): number | null {
  const offset = componentPortOffsets[component]
  return offset === undefined || spec.network.basePort === null ? null : spec.network.basePort + offset
}

/** The ports a spec publishes; empty until its base port is set. */
export function portsOf (spec: StackSpec): number[] {
  return componentsOf(spec).map(component => portOf(spec, component)).filter((port): port is number => port !== null)
}

export function urlsOf (spec: StackSpec): StackUrls {
  const url = (component: StackComponentId) => {
    const port = componentsOf(spec).includes(component) ? portOf(spec, component) : null
    return port === null ? null : `http://127.0.0.1:${port}`
  }
  return {
    environment: url('environment'),
    aasRegistry: url('aasRegistry'),
    submodelRegistry: url('submodelRegistry'),
    discovery: url('discovery'),
    keycloak: url('keycloak'),
  }
}

/** With separate registries, the repositories must keep them filled. */
export function normalizeSpec (spec: StackSpec): StackSpec {
  return spec.topology === 'separate' ? { ...spec, features: { ...spec.features, registrySync: true } } : spec
}

function json (value: unknown): { kind: 'text', text: string } {
  return { kind: 'text', text: `${JSON.stringify(value, null, 2)}\n` }
}

export function planStack (identity: StackIdentity, input: StackSpec, secrets: StackSecrets): StackDetails {
  const spec = normalizeSpec(input)
  if (spec.network.basePort === null) {
    throw new Error('The stack has no ports yet.')
  }
  const prefix = `basyx-${identity.id}`
  const network = prefix
  const labels = { [stackLabel]: identity.id, [nameLabel]: spec.name }
  const components = componentsOf(spec)
  const secured = spec.security.mode === 'keycloak'
  const keycloakPort = portOf(spec, 'keycloak')
  const hostIp = spec.network.exposure === 'local' ? '127.0.0.1' : '0.0.0.0'
  const restart = spec.restart === 'always' ? 'unless-stopped' : 'no'
  const databaseVolume = spec.persistence === 'keep' ? `${prefix}-database` : null

  const database: Record<string, EnvValue> = {
    POSTGRES_HOST: serviceNames.database,
    POSTGRES_PORT: '5432',
    POSTGRES_USER: databaseUser,
    POSTGRES_PASSWORD: { secret: 'POSTGRES_PASSWORD' },
    POSTGRES_DBNAME: databaseName,
  }
  const security: Record<string, EnvValue> = secured && keycloakPort !== null
    ? {
        ABAC_ENABLED: 'true',
        ABAC_MODELPATH: '/security/access-rules.json',
        ABAC_POLICY_FILE_IMPORT: 'always',
        OIDC_TRUSTLISTPATH: '/security/trustlist.json',
        ...(spec.security.mode === 'keycloak' && spec.security.access === 'sharing'
          ? { REBAC_ENABLED: 'true', REBAC_ADMINISTRATORS: rebacAdministrators(keycloakPort) }
          : {}),
      }
    : { ABAC_ENABLED: 'false' }
  const securityFiles: PlannedFile[] = secured && keycloakPort !== null && spec.security.mode === 'keycloak'
    ? [
        { directory: '/', path: 'security/trustlist.json', content: json(trustList(keycloakPort)), exportPath: 'config/security/trustlist.json' },
        { directory: '/', path: 'security/access-rules.json', content: json(accessRules(spec.security.access)), exportPath: 'config/security/access-rules.json' },
      ]
    : []
  const afterSetup: PlannedContainer['dependsOn'] = [
    { component: 'schema', condition: 'service_completed_successfully' },
    ...(secured ? [{ component: 'keycloak' as const, condition: 'service_started' as const }] : []),
  ]

  const containers: PlannedContainer[] = []
  for (const component of components) {
    const catalog = catalogImages[componentImages[component]]
    const image = spec.images.digests?.[component] ? `${catalog.repository}@${spec.images.digests[component]}` : imageReference(catalog, spec.images.channel)
    const hostPort = portOf(spec, component)
    const containerPort = containerPorts[component]
    const base: PlannedContainer = {
      component,
      name: `${prefix}-${serviceNames[component]}`,
      image,
      command: basyxCommands[component] ?? null,
      env: {},
      port: hostPort !== null && containerPort !== undefined ? { host: hostPort, container: containerPort, hostIp } : null,
      volume: null,
      files: [],
      healthcheck: null,
      restart,
      dependsOn: [],
    }
    switch (component) {
      case 'database': {
        containers.push({
          ...base,
          env: { POSTGRES_USER: databaseUser, POSTGRES_PASSWORD: { secret: 'POSTGRES_PASSWORD' }, POSTGRES_DB: databaseName },
          // PostgreSQL 18 keeps its data in a versioned folder below this path.
          volume: databaseVolume ? { name: databaseVolume, target: '/var/lib/postgresql' } : null,
          healthcheck: { test: ['CMD-SHELL', `pg_isready -U ${databaseUser} -d ${databaseName}`], intervalSeconds: 2, retries: 60 },
        })
        break
      }
      case 'schema': {
        containers.push({ ...base, env: database, restart: 'no', dependsOn: [{ component: 'database', condition: 'service_healthy' }] })
        break
      }
      case 'keycloak': {
        containers.push({
          ...base,
          command: ['start-dev', '--import-realm'],
          env: {
            KC_BOOTSTRAP_ADMIN_USERNAME: keycloakAdminUser,
            KC_BOOTSTRAP_ADMIN_PASSWORD: { secret: 'KEYCLOAK_ADMIN_PASSWORD' },
            KC_HOSTNAME: `http://127.0.0.1:${keycloakPort}`,
            KC_HOSTNAME_BACKCHANNEL_DYNAMIC: 'true',
            KC_HTTP_ENABLED: 'true',
            KC_HEALTH_ENABLED: 'true',
          },
          files: [{ directory: '/opt/keycloak/data', path: 'import/realm.json', content: json(realmDocument(secrets.users)), exportPath: 'config/keycloak/realm.json' }],
        })
        break
      }
      case 'environment': {
        const port = portOf(spec, 'environment')
        const env: Record<string, EnvValue> = {
          ...database,
          SERVER_PORT: '5004',
          ...security,
          GENERAL_AASREGISTRYINTEGRATION: String(spec.features.registrySync),
          GENERAL_SUBMODELREGISTRYINTEGRATION: String(spec.features.registrySync),
          GENERAL_DISCOVERYINTEGRATION: String(spec.features.discoverySync),
          GENERAL_EXTERNALURL: `http://127.0.0.1:${port}`,
          ...(spec.features.history ? { BASYX_HISTORY_MODE: 'api' } : {}),
          BASYX_EVENTING_FEED_ENABLED: String(spec.features.eventFeed),
          ...(spec.aasxFiles.length > 0 ? { GENERAL_AAS_PRECONFIG_PATHS: '/app/preconfiguration' } : {}),
        }
        const aasx: PlannedFile[] = spec.aasxFiles.map(name => ({ directory: '/app', path: `preconfiguration/${name}`, content: { kind: 'aasx', name }, exportPath: `aasx/${name}` }))
        containers.push({ ...base, env, files: [...securityFiles, ...aasx], dependsOn: afterSetup })
        break
      }
      default: {
        containers.push({ ...base, env: { ...database, SERVER_PORT: '5004', ...security }, files: securityFiles, dependsOn: afterSetup })
      }
    }
  }

  return {
    network,
    volumes: databaseVolume ? [databaseVolume] : [],
    containers,
    urls: urlsOf(spec),
    labels,
  }
}

export function resolveEnv (env: Record<string, EnvValue>, secrets: StackSecrets): string[] {
  return Object.entries(env).map(([key, value]) => {
    if (typeof value === 'string') {
      return `${key}=${value}`
    }
    return `${key}=${value.secret === 'POSTGRES_PASSWORD' ? secrets.databasePassword : (secrets.keycloakAdminPassword ?? '')}`
  })
}

/** The engine's create request for a planned container. */
export function containerConfig (details: StackDetails, container: PlannedContainer, secrets: StackSecrets, slug: string): CreateContainerConfig {
  const portKey = container.port ? `${container.port.container}/tcp` : null
  return {
    Image: container.image,
    ...(container.command ? { Cmd: container.command } : {}),
    Env: resolveEnv(container.env, secrets),
    Labels: {
      ...details.labels,
      [componentLabel]: container.component,
      // Docker Desktop groups containers by these labels.
      'com.docker.compose.project': `basyx-${slug}`,
      'com.docker.compose.service': serviceNames[container.component],
    },
    ...(portKey ? { ExposedPorts: { [portKey]: {} } } : {}),
    ...(container.healthcheck
      ? { Healthcheck: { Test: container.healthcheck.test, Interval: container.healthcheck.intervalSeconds * 1e9, Timeout: 5e9, Retries: container.healthcheck.retries } }
      : {}),
    HostConfig: {
      ...(portKey && container.port ? { PortBindings: { [portKey]: [{ HostIp: container.port.hostIp, HostPort: String(container.port.host) }] } } : {}),
      RestartPolicy: { Name: container.restart },
      ...(container.volume ? { Mounts: [{ Type: 'volume' as const, Source: container.volume.name, Target: container.volume.target }] } : {}),
      NetworkMode: details.network,
    },
    NetworkingConfig: { EndpointsConfig: { [details.network]: { Aliases: [serviceNames[container.component]] } } },
  }
}

/** The issuer of a secured spec, `null` without Keycloak. */
export function issuerOfSpec (spec: StackSpec): string | null {
  const port = spec.security.mode === 'keycloak' ? portOf(spec, 'keycloak') : null
  return port === null ? null : issuerOf(port)
}
