#!/usr/bin/env bun

import { readdir } from "fs/promises";
import { join, basename, dirname } from "path";
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

interface TextEntry {
  text: string;
  filePath: string;
  projectPath: string;
  cwd?: string;
  timestamp?: string;
  role?: string;
  sessionId?: string;
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

async function* extractTextFromFile(filePath: string): AsyncGenerator<TextEntry> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  // Extract project path from file path
  const fileName = basename(filePath, '.jsonl');
  const parentDir = dirname(filePath);
  const projectPath = basename(parentDir);

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const record: JSONLRecord = JSON.parse(line);

      // Extract text from message content
      if (record.message?.content) {
        const content = record.message.content;
        const texts: string[] = [];

        if (typeof content === 'string') {
          // Simple string content
          if (content.trim()) {
            texts.push(content);
          }
        } else if (Array.isArray(content)) {
          // Array of content blocks
          for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
              texts.push(block.text);
            }
          }
        }

        // Yield each text with metadata
        for (const text of texts) {
          yield {
            text,
            filePath,
            projectPath,
            cwd: record.cwd,
            timestamp: record.timestamp,
            role: record.message.role,
            sessionId: record.sessionId || fileName,
          };
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
  const entries: TextEntry[] = [];

  try {
    // Collect all entries
    for await (const filePath of walkDir(projectsDir)) {
      for await (const entry of extractTextFromFile(filePath)) {
        entries.push(entry);
      }
    }

    // Output as JSONL for later processing
    for (const entry of entries) {
      console.log(JSON.stringify(entry));
    }
  } catch (error) {
    console.error('Error extracting text:', error);
    process.exit(1);
  }
}

main();
