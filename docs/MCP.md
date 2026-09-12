# Read-only MCP server

Keeptrail exposes a local stdio MCP server for coding agents. It is intentionally read-only: no tool can import, edit, delete, or transmit library data.

Build first, then run:

```sh
npm run build:mcp
node apps/mcp/dist/index.js
```

The server reads the same `KEEPTRAIL_DATA_DIR` as the API. Register the command in an MCP-capable client with the working directory set to the repository. The available tools are:

- `search_library`: keyword search with optional topic, platform, tag, and limit filters.
- `get_item`: source metadata, summary, evidence, websites, notes, captures, and collections.
- `get_passages`: source-linked search passages, with an optional query and limit.
- `list_topics`: topic labels and counts.

The tool descriptions tell agents to preserve evidence IDs and treat uncertain website names as unverified. No provider credentials are available to MCP.
