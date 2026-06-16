#!/usr/bin/env python3
"""
Extract the GTFS zip to the backend data directory on first run.

Called automatically by docker-compose (gtfs-init service) before the backend starts.
Safe to re-run: exits 0 immediately if the destination directory already exists.

Source:  otp-toledo/GTFS_Urbano_Toledo_2026.zip  (tracked via Git LFS)
Dest:    movilidad-urbana-sim/backend/data/gtfs/GTFS_Urbano_Toledo_2026/
"""
import sys
import zipfile
from pathlib import Path

DEST = Path("movilidad-urbana-sim/backend/data/gtfs/GTFS_Urbano_Toledo_2026")
SRC = Path("otp-toledo/GTFS_Urbano_Toledo_2026.zip")


def main() -> None:
    if DEST.exists():
        print(f"GTFS already extracted at {DEST}, skipping.")
        return

    if not SRC.exists():
        print(
            f"ERROR: GTFS zip not found at {SRC}.\n"
            "Make sure Git LFS is installed and run:\n"
            "  git lfs pull"
        )
        sys.exit(1)

    DEST.mkdir(parents=True, exist_ok=True)
    print(f"Extracting {SRC} -> {DEST} ...")
    with zipfile.ZipFile(SRC) as zf:
        zf.extractall(DEST)
    print(f"Done. {len(list(DEST.iterdir()))} files extracted.")


if __name__ == "__main__":
    main()
