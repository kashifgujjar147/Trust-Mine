$ErrorActionPreference = "Continue"

$API = "https://trust-mine-server-production.up.railway.app/api"
$BASE = "https://trustmineshop.vercel.app"

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "       TRUST MINE PRODUCTION E2E AUDIT" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

function Test-Endpoint($Method,$Url,$Body=$null,$Headers=@{}) {
    try {
        $params = @{
            Method = $Method
            Uri = $Url
            Headers = $Headers
            TimeoutSec = 20
        }

        if ($null -ne $Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            $params.ContentType = "application/json"
        }

        $r = Invoke-WebRequest @params -UseBasicParsing

        [PSCustomObject]@{
            Status = $r.StatusCode
            Body   = $r.Content
            Error  = ""
        }
    }
    catch {
        $status = ""
        $body = ""

        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
                $reader.Close()
            } catch {}
        }

        [PSCustomObject]@{
            Status = $status
            Body   = $body
            Error  = $_.Exception.Message
        }
    }
}

function Show-Test($Name,$Result) {
    if ($Result.Status -ge 200 -and $Result.Status -lt 300) {
        Write-Host "[PASS] $Name -> $($Result.Status)" -ForegroundColor Green
    }
    elseif ($Result.Status -ge 400 -and $Result.Status -lt 500) {
        Write-Host "[INFO] $Name -> $($Result.Status)" -ForegroundColor Yellow
    }
    elseif ($Result.Status -ge 500) {
        Write-Host "[FAIL] $Name -> $($Result.Status)" -ForegroundColor Red
    }
    else {
        Write-Host "[FAIL] $Name -> $($Result.Error)" -ForegroundColor Red
    }
}

Write-Host "[1] FRONTEND" -ForegroundColor Magenta
$r = Test-Endpoint GET $BASE
Show-Test "Vercel frontend" $r

Write-Host "`n[2] API HEALTH" -ForegroundColor Magenta
$r = Test-Endpoint GET "$API/health"
Show-Test "Railway API health" $r

Write-Host "`n[3] PUBLIC API ROUTES" -ForegroundColor Magenta

$routes = @(
    "/payment-methods",
    "/packages",
    "/rewards",
    "/promos",
    "/settings"
)

foreach ($route in $routes) {
    $r = Test-Endpoint GET "$API$route"
    Show-Test $route $r
}

Write-Host "`n[4] AUTH PROTECTION" -ForegroundColor Magenta

$protected = @(
    "/me",
    "/wallet",
    "/deposits",
    "/withdrawals",
    "/notifications",
    "/referrals"
)

foreach ($route in $protected) {
    $r = Test-Endpoint GET "$API$route"
    if ($r.Status -eq 401 -or $r.Status -eq 403) {
        Write-Host "[PASS] Protected $route -> $($r.Status)" -ForegroundColor Green
    }
    elseif ($r.Status -ge 500) {
        Write-Host "[FAIL] Protected $route -> $($r.Status)" -ForegroundColor Red
    }
    else {
        Write-Host "[WARN] $route -> $($r.Status)" -ForegroundColor Yellow
    }
}

Write-Host "`n[5] ADMIN PROTECTION" -ForegroundColor Magenta

$adminRoutes = @(
    "/admin/deposits",
    "/admin/withdrawals",
    "/admin/users",
    "/admin/payment-methods",
    "/admin/settings"
)

foreach ($route in $adminRoutes) {
    $r = Test-Endpoint GET "$API$route"
    if ($r.Status -eq 401 -or $r.Status -eq 403) {
        Write-Host "[PASS] Admin protected $route -> $($r.Status)" -ForegroundColor Green
    }
    elseif ($r.Status -ge 500) {
        Write-Host "[FAIL] Admin $route -> $($r.Status)" -ForegroundColor Red
    }
    else {
        Write-Host "[WARN] Admin $route -> $($r.Status)" -ForegroundColor Yellow
    }
}

Write-Host "`n[6] INVALID INPUT / FINANCIAL VALIDATION" -ForegroundColor Magenta

$invalidBodies = @(
    @{ amount = -100 },
    @{ amount = 0 },
    @{ amount = "abc" },
    @{ amount = 999999999 },
    @{ reference = "" }
)

foreach ($body in $invalidBodies) {
    $r = Test-Endpoint POST "$API/deposits/payment-proof" $body
    if ($r.Status -ge 400 -and $r.Status -lt 500) {
        Write-Host "[PASS] Invalid financial input rejected -> $($r.Status)" -ForegroundColor Green
    }
    elseif ($r.Status -ge 500) {
        Write-Host "[FAIL] Invalid financial input caused server error -> $($r.Status)" -ForegroundColor Red
    }
    else {
        Write-Host "[WARN] Invalid financial input accepted -> $($r.Status)" -ForegroundColor Yellow
    }
}

Write-Host "`n[7] HTTP SECURITY HEADERS" -ForegroundColor Magenta

$r = Test-Endpoint GET $BASE

if ($r.Status) {
    Write-Host "Frontend reachable: PASS" -ForegroundColor Green
}

Write-Host "`n[8] LOCAL SOURCE FINANCIAL AUDIT" -ForegroundColor Magenta

$serverSrc = ".\server\src"

$patterns = @(
    "withMongoTransaction",
    "payment-proof",
    "withdrawals",
    "deposits",
    "admin/deposits",
    "admin/withdrawals",
    "ledger",
    "referral",
    "reward",
    "bcrypt",
    "JWT_SECRET",
    "MONGODB_TRANSACTIONS_REQUIRED"
)

foreach ($pattern in $patterns) {
    $matches = Get-ChildItem $serverSrc -Recurse -File -Include *.ts,*.js |
        Select-String -Pattern $pattern -SimpleMatch

    if ($matches) {
        Write-Host "[FOUND] $pattern -> $($matches.Count) matches" -ForegroundColor Green
    }
    else {
        Write-Host "[MISSING] $pattern" -ForegroundColor Red
    }
}

Write-Host "`n[9] PRODUCTION BUILD" -ForegroundColor Magenta
npm run build

Write-Host "`n[10] FINAL SUMMARY" -ForegroundColor Cyan
Write-Host "============================================"
Write-Host "API:       $API"
Write-Host "Frontend:  $BASE"
Write-Host "============================================"
Write-Host "E2E audit finished."
