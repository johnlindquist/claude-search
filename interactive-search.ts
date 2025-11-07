#!/usr/bin/env bun

import { spawn } from "child_process";
import { join } from "path";
import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { tmpdir } from "os";
import { select } from "@inquirer/prompts";
import { ExitPromptError } from "@inquirer/core";
import { extractConversation } from "./extract-conversation";

interface SearchOptions {
  topK?: number;
  maxDistance?: number;
}

interface TextEntry {
  text: string;
  filePath: string;
  projectPath: string;
  cwd?: string;
  timestamp?: string;
  role?: string;
  sessionId?: string;
}

interface SearchResult {
  lineNumber: number;
  distance: number;
  entry: TextEntry;
}

function parseArgs(args: string[]): { query: string; options: SearchOptions } {
  const options: SearchOptions = {
    topK: 1000, // Large number to get all results, will warn if > 25
  };

  let query = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--top-k' && i + 1 < args.length) {
      options.topK = parseInt(args[++i], 10);
    } else if (arg === '--max-distance' && i + 1 < args.length) {
      options.maxDistance = parseFloat(args[++i]);
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
Claude Search (Interactive) - Search and copy conversations to clipboard

Usage: bun run interactive-search.ts <query> [options]

Arguments:
  <query>               Search query (semantic matching)

Options:
  --max-distance <num>  Maximum cosine distance threshold (0.0-1.0)
                        Recommended values based on testing:
                        - 0.4 for precision (fewer, more relevant results)
                        - 0.5 for recall (more results, broader matches)
  --top-k <number>      Max results (default: 1000, warns if >25)
  -h, --help           Show this help message

Examples:
  bun run interactive-search.ts "authentication methods"
  bun run interactive-search.ts "bug fixes" --max-distance 0.4
  bun run interactive-search.ts "react hooks" --max-distance 0.5
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
): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const searchArgs = [query, tempFile, '-n', '0'];

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

    search.on('error', () => {
      reject(new Error('Make sure "search" command is installed (npm install -g @llamaindex/semtools)'));
    });

    search.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Search failed with code ${code}`));
        return;
      }

      const results: SearchResult[] = [];
      const lines = output.split('\n');

      for (const line of lines) {
        const match = line.match(/^[^:]+:(\d+)::(\d+)\s+\(([0-9.]+)\)/);
        if (match) {
          results.push({
            lineNumber: parseInt(match[1], 10),
            distance: parseFloat(match[3]),
            entry: null as any, // Will be filled in
          });
        }
      }

      resolve(results);
    });
  });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

async function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use pbcopy on macOS, xclip on Linux, clip on Windows
    let command: string;
    let args: string[] = [];

    if (process.platform === 'darwin') {
      command = 'pbcopy';
    } else if (process.platform === 'win32') {
      command = 'clip';
    } else {
      command = 'xclip';
      args = ['-selection', 'clipboard'];
    }

    const proc = spawn(command, args, {
      stdio: ['pipe', 'ignore', 'inherit'],
    });

    proc.stdin.write(text);
    proc.stdin.end();

    proc.on('error', (error) => {
      reject(new Error(`Failed to copy to clipboard: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Failed to copy to clipboard'));
      }
    });
  });
}

async function handleTooManyResults(
  resultCount: number,
  query: string,
  entries: TextEntry[],
  tempFile: string
): Promise<void> {
  console.log(`\n⚠️  Too many results (${resultCount}).`);

  let choice: string | number;
  try {
    choice = await select({
      message: 'How would you like to refine your search?',
      choices: [
        {
          name: '🎯 Auto - Automatically find optimal distance (recommended)',
          value: 'auto',
          description: 'Tries distances from 0.3 to 0.5 until results fit',
        },
        {
          name: '🔍 Distance 0.3 - Very specific (exact matches)',
          value: 0.3,
          description: 'Most restrictive, fewest results',
        },
        {
          name: '🎪 Distance 0.4 - Precision (recommended)',
          value: 0.4,
          description: 'Good balance of relevance and results',
        },
        {
          name: '🌊 Distance 0.5 - Recall (broader)',
          value: 0.5,
          description: 'More results, broader matches',
        },
        {
          name: '❌ Cancel',
          value: 'cancel',
          description: 'Exit search',
        },
      ],
    });
  } catch (error) {
    if (error instanceof ExitPromptError) {
      console.log('\n\nSearch cancelled.');
      process.exit(0);
    }
    throw error;
  }

  if (choice === 'cancel') {
    console.log('\nSearch cancelled.');
    process.exit(0);
  }

  if (choice === 'auto') {
    return await autoRefineSearch(query, entries, tempFile);
  }

  // Manual distance selection
  console.log(`\nSearching with distance ${choice}...`);
  const results = await performSearch(tempFile, query, { maxDistance: choice as number });

  if (results.length === 0) {
    console.log('No results found with this distance. Try a higher value.');
    return await handleTooManyResults(0, query, entries, tempFile);
  }

  if (results.length > 25) {
    console.log(`\nStill too many results (${results.length}).`);
    return await handleTooManyResults(results.length, query, entries, tempFile);
  }

  // Continue with normal flow
  await displayResultsAndCopy(results, entries, query, tempFile, choice as number);
}

