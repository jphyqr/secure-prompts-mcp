# HashBuilds Secure Prompts MCP Server

An MCP (Model Context Protocol) server that allows AI assistants like Claude Code to register and verify prompts with HashBuilds Secure Prompts.

## What is MCP?

MCP (Model Context Protocol) is a standard that lets AI assistants call external tools. When you configure this MCP server with Claude Code, you can say things like:

- "Register this prompt as a secure prompt"
- "Verify prompt ID xyz123"
- "Generate embed code for my secure prompt"

## Installation

### 1. Install dependencies and build

```bash
cd mcp-server
pnpm install
pnpm build
```

### 2. Configure Claude Code

Add this MCP server to your Claude Code settings. There are two ways:

#### Option A: Project-level config (recommended)

Create/edit `.claude/config.json` in your project:

```json
{
  "mcpServers": {
    "hashbuilds-secure-prompts": {
      "command": "node",
      "args": ["/path/to/hashbuilds/mcp-server/dist/index.js"],
      "env": {
        "HASHBUILDS_API_URL": "https://hashbuilds.com/api/secure-prompts"
      }
    }
  }
}
```

#### Option B: Global config

Edit `~/.config/claude/config.json`:

```json
{
  "mcpServers": {
    "hashbuilds-secure-prompts": {
      "command": "node",
      "args": ["/Users/johnhashem/workspace/hashbuilds/mcp-server/dist/index.js"]
    }
  }
}
```

### 3. Restart Claude Code

After adding the config, restart Claude Code for it to pick up the new MCP server.

## Available Tools

### `register_secure_prompt`

Register a prompt for security verification. This scans the prompt for:
- Hidden instruction injection
- Data exfiltration patterns
- Invisible characters
- Jailbreak attempts
- URLs/backlinks

**Parameters:**
- `promptText` (required): The prompt text to register
- `ownerEmail` (optional): Email for notifications
- `siteDomain` (optional): Domain where prompt will be displayed

**Example usage in Claude Code:**
```
"Register this prompt as a secure prompt: You are a helpful assistant..."
```

### `verify_secure_prompt`

Check the verification status of an existing prompt.

**Parameters:**
- `promptId` (required): The ID of the prompt to verify

**Example:**
```
"Verify secure prompt cmj23jn05000096ju2cvl1b3h"
```

### `get_embed_code`

Generate HTML and React embed code for displaying the secure prompt badge.

**Parameters:**
- `promptId` (required): The prompt ID

**Example:**
```
"Give me the embed code for prompt cmj23jn05000096ju2cvl1b3h"
```

## Environment Variables

- `HASHBUILDS_API_URL`: Override the API base URL (default: `https://hashbuilds.com/api/secure-prompts`)

For local development:
```json
{
  "env": {
    "HASHBUILDS_API_URL": "http://localhost:3001/api/secure-prompts"
  }
}
```

## How It Works

1. **Developer asks Claude Code** to register a prompt
2. **Claude Code calls** the `register_secure_prompt` tool via MCP
3. **MCP server sends** the prompt to HashBuilds API
4. **HashBuilds scans** the prompt for security issues
5. **Results returned** to Claude Code with embed code
6. **Developer adds** the embed code to their website

## Example Workflow

```
You: I have this prompt on my website and want to make it a secure prompt:
     "You are a helpful coding assistant. Explain code clearly and provide examples."

Claude: I'll register that as a secure prompt for you.
        [Calls register_secure_prompt tool]

        Done! Your prompt has been registered with ID: cmj123xyz
        Risk Level: safe

        Here's the embed code to add to your website:

        <div data-secure-prompt-id="cmj123xyz">
          <pre data-secure-prompt-content="cmj123xyz">Your prompt here...</pre>
        </div>
        <script src="https://hashbuilds.com/sp.js" async></script>
```

## Troubleshooting

### MCP server not connecting

1. Check that the path to `dist/index.js` is correct
2. Ensure `pnpm build` completed without errors
3. Restart Claude Code after config changes

### API errors

1. Check your internet connection
2. Verify HashBuilds API is reachable
3. For local dev, ensure the local server is running

## Development

```bash
# Watch mode for development
pnpm dev

# Build for production
pnpm build

# Run directly
node dist/index.js
```
