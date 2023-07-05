#!/bin/bash

# Set the directory
dir="./out/canary/make/zip/darwin/arm64"

# Get the first file
file=$(ls -1 $dir | head -n 1)

# Check if file exists and is a zip file
if [ -f "$dir/$file" ] && [ ${file: -4} == ".zip" ]
then
  # Unzip the file
  unzip "$dir/$file" -d "zip-out"
else
  echo "No zip file found"
fi
