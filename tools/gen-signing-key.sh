#!/bin/sh
# Generate the actor signing keypair.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo >&2 "Usage: $0 <filename>"
  exit 64
fi

set -x
openssl genrsa -out "$1" 2048
openssl rsa -in signing-key -pubout > "$1.pub"
