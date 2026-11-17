param([Parameter(Mandatory=$true)][string]$EncodedText, [int]$VoiceIndex = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime] | Out-Null
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$synth = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::new()
$voices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -eq 'ja-JP' })
if ($voices.Count -eq 0) { throw 'Japanese speech voice unavailable' }
$synth.Voice = $voices[$VoiceIndex % $voices.Count]
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedText))
$operation = $synth.SynthesizeTextToStreamAsync($text)
$task = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($operation))
$task.Wait()
$stream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($task.Result)
$buffer = [IO.MemoryStream]::new()
try {
    $stream.CopyTo($buffer)
    [Convert]::ToBase64String($buffer.ToArray())
} finally {
    $buffer.Dispose()
    $stream.Dispose()
    $synth.Dispose()
}
