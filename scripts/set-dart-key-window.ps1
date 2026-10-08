param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$taskRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $taskRoot '.secrets'
$secretPath = Join-Path $secretDirectory 'opendart-key.dpapi'
if ($SelfTest) {
    $secretDirectory = Join-Path $taskRoot 'tmp'
    $secretPath = Join-Path $secretDirectory 'dart-key-self-test.dpapi'
}
$window = New-Object System.Windows.Forms.Form
$window.Text = 'SIANALY - OpenDART key setup'
$window.ClientSize = New-Object System.Drawing.Size(500,210)
$window.StartPosition = 'CenterScreen'
$window.TopMost = $true
$window.FormBorderStyle = 'FixedDialog'
$window.MaximizeBox = $false
$window.MinimizeBox = $false
$window.Font = New-Object System.Drawing.Font('Segoe UI',10)
$label = New-Object System.Windows.Forms.Label
$label.Text = "Paste your OpenDART API key below, then click Save.`r`nThe key is hidden and encrypted for your Windows account."
$label.Location = New-Object System.Drawing.Point(24,24)
$label.Size = New-Object System.Drawing.Size(450,52)
$window.Controls.Add($label)
$inputBox = New-Object System.Windows.Forms.TextBox
$inputBox.UseSystemPasswordChar = $true
$inputBox.Location = New-Object System.Drawing.Point(24,87)
$inputBox.Size = New-Object System.Drawing.Size(450,28)
$window.Controls.Add($inputBox)
$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(24,126)
$status.Size = New-Object System.Drawing.Size(330,55)
$status.Text = 'No key is sent to chat or written in plaintext.'
$window.Controls.Add($status)
$save = New-Object System.Windows.Forms.Button
$save.Text = 'Save'
$save.Location = New-Object System.Drawing.Point(374,141)
$save.Size = New-Object System.Drawing.Size(100,34)
$window.Controls.Add($save)
$window.AcceptButton = $save
$save.Add_Click({
    $keyValue = $inputBox.Text.Trim()
    if ($keyValue -notmatch '^[0-9a-fA-F]{40}$') {
        $status.Text = 'Enter the 40-character API key, without spaces.'
        return
    }
    $secureValue = $null
    $saveStage = 'prepare'
    try {
        $secureValue = ConvertTo-SecureString $keyValue -AsPlainText -Force
        $saveStage = 'encrypt'
        $encryptedValue = ConvertFrom-SecureString $secureValue
        $saveStage = 'directory'
        New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
        $saveStage = 'write'
        $encryptedValue | Set-Content -LiteralPath $secretPath -Encoding ASCII
        $inputBox.Clear()
        $status.Text = 'Saved encrypted. You can close this window.'
        $save.Enabled = $false
    } catch {
        $status.Text = 'Save failed at: ' + $saveStage + '. Please tell Codex this message.'
        $safeDiagnostic = $saveStage + ' / ' + $_.Exception.GetType().FullName + ' / ' + $_.Exception.HResult
        $safeDiagnostic | Set-Content -LiteralPath (Join-Path $taskRoot 'tmp/dart-key-save-error.txt') -ErrorAction SilentlyContinue
    } finally {
        $keyValue = $null
        if ($secureValue) { $secureValue.Dispose() }
    }
})
$window.Add_Shown({
    $window.Activate(); $window.BringToFront(); $inputBox.Focus()
    if ($SelfTest) {
        $inputBox.Text = '0' * 40
        $save.PerformClick()
        $window.Close()
    }
})
[void]$window.ShowDialog()
if ($SelfTest) {
    if ($save.Enabled) { throw 'GUI save self-test failed.' }
    Remove-Item -LiteralPath $secretPath
    Write-Output 'GUI save self-test passed (dummy value only).'
}
$inputBox.Clear()
$window.Dispose()
