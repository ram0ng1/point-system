#!/usr/bin/env node
/**
 * Fails when the @ts-nocheck count in src/ grows past the recorded floor.
 *
 * Existing files are grandfathered; new files must be type-clean.
 * Lower FLOOR as @ts-nocheck declarations are removed so the count can
 * never rise again.
 */
const fs = require('node:fs');
const path = require('node:path');

const FLOOR = 42;
const ROOT = path.resolve(__dirname, '..', 'src');

let count = 0;
const offenders = [];

function walk(dir) {
  let entries;
  try {
    // withFileTypes returns Dirent objects with isFile()/isDirectory(),
    // letting us classify without a follow-up stat() — that pair was the
    // TOCTOU window CodeQL flagged.
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (!entry.isFile() || !/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      continue;
    }

    // Open the file as a descriptor and read from the fd. The fd is bound
    // to the inode opened at this instant, so even if the path is swapped
    // mid-walk the bytes we inspect come from the file we identified.
    let fd;
    try {
      fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(200);
      const n = fs.readSync(fd, buf, 0, 200, 0);
      const head = buf.toString('utf8', 0, n);
      if (/^\s*(\/\/|\/\*)\s*@ts-nocheck/m.test(head)) {
        count++;
        offenders.push(path.relative(ROOT, full));
      }
    } catch {
      // Unreadable file (permissions, removed mid-walk) — skip silently.
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
    }
  }
}

walk(ROOT);

if (count > FLOOR) {
  console.error(`@ts-nocheck count (${count}) exceeds floor (${FLOOR}).`);
  console.error('Either lower the floor in scripts/nocheck-floor.js, or remove @ts-nocheck from new files:');
  for (const f of offenders) console.error('  - ' + f);
  process.exit(1);
}

if (count < FLOOR) {
  console.log(`@ts-nocheck count (${count}) is below floor (${FLOOR}). Lower FLOOR in scripts/nocheck-floor.js to lock in the improvement.`);
}

console.log(`@ts-nocheck count: ${count} / floor ${FLOOR}. OK.`);