async function autoRefineSearch(
  query: string,
  entries: TextEntry[],
  tempFile: string,
  maxAttempts: number = 15
): Promise<void> {
  console.log('\n🔄 Auto-refining search...\n');

  const distances = [0.3, 0.35, 0.4, 0.45, 0.5];
  let attempt = 0;
  let lastGoodDistance: number | null = null;
  let lastGoodCount = 0;
  let lastTooManyDistance: number | null = null;

  for (const distance of distances) {
    if (attempt++ >= maxAttempts) {
      console.log('\n⚠️  Max refinement attempts reached.');
      if (lastGoodDistance) {
        console.log(`Using best result with ${lastGoodCount} matches at distance ${lastGoodDistance}.\n`);
        const results = await performSearch(tempFile, query, { maxDistance: lastGoodDistance });
        await displayResultsAndCopy(results, entries, query, tempFile, lastGoodDistance);
        return;
      }
      console.log('Please try a more specific query.');
      process.exit(0);
    }

    console.log(`  Trying distance ${distance}...`);
    const results = await performSearch(tempFile, query, { maxDistance: distance });

    if (results.length === 0) {
      console.log(`    No results, trying broader...`);
      continue;
    }

    if (results.length <= 25) {
      console.log(`    ✅ Found ${results.length} results!\n`);
      await displayResultsAndCopy(results, entries, query, tempFile, distance);
      return;
    }

    console.log(`    Too many (${results.length}), trying stricter...`);

    // If we jumped from few/none to too many, or have a previous good distance
    if (lastGoodDistance !== null && lastGoodCount < 25) {
      lastTooManyDistance = distance;
      console.log(`  📊 Detected jump from ${lastGoodCount} to ${results.length} results.`);
      console.log(`  🎯 Fine-tuning between ${lastGoodDistance} and ${distance}...\n`);

      // Binary search between lastGoodDistance and current distance
      const refined = await binarySearchDistance(
        query,
        entries,
        tempFile,
        lastGoodDistance,
        distance,
        maxAttempts - attempt
      );

      if (refined) {
        return;
      }
    }

    // Track this as potentially useful for fine-tuning
    if (results.length <= 25) {
      lastGoodDistance = distance;
      lastGoodCount = results.length;
    }
  }

  // If we got here and have a lastGoodDistance, use it
  if (lastGoodDistance) {
    console.log(`\nUsing best result with ${lastGoodCount} matches at distance ${lastGoodDistance}.\n`);
    const results = await performSearch(tempFile, query, { maxDistance: lastGoodDistance });
    await displayResultsAndCopy(results, entries, query, tempFile, lastGoodDistance);
    return;
  }

  console.log('\n⚠️  Could not find a good distance threshold automatically.');
  console.log('Try refining your query or using a manual distance setting.');
  process.exit(0);
}

async function binarySearchDistance(
  query: string,
  entries: TextEntry[],
  tempFile: string,
  minDistance: number,
  maxDistance: number,
  remainingAttempts: number
): Promise<boolean> {
  let left = minDistance;
  let right = maxDistance;
  let bestDistance = minDistance;
  let bestCount = 0;
  let attempts = 0;

  while (attempts < remainingAttempts && right - left > 0.02) {
    const mid = (left + right) / 2;
    attempts++;

    console.log(`    Testing distance ${mid.toFixed(2)}...`);
    const results = await performSearch(tempFile, query, { maxDistance: mid });

    if (results.length === 0) {
      console.log(`      No results, going higher...`);
      left = mid;
      continue;
    }

    if (results.length <= 25) {
      console.log(`      Good! ${results.length} results.`);
      bestDistance = mid;
      bestCount = results.length;

      // If we're close to 25, this is great - use it
      if (results.length >= 15) {
        console.log(`    ✅ Found optimal: ${results.length} results at distance ${bestDistance.toFixed(2)}!\n`);
        await displayResultsAndCopy(results, entries, query, tempFile, bestDistance);
        return true;
      }

      // Try to get more results
      left = mid;
    } else {
      console.log(`      Too many (${results.length}), going lower...`);
      right = mid;
    }
  }

  // Use the best we found
  if (bestCount > 0) {
    console.log(`    ✅ Found ${bestCount} results at distance ${bestDistance.toFixed(2)}!\n`);
    const results = await performSearch(tempFile, query, { maxDistance: bestDistance });
    await displayResultsAndCopy(results, entries, query, tempFile, bestDistance);
    return true;
  }

  return false;
}

