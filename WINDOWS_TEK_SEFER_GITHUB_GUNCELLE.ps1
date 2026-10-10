$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path $PSScriptRoot).Path

function Stop-Setup([string]$Message) {
  Write-Host "`nHATA: $Message" -ForegroundColor Red
  Write-Host 'Herhangi bir yayin yapilmadi. Bu pencereyi kapatabilirsiniz.' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host 'KASA PRO V19.38 - TEST DALINA GUNCELLEME' -ForegroundColor Cyan
Write-Host 'Bu islem main dalini yedek kabul eder, guvenli bir test dali acar, tam projeyi aktarir, build calistirir ve yalnizca basarili olursa test dalina gonderir. main dalini degistirmez.'
Write-Host 'Supabase SQL bu komutla tekrar calistirilmaz.' -ForegroundColor Yellow
Write-Host ''

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-Setup 'Git bulunamadi. GitHub Desktop/Git kurulmali.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-Setup 'npm bulunamadi. Guncel Node.js LTS kurulumu gereklidir.' }

$repoInput = Read-Host 'GitHub Desktop ile klonladigin kasa-pro-v19 klasorunun TAM yolunu yapistir'
$repoInput = $repoInput.Trim().Trim('"')
if (-not $repoInput -or -not (Test-Path $repoInput)) { Stop-Setup 'Klasor yolu bulunamadi.' }
$repoRoot = (Resolve-Path $repoInput).Path
if (-not (Test-Path (Join-Path $repoRoot '.git'))) { Stop-Setup 'Secilen klasor bir Git reposu degil (.git bulunamadi).' }

$origin = (& git -C $repoRoot remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $origin) { Stop-Setup 'GitHub origin adresi bulunamadi.' }
$branch = (& git -C $repoRoot branch --show-current).Trim()
if ($branch -ne 'main') { Stop-Setup "Su anda '$branch' dalindasin. GitHub Desktop'ta main dalini secip tekrar calistir." }

$status = (& git -C $repoRoot status --porcelain)
if ($status) { Stop-Setup 'Depoda kaydedilmemis degisiklik var. Once GitHub Desktop uzerinden bunlari kaydet veya yedekle; sonra tekrar calistir.' }

Write-Host "`nDepo: $repoRoot" -ForegroundColor Cyan
Write-Host "Dal:   main"
Write-Host "Origin: $origin"
$confirm = Read-Host 'Mevcut projeyi yedekleyip dosyalari degistirmek ve build basarili olursa yalnizca yeni test dalina gondermek icin EVET yaz'
if ($confirm -cne 'EVET') { Write-Host 'Iptal edildi; dosyalar degistirilmedi.'; exit 0 }

Write-Host "`nGitHub'daki son main surumu aliniyor..." -ForegroundColor Cyan
& git -C $repoRoot fetch origin
if ($LASTEXITCODE -ne 0) { Stop-Setup 'GitHub fetch basarisiz. Baglanti/oturumunu kontrol et.' }
& git -C $repoRoot pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { Stop-Setup 'main dalini ileri tasiyamadim. GitHub Desktop uzerinden senkronize et ve yeniden dene.' }
if ((& git -C $repoRoot status --porcelain)) { Stop-Setup 'Guncelleme sonrasi depo temiz degil; guvenlik icin durduruldu.' }

$parent = Split-Path $repoRoot -Parent
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$testBranch = "test/v19.38-code-applied-$stamp"
Write-Host "`nAna dali korumak icin test dali olusturuluyor: $testBranch" -ForegroundColor Cyan
& git -C $repoRoot switch -c $testBranch
if ($LASTEXITCODE -ne 0) { Stop-Setup 'Test dali olusturulamadi; ana dal degistirilmedi.' }
$backupZip = Join-Path $parent "KASA-PRO-V19-main-yedek-$stamp.zip"
Write-Host "`nMevcut kaynak yedekleniyor: $backupZip" -ForegroundColor Cyan
& git -C $repoRoot archive --format=zip "--output=$backupZip" HEAD
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $backupZip)) { Stop-Setup 'Kaynak yedegi olusturulamadi; dosyalar degistirilmedi.' }

Write-Host 'Proje dosyalari kopyalaniyor...' -ForegroundColor Cyan
$excludeDirs = @((Join-Path $sourceRoot '.git'), (Join-Path $sourceRoot 'node_modules'), (Join-Path $sourceRoot 'dist'), (Join-Path $sourceRoot '.vite'))
$excludeFiles = @('TEK_SEFER_YAYINLA.bat','WINDOWS_TEK_SEFER_GITHUB_GUNCELLE.ps1','INSTALLER_README.txt','.env','.env.local','.env.production','.env.production.local')
& robocopy $sourceRoot $repoRoot /E /R:1 /W:1 /XD $excludeDirs /XF $excludeFiles | Out-Host
$copyCode = $LASTEXITCODE
if ($copyCode -ge 8) {
  & git -C $repoRoot reset --hard HEAD | Out-Null
  & git -C $repoRoot clean -fd | Out-Null
  Stop-Setup 'Dosya kopyalama basarisiz; onceki Git kaynaklari geri yuklendi.'
}

Write-Host "`nBagimliliklar yukleniyor. Bu adim internet baglantisina gore birkac dakika surebilir..." -ForegroundColor Cyan
Push-Location $repoRoot
try {
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install basarisiz.' }
  Write-Host "`nVite/TypeScript uretim derlemesi calisiyor..." -ForegroundColor Cyan
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build basarisiz.' }
} catch {
  Pop-Location
  Write-Host "`nDerleme basarisiz: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Guvenlik icin proje degisiklikleri geri aliniyor...' -ForegroundColor Yellow
  & git -C $repoRoot reset --hard HEAD | Out-Null
  & git -C $repoRoot clean -fd | Out-Null
  Stop-Setup 'Derleme gecmedigi icin test dalina gonderim yapilmadi; main dalina dokunulmadi. Ustteki hata mesajini destek icin paylas.'
}
Pop-Location

& git -C $repoRoot add -A
if ($LASTEXITCODE -ne 0) { Stop-Setup 'Git add basarisiz.' }
$pending = (& git -C $repoRoot status --porcelain)
if (-not $pending) { Stop-Setup 'Kopyalamadan sonra commit edilecek degisiklik bulunamadi. Kaynak ZIP yanlis klasorden calistirilmis olabilir.' }
& git -C $repoRoot commit -m 'Apply KASA PRO V19.38 requested UI and permission updates'
if ($LASTEXITCODE -ne 0) { Stop-Setup 'Commit basarisiz. Dosyalar yerelde duruyor; GitHub Desktop hata mesajini kontrol et.' }
& git -C $repoRoot push -u origin $testBranch
if ($LASTEXITCODE -ne 0) { Stop-Setup 'Push basarisiz. Commit yerelde hazir; GitHub oturumunu yenileyip GitHub Desktop uzerinden Push origin yap.' }

Write-Host "`nBASARILI: Kaynak kod derlendi ve test dalina gonderildi. main dalina dokunulmadi." -ForegroundColor Green
Write-Host 'Vercel > Deployments bolumunde test dalinin Preview dagitimini kontrol et. Production'a ancak Preview testleri basariliysa birlestir.' -ForegroundColor Green
Write-Host 'POSMIST kontrollu erisimi ve UI degisiklikleri test kaynagindadir. Canli Supabase yetki/RLS testi ayri dogrulanmalidir.' -ForegroundColor Yellow
