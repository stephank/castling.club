{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    with nixpkgs.lib;
    flake-utils.lib.simpleFlake {
      inherit self nixpkgs;
      name = "castling-club";
      overlay = final: prev: let

        nodejs = final.nodejs-18_x;

        canvasBuildInputs = with final; (
          [ python3 pkg-config pixman cairo pango libjpeg ]
          ++ optionals stdenv.isDarwin (with darwin.apple_sdk.frameworks;
            [ CoreText xcbuild ]
          )
        );

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
            buildInputs = old.buildInputs ++ canvasBuildInputs;
          };
        };

      in {

        castling-club.defaultPackage = package;

        castling-club.devShell = final.mkShell {
          buildInputs = (with final; [ postgresql ])
            ++ canvasBuildInputs
            ++ [ nodejs package.yarn-freestanding ];
        };

      };
    };
}