async function displayResultsAndCopy(
  results: SearchResult[],
  entries: TextEntry[],
  query: string,
  tempFile?: string,
  currentDistance?: number
): Promise<void> {
  // Attach entries to results
  for (const result of results) {
    result.entry = entries[result.lineNumber];
  }

  // Sort by distance (best matches first)
  results.sort((a, b) => a.distance - b.distance);

  console.log(`Found ${results.length} result(s).`);
  console.log(`Select one to copy the full conversation to clipboard:\n`);

  // Group results by cwd
  const groupedByCwd = results.reduce((groups, result) => {
    const cwd = result.entry.cwd || 'Unknown';
    if (!groups[cwd]) {
      groups[cwd] = [];
    }
    groups[cwd].push(result);
    return groups;
  }, {} as Record<string, typeof results>);

  // Create choices with separators for each cwd group
  const choices: any[] = [];
  const cwds = Object.keys(groupedByCwd).sort();

  cwds.forEach((cwd, cwdIndex) => {
    // Add separator for each group
    const cwdShort = cwd.split('/').slice(-2).join('/');
    choices.push({
      name: `\n─────── ${cwdShort} ───────`,
      value: -2,
      disabled: true,
    });

    // Add results for this cwd
    groupedByCwd[cwd].forEach((result, localIndex) => {
      const entry = result.entry;
      const date = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Unknown';
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const preview = truncate(entry.text, 150);

      choices.push({
        name: `  ${date} ${time} | ${entry.role?.toUpperCase() || 'N/A'} [${(result.distance * 100).toFixed(1)}%]\n    ${preview}`,
        value: results.indexOf(result), // Use global index
        description: `Full path: ${entry.cwd || 'N/A'} | Distance: ${result.distance.toFixed(4)}`,
      });
    });
  });

  // Add "go broader" option if we have few results and can go broader
  if (results.length < 25 && tempFile && currentDistance && currentDistance < 0.6) {
    choices.push({
      name: '\n🌊 Go Broader - Search with higher distance threshold',
      value: -3,
      description: `Try distance ${(currentDistance + 0.1).toFixed(1)} for more results`,
    });
  }

  // Add cancel option
  choices.push({
    name: '❌ Cancel',
    value: -1,
    description: 'Exit without copying',
  });

  let selectedIndex: number;
  try {
    selectedIndex = await select({
      message: 'Select a result to copy the full conversation:',
      choices,
      pageSize: 15,
    });
  } catch (error) {
    if (error instanceof ExitPromptError) {
      console.log('\n\nCancelled.');
      process.exit(0);
    }
    throw error;
  }

  if (selectedIndex === -1) {
    console.log('\nCancelled.');
    process.exit(0);
  }

  // Handle "go broader" option
  if (selectedIndex === -3 && tempFile && currentDistance) {
    const newDistance = currentDistance + 0.1;
    console.log(`\nSearching with broader distance ${newDistance.toFixed(1)}...`);
    const newResults = await performSearch(tempFile, query, { maxDistance: newDistance });

    if (newResults.length === 0) {
      console.log('No additional results found.');
      return await displayResultsAndCopy(results, entries, query, tempFile, currentDistance);
    }

    if (newResults.length > 25) {
      return await handleTooManyResults(newResults.length, query, entries, tempFile);
    }

    return await displayResultsAndCopy(newResults, entries, query, tempFile, newDistance);
  }

  const selected = results[selectedIndex];
  console.log('\nExtracting full conversation...');

  try {
    const conversation = await extractConversation(selected.entry.filePath, selected.entry.sessionId!);
    await copyToClipboard(conversation);

    console.log('\n✅ Full conversation copied to clipboard!');
    console.log(`\nConversation details:`);
    console.log(`  Project: ${selected.entry.projectPath.replace(/-/g, '/')}`);
    console.log(`  Session: ${selected.entry.sessionId}`);
    console.log(`  File: ${selected.entry.filePath}`);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
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

  // Attach entries to results
  for (const result of results) {
    result.entry = entries[result.lineNumber];
  }

  // Sort by distance (best matches first)
  results.sort((a, b) => a.distance - b.distance);

  console.log(`Found ${results.length} result(s).`);

  // Check if too many results - offer refinement
  if (results.length > 25) {
    return await handleTooManyResults(results.length, query, entries, tempFile);
  }

  // Continue with normal display and copy flow
  await displayResultsAndCopy(results, entries, query);
}

main();
