# 인터뷰AI 전체 실행/중지 스크립트 (Windows PowerShell 5.1 이상)
#
#   .\run.ps1          DB, 백엔드, 프론트엔드를 Docker Compose 로 한 번에 빌드·실행하고 준비될 때까지 기다립니다.
#   .\run.ps1 --stop   모두 중지합니다 (컨테이너만 내리고 DB 데이터는 그대로 둡니다).
#   .\run.ps1 --help   사용법
#
# 실행 정책 때문에 막히면:  powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1
# 같은 PC 의 다른 프로젝트 컨테이너는 건드리지 않습니다 (이 폴더의 docker-compose.yml 프로젝트만 대상).

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -LiteralPath $PSScriptRoot

function Write-Step([string]$message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Warn([string]$message) { Write-Host "!!  $message" -ForegroundColor Yellow }
function Fail([string]$message) { Write-Host "xx  $message" -ForegroundColor Red; exit 1 }

# ---- 인자: PowerShell 은 `--stop` 을 이름 있는 매개변수로 보지 않으므로 $args 로 받습니다 ----
$flags = @($args | ForEach-Object { "$_".ToLowerInvariant() })
if ($flags -contains '--help' -or $flags -contains '-h' -or $flags -contains '/?') {
    Get-Content -LiteralPath $PSCommandPath -TotalCount 9 | ForEach-Object { $_ -replace '^# ?', '' }
    exit 0
}
$stop = $flags | Where-Object { $_ -in @('--stop', '-stop', '/stop', 'stop') }
$unknown = $flags | Where-Object { $_ -notin @('--stop', '-stop', '/stop', 'stop') }
if ($unknown) { Fail "알 수 없는 옵션: $($unknown -join ' ')  (사용법: .\run.ps1 --help)" }

# ---- Docker 확인 ----
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail 'docker 명령을 찾을 수 없습니다. Docker Desktop 을 설치해 주세요: https://www.docker.com/products/docker-desktop/'
}

function Test-DockerReady {
    & docker info *> $null
    return ($LASTEXITCODE -eq 0)
}

function Wait-DockerReady {
    if (Test-DockerReady) { return }
    $desktop = Join-Path $Env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $desktop) {
        Write-Step 'Docker Desktop 을 시작합니다 (준비될 때까지 최대 2분 기다립니다)...'
        Start-Process -FilePath $desktop
    } else {
        Fail 'Docker 엔진에 연결할 수 없습니다. Docker Desktop 을 실행한 뒤 다시 시도해 주세요.'
    }
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        if (Test-DockerReady) { return }
    }
    Fail 'Docker 가 2분 안에 준비되지 않았습니다. Docker Desktop 상태를 확인해 주세요.'
}

# ---- 중지 ----
if ($stop) {
    if (-not (Test-DockerReady)) {
        Write-Warn 'Docker 엔진이 꺼져 있어 중지할 컨테이너가 없습니다.'
        exit 0
    }
    Write-Step '이 프로젝트의 컨테이너를 중지하고 내립니다 (DB 데이터는 유지)...'
    & docker compose down
    if ($LASTEXITCODE -ne 0) { Fail 'docker compose down 이 실패했습니다.' }
    Write-Host '중지했습니다. 다시 시작하려면 .\run.ps1 을 실행하세요.' -ForegroundColor Green
    exit 0
}

# ---- 실행 ----
Wait-DockerReady

# .env: 없을 때만 .env.example 에서 만들고 JWT_SECRET 을 임의 값으로 채웁니다 (있으면 절대 덮어쓰지 않음).
if (-not (Test-Path -LiteralPath '.env')) {
    if (-not (Test-Path -LiteralPath '.env.example')) { Fail '.env 도 .env.example 도 없습니다.' }
    Write-Step '.env 가 없어 .env.example 로 새로 만듭니다 (JWT_SECRET 은 임의 값)...'
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes)
    $lines = Get-Content -LiteralPath '.env.example' -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^JWT_SECRET=') { "JWT_SECRET=$secret" } else { $_ }
    }
    [System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot '.env'), $lines, (New-Object System.Text.UTF8Encoding($false)))
}

# .env 값 읽기 (KEY=VALUE 한 줄씩, 주석·빈 줄 무시). 비밀값은 화면에 출력하지 않습니다.
$envValues = @{}
Get-Content -LiteralPath '.env' -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $envValues[$Matches[1]] = $Matches[2].Trim('"').Trim("'") }
}
$backendPort = if ($envValues['BACKEND_PORT']) { $envValues['BACKEND_PORT'] } else { '8080' }
$frontendPort = if ($envValues['FRONTEND_PORT']) { $envValues['FRONTEND_PORT'] } else { '3000' }

if (-not $envValues['OPENAI_API_KEY']) {
    Write-Warn '.env 에 OPENAI_API_KEY 가 없습니다. 앱은 뜨지만 면접 질문 생성·음성 인식·피드백은 실패합니다.'
}

Write-Step 'DB, 백엔드, 프론트엔드를 빌드하고 실행합니다 (처음에는 몇 분 걸립니다)...'
& docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Fail 'docker compose up 이 실패했습니다. 위 오류 메시지를 확인해 주세요.' }

Write-Step "백엔드가 준비될 때까지 기다립니다 (http://127.0.0.1:$backendPort/api/health)..."
$ready = $false
$deadline = (Get-Date).AddSeconds(180)
while ((Get-Date) -lt $deadline) {
    try {
        $reply = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/api/health" -TimeoutSec 3
        if ($reply.status -eq 'UP') { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Warn '백엔드가 3분 안에 준비되지 않았습니다. 로그를 확인하세요:  docker compose logs backend'
    & docker compose ps
    exit 1
}

& docker compose ps
Write-Host ''
Write-Host '준비됐습니다.' -ForegroundColor Green
Write-Host "  화면      http://localhost:$frontendPort"
Write-Host "  API 문서  http://localhost:$backendPort/api/docs"
Write-Host '  중지      .\run.ps1 --stop'
Write-Host '  로그      docker compose logs -f backend'
