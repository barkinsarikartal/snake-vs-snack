# snake-vs-snack

## REA (Reverse Engineer Anything)

This project uses [REA](https://github.com/morluto/rea) as an MCP server for
reverse-engineering binaries, JavaScript/Electron apps, .NET assemblies and
websites.

- `.mcp.json` registers the `rea` MCP server (pinned to `rea-agents@6.8.0`,
  started with `npx`). It needs Node.js 22+ and npm on the PATH.
- `.claude/skills/reverse-engineer-anything/` holds REA's bundled workflow
  skill so the agent knows how to use the tools.
- To upgrade, bump the version in `.mcp.json` and refresh the skill from the
  `skills/` directory of the matching `rea-agents` npm package.
- For native binary analysis, configure an engine (Ghidra, Hopper or IDA) on
  the machine running the agent; see REA's `docs/installation.md`.
- Terminal use without the MCP server: `npx -y rea-agents@6.8.0 --help`
