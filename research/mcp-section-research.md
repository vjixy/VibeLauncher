# MCP Servers And Tools Section Research

Date: 2026-03-20

## Goal

Design a third-party MCP server explorer that feels closer to Swagger/Postman than a raw config list:

- add and manage MCP server profiles
- detect whether a server is reachable
- inspect the tools exposed by that server
- render tool inputs from schema
- execute tools and inspect outputs
- keep the UI simple enough for a small launcher app

## Source Notes

### MCP protocol and SDK

1. Model Context Protocol tools specification
   Source: <https://modelcontextprotocol.io/specification/2025-06-18/server/tools>
   Relevant points:
   - tool definitions include `name`, optional `title`, `description`, `inputSchema`, optional `outputSchema`, and optional `annotations`
   - tool calls send a `tools/call` request with `name` and `arguments`
   - tool results may return `content`, `isError`, and optional `structuredContent`
   - when `outputSchema` exists, clients should validate structured results against it

2. MCP TypeScript SDK client docs
   Source: <https://ts.sdk.modelcontextprotocol.io/documents/client.html>
   Relevant points:
   - the official client supports `StdioClientTransport`, `StreamableHTTPClientTransport`, and legacy `SSEClientTransport`
   - recommended compatibility path for remote servers is: try streamable HTTP first, then fall back to SSE on 4xx
   - the SDK also supports roots so a client can expose relevant filesystem locations to the server

### Swagger/OpenAPI explorer patterns

3. Swagger "Adding Examples"
   Source: <https://swagger.io/docs/specification/v3_0/adding-examples/>
   Relevant points:
   - parameter and body examples improve testability and speed
   - multiple named examples help users understand different valid payload shapes
   - examples are distinct from defaults

4. Swagger "Describing Parameters"
   Source: <https://swagger.io/docs/specification/v3_0/describing-parameters/>
   Relevant points:
   - parameters should clearly show required vs optional
   - enums should render as constrained choices
   - defaults should only represent true server defaults, not sample values
   - descriptions matter because they tell the tester what each input actually does

## Best Features To Add

### Must-have

1. Connection profiles with transport support
   - `streamable-http`
   - `sse`
   - `stdio`

2. Reachability and health status
   - unknown / online / offline
   - last checked timestamp
   - last error summary

3. Tool discovery and caching
   - fetch live tool list when requested
   - cache last successful discovery so the UI is still useful when the server is offline

4. Schema-driven tool tester
   - generate a form from `inputSchema`
   - mark required fields clearly
   - render enums as selects
   - use examples if the schema provides them
   - keep a raw JSON editor fallback for complex nested payloads

5. Response inspector
   - show plain text outputs
   - show structured JSON outputs
   - show validation state against `outputSchema` when available
   - show execution errors in a separate state instead of mixing them into output

6. Request/response history
   - keep recent runs per server or tool
   - include timestamp, input payload, success/error, and short output preview
   - make it easy to rerun a previous payload

### Strong additions that fit this app

7. Custom headers or bearer token support for remote servers
   - many remote MCP servers will need auth
   - simpler than full OAuth while still covering a large share of setups

8. Environment variables and working directory for stdio servers
   - required for many local MCP servers

9. Roots support in the profile model
   - relevant because MCP clients can expose filesystem roots to servers
   - useful for local/project-aware servers

10. Capability badges
   - show whether the server exposes tools only or also prompts/resources
   - keep the section focused on tools but surface the rest as context

11. Manual refresh
   - explicit refresh is better than aggressive polling for a utility launcher

## UX Recommendations

1. Split the section into three panes
   - left: server list
   - center: selected server details and tool list
   - right: selected tool tester and result viewer

2. Make status visible before action
   - server badge should immediately show online/offline/unknown

3. Keep forms "Swagger-like", not raw-only
   - simple inputs should be editable as fields
   - advanced mode can expose raw JSON

4. Never hide the schema
   - input schema summary and output schema summary should always be inspectable

5. Preserve tester context
   - when switching tools, do not discard the last run history

## Scope Chosen For Implementation

The first implementation should include:

- MCP server CRUD
- transport support for streamable HTTP, SSE, and stdio
- connection testing + live tool discovery
- cached tool metadata
- schema-based tester with raw JSON fallback
- result viewer for text/JSON/errors
- recent execution history
- custom headers, environment variables, and roots in the profile

The first implementation does not need full OAuth flow yet. Custom headers and bearer tokens cover more use cases with lower complexity.
