#!/usr/bin/env bun

import { spawn } from "child_process";
import { join } from "path";
import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { tmpdir } from "os";
import { mkdir } from "fs/promises";

interface SearchOptions {
  topK?: number;
  maxDistance?: number;
  context?: number;
}

interface TextEntry {
  text: string;
  filePath: string;
  projectPath: string;
  timestamp?: string;
  role?: string;
  sessionId?: string;
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

Usage: bun run search-with-context.ts <query> [options]

Arguments:
  <query>               Search query (semantic matching)

Options:
  --top-k <number>      Number of results to return (default: 3)
  --max-distance <num>  Maximum cosine distance threshold (0.0+)
  --context <number>    Lines of context before/after match (default: 3)
  -h, --help           Show this help message

Examples:
  bun run search-with-context.ts "authentication methods" --top-k 5
  bun run search-with-context.ts "bug in user registration" --max-distance 0.3
  bun run search-with-context.ts "react hooks" --context 5
`);
}

async function extractMetadata(): Promise<{ entries: TextEntry[]; tempFile: string }> {
  const extractScript = join(import.meta.dir, 'extract-with-metadata.ts');
  const tempFile = join(tmpdir(), `claude-search-${Date.now()}.txt`);

  return new Promise((resolve, reject) => {
    const entries: TextEntry[] = [];
    const textLines: string[] = [];

    const extract = spawn('bun', ['run', extractScript], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    const rl = createInterface({
      input: extract.stdout,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      try {
        const entry: TextEntry = JSON.parse(line);
        entries.push(entry);
        // Store text with newlines replaced for search
        textLines.push(entry.text.replace(/\n/g, ' '));
      } catch (error) {
        // Skip invalid lines
      }
    });

    extract.on('error', reject);

    extract.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Extraction failed with code ${code}`));
        return;
      }

      // Write text lines to temp file for search
      const writeStream = createWriteStream(tempFile);
      for (const line of textLines) {
        writeStream.write(line + '\n');
      }
      writeStream.end();

      await new Promise((resolveWrite) => writeStream.on('finish', resolveWrite));
      resolve({ entries, tempFile });
    });
  });
}

async function performSearch(
  tempFile: string,
  query: string,
  options: SearchOptions
): Promise<Array<{ lineNumber: number; distance: number }>> {
  return new Promise((resolve, reject) => {
    const searchArgs = [query, tempFile, '-n', '0']; // No context, we'll add it ourselves

    if (options.maxDistance !== undefined) {
      searchArgs.push('-m', options.maxDistance.toString());
    } else {
      searchArgs.push('--top-k', options.topK!.toString());
    }

    const search = spawn('search', searchArgs, {
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    let output = '';
    search.stdout.on('data', (data) => {
      output += data.toString();
    });

    search.on('error', (error) => {
      reject(new Error('Make sure "search" command is installed (npm install -g @llamaindex/semtools)'));
    });

    search.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Search failed with code ${code}`));
        return;
      }

      // Parse search output
      const results: Array<{ lineNumber: number; distance: number }> = [];
      const lines = output.split('\n');

      for (const line of lines) {
        // Match format: filename:123::456 (0.123456) or <stdin>:123::456 (0.123456)
        const match = line.match(/^[^:]+:(\d+)::(\d+)\s+\(([0-9.]+)\)/);
        if (match) {
          results.push({
            lineNumber: parseInt(match[1], 10),
            distance: parseFloat(match[3]),
          });
        }
      }

      resolve(results);
    });
  });
}

function formatResult(entry: TextEntry, distance: number, index: number) {
  const date = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Unknown date';
  const role = entry.role ? entry.role.toUpperCase() : 'UNKNOWN';
  const project = entry.projectPath.replace(/-/g, '/');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Result ${index + 1} - Distance: ${distance.toFixed(4)}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Project: ${project}`);
  console.log(`Role: ${role}`);
  console.log(`Date: ${date}`);
  console.log(`Session: ${entry.sessionId}`);
  console.log(`${'-'.repeat(80)}`);

  // Show text with some formatting
  const text = entry.text.length > 500
    ? entry.text.substring(0, 500) + '...'
    : entry.text;
  console.log(text);
  console.log('');
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

  console.log('Extracting text from Claude projects...');
  const { entries, tempFile } = await extractMetadata();
  console.log(`Found ${entries.length} text entries across all conversations.\n`);

  console.log(`Searching for: "${query}"\n`);
  const results = await performSearch(tempFile, query, options);

  if (results.length === 0) {
    console.log('No results found.');
    process.exit(0);
  }

  console.log(`Found ${results.length} result(s):\n`);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const entry = entries[result.lineNumber];
    if (entry) {
      formatResult(entry, result.distance, i);
    }
  }

  // Clean up temp file
  try {
    await Bun.write(tempFile, '');
  } catch {}
}

main();
