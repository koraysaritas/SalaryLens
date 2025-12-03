#!/usr/bin/env node
/**
 * Build script for SalaryLens
 * Injects cache-busting version parameters into index.html
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

// Generate version based on current timestamp
const version = Date.now();

console.log(`🔨 Building SalaryLens with version: ${version}`);

// Read the index.html file
let html = fs.readFileSync(INDEX_HTML, 'utf8');

// Replace static file references with versioned ones
// Match: href="./styles.css" or src="./app.js"
html = html.replace(
    /(<link\s+rel="stylesheet"\s+href="\.\/styles\.css)("\s*\/?>)/gi,
    `$1?v=${version}$2`
);

html = html.replace(
    /(<script\s+src="\.\/app\.js)(">)/gi,
    `$1?v=${version}$2`
);

// Also handle favicon for completeness
html = html.replace(
    /(<link\s+rel="icon"\s+href="\.\/favicon\.svg)("\s*type="image\/svg\+xml"\s*\/?>)/gi,
    `$1?v=${version}$2`
);

// Write the updated HTML back
fs.writeFileSync(INDEX_HTML, html, 'utf8');

console.log('✅ Successfully injected version parameters into index.html');
console.log(`   - styles.css?v=${version}`);
console.log(`   - app.js?v=${version}`);
console.log(`   - favicon.svg?v=${version}`);
