# Claude Search - Quick Usage Guide

## Quick Start

```bash
# Install dependencies
bun install

# Search and select interactively (default)
bun run index.ts "your search query"

# Or use the npm script
bun search "your search query"
```

## Interactive Workflow

1. **Run a search**
   ```bash
   bun run index.ts "authentication methods"
   ```

2. **Browse results**
   - Use `↑` and `↓` arrow keys to navigate
   - Results are sorted by relevance (lower % = better match)
   - Each result shows: `[distance%] date | role | project path`
   - Preview text is shown below each result

3. **Select a conversation**
   - Press `Enter` to select
   - The full conversation (including all tool uses and results) will be copied to clipboard
   - Or select "❌ Cancel" to exit

4. **Paste the conversation**
   - The entire conversation is now in your clipboard
   - Paste it anywhere: another Claude conversation, a file, documentation, etc.

## Command Options

```bash
# Show more results (default is 10)
bun run index.ts "query" --top-k 20

# Filter by maximum distance (lower = more similar)
bun run index.ts "query" --max-distance 0.3

# Use plain text output (no interactive menu)
bun run index.ts "query" --no-interactive
```

## What Gets Copied

When you select a conversation, you get:

- **All user messages** with timestamps
- **All assistant messages** with timestamps
- **All tool uses** with full input parameters
- **All tool results** with complete output
- Formatted for easy reading

## Example Queries

```bash
# Find conversations about specific topics
bun run index.ts "authentication"
bun run index.ts "database schema"
bun run index.ts "error handling"

# Find conversations about bugs
bun run index.ts "bug in login form"
bun run index.ts "fixing the API"

# Find conversations about technologies
bun run index.ts "react hooks"
bun run index.ts "typescript generics"
bun run index.ts "docker setup"

# Find conversations about features
bun run index.ts "implementing search"
bun run index.ts "adding pagination"
```

## Tips

- **Be specific**: More specific queries return better results
- **Use keywords**: Include important technical terms
- **Check the distance**: Lower percentages mean better matches
- **Browse multiple results**: Sometimes the 2nd or 3rd result is more relevant
- **Use --top-k**: If you don't see what you want, increase the result count

## Keyboard Shortcuts

In the interactive menu:
- `↑` / `↓` - Navigate results
- `Enter` - Select and copy conversation
- `Ctrl+C` - Cancel/exit

## npm Scripts

```bash
# Interactive search (default)
bun search "query"

# Direct interactive (same as above)
bun interactive "query"

# Plain text output
bun plain "query"

# Extract all text (for debugging)
bun extract
```

## Troubleshooting

### "search command not found"
Install semtools:
```bash
npm install -g @llamaindex/semtools
```

### "No results found"
- Try a broader query
- Increase --max-distance: `--max-distance 0.5`
- Check that you have conversation history in `~/.claude/projects/`

### "Failed to copy to clipboard"
- **macOS**: Should work out of the box (uses `pbcopy`)
- **Linux**: Install `xclip`: `sudo apt-get install xclip`
- **Windows**: Should work out of the box (uses `clip`)

## Advanced Usage

### Pipe to other tools

```bash
# Extract and search with custom tools
bun extract | grep "authentication"

# Get metadata for all conversations
bun run extract-with-metadata.ts | jq '.projectPath' | sort | uniq
```

### Custom filtering

```bash
# Very strict filtering (only very similar results)
bun run index.ts "query" --max-distance 0.2

# Relaxed filtering (more diverse results)
bun run index.ts "query" --max-distance 0.6

# Many results for browsing
bun run index.ts "query" --top-k 50
```
