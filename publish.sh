# !/bin/bash
cd /Users/haohui/code/Xyzen/web
export VITE_XYZEN_BACKEND_URL="https://chat.sciol.ac.cn"

yarn build

zip -r web.zip site/*

timestamp=$(date +"%Y%m%d-%H%M%S")
echo "Timestamp: $timestamp"

stroage_PATH="/Users/haohui/Downloads/xyzen-bohr-app"

mkdir -p $stroage_PATH

mv web.zip $stroage_PATH/web-$timestamp.zip
