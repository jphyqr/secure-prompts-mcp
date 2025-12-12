# Quick Setup Guide

## Step 1: Add MCP Server to Claude Code

Run this command to add the MCP server to your Claude Code settings:

```bash
# Add to global settings
claude mcp add hashbuilds-secure-prompts node /Users/johnhashem/workspace/hashbuilds/mcp-server/dist/index.js
```

Or manually edit `~/.claude/settings.json` and add:

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

## Step 2: Restart Claude Code

After adding the config, restart Claude Code (Cmd+Shift+P > "Developer: Reload Window" in VS Code, or restart the terminal session).

## Step 3: Test It

Ask Claude Code:
- "Register this as a secure prompt: You are a helpful assistant..."
- "Verify secure prompt cmj23jn05000096ju2cvl1b3h"
- "Get embed code for prompt cmj23jn05000096ju2cvl1b3h"

## For Local Development

To test against localhost:3001:

```json
{
  "mcpServers": {
    "hashbuilds-secure-prompts": {
      "command": "node",
      "args": ["/Users/johnhashem/workspace/hashbuilds/mcp-server/dist/index.js"],
      "env": {
        "HASHBUILDS_API_URL": "http://localhost:3001/api/secure-prompts"
      }
    }
  }
}
```
