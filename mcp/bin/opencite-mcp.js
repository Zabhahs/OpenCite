#!/usr/bin/env node
// OpenCITE MCP — stdio entrypoint. Run by an MCP client (Claude Desktop, etc).
import { startStdioServer } from "../src/server.js";

startStdioServer().catch((err) => {
  process.stderr.write(`opencite-mcp failed to start: ${err.message}\n`);
  process.exit(1);
});
