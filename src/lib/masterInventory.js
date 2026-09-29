import Papa from 'papaparse';
import { supabase } from './supabase.js';
import { fileStamp } from './time.js';

// Master Crystal Inventory (spec 11.1): check a Crystal Commerce CSV, store it
// in the private `master-inventory` bucket, and keep the latest five. Reading
// its columns for export is out of scope until the export spec exists.

const BUCKET = 'master-inventory';
export const MAX_BYTES = 20 * 1024 * 1024;

/**
 * @typedef {{ rowCount: number, columns: string[] }} CsvSummary
 */

/**
 * Check a picked file before anything is uploaded. Throws an Error with a
 * message for the Settings panel when the file isn't a usable CSV.
 * @param {File} file
 * @returns {Promise<CsvSummary>}
 */
export async function checkCsv(file) {
  if (!/\.csv$/i.test(file.name)) {
    throw new Error(`"${file.name}" isn't a .csv file. Export the inventory from Crystal Commerce as CSV.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.`);
  }
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty.`);
  }

  // A spreadsheet or other binary file renamed to .csv has NUL bytes early on.
  const head = await file.slice(0, 64 * 1024).text();
  if (head.includes('\u0000')) {
    throw new Error(`"${file.name}" looks like a spreadsheet or other binary file, not a CSV.`);
  }

  const results = await new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: 'greedy',
      complete: resolve,
      error: reject,
    });
  });

  const broken = results.errors.find((e) => e.type === 'Quotes');
  if (broken) {
    throw new Error(`"${file.name}" couldn't be read: a quote isn't closed near row ${broken.row + 1}.`);
  }

  const [header, ...rows] = results.data;
  const columns = (header ?? []).map((c) => String(c).trim());
  if (columns.filter(Boolean).length < 2) {
    throw new Error(`"${file.name}" has no header row of columns. It doesn't look like a Crystal Commerce export.`);
  }
  if (rows.length === 0) {
    throw new Error(`"${file.name}" has a header row but no data rows.`);
  }
  return { rowCount: rows.length, columns };
}

/** Storage keys allow a limited character set; the real name is kept in the table. */
function safeKeyName(name) {
  return name.replace(/[^A-Za-z0-9._() -]/g, '_');
}

/**
 * Upload a checked file and make it the current Master Crystal Inventory.
 * @param {File} file
 * @param {CsvSummary} summary
 * @param {string} userId  the picked staff user
 */
export async function uploadCsv(file, summary, userId) {
  const path = `${fileStamp(new Date())}__${safeKeyName(file.name)}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: 'text/csv',
    upsert: false,
  });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

  const { data: pruned, error } = await supabase.rpc('master_inventory_add', {
    p_storage_path: path,
    p_original_filename: file.name,
    p_size_bytes: file.size,
    p_row_count: summary.rowCount,
    p_columns: summary.columns,
    p_uploaded_by: userId,
  });
  if (error) {
    // Nothing was recorded, so don't leave the file behind either.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Saving the upload failed: ${error.message}`);
  }

  // Past the latest five: the rows are gone; remove their files.
  if (pruned?.length) {
    const { error: rmError } = await supabase.storage.from(BUCKET).remove(pruned);
    if (rmError) console.error('Removing old inventory files failed', rmError);
  }
}

/**
 * Save a stored copy to this computer under its original name.
 * @param {{ storage_path: string, original_filename: string }} row
 */
export async function downloadCsv(row) {
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
