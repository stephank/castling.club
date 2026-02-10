# Test a build with:
# nix-build -E '(import <nixpkgs> { }).callPackage ./package.nix { }'

{
  buildNpmPackage,
  importNpmLock,
  nodejs_24,
  pkg-config,
  pixman,
  cairo,
  pango,
  libjpeg,
}:

buildNpmPackage {
  pname = "castling-club";
  version = "0.0.0";
  src = ./.;

  nodejs = nodejs_24;

  npmDeps = importNpmLock { npmRoot = ./.; };
  npmConfigHook = importNpmLock.npmConfigHook;

  nativeBuildInputs = [ pkg-config ];
  buildInputs = [
    pixman
    cairo
    pango
    libjpeg
  ];
}
