import type { StackAccessModel, StackSignIn } from '#shared/contract'
import { randomInt, randomUUID } from 'node:crypto'

// Keycloak realm, BaSyx trust list and ABAC rules of a secured stack
// (presets P3–P5 of the BaSyx Docker plan). Studio on the host and the
// containers use one issuer, `http://127.0.0.1:<port>/realms/basyx`: Keycloak
// derives its back-channel URLs from the request (`hostname-backchannel-
// dynamic`), so BaSyx fetches the keys from `keycloak:8080` inside the
// stack's network.

export const realmName = 'basyx'
export const studioClientId = 'basyx-studio'
export const apiAudience = 'basyx-api'
export const keycloakAdminUser = 'kcadmin'

/** A user of the stack's realm; the fixed ID keeps ReBAC ownership when Keycloak is recreated. */
export type StackUser = StackSignIn['users'][number] & { id: string }

export interface StackSecrets {
  databasePassword: string
  /** Secured stacks only. */
  keycloakAdminPassword: string | null
  users: StackUser[]
}

const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'

/** A password people can type: three groups of four characters. */
export function generatePassword (): string {
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('')
  return `${group()}-${group()}-${group()}`
}

/** The users of a secured stack: an administrator and one or two people. */
export function defaultUsers (access: StackAccessModel): StackUser[] {
  const user = (username: string, role: StackUser['role']): StackUser => ({ id: randomUUID(), username, password: generatePassword(), role })
  return access === 'roles'
    ? [user('admin', 'admin'), user('viewer', 'viewer')]
    : [user('admin', 'admin'), user('alice', 'user'), user('bob', 'user')]
}

export function generateSecrets (access: StackAccessModel | null): StackSecrets {
  return {
    databasePassword: generatePassword(),
    keycloakAdminPassword: access ? generatePassword() : null,
    users: access ? defaultUsers(access) : [],
  }
}

export function issuerOf (keycloakPort: number): string {
  return `http://127.0.0.1:${keycloakPort}/realms/${realmName}`
}

const roleOf: Record<StackUser['role'], string> = {
  admin: 'basyx-admin',
  viewer: 'basyx-viewer',
  user: 'basyx-user',
}

