# 크랩피치 BYO AI — Claude / Codex / Gemini CLI 설치 후 로그인 창 실행
# 사용 (PowerShell):
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\crabpitch-byo-ai-setup.ps1 [-Provider claude|chatgpt|gemini|all]
param(
  [ValidateSet("claude","chatgpt","gemini","all")]
  [string]$Provider = "all"
)

function Ensure-Npm {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js/npm이 필요합니다: https://nodejs.org (22+ 권장)"
    exit 1
  }
}

function Install-NpmPkg([string]$pkg) {
  Write-Host "→ npm install -g $pkg"
  npm install -g $pkg
  if ($LASTEXITCODE -ne 0) { throw "npm install failed: $pkg" }
}

function Run-Login([string]$title, [scriptblock]$cmd) {
  Write-Host ""
  Write-Host "=== $title 로그인 (브라우저 창이 열립니다) ==="
  & $cmd
}

Ensure-Npm

function Setup-Claude {
  try {
    irm https://claude.ai/install.ps1 | iex
  } catch {
    Install-NpmPkg "@anthropic-ai/claude-code"
  }
  Run-Login "Claude Code" { claude }
}

function Setup-Chatgpt {
  Install-NpmPkg "@openai/codex"
  Run-Login "Codex (ChatGPT)" { codex login }
}

function Setup-Gemini {
  Install-NpmPkg "@google/gemini-cli"
  Run-Login "Gemini" { gemini }
}

switch ($Provider) {
  "claude" { Setup-Claude }
  "chatgpt" { Setup-Chatgpt }
  "gemini" { Setup-Gemini }
  "all" {
    Write-Host "세 CLI를 순서대로 설치·로그인합니다."
    try { Setup-Claude } catch { Write-Warning $_ }
    try { Setup-Chatgpt } catch { Write-Warning $_ }
    try { Setup-Gemini } catch { Write-Warning $_ }
  }
}

Write-Host ""
Write-Host "완료. 크랩피치 웹 「내 AI」에서 스킬 프롬프트를 복사해 CLI/앱에 붙여넣으세요."
