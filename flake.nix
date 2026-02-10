{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs =
    { self, nixpkgs }:
    let

      inherit (nixpkgs) lib;

      # Instantiate Nixpkgs with our overlay.
      pkgsBySystem = lib.mapAttrs (
        system: unused:
        import nixpkgs {
          inherit system;
          overlays = [ self.overlays.default ];
        }
      ) nixpkgs.legacyPackages;

      # Iterate Nixpkgs instances.
      eachSystem = f: lib.mapAttrs (unused: f) pkgsBySystem;

    in
    {
      # The primary export is a Nixpkgs overlay.
      overlays.default = final: prev: {
        castling-club = final.callPackage ./package.nix { };
      };

      # For `nix build`
      packages = eachSystem (pkgs: {
        default = pkgs.castling-club;
      });

      # For `nix develop`
      devShells = eachSystem (pkgs: {
        default = pkgs.mkShell {
          inputsFrom = [ pkgs.castling-club ];
          nativeBuildInputs = [ pkgs.postgresql ];
        };
      });

      # For `nix flake check`
      checks = eachSystem (pkgs: {
        default = pkgs.callPackage ./functional-test/run.nix { };
      });

      # For `nix fmt`
      formatter = eachSystem (pkgs: pkgs.nixfmt-tree);
    };
}
