#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
# Render Linux ortamına Chrome tarayıcısını ve gerekli tüm Linux bağımlılıklarını zorla indirip kurar:
npx puppeteer browsers install chrome
