"""Package generated relic art for the game; this script does not call an image API."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-map", type=Path, help="JSON list of generated {id, source} files to import")
    args = parser.parse_args()
    relics = json.loads((ROOT / "data/relics.json").read_text(encoding="utf-8"))["relics"]
    known = {relic["id"] for relic in relics}
    sources = ROOT / "characters/relics/source"
    outputs = ROOT / "public/relics"
    sources.mkdir(parents=True, exist_ok=True)
    outputs.mkdir(parents=True, exist_ok=True)
    if args.source_map:
        incoming = json.loads(args.source_map.read_text(encoding="utf-8"))
        if len(incoming) != len(known) or {entry["id"] for entry in incoming} != known:
            raise ValueError("The generation map must cover all relics exactly once")
        for entry in incoming:
            source = Path(entry["source"])
            destination = sources / f'{entry["id"]}.png'
            if destination.exists() and sha256(source) != sha256(destination):
                raise ValueError(f"Preserving existing original: {destination}")
            if source.resolve() != destination.resolve():
                shutil.copy2(source, destination)
    manifest = []
    for relic in relics:
        source = sources / f'{relic["id"]}.png'
        destination = outputs / f'{relic["id"]}.webp'
        with Image.open(source) as image:
            original_size = image.size
            if "A" not in image.getbands():
                raise ValueError(f"Missing generated transparency: {source}")
            if image.getchannel("A").getextrema()[0] != 0:
                raise ValueError(f"No transparent background: {source}")
            # Delivery thumbnails only: preserve composition, aspect ratio, and alpha.
            image = image.convert("RGBA")
            image.thumbnail((384, 384), Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=90, method=6, exact=True)
            web_size = image.size
        with Image.open(destination) as encoded:
            if "A" not in encoded.getbands() or encoded.getchannel("A").getextrema()[0] != 0:
                raise ValueError(f"Transparency was lost: {destination}")
        manifest.append({"id": relic["id"], "name": relic["name"], "rarity": relic["rarity"],
                         "source": str(source.relative_to(ROOT)).replace("\\", "/"),
                         "asset": str(destination.relative_to(ROOT)).replace("\\", "/"),
                         "sourceSize": original_size, "webSize": web_size,
                         "sourceSha256": sha256(source), "webSha256": sha256(destination),
                         "bytes": destination.stat().st_size})
    (ROOT / "characters/relics/asset-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"relics": len(manifest), "webBytes": sum(entry["bytes"] for entry in manifest), "alphaPreserved": True}))


if __name__ == "__main__":
    main()
