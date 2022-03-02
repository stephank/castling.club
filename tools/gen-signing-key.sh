#!/bin/sh
# Generate the actor signing keypair.
set -xe

cd $(dirname $0)/../
openssl genrsa -out signing-key 2048
openssl rsa -in signing-key -pubout > signing-key.pub
