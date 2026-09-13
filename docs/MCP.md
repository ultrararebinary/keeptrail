# Read-only MCP server

Keeptrail exposes a local stdio MCP server for coding agents. It is intentionally read-only: no tool can import, edit, delete, or transmit library data.

Build first, then run:

```sh
npm run build:mcp
node apps/mcp/dist/index.js
```

The server reads the same `KEEPTRAIL_DATA_DIR` as the API. Register the command in an MCP-capable client with the working directory set to the repository. The available tools are:

- `search_library`: required `query`, optional `limit` (1–10); keyword result summaries and evidence references. Topic/platform/tag filters are not exposed by this tool.
- `get_item`: required UUID `id`; returns ID, title, summary, websites, tags and source URL, not the complete detail/evidence payload.
- `get_passages`: required UUID `itemId` and at most five `evidenceIds`; returns matching evidence passages and timestamps.
- `list_topics`: paginated topic labels and counts.
- `get_processing_status`: bounded item status, stage history, counts, and sanitized error code.
- `get_capabilities`: deterministic capability/prerequisite status.

The tool descriptions tell agents to preserve evidence IDs and treat uncertain website names as unverified. MCP opens the Keeptrail database read-only and has no provider credentials or mutating tools. It is a local stdio surface, not a remote API bypass.

Review 2026-09-13: no real MCP protocol acceptance run is claimed. Direct SQLite access differs from the authenticated local-API boundary required by the LUNA contract. Search is keyword-only; see [CODE_REVIEW.md](CODE_REVIEW.md) before relying on semantic or complete-transcript retrieval.
