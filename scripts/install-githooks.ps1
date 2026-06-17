param(
  [switch]$EnableAutoPush,
  [string]$Remote = "origin"
)

git config core.hooksPath .githooks

if ($EnableAutoPush) {
  git config fitfocus.autoPush true
  git config fitfocus.autoPushRemote $Remote
  Write-Host "✅ Hooks включены: core.hooksPath=.githooks"
  Write-Host "✅ Auto-push включён: fitfocus.autoPush=true, remote=$Remote"
} else {
  Write-Host "✅ Hooks включены: core.hooksPath=.githooks"
  Write-Host "Подсказка: запусти с -EnableAutoPush, чтобы включить авто-пуш после коммитов."
}

Write-Host "Проверка: git config core.hooksPath"
