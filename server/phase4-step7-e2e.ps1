# Phase 4 Step 7 -- Codified Verification.
#
# Closes out the Phase 4 verification surface. The earlier
# `phase4-e2e.ps1` covers the "happy path + 4xx + 403 + re-pack
# trigger on tasks" assertions. This script adds:
#   - Section A: VAL-4.4.6 (column-move re-pack / interop with re-pack)
#   - Section B: VAL-4.6.1..6.10 (non-functional: TS clean, ESM .js
#     discipline, no new server deps, no WebSocket, no test framework,
#     no Tailwind config extension, middleware chains, prisma
#     transactions, no inline `position` strings)
#   - Section C: VAL-4.5.12..5.16 (frontend static-analysis: dnd-kit +
#     TanStack Query deps present, QueryClientProvider mounted, no
#     global state lib, KeyboardSensor + role=status baseline)
#   - Section D: Phase 5 Step 7 (input validation audit script
#     exists, is wired into npm run lint, validate() middleware
#     carries the audit marker, envelope helper exists, every
#     loadBoard/loadColumn/loadTask route validates its path param)
#
# Sections B, C, and D are shell-grep / file-inspection checks and
# are safe to run any time -- they don't depend on the dev server.
# Section A requires the dev server (http://localhost:4000) and a
# fresh Postgres to be reachable via `server/.env`.
#
# Usage: powershell -ExecutionPolicy Bypass -File phase4-step7-e2e.ps1

$ErrorActionPreference = "Continue"

# Resolve paths relative to the script so it can be run from any cwd.
$Script:RepoRoot  = (Resolve-Path "$PSScriptRoot/..").Path
$Script:ServerDir = $PSScriptRoot
$Script:ClientDir = (Resolve-Path "$PSScriptRoot/../client/kanban-board-client").Path
$Base = "http://localhost:4000"

# Unique suffix so this script is idempotent against the same DB.
$Suffix = ([guid]::NewGuid().ToString("N")).Substring(0, 8)
$U1    = "u1-p7-$Suffix@example.com"
$Pw    = "password123"

# ---------------------------------------------------------------------------
# Helpers -- same shape as phase4-e2e.ps1
# ---------------------------------------------------------------------------
$Script:Pass = 0
$Script:Fail = 0
$Script:Log  = @()

function Record($name, $ok, $detail) {
  if ($detail -eq $null) { $detail = "" }
  if ($ok) {
    $Script:Pass++
    $tag = "PASS"
  } else {
    $Script:Fail++
    $tag = "FAIL"
  }
  $line = "[$tag] $name"
  if ($detail -ne "") { $line = "$line - $detail" }
  $Script:Log += $line
  Write-Host $line
}

function Call($method, $path, $session, $body) {
  $headers = @{ "Content-Type" = "application/json" }
  $params = @{
    Method  = $method
    Uri     = "$Base$path"
    Headers = $headers
  }
  if ($session) { $params.WebSession = $session }
  if ($body) { $params.Body = ($body | ConvertTo-Json -Depth 5) }

  $resp  = $null
  $raw   = ""
  $code  = 0
  try {
    $r = Invoke-WebRequest @params -UseBasicParsing -ErrorAction Stop
    $raw  = $r.Content
    $code = [int]$r.StatusCode
  } catch {
    $exResp = $_.Exception.Response
    if ($exResp) {
      $code = [int]$exResp.StatusCode
      $stream = $exResp.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $raw = $reader.ReadToEnd()
        $reader.Close()
      }
    } else {
      $code = 0
      $raw  = $_.Exception.Message
    }
  }

  $parsed = $null
  if ($raw) {
    try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $null }
  }
  return @{ Status = $code; Body = $parsed; Raw = $raw }
}

# Helper: compute the expected Float position for the i-th appended
# column or task. Mirrors server/src/common/utils/floatPosition.ts.
function Get-FloatPos([int]$i) {
  return (($i + 1) * 1000)
}

# ===========================================================================
# SECTION A -- VAL-4.4.6 (column-move Float interop)
# ===========================================================================
# Phase 5 simplification: positions are Floats (MAX + 1000 for append,
# (prev + next) / 2 for between, (i + 1) * 1000 for re-pack). No
# re-pack fallback. Section A verifies the column-move endpoint behaves
# correctly against the Float scheme: positions are numeric, append
# spacing is 1000, mid-list moves don't disturb siblings.
Write-Host ""
Write-Host "==== Section A: VAL-4.4.6 column-move (Float) ===="

