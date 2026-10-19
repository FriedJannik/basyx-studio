import type { Connection, ConnectionPurpose, ConnectionTestResult, ConnectionType } from '#shared/contract'
import type { ConnectionClient } from './client'
import { connectionTypes } from '#shared/contract'
import { testInfluxdb2 } from './influxdb2'

// The adapters of connection types (ADR 0040). The contract
// (shared/contract/connections.ts) holds what the UI needs too: settings,
// accepted auth schemes, purposes and the default timeout. The adapter adds
// what only the Studio Service does with a connection.

export type ConnectionCheck = ConnectionTestResult['checks'][number]

export interface ConnectionAdapter {
  /** *Test connection* (CON-005): the checks after the credentials were obtained. */
  test: (client: ConnectionClient) => Promise<ConnectionCheck[]>
}

export const connectionAdapters: Record<ConnectionType, ConnectionAdapter> = {
  influxdb2: { test: testInfluxdb2 },
}

/** Whether a URL named in AAS content refers to a connection: the origin of its URL or of an alias. */
export function refersTo (connection: Connection, url: URL): boolean {
  return [connection.url, ...connection.aliases].some(candidate => new URL(candidate).origin === url.origin)
}

/**
 * The connection of an infrastructure that serves a purpose for a service
 * that content of this infrastructure names (CON-003), if any.
 */
export function connectionFor (connections: readonly Connection[], purpose: ConnectionPurpose, url: URL): Connection | undefined {
  return connections.find(connection =>
    (connectionTypes[connection.type].purposes as readonly ConnectionPurpose[]).includes(purpose) && refersTo(connection, url))
}
