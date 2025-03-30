set -e

if [ -v GRAPHITE_TOKEN ];then
    gt auth --token $GRAPHITE_TOKEN
fi

codespace_branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$codespace_branch" != "canary" ]; then
    git fetch origin canary:canary --depth=1
    git branch canary -t origin/canary
    gt init --trunk canary
    git checkout $codespace_branch
else
    gt init --trunk canary
fi
