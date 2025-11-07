#!/usr/bin/env bun

import { readdir } from "fs/promises";
import { join } from "path";
import { createReadStream } from "fs";
import { createInterface } from "readline";

interface MessageContent {
  type: string;
  text?: string;
}

interface JSONLRecord {
  type?: string;
  message?: {
    role?: string;
    content?: string | MessageContent[];
  };
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      yield fullPath;
    }
  }
}

async function* extractTextFromFile(filePath: string): AsyncGenerator<string> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const record: JSONLRecord = JSON.parse(line);

      // Extract text from message content
      if (record.message?.content) {
        const content = record.message.content;

        if (typeof content === 'string') {
          // Simple string content
          if (content.trim()) {
            yield content;
          }
        } else if (Array.isArray(content)) {
          // Array of content blocks
          for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
              yield block.text;
            }
          }
        }
      }
    } catch (error) {
      // Skip invalid JSON lines
      continue;
    }
  }
}

async function main() {
  const projectsDir = join(process.env.HOME || '~', '.claude', 'projects');

  try {
    for await (const filePath of walkDir(projectsDir)) {
      for await (const text of extractTextFromFile(filePath)) {
        // Output one line per text entry for search to consume
        // Replace newlines with spaces to keep each entry on one line
        console.log(text.replace(/\n/g, ' '));
      }
    }
  } catch (error) {
    console.error('Error extracting text:', error);
    process.exit(1);
  }
}

main();
