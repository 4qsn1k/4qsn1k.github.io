$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$bt = Join-Path $sdk "build-tools\36.0.0"
$jbin = "C:\Program Files\Android\Android Studio\jbr\bin"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$jbin;$env:Path"
$platform = Join-Path $sdk "platforms\android-37.0\android.jar"
$out = Join-Path $root "out"
New-Item -ItemType Directory -Force "$out\compiled","$out\classes","$out\dex" | Out-Null
Write-Host "AAPT2 compile..."
& "$bt\aapt2.exe" compile --dir "$root\res" -o "$out\compiled"
if($LASTEXITCODE -ne 0){throw "aapt compile failed"}
Write-Host "AAPT2 link..."
$flats = @(Get-ChildItem "$out\compiled" -Recurse -Filter *.flat | ForEach-Object FullName)
& "$bt\aapt2.exe" link --auto-add-overlay -I $platform --manifest "$root\AndroidManifest.xml" -o "$out\unsigned.apk" $flats
if($LASTEXITCODE -ne 0){throw "aapt link failed"}
Write-Host "JAVAC..."
$sources = @(Get-ChildItem "$root\src" -Recurse -Filter *.java | ForEach-Object FullName)
& "$jbin\javac.exe" -encoding UTF-8 -source 8 -target 8 -cp $platform -d "$out\classes" $sources
if($LASTEXITCODE -ne 0){throw "javac failed"}
Write-Host "D8..."
$classes = @(Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName)
& "$bt\d8.bat" --lib $platform --min-api 30 --output "$out\dex" $classes
if($LASTEXITCODE -ne 0){throw "d8 failed"}
Write-Host "MERGE..."
Copy-Item "$out\unsigned.apk" "$out\withdex.apk" -Force
Push-Location "$out\dex"
& "$jbin\jar.exe" uf "$out\withdex.apk" classes.dex
Pop-Location
if($LASTEXITCODE -ne 0){throw "zip failed"}
Write-Host "ALIGN..."
& "$bt\zipalign.exe" -f -p 4 "$out\withdex.apk" "$out\aligned.apk"
if($LASTEXITCODE -ne 0){throw "align failed"}
$ks="$env:USERPROFILE\.android\debug.keystore"
if(!(Test-Path $ks)){
    New-Item -ItemType Directory "$env:USERPROFILE\.android" -Force | Out-Null
    & "$jbin\keytool.exe" -genkeypair -keystore $ks -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=MI13 Agent Debug,O=Personal Lab,C=US"
}
Write-Host "SIGN..."
& "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out "$root\MI13-Agent-v0.1.apk" "$out\aligned.apk"
if($LASTEXITCODE -ne 0){throw "sign failed"}
Write-Host "VERIFY..."
& "$bt\apksigner.bat" verify --verbose --print-certs "$root\MI13-Agent-v0.1.apk"
if($LASTEXITCODE -ne 0){throw "verify failed"}
Get-Item "$root\MI13-Agent-v0.1.apk" | Select-Object FullName,Length,LastWriteTime