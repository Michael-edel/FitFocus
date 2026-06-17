param(
  [string]$Remote = "origin"
)

$branch = (git rev-parse --abbrev-ref HEAD).Trim()

if ($branch -eq "HEAD") {
  throw "Detached HEAD: cannot auto-detect branch for push."
}

git -c fitfocus.autoPush=true -c fitfocus.autoPushRemote=$Remote push $Remote "HEAD:$branch"
