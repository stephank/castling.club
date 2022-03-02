{ pkgs ? import <nixpkgs> { } }:

pkgs.callPackage ./yarn-project.nix {

  nodejs = pkgs.nodejs-16_x;

} {

  src = pkgs.lib.cleanSource ./.;

  overrideAttrs = old: {

    buildInputs = with pkgs; old.buildInputs
      ++ [ python3 pkg-config pixman cairo pango libjpeg ]
      ++ pkgs.lib.optionals pkgs.stdenv.isDarwin (
        with pkgs.darwin.apple_sdk.frameworks; [ CoreText xcbuild ]
      );

    buildPhase = ''
      yarn build
    '';

  };

}
