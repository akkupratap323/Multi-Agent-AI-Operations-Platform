#!/usr/bin/env bash
# Speak text using Apple's System Voice

# Exit on error
set -e

TEXT="${1:-'Testing apple system voice.'}"

echo "Speaking: $TEXT"
say "$TEXT"