function capitalized (value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** The realm Keycloak imports at its first start. */
export function realmDocument (users: StackUser[]): Record<string, unknown> {
  const accessTokenOnly = { 'access.token.claim': 'true', 'id.token.claim': 'false', 'userinfo.token.claim': 'false', 'introspection.token.claim': 'true' }
  return {
    realm: realmName,
    enabled: true,
    registrationAllowed: false,
    roles: { realm: Object.values(roleOf).map(name => ({ name })) },
    groups: [{ name: 'operators' }],
    clientScopes: [
      {
        name: 'basyx',
        protocol: 'openid-connect',
        attributes: { 'include.in.token.scope': 'false' },
        protocolMappers: [
          { name: 'roles', protocol: 'openid-connect', protocolMapper: 'oidc-usermodel-realm-role-mapper', config: { 'multivalued': 'true', 'claim.name': 'roles', 'jsonType.label': 'String', ...accessTokenOnly } },
          { name: 'groups', protocol: 'openid-connect', protocolMapper: 'oidc-group-membership-mapper', config: { 'full.path': 'false', 'claim.name': 'groups', ...accessTokenOnly } },
          { name: 'audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper', config: { 'included.custom.audience': apiAudience, 'access.token.claim': 'true', 'id.token.claim': 'false', 'introspection.token.claim': 'true' } },
        ],
      },
      { name: 'profile', protocol: 'openid-connect', protocolMappers: [
        { name: 'username', protocol: 'openid-connect', protocolMapper: 'oidc-usermodel-attribute-mapper', config: { 'user.attribute': 'username', 'claim.name': 'preferred_username', 'jsonType.label': 'String', 'access.token.claim': 'true', 'id.token.claim': 'true', 'userinfo.token.claim': 'true' } },
        { name: 'full name', protocol: 'openid-connect', protocolMapper: 'oidc-full-name-mapper', config: { 'access.token.claim': 'true', 'id.token.claim': 'true', 'userinfo.token.claim': 'true' } },
      ] },
      { name: 'email', protocol: 'openid-connect' },
      { name: 'basic', protocol: 'openid-connect', protocolMappers: [
        { name: 'sub', protocol: 'openid-connect', protocolMapper: 'oidc-sub-mapper', config: { 'access.token.claim': 'true', 'introspection.token.claim': 'true' } },
      ] },
    ],
    defaultDefaultClientScopes: ['basyx', 'profile', 'email', 'basic'],
    clients: [{
      clientId: studioClientId,
      name: 'BaSyx Studio',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      // Keycloak accepts any port for loopback redirect URIs (RFC 8252, 7.3).
      redirectUris: ['http://127.0.0.1/api/studio/v1/auth/callback', 'http://localhost/api/studio/v1/auth/callback'],
      webOrigins: ['+'],
      attributes: { 'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': '+' },
      defaultClientScopes: ['basyx', 'profile', 'email', 'basic'],
    }],
    users: users.map(user => ({
      id: user.id,
      username: user.username,
      enabled: true,
      emailVerified: true,
      firstName: capitalized(user.username),
      lastName: 'BaSyx',
      email: `${user.username}@basyx.local`,
      credentials: [{ type: 'password', value: user.password, temporary: false }],
      realmRoles: [roleOf[user.role]],
      groups: user.role === 'admin' ? ['/operators'] : [],
    })),
  }
}

/** The BaSyx trust list: the stack's issuer, its keys fetched inside the network. */
export function trustList (keycloakPort: number): unknown[] {
  return [{
    issuer: issuerOf(keycloakPort),
    audience: apiAudience,
    discoveryUrl: `http://keycloak:8080/realms/${realmName}/.well-known/openid-configuration`,
  }]
}

/** ReBAC administrators: the `operators` group of the stack's realm. */
export function rebacAdministrators (keycloakPort: number): string {
  return `${issuerOf(keycloakPort)}|group:operators`
}

const apiRoutes = [
  '/shells', '/shells/*', '/submodels', '/submodels/*', '/concept-descriptions', '/concept-descriptions/*',
  '/shell-descriptors', '/shell-descriptors/*', '/submodel-descriptors', '/submodel-descriptors/*',
  '/lookup/*', '/query/*', '/upload', '/serialization', '/packages', '/packages/*',
  '/events', '/.well-known/*', '/security/*',
]

function hasRole (role: string) {
  return { $contains: [{ $attribute: { CLAIMPATH: '/roles' } }, { $strVal: role }] }
}

/**
 * ABAC rules. Everyone may read `/description` (Studio probes it). `roles`:
 * administrators may do everything, viewers read. `sharing`: administrators
 * may do everything, users may create; ReBAC makes them owners of what they
 * create and lets them share it.
 */
export function accessRules (access: StackAccessModel): Record<string, unknown> {
  const userRule = access === 'roles'
    ? { USEACL: 'read', USEOBJECTS: ['api'], USEFORMULA: 'is_viewer' }
    : { USEACL: 'create', USEOBJECTS: ['api'], USEFORMULA: 'is_user' }
  return {
    AllAccessPermissionRules: {
      DEFATTRIBUTES: [
        { name: 'anonymous', attributes: [{ GLOBAL: 'ANONYMOUS' }] },
        { name: 'roles', attributes: [{ CLAIMPATH: '/roles' }] },
      ],
      DEFOBJECTS: [
        { name: 'description', objects: [{ ROUTE: '/description' }] },
        { name: 'api', objects: apiRoutes.map(route => ({ ROUTE: route })) },
      ],
      DEFACLS: [
        { name: 'public_read', acl: { USEATTRIBUTES: 'anonymous', RIGHTS: ['READ'], ACCESS: 'ALLOW' } },
        { name: 'read', acl: { USEATTRIBUTES: 'roles', RIGHTS: ['READ'], ACCESS: 'ALLOW' } },
        { name: 'create', acl: { USEATTRIBUTES: 'roles', RIGHTS: ['CREATE'], ACCESS: 'ALLOW' } },
        { name: 'all', acl: { USEATTRIBUTES: 'roles', RIGHTS: ['ALL'], ACCESS: 'ALLOW' } },
      ],
      DEFFORMULAS: [
        { name: 'is_admin', formula: hasRole('basyx-admin') },
        { name: 'is_viewer', formula: hasRole('basyx-viewer') },
        { name: 'is_user', formula: hasRole('basyx-user') },
      ],
      rules: [
        { USEACL: 'public_read', USEOBJECTS: ['description'], FORMULA: { $boolean: true } },
        userRule,
        { USEACL: 'all', USEOBJECTS: ['api'], USEFORMULA: 'is_admin' },
      ],
    },
  }
}
