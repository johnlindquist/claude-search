# Claude Search

Semantic search tool for searching across your entire Claude conversation history stored in `~/.claude/projects/`.

## Overview

This tool extracts all text content from your Claude Code conversation history (JSONL files) and performs semantic search using embeddings. It helps you quickly find relevant conversations, answers, and discussions from your past Claude sessions.

## Features

- **Interactive Selection**: Browse search results with an interactive menu
- **Semantic Search**: Uses AI embeddings (via semtools) for intelligent, meaning-based search
- **Full Conversation Export**: Copies entire conversations (including tool uses) to clipboard
- **Rich Metadata**: Shows project, role (user/assistant), timestamp, and session info
- **Fast**: Processes thousands of conversation entries efficiently
- **Cross-Platform**: Built with Bun and TypeScript (clipboard support for macOS, Linux, Windows)

## Prerequisites

1. **Bun**: Install from [bun.sh](https://bun.sh)
2. **semtools search command**: Install via npm
   ```bash
   npm install -g @llamaindex/semtools
   ```

## Installation

```bash
bun install
```

## Usage

### Interactive Search (Default)

The default mode shows an interactive menu where you can browse results and select one to copy the full conversation to clipboard:

```bash
bun run index.ts "your search query"
```

**Workflow:**
1. Enter your search query
2. Browse the sorted results (by relevance/distance)
3. Select a result with arrow keys
4. Press Enter to copy the full conversation to clipboard
5. Paste anywhere!

### Examples

```bash
# Interactive search with default settings (top 10 results)
bun run index.ts "authentication methods"

# Show more results in the menu
bun run index.ts "react hooks" --top-k 15

# Filter by distance threshold
bun run index.ts "bug in user registration" --max-distance 0.4
```

### Non-Interactive Mode

If you prefer plain text output without the interactive menu:

```bash
bun run index.ts "your query" --no-interactive
```

### Options

- `--max-distance <number>`: Maximum cosine distance threshold (0.0-1.0)
  - **Recommended:** `0.4` for precision (fewer, more relevant results)
  - **Recommended:** `0.5` for recall (more results, broader matches)
  - Based on testing 28 real queries across conversation history
- `--top-k <number>`: Max results (default: 1000, warns if >25)
- `--no-interactive`: Disable interactive menu, show plain text output
- `-h, --help`: Show help message

### Distance Threshold Guide

Based on automated testing with 28 real conversation queries:

| Threshold | Results Found | Good Range (1-25) | Avg Results | Best For |
|-----------|---------------|-------------------|-------------|----------|
| 0.3       | 14.3%         | 14.3%            | 1.0         | Very specific, exact matches |
| **0.4**   | 46.4%         | **42.9%**        | 4.9         | **Precision** - fewer false positives |
| **0.5**   | 71.4%         | 50.0%            | 22.1        | **Recall** - broader search |
| 0.6       | 89.3%         | 28.6%            | 91.0        | Too broad, many results |

**Recommendation**: Start with `--max-distance 0.4` for precise results, use `0.5` if you need broader matches.

## How It Works

1. **Extract**: Scans all `~/.claude/projects/**/*.jsonl` files
2. **Parse**: Extracts text content from conversation messages (both user and assistant)
3. **Index**: Creates a searchable index with metadata (project, timestamp, role, session)
4. **Search**: Uses semtools' semantic search to find relevant matches
5. **Interactive Menu**: Browse results sorted by relevance (distance score)
6. **Export**: Select a result to extract and copy the full conversation to clipboard

## Example Output

### Interactive Mode

```
Extracting text from Claude projects...
Found 3936 text entries across all conversations.

Searching for: "authentication methods"

Found 5 result(s). Select one to copy the full conversation to clipboard:

? Select a result to copy the full conversation: (Use arrow keys)
❯ [12.1%] 10/29/2025 | USER | prompt/images/examples
    What authentication methods are supported?
  [31.9%] 10/27/2025 | ASSISTANT | claude/images/context
    I'll read both documentation images to identify the authentication methods...
  [32.9%] 10/27/2025 | ASSISTANT | claude/images/context
    I'll read both documentation pages to identify the authentication methods...
  ❌ Cancel

Extracting full conversation...

✅ Full conversation copied to clipboard!

Conversation details:
  Project: /Users/username/dev/claude/images/context/prompt/images/examples
  Session: 0915f0e3-b227-4ab8-9817-32978baaf371
  File: /Users/username/.claude/projects/.../0915f0e3-b227-4ab8-9817-32978baaf371.jsonl
```

### Copied Conversation Format

The clipboard will contain the full conversation with all text and tool uses:

```
================================================================================
USER - 10/29/2025, 11:33:56 AM
================================================================================

What authentication methods are supported?

================================================================================
ASSISTANT - 10/29/2025, 11:34:02 AM
================================================================================

I'll read the documentation to find the authentication methods.

[TOOL USE: Read]
{
  "file_path": "/path/to/docs/auth.md"
}

[TOOL RESULT]
... content of the file ...

Based on the documentation, there are three authentication methods:
1. API Key
2. OAuth 2.0
3. JWT tokens
...
```

## Scripts

- `bun run index.ts`: Main search interface (interactive by default)
- `bun run interactive-search.ts`: Direct access to interactive search
- `bun run search-with-context.ts`: Plain text search with formatted output
- `bun run extract-text.ts`: Simple text extraction (no metadata)
- `bun run extract-with-metadata.ts`: Text extraction with full metadata
- `extract-conversation.ts`: Library for extracting full conversations (imported by interactive-search)

## Project Structure

- `index.ts`: Main entry point (routes to interactive or plain search)
- `interactive-search.ts`: Interactive search with menu and clipboard export
- `extract-conversation.ts`: Library for extracting full conversations from JSONL
- `search-with-context.ts`: Plain text search with formatted output
- `extract-with-metadata.ts`: Extracts text with metadata from JSONL files
- `extract-text.ts`: Simple text extraction for piping to search
- `claude-search.ts`: Legacy search wrapper (simple version)

## Credits

Built using:
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [semtools](https://github.com/run-llama/semtools) - Semantic search tools by LlamaIndex
- TypeScript

## License

MIT
