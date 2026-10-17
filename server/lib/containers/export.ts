import type { StackSpec } from '#shared/contract'
import type { EnvValue, PlannedContainer, StackDetails } from './plan'
import type { StackSecrets } from './security'
import { dirname, posix } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { basyxServices } from './catalog'
import { serviceNames } from './plan'
import { keycloakAdminUser } from './security'

// Export of a stack as a compose project (plan X1, X2): the same images,
// environment and ports as the engine runs, with the generated files in
// `config/` and `aasx/` mounted read-only, and the secrets in `.env`.

type Yaml = string | number | boolean | null | Yaml[] | { [key: string]: Yaml }

const plainScalar = /^[\w./-]+$/

function scalar (value: string | number | boolean | null): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value !== 'string') {
    return String(value)
  }
  // Values that YAML would read as another type, or with special characters, are quoted.
  return plainScalar.test(value) && !/^(?:true|false|yes|no|on|off|null|~|[\d.]+)$/i.test(value) ? value : JSON.stringify(value)
}

/** A small YAML writer for the compose file: maps, lists and scalars. */
export function toYaml (value: Yaml, indent = 0): string {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${pad}[]\n`
    }
    return value.map(item => (item !== null && typeof item === 'object')
      ? `${pad}-\n${toYaml(item, indent + 2)}`
      : `${pad}- ${scalar(item)}\n`).join('')
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => {
      if (item !== null && typeof item === 'object' && (Array.isArray(item) ? item.length > 0 : Object.keys(item).length > 0)) {
        return `${pad}${scalar(key)}:\n${toYaml(item, indent + 2)}`
      }
      if (item !== null && typeof item === 'object') {
        return `${pad}${scalar(key)}: ${Array.isArray(item) ? '[]' : '{}'}\n`
      }
      return `${pad}${scalar(key)}: ${scalar(item)}\n`
    }).join('')
  }
  return `${pad}${scalar(value)}\n`
}

function envValue (value: EnvValue): string {
  return typeof value === 'string' ? value : `\${${value.secret}}`
}

/** Bind mounts for a container's files: one folder per target directory. */
function mountsOf (container: PlannedContainer): string[] {
  const mounts = new Map<string, string>()
  for (const file of container.files) {
    const target = posix.join(file.directory, posix.dirname(file.path))
    mounts.set(target, `./${dirname(file.exportPath)}:${target}:ro`)
  }
  return [...mounts.values()]
}

export function composeFile (details: StackDetails, spec: StackSpec, slug: string, hasDatabase = false): string {
  const services: Record<string, Yaml> = {}
  const volumes: Record<string, Yaml> = {}
  for (const container of details.containers) {
    const service: Record<string, Yaml> = { image: container.image }
    if (container.command) {
      service.command = container.command
    }
    if (Object.keys(container.env).length > 0) {
      service.environment = Object.fromEntries(Object.entries(container.env).map(([key, value]) => [key, envValue(value)]))
    }
    if (container.port) {
      service.ports = [`${container.port.hostIp}:${container.port.host}:${container.port.container}`]
    }
    const mounts = mountsOf(container)
    if (container.volume) {
      const name = serviceNames[container.component]
      volumes[name] = {}
      mounts.unshift(`${name}:${container.volume.target}`)
    }
    if (mounts.length > 0) {
      service.volumes = mounts
    }
    if (container.healthcheck) {
      service.healthcheck = {
        test: container.healthcheck.test,
        interval: `${container.healthcheck.intervalSeconds}s`,
        timeout: '5s',
        retries: container.healthcheck.retries,
      }
    }
    if (container.dependsOn.length > 0) {
      service.depends_on = Object.fromEntries(container.dependsOn.map(dependency => [serviceNames[dependency.component], { condition: dependency.condition }]))
    }
    service.restart = container.restart
    // BaSyx services need Keycloak's realm when they start; compose cannot
    // wait for it, so they retry until it answers.
    if (container.restart === 'no' && spec.security.mode === 'keycloak' && basyxServices.includes(container.component)) {
      service.restart = 'on-failure'
    }
    services[serviceNames[container.component]] = service
  }
  if (hasDatabase) {
    const database = details.containers.find(container => container.component === 'database')!
    services['database-restore'] = {
      image: database.image,
      command: ['sh', '-ec', 'if [ ! -f /restore-state/done ]; then pg_restore --host=database --username=basyx --dbname=basyx --clean --if-exists --no-owner --no-privileges --exit-on-error /backup/database.dump; touch /restore-state/done; fi'],
      environment: { PGPASSWORD: '${POSTGRES_PASSWORD}' },
      volumes: ['./data/database.dump:/backup/database.dump:ro', 'restore-state:/restore-state'],
      depends_on: { database: { condition: 'service_healthy' } },
      restart: 'no',
    }
    volumes['restore-state'] = {}
    const schema = services.schema as Record<string, Yaml>
    schema.depends_on = { 'database-restore': { condition: 'service_completed_successfully' } }
  }
  const document: Record<string, Yaml> = { name: `basyx-${slug}`, services }
  if (Object.keys(volumes).length > 0) {
    document.volumes = volumes
  }
  // JSON quoting keeps the name on its comment line, whatever it contains.
  return `# BaSyx instance ${JSON.stringify(spec.name)}, exported from BaSyx Studio.\n# Start: docker compose up -d   (or: podman compose up -d)\n${toYaml(document)}`
}

