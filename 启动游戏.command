#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  print '请先安装 Node.js 24 LTS，再双击启动。'
  read '?按回车关闭'; exit 1
fi
exec node scripts/local-server.mjs --open
