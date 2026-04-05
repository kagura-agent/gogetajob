#!/bin/bash
export PATH="/home/test/.nvm/versions/node/v22.22.1/bin:$PATH"
cd /home/test/.openclaw/workspace/gogetajob
node dist/cli/index.js "$@"
