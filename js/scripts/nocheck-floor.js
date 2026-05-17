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
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      const head = fs.readFileSync(full, 'utf8').slice(0, 200);
      if (/^\s*(\/\/|\/\*)\s*@ts-nocheck/m.test(head)) {
        count++;
        offenders.push(path.relative(ROOT, full));
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
