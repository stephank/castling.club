# Starts PostgreSQL and castling.club, then runs the test.

app: pkgs: with pkgs;
runCommand "test"
{
  nativeBuildInputs = [ app openssl postgresql ];
} ''
  set -xeuo pipefail

  # Use a Unix socket in our build dir.
  export PGHOST="$PWD/db"
  # Needed because $USER is not set.
  export PGUSER="$(id -nu)"

  # Generate a signing key.
  ${../tools/gen-signing-key.sh} signing-key

  # Initialize and start PostgreSQL.
  initdb -D db
  postgres -D db -k "$PGHOST" &

  # Terminate background jobs on exit.
  trap 'jobs -p | xargs kill; wait' EXIT

  # Wait for PostgreSQL to complete startup.
  checkPort() {
    declare -i tries=0
    while ! 2> /dev/null > /dev/tcp/127.0.0.1/$1; do
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
