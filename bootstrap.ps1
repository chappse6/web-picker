# One-shot setup for Windows PowerShell: install deps, build, print next steps.
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js >= 18 is required."
  exit 1
}

Write-Host "[web-picker] installing dependencies..."
npm install

Write-Host "[web-picker] building..."
npm run build

Write-Host @"

Done. Next steps (no API keys or accounts required):

1) Load the Chrome extension:
   chrome://extensions  ->  enable "Developer mode"  ->  "Load unpacked"
   ->  select:  $Root\extension

2) Register the MCP server with your agent:
   Claude Code:  claude mcp add web-picker --scope user -- node "$Root\scripts\run.cjs"
   Codex:        add [mcp_servers.web-picker] to %USERPROFILE%\.codex\config.toml
                 command = "node", args = ["$Root\scripts\run.cjs"]

3) Serve the demo page on localhost:
   python -m http.server 3000 --directory test-page
   (then open http://localhost:3000 )

4) In your agent, call the tool:  connect_web_picker
"@
