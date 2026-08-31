#!/bin/bash
# C7 Case Files — double-click launcher (macOS)
cd "$(dirname "$0")"
echo "Starting C7 Case Files on http://localhost:8777 ..."
open "http://localhost:8777" &
python3 -m http.server 8777
