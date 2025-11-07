import { createReadStream } from "fs";
import { createInterface } from "readline";

interface MessageContent {
  type: string;
  text?: string;
  [key: string]: any;
}

interface ToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: any;
}

interface JSONLRecord {
  type?: string;
  message?: {
    role?: string;
    content?: string | Array<MessageContent | ToolUse | ToolResult>;
  };
  timestamp?: string;
  uuid?: string;
  parentUuid?: string;
  [key: string]: any;
}

interface ConversationEntry {
  role: string;
  timestamp?: string;
  content: Array<{
    type: string;
    text?: string;
    tool_name?: string;
    tool_input?: any;
    tool_result?: any;
    [key: string]: any;
  }>;
}

export async function extractConversation(filePath: string, sessionId: string): Promise<string> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const entries: ConversationEntry[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const record: JSONLRecord = JSON.parse(line);

      // Only process user and assistant messages
      if (record.message && record.message.role) {
        const role = record.message.role;
        const content = record.message.content;
        const contentBlocks: Array<any> = [];

        if (typeof content === 'string') {
          contentBlocks.push({ type: 'text', text: content });
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              contentBlocks.push({ type: 'text', text: block.text });
            } else if (block.type === 'tool_use') {
              contentBlocks.push({
                type: 'tool_use',
                tool_name: block.name,
                tool_input: block.input,
              });
            } else if (block.type === 'tool_result') {
              contentBlocks.push({
                type: 'tool_result',
                tool_result: block.content,
              });
            }
          }
        }

        if (contentBlocks.length > 0) {
          entries.push({
            role,
            timestamp: record.timestamp,
            content: contentBlocks,
          });
        }
      }
    } catch (error) {
      // Skip invalid JSON lines
      continue;
    }
  }

  // Format as readable conversation
  return formatConversation(entries);
}

function formatConversation(entries: ConversationEntry[]): string {
  let output = '';

  for (const entry of entries) {
    const timestamp = entry.timestamp
      ? new Date(entry.timestamp).toLocaleString()
      : '';

    output += `\n${'='.repeat(80)}\n`;
    output += `${entry.role.toUpperCase()}`;
    if (timestamp) {
      output += ` - ${timestamp}`;
    }
    output += `\n${'='.repeat(80)}\n\n`;

    for (const block of entry.content) {
      if (block.type === 'text') {
        output += block.text + '\n\n';
      } else if (block.type === 'tool_use') {
        output += `[TOOL USE: ${block.tool_name}]\n`;
        output += JSON.stringify(block.tool_input, null, 2) + '\n\n';
      } else if (block.type === 'tool_result') {
        output += `[TOOL RESULT]\n`;
        if (typeof block.tool_result === 'string') {
          output += block.tool_result + '\n\n';
        } else {
          output += JSON.stringify(block.tool_result, null, 2) + '\n\n';
        }
      }
    }
  }

  return output;
}
