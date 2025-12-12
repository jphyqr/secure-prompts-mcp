#!/usr/bin/env node

/**
 * HashBuilds Secure Prompts MCP Server
 *
 * This MCP server allows AI assistants (like Claude Code) to:
 * 1. Register prompts for security verification
 * 2. Verify existing prompts
 * 3. List prompts for a domain
 *
 * The server communicates via stdio using the Model Context Protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration - can be overridden via environment variables
const API_BASE = process.env.HASHBUILDS_API_URL || "https://www.hashbuilds.com/api/secure-prompts";

/**
 * Register a prompt with HashBuilds Secure Prompts
 */
async function registerPrompt(args: {
  promptText: string;
  ownerEmail?: string;
  siteDomain?: string;
}): Promise<{
  success: boolean;
  id?: string;
  promptHash?: string;
  riskLevel?: string;
  riskScore?: number;
  summary?: string;
  promptLabel?: string;
  promptType?: string;
  recommendations?: string[];
  embedOptions?: object;
  implementationGuide?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || "Registration failed" };
    }

    const promptId = result.id;
    const scriptUrl = "https://www.hashbuilds.com/sp.js";

    // Generate multiple embed options for the implementing agent
    const embedOptions = {
      // Option 1: Full badge with prompt preview
      fullBadge: {
        description: "Shows security badge + prompt preview + copy button. Best for dedicated prompt pages.",
        html: `<div data-secure-prompt-id="${promptId}"></div>\n<script src="${scriptUrl}" async></script>`,
        react: `<>\n  <div data-secure-prompt-id="${promptId}" />\n  <Script src="${scriptUrl}" strategy="lazyOnload" />\n</>`
      },
      // Option 2: Compact link
      compactLink: {
        description: "Simple 'Copy Verified Prompt' link. Best for inline use or cards.",
        html: `<a href="https://www.hashbuilds.com/copy/${promptId}" target="_blank" rel="noopener" class="secure-prompt-link">Copy Verified ${result.promptLabel || 'Prompt'}</a>`,
        react: `<a href="https://www.hashbuilds.com/copy/${promptId}" target="_blank" rel="noopener" className="secure-prompt-link">Copy Verified ${result.promptLabel || 'Prompt'}</a>`
      },
      // Option 3: Icon button
      iconButton: {
        description: "Small shield icon button. Best for tight spaces.",
        html: `<a href="https://www.hashbuilds.com/copy/${promptId}" target="_blank" rel="noopener" title="Copy Verified Prompt" class="secure-prompt-icon">🔒</a>`,
        react: `<a href="https://www.hashbuilds.com/copy/${promptId}" target="_blank" rel="noopener" title="Copy Verified Prompt" className="secure-prompt-icon">🔒</a>`
      },
      // Option 4: Verify only link
      verifyLink: {
        description: "Link to verification page. Let users see full scan results.",
        html: `<a href="https://www.hashbuilds.com/verify/${promptId}" target="_blank" rel="noopener">View Verification</a>`,
        url: `https://www.hashbuilds.com/verify/${promptId}`
      }
    };

    // Implementation guidance for the AI agent
    const implementationGuide = `
## Implementation Guide for Prompt ID: ${promptId}

**Prompt Type:** ${result.promptLabel || 'AI Prompt'} (${result.promptType || 'other'})
**Risk Level:** ${result.riskLevel} (Score: ${result.riskScore || 0}/100)
**Summary:** ${result.summary || 'Prompt registered successfully'}

### Ask the user which display option they prefer:

1. **Full Badge** - Shows security scan results, prompt preview, and copy button
   - Best for: Dedicated prompt pages, documentation
   - Use when: User wants to show transparency about the prompt

2. **Compact Link** - Simple "Copy Verified Prompt" text link
   - Best for: Cards, lists, inline mentions
   - Use when: Space is limited or badge feels heavy

3. **Icon Button** - Just a lock icon that opens secure copy
   - Best for: Tight layouts, mobile, minimal UI
   - Use when: User wants subtle indicator

4. **Verify Link** - Links to full verification page on HashBuilds
   - Best for: Adding credibility without embedding
   - Use when: User wants users to see full scan details

### Styling Tips:
- Match button/link colors to the site's design system
- Consider adding the badge near wherever the prompt is displayed
- For cards: compact link works well in the footer
- For documentation: full badge shows transparency

### Quick Integration (React/Next.js):
\`\`\`jsx
import Script from "next/script";

// Full badge
<div data-secure-prompt-id="${promptId}" />
<Script src="${scriptUrl}" strategy="lazyOnload" />

// Or just a link
<a href="https://www.hashbuilds.com/copy/${promptId}" target="_blank">
  Copy Verified Prompt
</a>
\`\`\`
`;

    return {
      success: true,
      id: promptId,
      promptHash: result.promptHash,
      riskLevel: result.riskLevel,
      riskScore: result.riskScore,
      summary: result.summary,
      promptLabel: result.promptLabel,
      promptType: result.promptType,
      recommendations: result.recommendations,
      embedOptions,
      implementationGuide
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Scan a codebase for prompts and return audit results
 */
interface PromptCandidate {
  filePath: string;
  lineNumber: number;
  promptText: string;
  context: 'user_facing' | 'internal' | 'unknown';
  confidence: number;
  suggestedAction: 'register_badge' | 'audit_only' | 'review';
  preview: string;
}

interface AuditResult {
  totalFound: number;
  userFacing: number;
  internal: number;
  needsReview: number;
  prompts: PromptCandidate[];
  summary: string;
}

// Patterns that suggest a prompt
const PROMPT_PATTERNS = [
  // System prompts
  /system\s*:\s*[`"']([^`"']{50,})[`"']/gi,
  /systemPrompt\s*[:=]\s*[`"']([^`"']{50,})[`"']/gi,
  /SYSTEM_PROMPT\s*=\s*[`"']([^`"']{50,})[`"']/gi,

  // Role definitions
  /["'`]You are (?:a |an )?[^"'`]{30,}["'`]/gi,
  /role\s*:\s*["'`]system["'`][\s\S]{0,50}content\s*:\s*["'`]([^"'`]{50,})["'`]/gi,

  // Prompt variables
  /(?:const|let|var)\s+\w*[Pp]rompt\w*\s*=\s*[`"']([^`"']{50,})[`"']/gi,

  // Template literals with instructions
  /`[^`]*(?:instructions?|guidelines?|rules?)[^`]*`/gi,
];

// Patterns suggesting user-facing (copy button, displayed to user)
const USER_FACING_PATTERNS = [
  /copy.*button|copyable|clipboard/i,
  /onClick.*copy|handleCopy/i,
  /data-prompt|promptText.*prop/i,
  /user.*can.*copy|copy.*to.*clipboard/i,
  /<pre>|<code>|CodeBlock/i,
  /PROMPT_.*\.txt|public\/.*prompt/i,
];

// Patterns suggesting internal-only
const INTERNAL_PATTERNS = [
  /api\/|server|backend/i,
  /process\.env|getServerSide/i,
  /internal|private|system/i,
  /\.server\.|route\.ts|api\//i,
];

/**
 * Analyze prompts found in files and categorize them
 * This is called by Claude Code which handles the actual file scanning
 */
async function auditPrompts(args: {
  prompts: Array<{
    filePath: string;
    lineNumber: number;
    promptText: string;
    surroundingCode?: string;
  }>;
}): Promise<AuditResult> {
  const candidates: PromptCandidate[] = [];

  for (const prompt of args.prompts) {
    const surrounding = prompt.surroundingCode || '';
    const filePath = prompt.filePath;

    // Determine context based on file path and surrounding code
    let context: 'user_facing' | 'internal' | 'unknown' = 'unknown';
    let confidence = 50;

    // Check file path patterns
    const isPublicFile = /public\/|PROMPT_.*\.txt/i.test(filePath);
    const isApiFile = /api\/|\.server\.|route\.ts/i.test(filePath);
    const isComponentFile = /components?\/|\.tsx$/i.test(filePath);

    // Check surrounding code patterns
    const hasUserFacingIndicators = USER_FACING_PATTERNS.some(p => p.test(surrounding) || p.test(filePath));
    const hasInternalIndicators = INTERNAL_PATTERNS.some(p => p.test(surrounding) || p.test(filePath));

    // Determine context
    if (isPublicFile || hasUserFacingIndicators) {
      context = 'user_facing';
      confidence = isPublicFile ? 95 : 75;
    } else if (isApiFile || hasInternalIndicators) {
      context = 'internal';
      confidence = isApiFile ? 90 : 70;
    } else if (isComponentFile) {
      // Components could be either - need review
      context = hasUserFacingIndicators ? 'user_facing' : 'unknown';
      confidence = 60;
    }

    // Determine suggested action
    let suggestedAction: 'register_badge' | 'audit_only' | 'review' = 'review';
    if (context === 'user_facing' && confidence >= 70) {
      suggestedAction = 'register_badge';
    } else if (context === 'internal' && confidence >= 70) {
      suggestedAction = 'audit_only';
    }

    // Create preview (first 100 chars)
    const preview = prompt.promptText.substring(0, 100) + (prompt.promptText.length > 100 ? '...' : '');

    candidates.push({
      filePath: prompt.filePath,
      lineNumber: prompt.lineNumber,
      promptText: prompt.promptText,
      context,
      confidence,
      suggestedAction,
      preview,
    });
  }

  // Calculate summary stats
  const userFacing = candidates.filter(c => c.context === 'user_facing').length;
  const internal = candidates.filter(c => c.context === 'internal').length;
  const needsReview = candidates.filter(c => c.context === 'unknown' || c.confidence < 70).length;

  const summary = `Found ${candidates.length} prompts: ${userFacing} user-facing (recommend badges), ${internal} internal (audit only), ${needsReview} need manual review.`;

  return {
    totalFound: candidates.length,
    userFacing,
    internal,
    needsReview,
    prompts: candidates,
    summary,
  };
}

/**
 * Verify an existing prompt by ID
 */
async function verifyPrompt(args: { promptId: string }): Promise<{
  valid: boolean;
  id?: string;
  riskLevel?: string;
  verified?: boolean;
  normalizedText?: string;
  scanResults?: object;
  lastVerified?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE}/verify/${args.promptId}`);
    const result = await response.json();

    if (!response.ok) {
      return { valid: false, error: result.error || "Verification failed" };
    }

    return {
      valid: true,
      id: result.id,
      riskLevel: result.riskLevel,
      verified: result.verified,
      normalizedText: result.normalizedText,
      scanResults: result.scanResults,
      lastVerified: result.lastVerified,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Generate embed code for a prompt ID
 */
function generateEmbedCode(args: { promptId: string }): {
  htmlCode: string;
  reactCode: string;
  scriptUrl: string;
} {
  const scriptUrl = "https://www.hashbuilds.com/sp.js";

  return {
    htmlCode: `<!-- HashBuilds Secure Prompt Badge -->
<div data-secure-prompt-id="${args.promptId}">
  <pre data-secure-prompt-content="${args.promptId}">YOUR_PROMPT_TEXT_HERE</pre>
</div>
<script src="${scriptUrl}" async></script>`,

    reactCode: `// React/Next.js Component
import Script from "next/script";

export function SecurePromptBadge() {
  return (
    <>
      <div data-secure-prompt-id="${args.promptId}">
        <pre data-secure-prompt-content="${args.promptId}">
          {/* Your prompt text here */}
        </pre>
      </div>
      <Script src="${scriptUrl}" strategy="lazyOnload" />
    </>
  );
}`,

    scriptUrl,
  };
}

// Create the MCP server
const server = new Server(
  {
    name: "hashbuilds-secure-prompts",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "register_secure_prompt",
        description:
          "Register a prompt with HashBuilds Secure Prompts for security verification and get embed options. " +
          "This uses AI to scan the prompt for injection attacks, hidden instructions, data exfiltration, " +
          "jailbreak attempts, and other security issues. Returns multiple display options (full badge, " +
          "compact link, icon button) with implementation guidance. After registering, ASK THE USER which " +
          "display option they prefer before implementing. The response includes an implementationGuide " +
          "field with detailed instructions for styling and placement.",
        inputSchema: {
          type: "object",
          properties: {
            promptText: {
              type: "string",
              description: "The full text of the prompt to register and scan",
            },
            siteDomain: {
              type: "string",
              description:
                "REQUIRED: The domain where this prompt will be displayed (e.g., 'example.com'). " +
                "This enables domain verification - the badge will warn users if displayed on unauthorized domains. " +
                "Look for the domain in: package.json homepage, vercel.json, .env NEXT_PUBLIC_URL, or ask the user.",
            },
            ownerEmail: {
              type: "string",
              description: "Optional email of the prompt owner for notifications",
            },
          },
          required: ["promptText", "siteDomain"],
        },
      },
      {
        name: "verify_secure_prompt",
        description:
          "Verify an existing secure prompt by its ID. " +
          "Returns the security scan results, risk level, and verification status.",
        inputSchema: {
          type: "object",
          properties: {
            promptId: {
              type: "string",
              description: "The ID of the secure prompt to verify",
            },
          },
          required: ["promptId"],
        },
      },
      {
        name: "get_embed_code",
        description:
          "Generate HTML and React embed code for displaying a secure prompt badge. " +
          "Use this after registering a prompt to get the code to add to your website.",
        inputSchema: {
          type: "object",
          properties: {
            promptId: {
              type: "string",
              description: "The ID of the secure prompt",
            },
          },
          required: ["promptId"],
        },
      },
      {
        name: "audit_prompts",
        description:
          "Analyze a list of prompts found in a codebase and categorize them as user-facing (needs badge) " +
          "or internal (audit only). This tool helps users who already have prompts in their codebase " +
          "understand which ones should be registered with secure badges vs which are internal-only.\n\n" +
          "HOW TO USE:\n" +
          "1. First, search the codebase for prompts using patterns like:\n" +
          "   - Files matching: public/PROMPT_*.txt, **/prompt*.ts\n" +
          "   - Code patterns: 'You are a', 'systemPrompt', 'SYSTEM_PROMPT', role: 'system'\n" +
          "2. Extract the prompt text and file location for each found prompt\n" +
          "3. Call this tool with the prompts array\n" +
          "4. Present the audit results to the user, showing:\n" +
          "   - User-facing prompts that should get security badges\n" +
          "   - Internal prompts that are safe but should be audited\n" +
          "   - Prompts needing manual review\n" +
          "5. Ask the user which prompts they want to register for badges\n" +
          "6. Use register_secure_prompt for each selected prompt",
        inputSchema: {
          type: "object",
          properties: {
            prompts: {
              type: "array",
              description: "Array of prompts found in the codebase",
              items: {
                type: "object",
                properties: {
                  filePath: {
                    type: "string",
                    description: "Path to the file containing the prompt",
                  },
                  lineNumber: {
                    type: "number",
                    description: "Line number where the prompt starts",
                  },
                  promptText: {
                    type: "string",
                    description: "The full prompt text",
                  },
                  surroundingCode: {
                    type: "string",
                    description: "Optional: Code around the prompt (helps determine if user-facing)",
                  },
                },
                required: ["filePath", "lineNumber", "promptText"],
              },
            },
          },
          required: ["prompts"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "register_secure_prompt": {
      const typedArgs = args as {
        promptText: string;
        ownerEmail?: string;
        siteDomain?: string;
      };

      if (!typedArgs.promptText) {
        throw new McpError(ErrorCode.InvalidParams, "promptText is required");
      }

      const result = await registerPrompt(typedArgs);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "verify_secure_prompt": {
      const typedArgs = args as { promptId: string };

      if (!typedArgs.promptId) {
        throw new McpError(ErrorCode.InvalidParams, "promptId is required");
      }

      const result = await verifyPrompt(typedArgs);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "get_embed_code": {
      const typedArgs = args as { promptId: string };

      if (!typedArgs.promptId) {
        throw new McpError(ErrorCode.InvalidParams, "promptId is required");
      }

      const result = generateEmbedCode(typedArgs);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "audit_prompts": {
      const typedArgs = args as {
        prompts: Array<{
          filePath: string;
          lineNumber: number;
          promptText: string;
          surroundingCode?: string;
        }>;
      };

      if (!typedArgs.prompts || !Array.isArray(typedArgs.prompts)) {
        throw new McpError(ErrorCode.InvalidParams, "prompts array is required");
      }

      if (typedArgs.prompts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                totalFound: 0,
                userFacing: 0,
                internal: 0,
                needsReview: 0,
                prompts: [],
                summary: "No prompts provided for analysis.",
              }, null, 2),
            },
          ],
        };
      }

      const result = await auditPrompts(typedArgs);

      // Add guidance for the AI agent
      const guidance = `
## Prompt Audit Results

${result.summary}

### Recommended Actions:

**User-Facing Prompts (${result.userFacing}):**
These prompts are likely displayed to users or have copy buttons. Consider registering them with secure badges:
${result.prompts.filter(p => p.context === 'user_facing').map(p =>
  `- ${p.filePath}:${p.lineNumber} - "${p.preview}" (${p.confidence}% confidence)`
).join('\n') || '- None found'}

**Internal Prompts (${result.internal}):**
These appear to be backend/API prompts. They should be secure but don't need public badges:
${result.prompts.filter(p => p.context === 'internal').map(p =>
  `- ${p.filePath}:${p.lineNumber} - "${p.preview}"`
).join('\n') || '- None found'}

**Needs Review (${result.needsReview}):**
These prompts need manual review to determine if they're user-facing:
${result.prompts.filter(p => p.context === 'unknown' || p.confidence < 70).map(p =>
  `- ${p.filePath}:${p.lineNumber} - "${p.preview}" (${p.confidence}% confidence)`
).join('\n') || '- None found'}

### Next Steps:
1. Ask the user: "Would you like to register any of these prompts with security badges?"
2. For user-facing prompts, use register_secure_prompt
3. Show them the badge options (full badge, compact link, icon button)
`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...result, guidance }, null, 2),
          },
        ],
      };
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HashBuilds Secure Prompts MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