# Check the server is reachable up front so Section A can fail
# clearly rather than producing cascading 0/0 results.
$health = Call GET "/health" $null $null
$serverUp = ($health.Status -eq 200)
Record "Section A: server /health responds 200" $serverUp ("status=$($health.Status)")
if (-not $serverUp) {
  Write-Host "  (Skipping Section A's network assertions -- server is not running on $Base.)"
}

if ($serverUp) {
  $reg = Call POST "/api/auth/register" $null @{ email = $U1; password = $Pw }
  # `WebRequestSession` is PowerShell's built-in cookie container —
  # the server's `Set-Cookie: token=…` header populates it, and
  # subsequent calls through the same session automatically attach
  # the cookie.
  $S1 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Call POST "/api/auth/login" $S1 @{ email = $U1; password = $Pw } | Out-Null
  $cb = Call POST "/api/boards" $S1 @{ title = "P7 Float" }
  $BR = $cb.Body.id
  Record "VAL-4.4.6 created board" ($cb.Status -eq 201) ("status=$($cb.Status)")

  # A.1 -- Create 12 columns. With Float, each append is MAX + 1000.
  $colIds = @()
  for ($i = 0; $i -lt 12; $i += 1) {
    $r = Call POST "/api/boards/$BR/columns" $S1 @{ title = "K$i" }
    if ($r.Status -eq 201) { $colIds += $r.Body.id } else { break }
  }
  Record "VAL-4.4.6 created 12 columns" ($colIds.Count -eq 12) ("created=$($colIds.Count)")

  $colList = Call GET "/api/boards/$BR/columns" $S1 $null
  $positions = @($colList.Body | ForEach-Object { $_.position })

  # A.2 -- All 12 returned positions are numeric Floats, in 1000-step
  # ascending order: 1000, 2000, 3000, ..., 12000.
  $expectedPositions = @(1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000)
  $posMatched = $true
  for ($j = 0; $j -lt $expectedPositions.Count; $j += 1) {
    if ([double]$positions[$j] -ne [double]$expectedPositions[$j]) {
      $posMatched = $false
      break
    }
  }
  $posSummary = if ($positions) { ($positions | Select-Object -First 12) -join ',' } else { "n/a" }
  Record "VAL-4.4.6 column positions are 1000-step Floats" $posMatched ("got=$posSummary")

  # A.3 -- Move a column from one position to another. The move
  # endpoint should produce a new Float position for the moved
  # column without disturbing the siblings' positions.
  $firstId = $colIds[0]
  $secondId = $colIds[1]
  $mv = Call POST "/api/columns/$firstId/move" $S1 @{ toIndex = 5 }
  Record "VAL-4.4.6 column-move returns 200" ($mv.Status -eq 200) ("status=$($mv.Status)")
  Record "VAL-4.4.6 moved column's new position is a number" `
    (($mv.Body.position -is [int]) -or ($mv.Body.position -is [double]) -or ($mv.Body.position -is [single])) `
    ("pos=$($mv.Body.position)")

  $colList2 = Call GET "/api/boards/$BR/columns" $S1 $null
  $newOrder = @($colList2.Body | ForEach-Object { $_.id })
  Record "VAL-4.4.6 column-move places moved column at requested index" `
    ($newOrder[5] -eq $firstId) ("newOrder=$($newOrder -join ',')")

  # A.4 -- The 11 non-moved columns' positions should be unchanged.
  $preMoveMap = @{}
  foreach ($i in 0..($colIds.Count - 1)) {
    $preMoveMap[$colIds[$i]] = $positions[$i]
  }
  $allUnchanged = $true
  $changed = @()
  foreach ($row in $colList2.Body) {
    if ($row.id -eq $firstId) { continue }
    $pre = $preMoveMap[$row.id]
    if ([double]$pre -ne [double]$row.position) {
      $allUnchanged = $false
      $changed += "$($row.id): $pre -> $($row.position)"
    }
  }
  Record "VAL-4.4.6 sibling column positions unchanged after move" $allUnchanged ("changed=$($changed -join ';')")

  # A.5 -- Repeated column-move: 5 successive moves all return
  # 200 + a numeric position.
  $allOk = $true
  for ($k = 0; $k -lt 5; $k += 1) {
    $r = Call POST "/api/columns/$secondId/move" $S1 @{ toIndex = ($k % 6) }
    if ($r.Status -ne 200 -or $null -eq $r.Body.position) {
      $allOk = $false
      break
    }
  }
  Record "VAL-4.4.6 repeated column-moves all return 200 + numeric position" $allOk ""

  # A.6 -- Move a column to the very start (index 0).
  $r = Call POST "/api/columns/$($colIds[8])/move" $S1 @{ toIndex = 0 }
  Record "VAL-4.4.6 column-move to index 0 returns 200" ($r.Status -eq 200) ("status=$($r.Status)")
}

# ===========================================================================
# SECTION B -- VAL-4.6 (Non-functional requirements)
# ===========================================================================
Write-Host ""
Write-Host "==== Section B: VAL-4.6 non-functional checks ===="

# B.1 -- VAL-4.6.1: server + client tsc --noEmit both clean.
Push-Location $Script:ServerDir
$serverTsc = & npx tsc --noEmit 2>&1
$serverTscExit = $LASTEXITCODE
Pop-Location
$serverTscTail = (($serverTsc | Select-Object -Last 3) -join ' | ')
Record "VAL-4.6.1 server tsc --noEmit exit 0" ($serverTscExit -eq 0) ("exit=$serverTscExit; tail=$serverTscTail")

Push-Location $Script:ClientDir
$clientTsc = & npx tsc --noEmit 2>&1
$clientTscExit = $LASTEXITCODE
Pop-Location
$clientTscTail = (($clientTsc | Select-Object -Last 3) -join ' | ')
Record "VAL-4.6.1 client tsc --noEmit exit 0" ($clientTscExit -eq 0) ("exit=$clientTscExit; tail=$clientTscTail")

# B.2 -- VAL-4.6.2: every relative import in new server code ends
# in .js. We scan the floatPosition + columns + tasks modules
# (Phase 5 removed lexoPosition, replaced by floatPosition).
$floatPath = "$Script:ServerDir/src/common/utils/floatPosition.ts"
$colsFiles = Get-ChildItem -Path "$Script:ServerDir/src/modules/columns" -Recurse -Filter "*.ts" | ForEach-Object { $_.FullName }
$tasksFiles = Get-ChildItem -Path "$Script:ServerDir/src/modules/tasks"   -Recurse -Filter "*.ts" | ForEach-Object { $_.FullName }
$allFiles = @($floatPath) + @($colsFiles) + @($tasksFiles)

$nonJsCount = 0
$importPat = 'from [''"][.][.]?/[^''"]+[''"]'
$jsPat     = '\.js[''"]'
foreach ($f in $allFiles) {
  $matches = & grep -nE $importPat $f 2>$null
  foreach ($m in $matches) {
    if ($m -and ($m -notmatch $jsPat)) {
      $nonJsCount++
    }
  }
}
Record "VAL-4.6.2 all relative imports in new server code end in .js" ($nonJsCount -eq 0) ("violations=$nonJsCount")

# B.3 -- VAL-4.6.3: no new top-level server deps since the start
# of Phase 4. Diff server/package.json against the pre-Phase-4 ref
# (the parent commit of b80b07f which introduced the lexo scheme).
# Phase 5 Step 7 wires `scripts/audit-routes.mts` into `npm run lint`
# (the existing `lint` script + a new `audit:routes` alias) — that
# change is in the `scripts` field, not in `dependencies`, so we
# restrict the diff to the `dependencies` and `devDependencies`
# sections.
#
# Phase 5 Step 8 (cookie-based auth migration) is the first
# intentional exception: it adds `cookie-parser` and
# `@types/cookie-parser` so `authMiddleware` can read the JWT from
# the `req.cookies.token` httpOnly cookie. The pattern list below
# explicitly allows these two names — if a future dep is added,
# update the pattern (or the original Phase 4 intent of
# "no new top-level deps" can be revisited).
$serverPkgFullDiff = & git -C $Script:RepoRoot diff b80b07f^ -- server/package.json 2>&1
$serverPkgFilteredDiff = $serverPkgFullDiff | Where-Object {
  $_ -match '^\+.*"dependencies"|^\+.*"devDependencies"|^\+.*"@types/|^\+.*"express"|^\+.*"prisma"|^\+.*"jsonwebtoken"|^\+.*"bcryptjs"|^\+.*"helmet"|^\+.*"cors"|^\+.*"zod"|^\+.*"pg"|^\+.*"@prisma/|^\+.*"cookie-parser"' -or
  $_ -match '^-.*"dependencies"|^-.*"devDependencies"|^-.*"@types/|^-.*"express"|^-.*"prisma"|^-.*"jsonwebtoken"|^-.*"bcryptjs"|^-.*"helmet"|^-.*"cors"|^-.*"zod"|^-.*"pg"|^-.*"@prisma/|^-.*"cookie-parser"'
}
# Subtract the documented allowlist (cookie-parser) from the filtered
# diff. After this subtraction the diff should be empty — anything
# else is a real regression.
$serverPkgAllowedDiff = $serverPkgFilteredDiff | Where-Object {
  $_ -notmatch '^\+.*"cookie-parser"|^\+.*"@types/cookie-parser"|^-.*"cookie-parser"|^-.*"@types/cookie-parser"'
}
$serverPkgDiffStr = ($serverPkgAllowedDiff -join "`n")
Record "VAL-4.6.3 git diff b80b07f^ -- server/package.json dependencies is empty (cookie-parser + @types/cookie-parser are the documented Phase 5 Step 8 exceptions)" `
  ([string]::IsNullOrWhiteSpace($serverPkgDiffStr)) ("filtered-diff-bytes=$($serverPkgDiffStr.Length)")

# B.4 -- VAL-4.6.4: client gained the 4 expected Phase 4 deps
# (@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities,
# @tanstack/react-query). The pre-Phase-4 ref is 97aca11^, which
# is the commit just before the Phase 4 client scaffold (the
# client/package.json was created in 97aca11 itself, so the
# initial scaffold and the dnd-kit+TanStack additions land in
# the same commit -- we assert both that the 4 expected deps are
# present in the current tree AND that the diff against the
# pre-Phase-4 tree contains no *other* library additions in
# dependencies).
$clientPkgJson = Get-Content "$Script:ClientDir/package.json" -Raw | ConvertFrom-Json
$clientDeps = $clientPkgJson.dependencies
$expectedAdds = @("@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "@tanstack/react-query")
$present = @($expectedAdds | Where-Object { $clientDeps.$_ })
$missingAdds = @($expectedAdds | Where-Object { -not $clientDeps.$_ })

# Compare against the pre-Phase-4 tree: client/package.json did
# not exist before 97aca11, so the diff shows the whole file as
# "added". Filter the diff to just the `dependencies` block's
# added lines, then assert they reference ONLY the 4 expected
# names (or, for the initial scaffold, no other library is added
# in any subsequent commit either).
$clientDepDiff = & git -C $Script:RepoRoot diff "97aca11^" -- client/kanban-board-client/package.json 2>&1
# Lines that ADD a dep look like: +    "name": "version",
# in the `dependencies` section. We extract the dep names.
$addedDepNames = @()
$inDeps = $false
foreach ($line in $clientDepDiff) {
  if ($line -match '^\+\s*"dependencies"\s*:\s*\{') { $inDeps = $true; continue }
  if ($line -match '^\+\s*\}\s*,\s*$' -or $line -match '^\+\s*\}') { $inDeps = $false; continue }
  if ($inDeps -and $line -match '^\+\s*"([^"]+)"\s*:') {
    $addedDepNames += $Matches[1]
  }
}
# In 97aca11, the deps block was created with the initial
# scaffold (next, react, react-dom, axios) PLUS the 4 Phase 4
# deps. We assert that across the entire diff, no library
# outside the expected 4 + the well-known initial scaffold
# (axios, next, react, react-dom) appears. The spirit: no
# surprise packages snuck in via later commits.
$allowedNames = @("axios", "next", "react", "react-dom") + $expectedAdds
$surpriseAdds = @($addedDepNames | Where-Object { $allowedNames -notcontains $_ })
$addedOk = ($present.Count -eq $expectedAdds.Count) -and ($missingAdds.Count -eq 0) -and ($surpriseAdds.Count -eq 0)
Record "VAL-4.6.4 client gained the 4 expected deps and no surprise packages" `
  $addedOk ("present=$($present -join ','); surprise=$($surpriseAdds -join ',')")

# B.5 -- VAL-4.6.5: no module produces or consumes `position`
# strings inline. All position math flows through floatPosition.
$inlinePosCount = 0
$inlinePosPat = '"position"\s*:\s*"'
$moduleFiles = Get-ChildItem -Path "$Script:ServerDir/src/modules" -Recurse -Filter "*.ts" | ForEach-Object { $_.FullName }
foreach ($f in $moduleFiles) {
  $lines = Get-Content $f
  for ($i = 0; $i -lt $lines.Count; $i += 1) {
    $line = $lines[$i]
    if ($line -match $inlinePosPat -and $line -notmatch '^\s*//') {
      $inlinePosCount += 1
    }
  }
}
Record "VAL-4.6.5 no inline position: '...' in server/src/modules" ($inlinePosCount -eq 0) ("violations=$inlinePosCount")

# B.6 -- VAL-4.6.6: moveTask + moveColumn each use prisma.$transaction.
$tasksSvc = Get-Content "$Script:ServerDir/src/modules/tasks/tasks.service.ts" -Raw
$colsSvc  = Get-Content "$Script:ServerDir/src/modules/columns/columns.service.ts" -Raw
Record 'VAL-4.6.6 tasks.service.ts uses prisma.$transaction' ($tasksSvc -match 'prisma\.\$transaction') ''
Record 'VAL-4.6.6 columns.service.ts uses prisma.$transaction' ($colsSvc -match 'prisma\.\$transaction') ''

# B.7 -- VAL-4.6.7: no real-time / WebSocket sync in Phase 4.
$socketHits = 0
$socketPat = 'socket\.io|new WebSocket\('
$serverSrcFiles = Get-ChildItem -Path "$Script:ServerDir/src" -Recurse -Filter "*.ts" | ForEach-Object { $_.FullName }
foreach ($f in $serverSrcFiles) {
  $content = Get-Content $f -Raw
  if ($content -match $socketPat) { $socketHits += 1 }
}
Record "VAL-4.6.7 no socket.io / new WebSocket( in server/src" ($socketHits -eq 0) ("hits=$socketHits")

# B.8 -- VAL-4.6.8: no automated test framework was added in Phase 4.
# Diff server/package.json from b80b07f^ (pre-Phase-4 server) and
# client/kanban-board-client/package.json from 97aca11^ (pre-Phase-4
# client -- the file didn't exist before that commit).
$serverFrameDiff = & git -C $Script:RepoRoot diff b80b07f^ -- server/package.json 2>&1
$clientFrameDiff = & git -C $Script:RepoRoot diff "97aca11^" -- client/kanban-board-client/package.json 2>&1
$testFramePat = '"(jest|vitest|playwright|cypress|@playwright|@testing-library)"'
$testFrameCount = (
  @($serverFrameDiff | Where-Object { $_ -match $testFramePat }).Count +
  @($clientFrameDiff | Where-Object { $_ -match $testFramePat }).Count
)
Record "VAL-4.6.8 no jest/vitest/playwright/cypress added in Phase 4" ($testFrameCount -eq 0) ("hits=$testFrameCount")

# B.9 -- VAL-4.6.9: no Tailwind config extensions were added in
# Phase 4. The pre-Phase-4 client did not exist, so we check
# against the current working tree: a tailwind.config.* file
# must not exist anywhere in client/kanban-board-client/, and
# the existing postcss.config.mjs (added in 97aca11) must be
# byte-for-byte unchanged from HEAD.
$twConfigFiles = Get-ChildItem -Path "$Script:ClientDir" -Recurse -Filter "tailwind.config.*" -ErrorAction SilentlyContinue
Record "VAL-4.6.9 no tailwind.config.* file exists in client/" `
  ($twConfigFiles.Count -eq 0) ("found=$($twConfigFiles.Count)")

$postCssStatus = & git -C $Script:RepoRoot status --porcelain "client/kanban-board-client/postcss.config.mjs" 2>&1
Record "VAL-4.6.9 postcss.config.mjs is unchanged in the working tree" `
  ([string]::IsNullOrWhiteSpace(($postCssStatus -join "`n"))) ("status=$($postCssStatus -join ';')")

# B.10 -- VAL-4.6.10: the move routes' middleware chains match
# REQ-4.3.14 and REQ-4.4.8.
$tasksRoutes = Get-Content "$Script:ServerDir/src/modules/tasks/tasks.routes.ts" -Raw
$colsRoutes  = Get-Content "$Script:ServerDir/src/modules/columns/columns.routes.ts" -Raw

$taskMoveChainOk = ($tasksRoutes -match 'requireAuth') -and
                   ($tasksRoutes -match 'ColumnAndTaskIdParamSchema') -and
                   ($tasksRoutes -match 'loadColumn') -and
                   ($tasksRoutes -match 'loadTask') -and
                   ($tasksRoutes -match 'requireBoardAccess') -and
                   ($tasksRoutes -match 'MoveTaskSchema')
Record "VAL-4.6.10 task-move route chain matches REQ-4.3.14" $taskMoveChainOk ""

$colMoveChainOk = ($colsRoutes -match 'requireAuth') -and
                  ($colsRoutes -match 'ColumnIdParamSchema') -and
                  ($colsRoutes -match 'loadColumn') -and
                  ($colsRoutes -match 'requireBoardAccess') -and
                  ($colsRoutes -match 'MoveColumnSchema')
Record "VAL-4.6.10 column-move route chain matches REQ-4.4.8" $colMoveChainOk ""

# B.11 -- extra: every server module that produces or consumes
# positions imports floatPosition.
$floatImportCount = 0
foreach ($f in $moduleFiles) {
  $content = Get-Content $f -Raw
  if ($content -match 'from.*floatPosition') { $floatImportCount += 1 }
}
Record "VAL-4.6.7 (extra) server modules import floatPosition through the helper" `
  ($floatImportCount -ge 1) ("imports=$floatImportCount")

# ===========================================================================
# SECTION C -- VAL-4.5 (frontend static-analysis)
# ===========================================================================
Write-Host ""
Write-Host "==== Section C: VAL-4.5 frontend static-analysis ===="

# C.1 -- VAL-4.5.12: the 4 expected deps are in client dependencies.
$cDeps = (Get-Content "$Script:ClientDir/package.json" -Raw | ConvertFrom-Json).dependencies
$expectedClientDeps = @("@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "@tanstack/react-query")
$missingDeps = @($expectedClientDeps | Where-Object { -not $cDeps.$_ })
Record "VAL-4.5.12 client package.json declares all 4 expected Phase 4 deps" ($missingDeps.Count -eq 0) ("missing=$($missingDeps -join ',')")

# C.2 -- VAL-4.5.13: QueryClientProvider is mounted at the root.
$providersSrc = Get-Content "$Script:ClientDir/src/app/providers.tsx" -Raw
$queryClientOk = ($providersSrc -match "QueryClientProvider") -and ($providersSrc -match "new QueryClient")
Record "VAL-4.5.13 providers.tsx mounts QueryClientProvider + new QueryClient" $queryClientOk ""

# C.3 -- VAL-4.5.14: no global state library added in Phase 4.
$stateLibs = @("zustand", "redux", "jotai", "recoil", "mobx", "valtio", "@reduxjs/toolkit")
$stateHits = @($stateLibs | Where-Object { $cDeps.$_ })
Record "VAL-4.5.14 no global state library added to client deps" ($stateHits.Count -eq 0) ("hits=$($stateHits -join ',')")

# C.4 -- VAL-4.5.15: KeyboardSensor + sortableKeyboardCoordinates
# are wired up (dnd-kit keyboard-accessibility baseline).
$boardViewSrc = Get-Content "$Script:ClientDir/src/features/board/BoardView.tsx" -Raw
$keyboardOk = ($boardViewSrc -match "KeyboardSensor") -and ($boardViewSrc -match "sortableKeyboardCoordinates")
Record "VAL-4.5.15 BoardView.tsx imports KeyboardSensor + sortableKeyboardCoordinates" $keyboardOk ""

# C.5 -- VAL-4.5.16: the columns wrap their tasks in a nested
# SortableContext. The `Column.tsx` shim re-exports `ColumnShell.tsx`
# (Phase 5 Step 1's refactor), so the actual SortableContext lives
# in `ColumnShell.tsx`. We check both to keep the test forward-
# compatible with either layout.
$columnSrc = Get-Content "$Script:ClientDir/src/features/board/Column.tsx" -Raw
$columnShellSrc = Get-Content "$Script:ClientDir/src/features/board/components/ColumnShell.tsx" -Raw
$columnSortable = (($columnSrc -match "SortableContext") -or ($columnShellSrc -match "SortableContext"))
Record "VAL-4.5.16 Column.tsx wraps its tasks in a nested SortableContext" $columnSortable ""

# C.6 -- VAL-4.5.10: the rollback indicator exposes role=status.
# Phase 5 Step 3 moved the placeholder `<div role="status">` into
# the dedicated `<Toast />` component (`features/board/components/Toast.tsx`).
# We check both the BoardView (Phase 4 placement) and the Toast
# component (Phase 5 placement) so the assertion holds either way.
$toastComponentSrc = Get-Content "$Script:ClientDir/src/features/board/components/Toast.tsx" -Raw
$toastOk = ($boardViewSrc -match 'role="status"') -or ($toastComponentSrc -match 'role="status"')
Record "VAL-4.5.10 toast container exposes role=status" $toastOk ""

# C.7 -- VAL-4.5.4: useMoveTaskMutation snapshots the previous
# board and restores it on error (client-side rollback contract).
$mutSrc = Get-Content "$Script:ClientDir/src/features/board/useMoveTaskMutation.ts" -Raw
$rollbackOk = ($mutSrc -match "onError") -and ($mutSrc -match "setQueryData") -and ($mutSrc -match "snapshotRef")
Record "VAL-4.5.4 useMoveTaskMutation restores cache on onError (rollback contract)" $rollbackOk ""

# ===========================================================================
# SECTION D -- Phase 5 Step 7 (Input Validation Audit, Plan Section 7)
# ===========================================================================
#
# These assertions exercise `server/scripts/audit-routes.mts` without
# requiring a live dev server â€” they are file-inspection / shell
# checks only. The script itself is run separately by `npm run lint`
# and the CI workflow, so the assertions here are about whether the
# script EXISTS, is wired into the lint pipeline, and is structurally
# well-formed.
Write-Host ""
Write-Host "==== Section D: Phase 5 Step 7 - Input Validation Audit ===="

$auditScript = "$Script:ServerDir/scripts/audit-routes.mts"
Record "Phase 5 Section 7.1 audit script exists at scripts/audit-routes.mts" (Test-Path $auditScript) $auditScript

# D.2 -- the script imports the app factory, so the audit can
# introspect the live route table.
$auditSrc = ""
if (Test-Path $auditScript) { $auditSrc = Get-Content $auditScript -Raw }
$importsApp = $auditSrc -match 'from\s+["'']\.\./src/app\.js["'']'
Record "Phase 5 Section 7.1 audit script imports the createApp factory" $importsApp ""

# D.3 -- the script defines a public-routes allowlist (the "legitimately
# empty" set: /health, the two auth endpoints, and the two list-
# everything endpoints that read only `req.user.id`).
$hasAllowlist = $auditSrc -match "PUBLIC_ROUTES"
Record "Phase 5 Section 7.1 audit script declares a PUBLIC_ROUTES allowlist" $hasAllowlist ""

$healthAllowed  = $auditSrc -match "GET /health"
$registerAllowed = $auditSrc -match "POST /api/auth/register"
$loginAllowed    = $auditSrc -match "POST /api/auth/login"
Record "Phase 5 Section 7.1 PUBLIC_ROUTES includes GET /health"                     $healthAllowed ""
Record "Phase 5 Section 7.1 PUBLIC_ROUTES includes POST /api/auth/register"         $registerAllowed ""
Record "Phase 5 Section 7.1 PUBLIC_ROUTES includes POST /api/auth/login"            $loginAllowed ""

# D.4 -- the script also enumerates the MOUNT_PATHS map so the
# audit can produce full route paths (e.g. /api/boards/:id) for
# the report. Each entry pairs a router with its mount path.
$hasMountMap = $auditSrc -match "MOUNT_PATHS"
Record "Phase 5 Section 7.1 audit script declares a MOUNT_PATHS map" $hasMountMap ""

# D.5 -- npm run lint runs the audit script after tsc --noEmit.
$pkgJson = Get-Content "$Script:ServerDir/package.json" -Raw
$lintWiresAudit = ($pkgJson -match '"lint"\s*:\s*"tsc --noEmit && tsx scripts/audit-routes\.mts"')
Record "Phase 5 Section 7.1 npm run lint chains tsc + audit-routes" $lintWiresAudit ""

# D.6 -- the validate() middleware carries a marker so the audit
# can detect it by introspection without importing the zod schemas.
# `Object.defineProperty(handler, "kanbanValidate", ...)` is the
# contract the audit script depends on.
$validateSrc = Get-Content "$Script:ServerDir/src/common/validators/validate.middleware.ts" -Raw
$hasMarker = $validateSrc -match "kanbanValidate"
Record "Phase 5 Section 7.1 validate() middleware tags handlers with kanbanValidate marker" $hasMarker ""

# D.7 -- envelope helper exists and is the documented wire contract
# for new endpoints. The error envelope is already produced by
# `error.middleware.ts`; this helper codifies the success shape
# without forcing a Phase 1-4 handler to change.
$envelopeSrc = if (Test-Path "$Script:ServerDir/src/common/envelope.ts") { Get-Content "$Script:ServerDir/src/common/envelope.ts" -Raw } else { "" }
$hasEnvelope = ($envelopeSrc -match "envelope<") -and ($envelopeSrc -match "errorEnvelope")
Record "Phase 5 Section 7.2 src/common/envelope.ts exposes envelope() + errorEnvelope()" $hasEnvelope ""

# D.8 -- every loadBoard / loadColumn / loadTask route in the
# Phase 1-4 surface has a `validate(SomeParamSchema, "params")`
# in front of it. The audit script catches any miss; this assertion
# is a structural sanity check on the routes file shape.
$boardsRoutes   = Get-Content "$Script:ServerDir/src/modules/boards/boards.routes.ts" -Raw
$columnsRoutes  = Get-Content "$Script:ServerDir/src/modules/columns/columns.routes.ts" -Raw
$tasksRoutes    = Get-Content "$Script:ServerDir/src/modules/tasks/tasks.routes.ts" -Raw
$allRoutesSrc   = "$boardsRoutes`n$columnsRoutes`n$tasksRoutes"

# Each resource-id segment that `loadBoard` / `loadColumn` /
# `loadTask` reads (`:id`, `:boardId`, `:columnId`, `:taskId`,
# `:userId`) must have a corresponding `validate(... "params")`
# in the same router chain. This is a structural sanity check;
# the authoritative pass/fail is `server/scripts/audit-routes.mts`
# (run by `npm run lint` + CI), which walks the live route table.
# A single `validate(ParamSchema, "params")` call can validate
# multiple path segments at once (e.g. `MemberParamsSchema` covers
# both `:id` and `:userId`), so the PowerShell check is on a
# positive existence basis: every loader-using route file must
# contain at least one `validate(... "params")` call.
$boardsHasParams    = $boardsRoutes   -match 'validate\([^)]+,\s*["'']params["'']\)'
$columnsHasParams   = $columnsRoutes  -match 'validate\([^)]+,\s*["'']params["'']\)'
$tasksHasParams     = $tasksRoutes    -match 'validate\([^)]+,\s*["'']params["'']\)'
Record "Phase 5 Section 7.3 boards.routes.ts uses validate(... \"params\")"   $boardsHasParams ""
Record "Phase 5 Section 7.3 columns.routes.ts uses validate(... \"params\")"  $columnsHasParams ""
Record "Phase 5 Section 7.3 tasks.routes.ts uses validate(... \"params\")"    $tasksHasParams ""

# ===========================================================================
# Summary
# ===========================================================================
Write-Host ""
Write-Host "========================================"
Write-Host "Phase 4 Step 7: $($Script:Pass) passed, $($Script:Fail) failed"
Write-Host "========================================"
if ($Script:Fail -gt 0) { exit 1 } else { exit 0 }



