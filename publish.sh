# !/bin/bash
cd /Users/haohui/code/Xyzen/web
export VITE_XYZEN_BACKEND_URL="https://chat.sciol.ac.cn"

yarn build

zip -r web.zip dist/*

timestamp=$(date +"%Y%m%d-%H%M%S")
echo "Timestamp: $timestamp"

mkdir -p /Users/haohui/Downloads/xyzen-bohr-app

mv web.zip /Users/haohui/Downloads/web-$timestamp.zip
