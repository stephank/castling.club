{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-23.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    with nixpkgs.lib;
    flake-utils.lib.simpleFlake {
      inherit self nixpkgs;
      name = "castling-club";
      overlay = final: prev: let

        inherit (final) stdenv;

        # Major Node.js version.
        nodejs = final.nodejs_20;

        corepack = final.corepack.override {
          inherit nodejs;
        };

        # Packages required to build the `canvas` npm package.
        canvasDeps = with final; (
          [ python3 pkg-config pixman cairo pango libjpeg ]
          ++ optionals stdenv.isDarwin (with darwin.apple_sdk.frameworks;
            [ CoreText xcbuild ]
          )
        );

        # Import and amend the app build from yarn-plugin-nixify.
        package = prev.callPackage ./yarn-project.nix {
          inherit nodejs;
        } {
          src = ./.;
          overrideAttrs = old: {
            buildPhase = "yarn build";
            checkPhase = "yarn test";
            doCheck = true;
          };
          overrideCanvasAttrs = old: {
            buildInputs = old.buildInputs ++ canvasDeps;
            env = optionalAttrs (stdenv.isDarwin && stdenv.isx86_64) {
              NIX_CFLAGS_COMPILE = "-D__ENVIRONMENT_MAC_OS_X_VERSION_MIN_REQUIRED__=101300";
            };
          };
        };

      in {

        # For `nix build`
        castling-club.packages.default = package;

        # For `nix develop`
        castling-club.devShell = final.mkShell {
          buildInputs = (with final; [ postgresql ])
            ++ canvasDeps
            ++ [ nodejs corepack ];
        };

        # For `nix flake check`
        castling-club.checks.default = import ./functional-test/run.nix final;

      };
    };
}
