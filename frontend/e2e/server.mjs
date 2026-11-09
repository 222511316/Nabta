// Starts the real backend for the browser tests (playwright.config.js → webServer): a fresh database
// in a temporary folder, migrated with Alembic and filled with the demo data, then FastAPI on E2E_PORT,
// serving the production build in frontend/dist (npm run e2e builds it first).
//
// The installed pest model (backend/models/nabta-pest) is used when present, as in the app.
// The AI features are off: the assessed release runs without an OpenAI key (supervisor review OBS-06).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { BACKEND_DIR, PORT, PYTHON, STORAGE_DIR, backendEnv } from './support/backend.js'

function run(args, { quiet = false } = {}) {
  // quiet: seed-demo prints the demo password, which must not end up in test logs.
  const result = spawnSync(PYTHON, args, { cwd: BACKEND_DIR, env: backendEnv(), encoding: 'utf-8' })
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    throw new Error(`${args.join(' ')} failed with exit code ${result.status}`)
  }
  if (!quiet) process.stdout.write(result.stdout + result.stderr)
}

if (!fs.existsSync(PYTHON)) {
  throw new Error(`No backend virtualenv at ${PYTHON}. Set up the backend first (HOW_TO_RUN.md).`)
}

fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
fs.mkdirSync(STORAGE_DIR, { recursive: true })
console.log(`[e2e] fresh storage in ${STORAGE_DIR}`)

run(['-m', 'alembic', 'upgrade', 'head'])
run(['-m', 'app.cli', 'seed-demo'], { quiet: true })
console.log('[e2e] demo data seeded')

const server = spawn(
  PYTHON,
  ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PORT), '--log-level', 'warning'],
  { cwd: BACKEND_DIR, env: backendEnv(), stdio: 'inherit' },
)
const stop = () => server.kill('SIGTERM')
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', stop)
server.on('exit', (code) => process.exit(code ?? 0))
