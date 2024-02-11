{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-23.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        inherit (pkgs) lib stdenv;

        # Major Node.js version.
        nodejs = pkgs.nodejs_20;

        corepack = pkgs.corepack.override {
          inherit nodejs;
        };

        # Packages required to build the `canvas` npm package.
        canvasDeps = with pkgs; (
          [ python3 pkg-config pixman cairo pango libjpeg ]
          ++ lib.optionals stdenv.isDarwin (with darwin.apple_sdk.frameworks;
          [ CoreText xcbuild ]
          )
        );

        # Import and amend the app build from yarn-plugin-nixify.
        package = pkgs.callPackage ./yarn-project.nix
          {
            inherit nodejs;
          }
          {
            src = ./.;
            overrideAttrs = old: {
              buildPhase = "yarn build";
              checkPhase = "yarn test";
              doCheck = true;
            };
            overrideCanvasAttrs = old: {
              buildInputs = old.buildInputs ++ canvasDeps;
              env = lib.optionalAttrs (stdenv.isDarwin && stdenv.isx86_64) {
                NIX_CFLAGS_COMPILE = "-D__ENVIRONMENT_MAC_OS_X_VERSION_MIN_REQUIRED__=101300";
              };
            };
          };

      in
      {

        # For `nix build`
        packages.default = package;

        # For `nix develop`
        devShells.default = pkgs.mkShell {
          buildInputs = (with pkgs; [ postgresql nixpkgs-fmt ])
            ++ canvasDeps
            ++ [ nodejs corepack ];
        };

        # For `nix flake check`
        checks.default = import ./functional-test/run.nix package pkgs;

      });
}
