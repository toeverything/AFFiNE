set -e

if [ -v GRAPHITE_TOKEN ];then
    gt auth --token $GRAPHITE_TOKEN
fi

git fetch origin canary:canary --depth=1
git branch canary -t origin/canary
gt init --trunk canary
