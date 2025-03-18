#!/bin/bash

# Check if a commit message has been provided
if [-z "$1"]; then
    echo "Usage:./git-auto.sh \"commit message\""
    exit 1
fi

#Add all changes
git add .

#Commit changes with message
git commit -m "$1"

git push origin main

echo "Changes pushed successfully"