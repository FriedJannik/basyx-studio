import type { ProblemCode } from '#shared/contract'
import type { WorkerRequest, WorkerResponse, WorkerResults } from './protocol'
import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { problemCodes } from '#shared/contract'
import { StudioProblem } from '../problem'

export interface WorkerClientOptions {
  /** Path of the bundled worker entry (`workspace-worker.mjs`). */
  entry: string
  /** Time limit per request; opening a package gets `openTimeoutMs`. */
  timeoutMs?: number
  openTimeoutMs?: number
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  timer: NodeJS.Timeout
}

/**
 * Starts and supervises the Workspace Worker process and sends it requests.
 * A request that exceeds its time limit kills the worker, which bounds the
 * CPU a hostile package can use; the next request starts a fresh worker.
 */
export class WorkspaceWorkerClient {
  /** Called when the worker stopped, so open workspaces are known to be gone. */
  onExit: (() => void) | undefined
  #child: ChildProcess | undefined
  #nextId = 1
  readonly #pending = new Map<number, Pending>()

  constructor (private readonly options: WorkerClientOptions) {}

  request<Op extends WorkerRequest['op']> (request: Extract<WorkerRequest, { op: Op }>): Promise<WorkerResults[Op]> {
    const child = this.#start()
    const id = this.#nextId++
    const parsesPackage = request.op === 'open' || request.op === 'inspect'
    const timeoutMs = parsesPackage ? (this.options.openTimeoutMs ?? 120_000) : (this.options.timeoutMs ?? 30_000)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#stop(new StudioProblem(parsesPackage ? 'package_rejected' : 'internal_error', 'The workspace operation took too long and was stopped.'))
      }, timeoutMs)
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      child.send({ id, request }, error => {
        if (error) {
          this.#settle(id, { id, ok: false, problem: { code: 'internal_error', detail: 'The workspace worker is not available.' } })
        }
      })
    })
  }

  close (): void {
    this.#stop(new StudioProblem('internal_error', 'Studio is shutting down.'))
  }

  #start (): ChildProcess {
    if (this.#child) {
      return this.#child
    }
    const child = fork(this.options.entry, [], {
      // The same runtime as the service: Node, or Electron running as Node.
      execPath: process.execPath,
      execArgv: [],
      env: { ELECTRON_RUN_AS_NODE: '1', NODE_ENV: process.env.NODE_ENV },
      serialization: 'advanced',
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    child.on('message', (response: WorkerResponse) => this.#settle(response.id, response))
    child.on('exit', () => {
      if (this.#child === child) {
        this.#child = undefined
        this.#failAll(new StudioProblem('internal_error', 'The workspace worker stopped. Open the file again.'))
        this.onExit?.()
      }
    })
    this.#child = child
    return child
  }

  #settle (id: number, response: WorkerResponse): void {
    const pending = this.#pending.get(id)
    if (!pending) {
      return
    }
    this.#pending.delete(id)
    clearTimeout(pending.timer)
    if (response.ok) {
      pending.resolve(response.result)
    } else {
      const code = (problemCodes as readonly string[]).includes(response.problem.code) ? response.problem.code as ProblemCode : 'internal_error'
      pending.reject(new StudioProblem(code, response.problem.detail, { violations: response.problem.violations }))
    }
  }

  #failAll (error: StudioProblem): void {
    for (const [id, pending] of this.#pending) {
      this.#pending.delete(id)
      clearTimeout(pending.timer)
      pending.reject(error)
    }
  }

  #stop (error: StudioProblem): void {
    const child = this.#child
    this.#child = undefined
    this.#failAll(error)
    if (child) {
      child.kill('SIGKILL')
      this.onExit?.()
    }
  }
}
