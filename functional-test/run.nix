# Starts PostgreSQL and castling.club, then runs the test.

pkgs: with pkgs;
let
  app = pkgs.castling-club.defaultPackage;
in
runCommand "test" {
  nativeBuildInputs = [ app openssl postgresql ];
  APP_DOMAIN="localhost:5080";
} ''
  set -xeuo pipefail

  # Needed because $USER is not set.
  export PGUSER="$(id -nu)"

  # Generate a signing key.
  ${../tools/gen-signing-key.sh} signing-key

  # Initialize and start PostgreSQL.
  initdb -D db
  postgres -D db &

  # Terminate background jobs on exit.
  trap 'jobs -p | xargs kill; wait' EXIT

  # Wait for PostgreSQL to complete startup.
  checkPort() {
    declare -i tries=0
    while ! 2> /dev/null > /dev/tcp/::1/$1; do
      if (( ++tries >= 10 )); then
        echo "Timed out"
        exit 1
      fi
      sleep 1
    done
  }
  checkPort 5432

  # Initialize and start castling.club.
  createdb
  castlingclub-migrate up
  castlingclub &

  # Wait for castling.club to complete startup.
  checkPort 5080

  # Run the test suite.
  ${app.nodejs}/bin/node ${./main.mjs} | tee $out
''
