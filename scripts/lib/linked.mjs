// What the database scripts share: the project the Supabase CLI is linked to,
// whether it's dev (the one .env.development names), and a query against it
// through `npx supabase db query --linked` (the Management API: no Docker).
// Used by db-snapshot.mjs (and by db-baseline.mjs until it was retired,
// decision 496). Reads no secrets.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');

export function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

export function fail(message) {
  console.error(message);
  process.exit(2);
}

/** The linked project's ref, and dev's (from .env.development). */
export function projects() {
  const ref = readText(path.join(root, 'supabase', '.temp', 'project-ref'))?.trim() ?? null;
  const devRef = readText(path.join(root, '.env.development'))?.match(/VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\./)?.[1] ?? null;
  if (!ref) fail('No linked project: run `npx supabase link` first.');
  return { ref, devRef, isDev: ref === devRef };
}

/** Run SQL on the linked project; the last statement's rows. */
export function query(sql) {
  const tmp = path.join(os.tmpdir(), `pug-db-${process.pid}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(tmp, sql);
  const res = spawnSync(`npx supabase db query --linked -f "${tmp}"`, { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(tmp, { force: true });
  const text = res.stdout ?? '';
  const start = text.indexOf('{');
  if (start < 0) fail(`No answer from the database:\n${text}\n${res.stderr ?? ''}`);
  // The CLI prints its JSON, then sometimes a notice: parse just the JSON.
  for (let end = text.lastIndexOf('}'); end > 0; end = text.lastIndexOf('}', end - 1)) {
    try {
      const json = JSON.parse(text.slice(start, end + 1));
      if (json._tag === 'Error' || json.error) fail(`The database refused a query:\n${JSON.stringify(json.error ?? json, null, 2)}`);
      return json.rows ?? [];
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
  fail(`Couldn't read the database's answer:\n${text.slice(0, 2000)}`);
}
