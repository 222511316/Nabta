// Where the end-to-end backend keeps its data, and how tests run the team's commands against it.
// Shared by server.mjs (which starts the backend) and the specs (which approve specialists with the CLI).
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PORT = Number(process.env.E2E_PORT ?? 8100)
export const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const BACKEND_DIR = path.resolve(FRONTEND_DIR, '..', 'backend')
// A fresh folder each time the server starts: its own database and photos, never the team's.
export const STORAGE_DIR = path.join(os.tmpdir(), `nabta-e2e-${PORT}`)
export const DATABASE_URL = `sqlite:///${path.join(STORAGE_DIR, 'nabta.db').split(path.sep).join('/')}`

export const PYTHON =
  process.platform === 'win32'
    ? path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(BACKEND_DIR, '.venv', 'bin', 'python')

/** The environment every backend process gets: this run's database, and the AI features off (OBS-06). */
export function backendEnv() {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('NABTA_')) delete env[name]
  return {
    ...env,
    NABTA_DATABASE_URL: DATABASE_URL,
    NABTA_STORAGE_DIR: STORAGE_DIR,
    NABTA_FRONTEND_DIST: path.join(FRONTEND_DIR, 'dist'),
    // Blank, not missing: a key in backend/.env must not switch the AI features on in the browser tests.
    NABTA_OPENAI_API_KEY: '',
    PYTHONDONTWRITEBYTECODE: '1',
  }
}

/** Runs `python -m app.cli ...args` on the test database and returns what it printed. */
export function teamCommand(...args) {
  return execFileSync(PYTHON, ['-m', 'app.cli', ...args], {
    cwd: BACKEND_DIR,
    env: backendEnv(),
    encoding: 'utf-8',
  })
}
