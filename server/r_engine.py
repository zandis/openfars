"""
R execution engine — runs R code via subprocess, captures output and plots.
For use on Replit (R installed via nix) or any system with R available.
"""

import asyncio
import base64
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def is_r_available() -> bool:
    """Check if R is installed and available."""
    return shutil.which("Rscript") is not None


async def execute_r_code(code: str, timeout: int = 60, working_dir: str = "") -> dict:
    """
    Execute R code and return output, errors, and plots.
    Plots are returned as base64-encoded PNGs.
    """
    if not is_r_available():
        return {
            "output": "",
            "error": "R is not installed. Install R via system packages or Replit nix config.",
            "plots": [],
            "success": False,
        }

    # Create a temp directory for plots
    with tempfile.TemporaryDirectory() as tmpdir:
        plot_dir = os.path.join(tmpdir, "plots")
        os.makedirs(plot_dir)

        # Wrap user code with plot capture
        wrapped_code = f"""
# Setup plot capture
plot_counter <- 0
plot_dir <- "{plot_dir}"

# Override plot device to save PNGs
.openfars_plot_hook <- function() {{
    plot_counter <<- plot_counter + 1
    fname <- file.path(plot_dir, sprintf("plot_%03d.png", plot_counter))
    png(fname, width=800, height=600, res=120)
}}

# Set default device
options(device = function(...) {{
    plot_counter <<- plot_counter + 1
    fname <- file.path(plot_dir, sprintf("plot_%03d.png", plot_counter))
    png(fname, width=800, height=600, res=120)
}})

# Auto-save ggplot
if (requireNamespace("ggplot2", quietly=TRUE)) {{
    .openfars_print_ggplot <- function(x, ...) {{
        plot_counter <<- plot_counter + 1
        fname <- file.path(plot_dir, sprintf("plot_%03d.png", plot_counter))
        ggplot2::ggsave(fname, plot=x, width=8, height=6, dpi=120)
        invisible(x)
    }}
}}

# ---- User code starts ----
{code}
# ---- User code ends ----

# Close any open devices
while (dev.cur() > 1) try(dev.off(), silent=TRUE)
"""

        # Write code to temp file
        code_file = os.path.join(tmpdir, "script.R")
        with open(code_file, "w") as f:
            f.write(wrapped_code)

        # Run R
        cwd = working_dir or os.getcwd()
        try:
            proc = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    "Rscript", "--vanilla", code_file,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=cwd,
                ),
                timeout=5,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            return {
                "output": "",
                "error": f"Execution timed out after {timeout} seconds",
                "plots": [],
                "success": False,
            }
        except FileNotFoundError:
            return {
                "output": "",
                "error": "Rscript not found. Ensure R is installed.",
                "plots": [],
                "success": False,
            }

        output = stdout.decode("utf-8", errors="replace")
        error = stderr.decode("utf-8", errors="replace")

        # Collect plots
        plots = []
        plot_files = sorted(Path(plot_dir).glob("*.png"))
        for pf in plot_files:
            with open(pf, "rb") as img:
                b64 = base64.b64encode(img.read()).decode()
                plots.append(f"data:image/png;base64,{b64}")

        # Filter out R's standard messages from stderr
        error_lines = [
            line for line in error.split("\n")
            if line.strip() and not line.startswith("Loading required") and "Warning message" not in line
        ]
        clean_error = "\n".join(error_lines)

        return {
            "output": output,
            "error": clean_error,
            "plots": plots,
            "success": proc.returncode == 0,
        }


async def install_r_package(package_name: str, repo: str = "https://cloud.r-project.org") -> dict:
    """Install an R package from CRAN or Bioconductor."""
    if not is_r_available():
        return {"success": False, "error": "R is not installed."}

    # Check if it's a Bioconductor package request
    if repo.lower() == "bioconductor":
        code = f"""
if (!requireNamespace("BiocManager", quietly=TRUE))
    install.packages("BiocManager", repos="https://cloud.r-project.org")
BiocManager::install("{package_name}", ask=FALSE, update=FALSE)
cat("SUCCESS\\n")
"""
    else:
        code = f"""
install.packages("{package_name}", repos="{repo}", quiet=TRUE)
cat("SUCCESS\\n")
"""

    result = await execute_r_code(code, timeout=300)

    if "SUCCESS" in result.get("output", ""):
        return {"success": True, "output": result["output"]}
    else:
        return {
            "success": False,
            "error": result.get("error", "") or result.get("output", "Installation failed"),
        }


async def list_r_packages() -> list:
    """List installed R packages."""
    if not is_r_available():
        return []

    code = """
pkgs <- installed.packages()[, c("Package", "Version")]
cat(jsonlite::toJSON(as.data.frame(pkgs), auto_unbox=TRUE))
"""
    result = await execute_r_code(code, timeout=30)
    if result["success"] and result["output"]:
        try:
            return json.loads(result["output"])
        except json.JSONDecodeError:
            return []
    return []


async def install_python_package(package_name: str) -> dict:
    """Install a Python package via pip."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "pip", "install", package_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
        output = stdout.decode("utf-8", errors="replace")
        error = stderr.decode("utf-8", errors="replace")
        return {
            "success": proc.returncode == 0,
            "output": output,
            "error": error if proc.returncode != 0 else "",
        }
    except asyncio.TimeoutError:
        return {"success": False, "error": "Installation timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}
