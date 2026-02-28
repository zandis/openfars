{ pkgs }: {
  deps = [
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.R
    pkgs.rPackages.jsonlite
    pkgs.rPackages.ggplot2
    pkgs.rPackages.dplyr
    pkgs.rPackages.tidyr
    pkgs.rPackages.readr
    pkgs.rPackages.BiocManager
  ];
}
