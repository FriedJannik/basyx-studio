import { describe, expect, it } from 'vitest'
import { diagnoseAppStart } from '~~/app/utils/app-start'

const entryUrl = 'http://apps.localhost:3000/app/app-1/ui/index.html'

describe('app start diagnosis', () => {
  it('blames the frame when the entry file loads', async () => {
    const fetcher = async () => new Response('<!doctype html>', { status: 200 })
    expect(await diagnoseAppStart(entryUrl, fetcher)).toEqual({ kind: 'blocked' })
  })

  it('reports the status when the apps origin answers with an error', async () => {
    const fetcher = async () => new Response(null, { status: 404 })
    expect(await diagnoseAppStart(entryUrl, fetcher)).toEqual({ kind: 'error', status: 404 })
  })

  it('reports the files as unreachable when the request fails', async () => {
    const fetcher = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await diagnoseAppStart(entryUrl, fetcher)).toEqual({ kind: 'unreachable' })
  })

  it('requests the entry file without credentials or cache', async () => {
    let init: RequestInit | undefined
    const fetcher = async (_input: RequestInfo | URL, options?: RequestInit) => {
      init = options
      return new Response(null, { status: 200 })
    }
    await diagnoseAppStart(entryUrl, fetcher)
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store' })
  })
})
