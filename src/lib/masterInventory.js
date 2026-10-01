import Papa from 'papaparse';
import { supabase } from './supabase.js';
import { fileStamp } from './time.js';
import { gunzip, gzip, isGzipPath } from './gzip.js';
import { productRow } from './ccNames.js';

// Master Crystal Inventory (spec 11.1): check a Crystal Commerce CSV and store
// it in the private `master-inventory` bucket, replacing the one before: only
// the current file is kept (owner, 2026-09-30).
// Reading its columns for export is out of scope until the export spec exists.
//
// The real export is 40 MB and more (owner, 2026-09-30), so the check reads it
// in chunks (nothing large held in memory, with progress), and it's stored
// gzipped: a CSV packs down to a fraction, well under the 50 MB per-file limit
// of Supabase's Free plan, and the Free plan's 1 GB of storage goes a long way.

const BUCKET = 'master-inventory';
/** The CSV as picked: plenty of room above today's 40 MB. */
export const MAX_BYTES = 300 * 1024 * 1024;
/** Stored (gzipped): Supabase's Free-plan limit for one file, and the bucket's (migration 0023). */
export const MAX_STORED_BYTES = 50 * 1024 * 1024;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
/** The columns the export needs from every row (export spec 6.1). */
export const REQUIRED_COLUMNS = ['Product ID', 'Product Name', 'Category'];
/** Products sent to the database per request while loading (export spec 6.7). */
const LOAD_BATCH = 2000;

/**
 * @typedef {{ rowCount: number, columns: string[] }} CsvSummary
 */

/**
 * Check a picked file before anything is uploaded, reading it in chunks.
 * Throws an Error with a message for the Settings panel when the file isn't
 * a usable CSV.
 * @param {File} file
 * @param {(fraction: number) => void} [onProgress]  0..1 as it's read
 * @returns {Promise<CsvSummary>}
 */
export async function checkCsv(file, onProgress) {
  if (!/\.csv$/i.test(file.name)) {
    throw new Error(`"${file.name}" isn't a .csv file. Export the inventory from Crystal Commerce as CSV.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is ${mb(file.size)}. The limit is ${mb(MAX_BYTES)}.`);
  }
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty.`);
  }

  // A spreadsheet or other binary file renamed to .csv has NUL bytes early on.
  const head = await file.slice(0, 64 * 1024).text();
  if (head.includes('\u0000')) {
    throw new Error(`"${file.name}" looks like a spreadsheet or other binary file, not a CSV.`);
  }

  // Chunk by chunk: count the rows and keep only the header.
  let header = null;
  let rows = 0;
  let broken = null;
  await new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: 'greedy',
      chunkSize: 2 * 1024 * 1024,
      chunk: (results, parser) => {
        const quote = results.errors.find((e) => e.type === 'Quotes');
        if (quote) {
          broken = rows + (header ? 1 : 0) + (quote.row ?? 0) + 1;
          parser.abort();
          return;
        }
        let data = results.data;
        if (!header && data.length) {
          header = data[0];
          data = data.slice(1);
        }
        rows += data.length;
        onProgress?.(Math.min(1, (results.meta.cursor ?? 0) / file.size));
      },
      complete: resolve,
      error: reject,
    });
  });

  if (broken != null) {
    throw new Error(`"${file.name}" couldn't be read: a quote isn't closed near row ${broken.toLocaleString()}.`);
  }
  const columns = (header ?? []).map((c) => String(c).trim());
  if (columns.filter(Boolean).length < 2) {
    throw new Error(`"${file.name}" has no header row of columns. It doesn't look like a Crystal Commerce export.`);
  }
  if (rows === 0) {
    throw new Error(`"${file.name}" has a header row but no data rows.`);
  }
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) {
    throw new Error(`"${file.name}" has no ${missing.join(', ')} column. It doesn't look like the Crystal Commerce inventory export.`);
  }
  return { rowCount: rows, columns };
}

/**
 * Read the CSV again in chunks and load its products for the export's
 * matcher (export spec 6.7), in batches, into the upload's row.
 * @param {File} file
 * @param {string} fileId  the master_inventory_files row (not yet current)
 * @param {(fraction: number) => void} [onProgress]
 */
