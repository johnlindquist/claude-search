#!/usr/bin/env bun

import { spawn } from "child_process";
import { join } from "path";
import { readFileSync } from "fs";

interface TestResult {
  query: string;
  resultCount: number;
  avgDistance: number;
  minDistance: number;
  maxDistance: number;
  tooMany: boolean;
}

async function runSearch(query: string, maxDistance?: number): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const args = ['run', join(import.meta.dir, 'interactive-search.ts'), query];
    if (maxDistance) {
      args.push('--max-distance', maxDistance.toString());
    }

    const proc = spawn('bun', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', () => {
      // Parse output
      const resultMatch = output.match(/Found (\d+) result/);
      const resultCount = resultMatch ? parseInt(resultMatch[1]) : 0;
      const tooMany = output.includes('Too many results');

      // Extract distances from output if available
      const distances: number[] = [];
      const distanceMatches = output.matchAll(/Distance: ([\d.]+)/g);
      for (const match of distanceMatches) {
        distances.push(parseFloat(match[1]));
      }

      const avgDistance = distances.length > 0
        ? distances.reduce((a, b) => a + b, 0) / distances.length
        : 0;

      resolve({
        query,
        resultCount,
        avgDistance,
        minDistance: distances.length > 0 ? Math.min(...distances) : 0,
        maxDistance: distances.length > 0 ? Math.max(...distances) : 0,
        tooMany,
      });
    });

    proc.on('error', reject);
  });
}

async function main() {
  // Read test queries
  const queriesFile = join(import.meta.dir, 'test-queries.txt');
  const content = readFileSync(queriesFile, 'utf-8');
  const queries = content
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.trim());

  console.log(`Testing ${queries.length} queries...\n`);

  // Test different distance thresholds
  const thresholds = [0.3, 0.4, 0.5, 0.6];

  for (const threshold of thresholds) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing with max-distance: ${threshold}`);
    console.log('='.repeat(80));

    const results: TestResult[] = [];
    let tooManyCount = 0;
    let goodCount = 0;

    for (const query of queries) {
      const result = await runSearch(query, threshold);
      results.push(result);

      if (result.tooMany) {
        tooManyCount++;
      } else if (result.resultCount > 0 && result.resultCount <= 25) {
        goodCount++;
      }

      process.stdout.write('.');
    }

    console.log('\n');

    // Calculate statistics
    const totalResults = results.reduce((sum, r) => sum + r.resultCount, 0);
    const avgResults = totalResults / results.length;
    const withResults = results.filter(r => r.resultCount > 0).length;
    const noResults = results.filter(r => r.resultCount === 0).length;

    console.log(`Summary for threshold ${threshold}:`);
    console.log(`  Total queries: ${queries.length}`);
    console.log(`  With results: ${withResults} (${(withResults / queries.length * 100).toFixed(1)}%)`);
    console.log(`  No results: ${noResults} (${(noResults / queries.length * 100).toFixed(1)}%)`);
    console.log(`  Too many (>25): ${tooManyCount} (${(tooManyCount / queries.length * 100).toFixed(1)}%)`);
    console.log(`  Good range (1-25): ${goodCount} (${(goodCount / queries.length * 100).toFixed(1)}%)`);
    console.log(`  Avg results per query: ${avgResults.toFixed(1)}`);

    // Show some examples
    console.log(`\nExamples:`);
    const samples = results.slice(0, 5);
    for (const sample of samples) {
      console.log(`  "${sample.query}": ${sample.resultCount} results ${sample.tooMany ? '(TOO MANY)' : ''}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('Recommendation:');

  // Analyze which threshold gives best results
  console.log('Based on the test results above, choose a threshold that:');
  console.log('  - Returns results for most queries (high % with results)');
  console.log('  - Keeps result count manageable (high % in 1-25 range)');
  console.log('  - Minimizes "too many results" warnings');
}

main();
