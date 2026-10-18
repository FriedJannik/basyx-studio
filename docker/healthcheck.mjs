// HEALTHCHECK of the container image: exits 0 when the Studio Service is
// ready. Docker runs it with the container's environment, not the launcher's.
import { basePathOf } from './base-path.mjs'

const port = process.env.NITRO_PORT || process.env.PORT || '3000'
const url = `http://127.0.0.1:${port}${basePathOf(process.env)}health/ready`

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
  process.exitCode = response.ok ? 0 : 1
} catch {
  process.exitCode = 1
}
