param()

$BOT_TOKEN = "8442704022:AAFCUHvJnDPf9lexLvK54vSqatEHKRuYiow"
$CHAT_ID = ""

if ([string]::IsNullOrEmpty($CHAT_ID)) {
    Write-Output "CHAT_ID не указан. Напиши что-нибудь в канал и выполни:"
    Write-Output "curl https://api.telegram.org/bot$BOT_TOKEN/getUpdates"
    Write-Output "Найди chat_id (для канала с -100) и вставь в этот скрипт."
    exit 1
}

$log = git log -1 --format="%s%n%b"
$lines = $log -split "`n"
$commitMsg = $lines[0]
$commitBody = ($lines[1..$lines.Length] -join "`n").Trim()
$author = git log -1 --format="%an"
$date = git log -1 --format="%cd" --date=short
$fileCount = (git diff --name-only HEAD~1 HEAD 2>$null).Count
$files = (git diff --name-only HEAD~1 HEAD 2>$null) -join "`n"
$stats = git diff --stat HEAD~1 HEAD 2>$null
$diff = git diff HEAD~1 HEAD 2>$null

$description = if ($commitBody) { $commitBody } else { $files }

$message = @"
<b>[iTiredMP3] [Experimental] [By $(whoami)]</b>
<code>[Commit:]</code> $commitMsg

<b>Изменения ($fileCount файлов):</b>
<code>$description</code>

<b>Файлы:</b>
<code>$stats</code>

<b>Diff (сокращённо):</b>
<pre>$diff</pre>

<b>Автор:</b> $author | <b>Дата:</b> $date
"@

if ($message.Length -gt 4000) {
    $message = $message.Substring(0, 4000) + "..."
}

$body = @{
    chat_id = $CHAT_ID
    text = $message
    parse_mode = "HTML"
}

try {
    $r = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" -Method Post -Body $body -TimeoutSec 10
    Write-Output "Telegram: OK"
} catch {
    Write-Output "Telegram error: $_"
}
