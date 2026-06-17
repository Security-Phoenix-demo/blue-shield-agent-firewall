# Phoenix Security Blue Shield - Firewall — Visual Studio Copilot pre-execute handler.
# Wires CopilotChatPreExecute ETW event to the Phoenix evaluate endpoint.
# See README.md for registration instructions.

param([string]$Command)

$installRe = '(npm install|npm add|pip install|yarn add|pnpm add|cargo add|gem install|uv pip install|poetry add|nuget install|dotnet add package)'
if ($Command -notmatch $installRe) { exit 0 }

# Bridge discovery (PRD R-FUNC-092)
$bridgePath = "$env:PROGRAMDATA\PhoenixFirewall\agent-bridge.json"
if ((Test-Path $bridgePath) -and ($env:PHOENIX_BRIDGE_AUTO -ne 'false')) {
    $verdict = & 'C:\Program Files\PhoenixFirewall\phoenix-firewall.exe' agent-bridge --ecosystem auto --command "$Command" 2>&1
    if ($LASTEXITCODE -eq 2) {
        Write-Error "[phoenix-firewall] BLOCKED by local v4 policy: $verdict"
        exit 2
    }
    exit 0
}

# Fallback: direct backend
if (-not $env:PHOENIX_API_KEY) {
    Write-Warning "[phoenix-firewall] PHOENIX_API_KEY not set — skipping check"
    exit 0
}
$apiUrl = if ($env:PHOENIX_API_URL) { $env:PHOENIX_API_URL } else { 'https://phxintel.security' }
$body = @{ command = $Command } | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Method Post -Uri "$apiUrl/api/v1/firewall/evaluate" `
        -Headers @{ 'x-api-key' = $env:PHOENIX_API_KEY } `
        -ContentType 'application/json' -Body $body -TimeoutSec 10
    if ($response.results.action -contains 'block') {
        Write-Error "[phoenix-firewall] BLOCKED by policy"
        exit 2
    }
} catch {
    if ($env:PHOENIX_STRICT -eq 'true') { exit 2 }
    exit 0
}
