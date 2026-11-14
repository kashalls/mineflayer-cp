import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Behaviours, type AccountInput, type BotSpec } from '@mineflayer-cp/shared'

export interface Account extends AccountInput {
  desiredState: 'running' | 'stopped'
  behaviours: Behaviours
  restartedAt: string | null
}

export interface Script {
  id: number
  accountId: string | null
  name: string
  code: string
  runOnSpawn: boolean
}

let database: DatabaseSync | undefined

export function db (): DatabaseSync {
  if (database) return database
  const dir = useRuntimeConfig().dataDir
  mkdirSync(dir, { recursive: true })
  database = new DatabaseSync(join(dir, 'panel.sqlite'))
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      username TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      version TEXT,
      auth TEXT NOT NULL,
      desired_state TEXT NOT NULL DEFAULT 'running',
      behaviours TEXT NOT NULL,
      restarted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_cache (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      cache_name TEXT NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (account_id, cache_name)
    );
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY,
      account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      run_on_spawn INTEGER NOT NULL DEFAULT 0
    );
  `)
  return database
}

type Row = Record<string, any>

function toAccount (row: Row): Account {
  return {
    id: row.id,
    label: row.label,
    username: row.username,
    host: row.host,
    port: row.port,
    version: row.version,
    auth: row.auth,
    desiredState: row.desired_state,
    behaviours: Behaviours.parse(JSON.parse(row.behaviours)),
    restartedAt: row.restarted_at
  }
}

function toScript (row: Row): Script {
  return { id: row.id, accountId: row.account_id, name: row.name, code: row.code, runOnSpawn: row.run_on_spawn === 1 }
}

export function listAccounts (): Account[] {
  return db().prepare('SELECT * FROM accounts ORDER BY label').all().map(toAccount)
}

export function getAccount (id: string): Account {
  const row = db().prepare('SELECT * FROM accounts WHERE id = ?').get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'account not found' })
  return toAccount(row)
}

export function createAccount (input: AccountInput): void {
  if (db().prepare('SELECT 1 FROM accounts WHERE id = ?').get(input.id)) {
    throw createError({ statusCode: 409, statusMessage: 'an account with that id already exists' })
  }
  db().prepare('INSERT INTO accounts (id, label, username, host, port, version, auth, behaviours) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(input.id, input.label, input.username, input.host, input.port, input.version, input.auth, JSON.stringify(Behaviours.parse({})))
}

export function updateAccount (id: string, input: Omit<AccountInput, 'id'>): void {
  db().prepare('UPDATE accounts SET label = ?, username = ?, host = ?, port = ?, version = ?, auth = ? WHERE id = ?')
    .run(input.label, input.username, input.host, input.port, input.version, input.auth, id)
}

export function deleteAccount (id: string): void {
  db().prepare('DELETE FROM accounts WHERE id = ?').run(id)
}

export function setDesiredState (id: string, state: Account['desiredState']): void {
  db().prepare('UPDATE accounts SET desired_state = ? WHERE id = ?').run(state, id)
}

export function markRestarted (id: string): void {
  db().prepare('UPDATE accounts SET restarted_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}

export function setBehaviours (id: string, behaviours: Behaviours): void {
  db().prepare('UPDATE accounts SET behaviours = ? WHERE id = ?').run(JSON.stringify(behaviours), id)
}

export function listScripts (accountId: string): Script[] {
  return db().prepare('SELECT * FROM scripts WHERE account_id = ? OR account_id IS NULL ORDER BY name').all(accountId).map(toScript)
}

export function saveScript (script: Omit<Script, 'id'> & { id?: number }): number {
  if (script.id === undefined) {
    return Number(db().prepare('INSERT INTO scripts (account_id, name, code, run_on_spawn) VALUES (?, ?, ?, ?)')
      .run(script.accountId, script.name, script.code, script.runOnSpawn ? 1 : 0).lastInsertRowid)
  }
  db().prepare('UPDATE scripts SET account_id = ?, name = ?, code = ?, run_on_spawn = ? WHERE id = ?')
    .run(script.accountId, script.name, script.code, script.runOnSpawn ? 1 : 0, script.id)
  return script.id
}

export function deleteScript (id: number): void {
  db().prepare('DELETE FROM scripts WHERE id = ?').run(id)
}

export function botSpec (id: string): BotSpec {
  const { label: _label, desiredState: _state, restartedAt: _restarted, ...account } = getAccount(id)
  return {
    ...account,
    spawnScripts: listScripts(id).filter(s => s.runOnSpawn).map(s => ({ name: s.name, code: s.code }))
  }
}

function cipherKey (): Buffer {
  return createHash('sha256').update(secret('encryptionKey')).digest()
}

/** Microsoft token caches are stored as iv | tag | AES-256-GCM ciphertext. */
export function encrypt (plaintext: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', cipherKey(), iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

export function decrypt (blob: Uint8Array): string {
  const data = Buffer.from(blob)
  const decipher = createDecipheriv('aes-256-gcm', cipherKey(), data.subarray(0, 12))
  decipher.setAuthTag(data.subarray(12, 28))
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')
}

export function getAuthCache (accountId: string, name: string): string {
  const row = db().prepare('SELECT data FROM auth_cache WHERE account_id = ? AND cache_name = ?').get(accountId, name)
  return row ? decrypt(row.data as Uint8Array) : '{}'
}

export function setAuthCache (accountId: string, name: string, json: string): void {
  db().prepare('INSERT INTO auth_cache (account_id, cache_name, data) VALUES (?, ?, ?) ON CONFLICT (account_id, cache_name) DO UPDATE SET data = excluded.data')
    .run(accountId, name, encrypt(json))
}

export function clearAuthCache (accountId: string): void {
  db().prepare('DELETE FROM auth_cache WHERE account_id = ?').run(accountId)
}
