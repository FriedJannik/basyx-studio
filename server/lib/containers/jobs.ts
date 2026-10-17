import type { Job, JobKind, JobStep, Problem } from '#shared/contract'
import { randomBytes } from 'node:crypto'
import { StudioProblem } from '../problem'

// Long operations on a stack run as jobs that the app polls (ADR 0033, plan
// E3); one job per stack at a time. A job is claimed before the operation
// awaits anything, so two calls for the same stack never both pass the check.

const retentionMs = 30 * 60 * 1000

export function newId (): string {
  return randomBytes(6).toString('hex')
}

interface Entry {
  job: Job
  done: Promise<void>
}

export class JobRunner {
  readonly #jobs = new Map<string, Entry>()
  /** The job that holds each stack. */
  readonly #holders = new Map<string, Job>()
  /** Stacks whose last job failed, until the next job succeeds. */
  readonly #failed = new Set<string>()
  readonly #toProblem: (error: unknown) => Problem

  constructor (toProblem: (error: unknown) => Problem) {
    this.#toProblem = toProblem
  }

  /**
   * Reserves a stack for a new job, synchronously. Throws `container_busy`
   * while another job or `isBusy` holds the stack.
   */
  claim (stackId: string, kind: JobKind, isBusy = false): Job {
    if (isBusy || this.#holders.has(stackId)) {
      throw new StudioProblem('container_busy', 'Another operation is running for this instance. Wait until it has finished.')
    }
    const job: Job = { id: newId(), stackId, kind, state: 'running', steps: [], problem: null, startedAt: new Date().toISOString(), finishedAt: null }
    this.#holders.set(stackId, job)
    this.#jobs.set(job.id, { job, done: Promise.resolve() })
    return job
  }

  /** Gives up a claimed job that never ran, e.g. because its preparation failed. */
  release (job: Job): void {
    if (this.#holders.get(job.stackId) === job) {
      this.#holders.delete(job.stackId)
    }
    this.#jobs.delete(job.id)
  }

  /**
   * Runs a claimed job in the background. `finished` runs after it, with the
   * job's final state, e.g. to audit the outcome.
   */
  run (job: Job, work: (job: Job) => Promise<void>, finished?: (job: Job) => Promise<void>): Job {
    const done = (async () => {
      try {
        await work(job)
        job.state = 'succeeded'
        this.#failed.delete(job.stackId)
      } catch (error) {
        job.state = 'failed'
        job.problem = this.#toProblem(error)
        for (const step of job.steps) {
          if (step.state === 'running') {
            step.state = 'failed'
          }
        }
        this.#failed.add(job.stackId)
      } finally {
        job.finishedAt = new Date().toISOString()
        this.#holders.delete(job.stackId)
        const timer = setTimeout(() => this.#jobs.delete(job.id), retentionMs)
        timer.unref?.()
      }
      await finished?.(job).catch(() => {})
    })()
    this.#jobs.set(job.id, { job, done })
    return job
  }

  get (id: string): Job {
    const entry = this.#jobs.get(id)
    if (!entry) {
      throw new StudioProblem('not_found', 'This operation is unknown or finished long ago.')
    }
    return entry.job
  }

  /** The job that holds the stack, if any. */
  holder (stackId: string): Job | null {
    return this.#holders.get(stackId) ?? null
  }

  lastFailed (stackId: string): boolean {
    return this.#failed.has(stackId)
  }

  /** Waits for running jobs; for tests and shutdown. */
  async settle (): Promise<void> {
    await Promise.all([...this.#jobs.values()].map(entry => entry.done))
  }
}

/** Adds a pending step, so the app shows the whole plan from the start. */
export function addStep (job: Job, id: string): JobStep {
  const step: JobStep = { id, state: 'pending', progress: null, note: null }
  job.steps.push(step)
  return step
}

/** Runs one step of a job; a failing step fails the job. */
export async function runStep<T> (job: Job, id: string, run: (step: JobStep) => Promise<T>): Promise<T> {
  const step = job.steps.find(existing => existing.id === id) ?? addStep(job, id)
  step.state = 'running'
  try {
    const result = await run(step)
    if (step.state === 'running') {
      step.state = 'done'
    }
    return result
  } catch (error) {
    step.state = 'failed'
    throw error
  }
}

/**
 * Runs a step whose failure must not fail the job (Studio's side of a
 * stack, e.g. its infrastructure): the step is done with the problem code as
 * its note, so the app can say what is left.
 */
export async function runOptionalStep (job: Job, id: string, run: () => Promise<void>): Promise<void> {
  await runStep(job, id, async step => {
    try {
      await run()
    } catch (error) {
      step.note = error instanceof StudioProblem ? error.code : 'internal_error'
    }
  })
}
