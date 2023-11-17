if [ -v GRAPHITE_TOKEN ];then
    gt auth --token $GRAPHITE_TOKEN
fi

git fetch
git branch canary -t origin/canary
gt init --trunk canary
