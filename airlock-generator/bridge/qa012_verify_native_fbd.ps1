# QA-OL-012 — read-only verifier for a separately saved native Owen Logic TEST OWLE.
# Example: powershell -NoProfile -ExecutionPolicy Bypass -File bridge/qa012_verify_native_fbd.ps1 -ProjectPath 'C:\...\Airlock_FBD_QA012_HOME.owle'
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ProjectPath)
$ErrorActionPreference='Stop'
try {
  $file=Get-Item -LiteralPath $ProjectPath -ErrorAction Stop
  if($file.Name -notmatch '^Airlock_FBD_QA012_.*\.owle$'){
    throw 'REFUSE_NON_QA012_TEST_FILE'
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[System.IO.Compression.ZipFile]::OpenRead($file.FullName)
  try {
    $entry=$zip.GetEntry('Project')
    if(-not $entry){throw 'MISSING_OWLE_PROJECT_ENTRY'}
    $reader=New-Object System.IO.StreamReader($entry.Open())
    try {$raw=$reader.ReadToEnd()} finally {$reader.Dispose()}
  } finally {$zip.Dispose()}
  $root=$raw|ConvertFrom-Json
  $projects=@($root.PSObject.Properties)
  if($projects.Count -ne 1){throw 'UNEXPECTED_PROJECT_ROOT'}
  $document=$projects[0].Value.DocumentModel
  if(-not $document){throw 'NO_DOCUMENT_MODEL'}
  $elements=@($document.Elements)
  $wires=@($document.ConnectorModels)
  if($elements.Count -ne 25){throw ('EXPECTED_25_ELEMENTS_GOT_'+$elements.Count)}
  if($wires.Count -ne 16){throw ('EXPECTED_16_CONNECTORS_GOT_'+$wires.Count)}
  $portMap=@{}
  $blockNames=@{}
  foreach($element in $elements){
    $model=$element.ElementModel
    if(-not $model){$model=$element.ElementBlockStoreModel.ElementModel}
    if(-not $model){throw 'ELEMENT_WITHOUT_MODEL'}
    $name=[string]$model.Title
    if($blockNames.ContainsKey($name)){throw ('DUPLICATE_ELEMENT_'+$name)}
    $blockNames[$name]=$true
    foreach($port in @($model.Ports)){
      $uid=[string]$port.UniqueId
      if(-not $uid -or $portMap.ContainsKey($uid)){throw 'DUPLICATE_OR_MISSING_PORT_UID'}
      $portMap[$uid]=$name+'.'+[string]$port.Name
    }
  }
  foreach($required in @('FB_Room_N1','FB_Room_N4','OR','I4','Q1','Q2','Q4')){
    if(-not $blockNames.ContainsKey($required)){throw ('MISSING_ELEMENT_'+$required)}
  }
  $edges=@()
  foreach($wire in $wires){
    $connector=$wire.ConnectorModel
    if(-not $connector){throw 'UNKNOWN_CONNECTOR_TYPE'}
    $source=$portMap[[string]$connector.FromPortUId]
    $target=$portMap[[string]$connector.ToPortUId]
    if(-not $source -or -not $target){throw 'DANGLING_WIRE_ENDPOINT'}
    $edge=$source+' -> '+$target
    if($edges -contains $edge){throw ('DUPLICATE_WIRE_'+$edge)}
    $edges+=,$edge
  }
  $expected=@(
    'I1.Output0 -> FB_Room_N1.Input0',
    'I1.Output0 -> FB_Room_N4.Input0',
    'I2.Output0 -> FB_Room_N1.Input1',
    'I2.Output0 -> FB_Room_N4.Input1',
    'I3.Output0 -> FB_Room_N1.Input2',
    'I4.Output0 -> FB_Room_N1.Input3',
    'I4.Output0 -> FB_Room_N4.Input2',
    'I5.Output0 -> FB_Room_N1.Input4',
    'I6.Output0 -> FB_Room_N4.Input3',
    'I7.Output0 -> FB_Room_N4.Input4',
    'I8.Output0 -> FB_Room_N4.Input5',
    'FB_Room_N1.Output8 -> OR.Input0',
    'FB_Room_N4.Output7 -> OR.Input1',
    'OR.Output2 -> Q4.Input0',
    'FB_Room_N1.Output0 -> Q1.Input0',
    'FB_Room_N4.Output0 -> Q2.Input0'
  )
  $missing=@($expected|Where-Object {$edges -notcontains $_})
  $unexpected=@($edges|Where-Object {$expected -notcontains $_})
  if($missing.Count -ne 0 -or $unexpected.Count -ne 0){
    throw ('FBD_PORTMAP_MISMATCH missing='+($missing -join ';')+' unexpected='+($unexpected -join ';'))
  }
  [pscustomobject]@{
    result='QA012_NATIVE_CONNECTOR_PORTMAP_PASS'
    scope='OWLE_STRUCTURE_ONLY_NOT_SIMULATION'
    elements=$elements.Count
    connectors=$wires.Count
    matched=$expected.Count
    hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    nativeScenariosVerified=$false
  }|ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{result='QA012_NATIVE_CONNECTOR_PORTMAP_FAIL';error=$_.Exception.Message}|
    ConvertTo-Json -Compress
  exit 1
}
