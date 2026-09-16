#!/usr/bin/env python3
"""Restore missing, hash-verified mascot PNGs from the supplied prototype ZIP."""
import argparse
import hashlib
import os
from pathlib import Path
import tempfile
import zipfile

EXPECTED = {
    "quack-empty-state.png": "5dda636f54eb1296da9b1db90d1f8e7c88bcaa997d989e791da4898932bbfa64",
    "quack-working.png": "643e0fa1a22f7db77cc69970ddd7c7cb7d357ef09eb3febc3bb05aabf7b9003c",
    "honk-error.png": "97c7b37fa3eaabef6125e9d293b23939746b29424a3e528ba105d6bad6c03df5",
}


def restore(archive: Path, destination: Path) -> list[Path]:
    """Validate all inputs before writing; never extract arbitrary archive paths."""
    pending = []
    with zipfile.ZipFile(archive) as source:
        for name, expected in EXPECTED.items():
            member = "quack-honk-pdf/public/mascots/" + name
            info = source.getinfo(member)
            if info.file_size > 2_000_000:
                raise ValueError("Unexpected asset size: " + name)
            data = source.read(member)
            if hashlib.sha256(data).hexdigest() != expected:
                raise ValueError("Asset checksum mismatch: " + name)
            target = destination / name
            if target.exists():
                if target.is_symlink() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
                    raise ValueError("Refusing to overwrite a different existing file: " + str(target))
                continue
            pending.append((target, data))
    destination.mkdir(parents=True, exist_ok=True)
    written = []
    for target, data in pending:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=destination, delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(data)
            os.replace(temporary, target)
            written.append(target)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Path to quack-honk-pdf-prototype.zip")
    args = parser.parse_args()
    destination = Path(__file__).resolve().parents[1] / "public" / "mascots"
    try:
        written = restore(args.archive, destination)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        parser.exit(1, "Restore failed: " + str(error) + "\n")
    print("Verified all three assets; restored " + str(len(written)) + " file(s).")
    print("Commit public/mascots/*.png to finish the repository asset import.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
