import type { appMethodParamsSchemas } from '#shared/contract'
import type { ContainerMethodName } from '../lib/apps/calls'
import type { ContainerManager } from '../lib/containers/manager'
import type { Actor } from '../lib/deps'
import type { FileGrantStore } from '../lib/desktop/grants'
import type { StudioRuntime } from './studio'
import type { z } from 'zod'
import { engineProblem } from '../lib/containers/manager'
import { StudioProblem } from '../lib/problem'

interface ContainerCall {
  containers: ContainerManager
  grants: FileGrantStore
  actor: Actor
  requestId: string
}

/** The validated parameters of a method, with their defaults applied. */
type Params<M extends ContainerMethodName> = z.output<(typeof appMethodParamsSchemas)[M]>

/** One handler per `studio.containers.*` method; adding a method without one does not compile. */
const handlers: { [M in ContainerMethodName]: (params: Params<M>, call: ContainerCall) => unknown } = {
  'studio.containers.listEngines': (_, { containers }) => containers.engines(true),
  'studio.containers.selectEngine': ({ host }, { containers }) => containers.selectEngine(host),
  'studio.containers.listStacks': (_, { containers }) => containers.list(),
  'studio.containers.getStack': ({ stackId }, { containers }) => containers.get(stackId),
  'studio.containers.planStack': ({ spec, stackId }, { containers }) => containers.plan(spec, stackId),
  'studio.containers.createStack': (params, { containers, actor, requestId }) => containers.create(params, actor, requestId),
  'studio.containers.changeStack': (params, { containers, actor, requestId }) => containers.change(params, actor, requestId),
  'studio.containers.startStack': ({ stackId }, { containers, actor, requestId }) => containers.start(stackId, actor, requestId),
  'studio.containers.stopStack': ({ stackId }, { containers, actor, requestId }) => containers.stop(stackId, actor, requestId),
  'studio.containers.updateStack': ({ stackId }, { containers, actor, requestId }) => containers.update(stackId, actor, requestId),
  'studio.containers.removeStack': (params, { containers, actor, requestId }) => containers.remove(params, actor, requestId),
  'studio.containers.getJob': ({ jobId }, { containers }) => containers.job(jobId),
  'studio.containers.getLogs': ({ stackId, component, tail }, { containers }) => containers.logs(stackId, component, tail),
  'studio.containers.saveLogs': ({ stackId, component, fileHandle }, { containers, grants, actor, requestId }) =>
    containers.saveLogs(stackId, component, grants.take(fileHandle, 'stack-logs'), actor, requestId),
  'studio.containers.getSignIn': ({ stackId }, { containers, actor, requestId }) => containers.signIn(stackId, actor, requestId),
  // Authorized only; the host then shows the native dialog (ADR 0015).
  'studio.containers.pickFiles': () => null,
  'studio.containers.exportStack': ({ stackId, fileHandle }, { containers, grants, actor, requestId }) =>
    containers.export(stackId, grants.take(fileHandle, 'stack-export'), actor, requestId),
  'studio.containers.importStack': ({ fileHandle }, { containers, grants, actor, requestId }) =>
    containers.import(grants.take(fileHandle, 'stack-import'), actor, requestId),
}

/**
 * Runs a `studio.containers.*` call (ADR 0033). The manifest permission, the
 * bundled-only rule and the parameters (`params`, already parsed with the
 * method's schema) are checked before.
 */
export async function performContainerMethod (studio: StudioRuntime, actor: Actor, method: ContainerMethodName, params: unknown, requestId: string): Promise<unknown> {
  if (!studio.containers) {
    throw new StudioProblem('unsupported_operation', 'Local BaSyx instances are only available in the desktop app.')
  }
  const handler = handlers[method] as (params: unknown, call: ContainerCall) => unknown
  try {
    return await handler(params, { containers: studio.containers, grants: studio.fileGrants, actor, requestId })
  } catch (error) {
    throw engineProblem(error)
  }
}
