import type { FileGrantStore } from '../desktop/grants'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { StudioProblem } from '../problem'

// The AASX files a stack loads at startup (plan P7): copied into Studio's
// data folder, one folder per stack, and from there into the container. They
// are never mounted.

const maxTotalBytes = 500 * 1024 * 1024

export class AasxStore {
  readonly #dataDir: string
  readonly #grants: FileGrantStore

  constructor (dataDir: string, grants: FileGrantStore) {
    this.#dataDir = dataDir
    this.#grants = grants
  }

  /** The folder of everything Studio keeps for a stack. */
  stackDirectory (stackId: string): string {
    return join(this.#dataDir, stackId)
  }

  read (stackId: string, name: string): Promise<Buffer> {
    return readFile(join(this.#directory(stackId), name))
  }

  /**
   * Adds files: `staged` from an import, `handles` the user chose in a
   * dialog. `keep` are names already stored; `avoid` are stored names that
   * are about to be deleted, which new files must not take. Returns the kept
   * and the new names, made unique. Nothing is written when the files are
   * larger than 500 MB together.
   */
  async add (stackId: string, handles: string[], staged: ReadonlyMap<string, Uint8Array>, keep: string[], avoid: string[] = []): Promise<string[]> {
    // Take every grant first: an expired one fails before anything is copied.
    const chosen = handles.map(handle => this.#grants.take(handle, 'stack-aasx'))
    let total = [...staged.values()].reduce((sum, content) => sum + content.length, 0)
    for (const path of chosen) {
      total += (await stat(path)).size
    }
    if (total > maxTotalBytes) {
      throw new StudioProblem('invalid_request', 'The AASX files are larger than 500 MB together.')
    }

    const directory = this.#directory(stackId)
    await mkdir(directory, { recursive: true })
    const names = new Set(keep)
    const taken = new Set([...keep, ...avoid])
    const unique = (name: string) => {
      let candidate = name
      for (let index = 2; taken.has(candidate); index++) {
        candidate = name.replace(/(\.aasx)$/i, ` (${index})$1`)
      }
      taken.add(candidate)
      names.add(candidate)
      return candidate
    }
    for (const [name, content] of staged) {
      await writeFile(join(directory, unique(name)), content)
    }
    for (const path of chosen) {
      await copyFile(path, join(directory, unique(basename(path).replaceAll(/[^\w.() -]/g, '_'))))
    }
    return [...names]
  }

  /** Deletes files a stack no longer loads. */
  async remove (stackId: string, names: string[]): Promise<void> {
    for (const name of names) {
      await rm(join(this.#directory(stackId), name), { force: true })
    }
  }

  /** Deletes everything Studio keeps for a stack. */
  async removeStack (stackId: string): Promise<void> {
    await rm(this.stackDirectory(stackId), { recursive: true, force: true })
  }

  #directory (stackId: string): string {
    return join(this.stackDirectory(stackId), 'aasx')
  }
}
