#!/usr/bin/env bun

import { spawn } from "child_process";
import { join } from "path";

interface SearchOptions {
  topK?: number;
  maxDistance?: number;
  context?: number;
}

function parseArgs(args: string[]): { query: string; options: SearchOptions } {
  const options: SearchOptions = {
    topK: 3,
    context: 3,
  };

  let query = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--top-k' && i + 1 < args.length) {
      options.topK = parseInt(args[++i], 10);
    } else if (arg === '--max-distance' && i + 1 < args.length) {
      options.maxDistance = parseFloat(args[++i]);
    } else if (arg === '--context' && i + 1 < args.length) {
      options.context = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      query = arg;
    }
  }

  return { query, options };
}

function printHelp() {
  console.log(`
Claude Search - Semantic search across your Claude conversation history

Usage: claude-search <query> [options]

Arguments:
  <query>               Search query (semantic matching)

Options:
  --top-k <number>      Number of results to return (default: 3)
  --max-distance <num>  Maximum cosine distance threshold (0.0+)
  --context <number>    Lines of context before/after match (default: 3)
  -h, --help           Show this help message

Examples:
  claude-search "authentication methods" --top-k 5
  claude-search "bug in user registration" --max-distance 0.3
  claude-search "react hooks" --context 5
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: Query is required\n');
    printHelp();
    process.exit(1);
  }

  const { query, options } = parseArgs(args);

  if (!query) {
    console.error('Error: Query is required\n');
    printHelp();
    process.exit(1);
  }

  // Build search command arguments
  const searchArgs = [query, '-n', options.context!.toString()];

  if (options.maxDistance !== undefined) {
    searchArgs.push('-m', options.maxDistance.toString());
  } else {
    searchArgs.push('--top-k', options.topK!.toString());
  }

  // Run extract-text.ts and pipe to search
  const extractScript = join(import.meta.dir, 'extract-text.ts');

  const extract = spawn('bun', ['run', extractScript], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const search = spawn('search', searchArgs, {
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  // Pipe extraction output to search input
  extract.stdout.pipe(search.stdin);

  // Handle errors
  extract.on('error', (error) => {
    console.error('Error running extraction:', error);
    process.exit(1);
  });

  search.on('error', (error) => {
    console.error('Error running search:', error);
    console.error('Make sure "search" command is installed (npm install -g @llamaindex/semtools)');
    process.exit(1);
  });

  search.on('close', (code) => {
    process.exit(code || 0);
  });
}

main();