async function loadProducts(file, fileId, onProgress) {
  let failure = null;
  let pending = [];
  const send = async (rows) => {
    const { error } = await supabase.rpc('cc_products_load', { p_file_id: fileId, p_rows: rows });
    if (error) throw new Error(`Loading products failed: ${error.message}`);
  };
  await new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      chunkSize: 2 * 1024 * 1024,
      chunk: (results, parser) => {
        for (const row of results.data) {
          const product = productRow(row);
          if (product) pending.push(product);
        }
        const cursor = results.meta.cursor ?? 0;
        parser.pause();
        (async () => {
          while (pending.length >= LOAD_BATCH) await send(pending.splice(0, LOAD_BATCH));
          onProgress?.(Math.min(1, cursor / file.size));
        })().then(() => parser.resume(), (e) => {
          failure = e;
          parser.abort();
        });
      },
      complete: () => (failure ? reject(failure) : resolve()),
      error: reject,
    });
  });
  if (failure) throw failure;
  while (pending.length) await send(pending.splice(0, LOAD_BATCH));
  onProgress?.(1);
}

/** Storage keys allow a limited character set; the real name is kept in the table. */
function safeKeyName(name) {
  return name.replace(/[^A-Za-z0-9._() -]/g, '_');
}

/**
 * Compress and upload a checked file, load its products for the export, and
 * make it the current Master Crystal Inventory; the file before it goes (once
 * this one is safely stored and loaded). If anything fails, the new file is
 * removed and the current one stays.
 * @param {File} file
 * @param {CsvSummary} summary
 * @param {string} userId  the picked staff user
 * @param {(step: 'compress'|'upload'|'load'|'save', fraction?: number) => void} [onStep]
 */
export async function uploadCsv(file, summary, userId, onStep) {
  onStep?.('compress');
  const packed = await gzip(file);
  if (packed.size > MAX_STORED_BYTES) {
    throw new Error(`"${file.name}" is still ${mb(packed.size)} compressed. The limit is ${mb(MAX_STORED_BYTES)}.`);
  }

  onStep?.('upload');
  const path = `${fileStamp(new Date())}__${safeKeyName(file.name)}.gz`;
  const up = await supabase.storage.from(BUCKET).upload(path, packed, {
    contentType: 'application/gzip',
    upsert: false,
  });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

  // The upload's row first (not yet current), so its products have one.
  const { data: fileId, error: startError } = await supabase.rpc('master_inventory_start', {
    p_storage_path: path,
    p_original_filename: file.name,
    p_size_bytes: file.size,
    p_row_count: summary.rowCount,
    p_columns: summary.columns,
    p_uploaded_by: userId,
  });
  if (startError) {
    // Nothing was recorded, so don't leave the file behind either.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Saving the upload failed: ${startError.message}`);
  }

  let pruned;
  try {
    onStep?.('load', 0);
    await loadProducts(file, fileId, (f) => onStep?.('load', f));
    onStep?.('save');
    const { data, error } = await supabase.rpc('master_inventory_finish', { p_file_id: fileId });
    if (error) throw new Error(`Saving the upload failed: ${error.message}`);
    pruned = data;
  } catch (e) {
    // Half-loaded: the new file and its products go; the current one stays.
    await supabase.rpc('master_inventory_abort', { p_file_id: fileId });
    await supabase.storage.from(BUCKET).remove([path]);
    throw e;
  }

  // The file this one replaces: its row is gone; remove the file too.
  if (pruned?.length) {
    const { error: rmError } = await supabase.storage.from(BUCKET).remove(pruned);
    if (rmError) console.error('Removing old inventory files failed', rmError);
  }
}

/** Hand the browser a file to save. */
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Save a stored copy to this computer as the CSV it was, under its original
 * name: a gzipped one is unpacked here first.
 * @param {{ storage_path: string, original_filename: string }} row
 */
export async function downloadCsv(row) {
  if (isGzipPath(row.storage_path)) {
    const { data, error } = await supabase.storage.from(BUCKET).download(row.storage_path);
    if (error) throw new Error(`Download failed: ${error.message}`);
    const csv = await gunzip(data);
    saveBlob(new Blob([csv], { type: 'text/csv' }), row.original_filename);
    return;
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 60, { download: row.original_filename });
  if (error) throw new Error(`Download failed: ${error.message}`);
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = row.original_filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
