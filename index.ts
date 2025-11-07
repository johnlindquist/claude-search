#!/usr/bin/env bun

// Main entry point - delegates to interactive-search.ts by default
import { spawn } from "child_process";
import { join } from "path";

// Check for --no-interactive flag to use plain search
const args = process.argv.slice(2);
const useInteractive = !args.includes('--no-interactive');

// Remove the flag from args if present
const filteredArgs = args.filter(arg => arg !== '--no-interactive');

const searchScript = useInteractive
  ? join(import.meta.dir, 'interactive-search.ts')
  : join(import.meta.dir, 'search-with-context.ts');

const proc = spawn('bun', ['run', searchScript, ...filteredArgs], {
  stdio: 'inherit',
});

proc.on('exit', (code) => {
  process.exit(code || 0);
});