export function envFile (secrets: StackSecrets): string {
  const lines = [
    '# Passwords generated by BaSyx Studio for this instance. Keep this file private.',
    `POSTGRES_PASSWORD=${secrets.databasePassword}`,
  ]
  if (secrets.keycloakAdminPassword) {
    lines.push(`KEYCLOAK_ADMIN_PASSWORD=${secrets.keycloakAdminPassword}`)
  }
  return `${lines.join('\n')}\n`
}

export function readme (details: StackDetails, spec: StackSpec, secrets: StackSecrets): string {
  const lines = [
    `# BaSyx instance ${JSON.stringify(spec.name)}`,
    '',
    'Exported from BaSyx Studio. It runs the same BaSyx Go services as in Studio.',
    '',
    '## Start',
    '',
    'You need Docker Desktop or Podman Desktop. In this folder, run:',
    '',
    '```bash',
    'docker compose up -d',
    '```',
    '',
    'or, with Podman:',
    '',
    '```bash',
    'podman compose up -d',
    '```',
    '',
    'The export contains a consistent database snapshot, including changes made in Studio.',
    'It also contains passwords and private data. Share it only with trusted people.',
    'The database snapshot is restored once, tracked by the restore-state volume.',
    'Keep that volume with the database; docker compose down -v removes both.',
    '',
    'The first start downloads the images and takes a few minutes. Stop with',
    '`docker compose down`; add `-v` to delete the data as well.',
    '',
    '## Addresses',
    '',
  ]
  const urls = details.urls
  const entries: Array<[string, string | null]> = [
    ['AAS environment (repositories)', urls.environment],
    ['AAS registry', urls.aasRegistry],
    ['Submodel registry', urls.submodelRegistry],
    ['Discovery', urls.discovery],
    ['Sign-in (Keycloak)', urls.keycloak],
  ]
  for (const [label, url] of entries) {
    if (url) {
      lines.push(`- ${label}: <${url}>`)
    }
  }
  if (spec.security.mode === 'keycloak') {
    lines.push(
      '',
      '## Sign-in',
      '',
      'Users of the realm `basyx` (passwords are also in `config/keycloak/realm.json`):',
      '',
      '| User | Role | Password |',
      '| --- | --- | --- |',
      ...secrets.users.map(user => `| \`${user.username}\` | ${user.role} | \`${user.password}\` |`),
      '',
      `Keycloak's administrator is \`${keycloakAdminUser}\`; the password is in \`.env\`.`,
      spec.security.access === 'sharing'
        ? 'Access follows ownership (ReBAC): users own what they create and share it with others; `admin` sees everything.'
        : 'Access follows roles (ABAC): `admin` may change everything, `viewer` may read.',
    )
  }
  lines.push(
    '',
    '## Files',
    '',
    '- `docker-compose.yml`: the services',
    '- `.env`: generated passwords; keep it private',
    '- `config/`: sign-in and access rules',
    '- `aasx/`: AASX files loaded at startup',
    '- `basyx-stack.json`: the settings, for importing into BaSyx Studio',
    '',
  )
  return lines.join('\n')
}

/** The export ZIP. `aasx` maps file names to their content. */
export function exportArchive (details: StackDetails, spec: StackSpec, secrets: StackSecrets, slug: string, aasx: Map<string, Uint8Array>, database?: Uint8Array): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'docker-compose.yml': strToU8(composeFile(details, spec, slug, Boolean(database))),
    '.env': strToU8(envFile(secrets)),
    'README.md': strToU8(readme(details, spec, secrets)),
    'basyx-stack.json': strToU8(`${JSON.stringify(spec, null, 2)}\n`),
  }
  if (database) {
    entries['data/database.dump'] = database
  }
  for (const container of details.containers) {
    for (const file of container.files) {
      if (file.content.kind === 'text') {
        entries[file.exportPath] = strToU8(file.content.text)
      } else {
        const content = aasx.get(file.content.name)
        if (content) {
          entries[file.exportPath] = content
        }
      }
    }
  }
  const root = `basyx-${slug}`
  return zipSync(Object.fromEntries(Object.entries(entries).map(([path, content]) => [`${root}/${path}`, content])))
}
