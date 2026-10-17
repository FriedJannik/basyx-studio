import type { StackSpec } from '#shared/contract'
import type { StudioDeps } from '../deps'
import type { EngineClient } from './engine'
import { createServer } from 'node:net'
import { firstStackPort, lastStackPort, stackPortBlock } from '#shared/contract'
import { containerStacks } from '../../database/schema'
import { StudioProblem } from '../problem'
import { portsOf } from './plan'

// Published ports of stacks (plan P8): a block of five per stack from 18100
// upwards, free on this computer, not published by the engine and not kept
// for another stored stack, even a stopped one.

export type IsPortFree = (port: number, exposure: StackSpec['network']['exposure']) => Promise<boolean>

/** Whether nothing listens on the port, on the address the stack would publish it on. */
export function isPortFreeOnHost (port: number, exposure: StackSpec['network']['exposure']): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen({ port, host: exposure === 'local' ? '127.0.0.1' : '0.0.0.0', exclusive: true }, () => {
      server.close(() => resolve(true))
    })
  })
}

export class PortAllocator {
  readonly #db: StudioDeps['db']
  readonly #isPortFree: IsPortFree

  constructor (db: StudioDeps['db'], isPortFree: IsPortFree = isPortFreeOnHost) {
    this.#db = db
    this.#isPortFree = isPortFree
  }

  /**
   * The ports of `spec` that are taken. `except` is the stack being changed,
   * whose own ports do not count; `ownRunning` are ports its running
   * containers publish already.
   */
  async inUse (spec: StackSpec, except: string | null, engine: EngineClient | null, ownRunning: ReadonlySet<number> = new Set()): Promise<number[]> {
    const reserved = await this.#reserved(except)
    const published = new Set(engine ? await engine.publishedPorts().catch(() => []) : [])
    const taken: number[] = []
    for (const port of portsOf(spec)) {
      if (ownRunning.has(port)) {
        continue
      }
      if (reserved.has(port) || published.has(port) || !(await this.#isPortFree(port, spec.network.exposure))) {
        taken.push(port)
      }
    }
    return taken
  }

  /** The spec with the first block of free ports. */
  async allocate (spec: StackSpec, except: string | null, engine: EngineClient | null): Promise<StackSpec> {
    for (let base = firstStackPort; base + stackPortBlock <= lastStackPort; base += stackPortBlock * 2) {
      const candidate = { ...spec, network: { ...spec.network, basePort: base } }
      if ((await this.inUse(candidate, except, engine)).length === 0) {
        return candidate
      }
    }
    throw new StudioProblem('container_port_in_use', 'No free ports were found for this instance.')
  }

  /** Throws `container_port_in_use` naming the taken ports. */
  async requireFree (spec: StackSpec, except: string | null, engine: EngineClient | null, ownRunning?: ReadonlySet<number>): Promise<void> {
    const taken = await this.inUse(spec, except, engine, ownRunning)
    if (taken.length > 0) {
      throw new StudioProblem('container_port_in_use', `The ports ${taken.join(', ')} are used by another program.`, {
        violations: taken.map(port => ({ path: 'network.basePort', message: `port ${port} is in use` })),
      })
    }
  }

  /** Ports of other stored stacks; they stay reserved while those stacks are stopped. */
  async #reserved (except: string | null): Promise<Set<number>> {
    const records = await this.#db.select({ id: containerStacks.id, spec: containerStacks.spec }).from(containerStacks)
    return new Set(records.filter(record => record.id !== except).flatMap(record => portsOf(record.spec)))
  }
}
