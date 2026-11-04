import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { ChatCompletionTool } from "@wllama/wllama";

const ALLOWED_TOOLS = new Set(["list_pages", "get_page"]);
export interface DocumentationClient {
  tools: ChatCompletionTool[];
  call(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}

export function validateToolArguments(name: string, args: unknown): Record<string, string> {
  if (!ALLOWED_TOOLS.has(name)) throw new Error(`Unsupported documentation tool: ${name}`);
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object.");
  const values = args as Record<string, unknown>;
  const allowed = name === "get_page" ? ["url"] : ["section", "version", "cursor"];
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.includes(key) || typeof value !== "string" || value.length > 2048) throw new Error(`Invalid ${name} argument: ${key}`);
  }
  if (name === "get_page" && (typeof values.url !== "string" || !values.url.trim())) throw new Error("get_page requires a page URL.");
  return values as Record<string, string>;
}

export async function connectDocumentation(endpoint: URL, signal: AbortSignal): Promise<DocumentationClient> {
  const client = new Client({ name: "nimbus-browser-chat", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(endpoint);
  try {
    await client.connect(transport, { signal, timeout: 15_000 });
    const result = await client.listTools({}, { signal, timeout: 15_000 });
    const tools = result.tools.filter(tool => ALLOWED_TOOLS.has(tool.name)).map<ChatCompletionTool>(tool => ({
      type: "function" as const,
      function: {
        name: tool.name, description: tool.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(Object.entries(tool.inputSchema.properties ?? {}).map(([name, property]) => {
            if (!property || typeof property !== "object" || Array.isArray(property) || property.type !== "string") {
              throw new Error(`Unsupported documentation tool schema: ${tool.name}.${name}`);
            }
            return [name, { type: "string", ...(typeof property.description === "string" ? { description: property.description } : {}) }];
          })),
          required: tool.inputSchema.required,
          additionalProperties: false,
        },
      },
    }));
    if (!tools.some(tool => tool.function.name === "list_pages") || !tools.some(tool => tool.function.name === "get_page")) {
      throw new Error("The Nimbus MCP endpoint must provide list_pages and get_page.");
    }
    return {
      tools,
      async call(name, args, requestSignal) {
        const result = await client.callTool({ name, arguments: validateToolArguments(name, args) }, { signal: requestSignal, timeout: 20_000 });
        const text = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
        if (result.isError) throw new Error(text || "The documentation tool returned an error.");
        try { return JSON.parse(text); } catch { return { content: text }; }
      },
      close: () => client.close(),
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}
