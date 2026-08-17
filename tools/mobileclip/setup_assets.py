#!/usr/bin/env python3
"""Provision android/app/src/main/assets/mobileclip/ from an Apple MobileCLIP2-B checkpoint.

The two ONNX graphs and the tokenizer vocabulary are ~151 MB and are not tracked in git, so a fresh
clone has no models: `MobileClipModel.session()` throws FileNotFoundException, every image fails to
index, and every search rejects. This script is how that directory gets rebuilt.

  python tools/mobileclip/setup_assets.py --checkpoint ~/Downloads/mobileclip2_b.pt

`--verify` checks an existing directory and needs neither torch nor the checkpoint, so it is the
cheap gate to run on a fresh clone or in CI before building:

  python tools/mobileclip/setup_assets.py --verify

The checkpoint itself is gated: accept Apple's terms at huggingface.co/apple/MobileCLIP2-B and
download it manually. Nothing here reaches the network.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import shutil
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSETS = REPO_ROOT / "android/app/src/main/assets/mobileclip"

IMAGE_MODEL = "mobileclip2_b_image_int8.onnx"
TEXT_MODEL = "mobileclip2_b_text_int8.onnx"
VOCABULARY = "bpe_simple_vocab_16e6.bpe"
MANIFEST = "model.json"

# Mirrors ClipTokenizer.kt: the first line is a version header, then exactly this many merge pairs.
# Kept in lockstep — a vocabulary of a different length shifts every token id and silently ruins
# text search rather than failing loudly.
MERGE_COUNT = 48_894
EMBEDDING_DIMENSIONS = 512
CONTEXT_LENGTH = 77


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            hasher.update(block)
    return hasher.hexdigest()


def read_manifest() -> dict:
    manifest = ASSETS / MANIFEST
    if not manifest.is_file():
        raise SystemExit(f"{manifest} is missing; it is tracked in git and should not be deleted.")
    return json.loads(manifest.read_text())


def copy_vocabulary() -> Path:
    """Copied out of the installed open_clip rather than downloaded.

    It is the standard OpenAI CLIP BPE file, and open_clip is already a hard requirement of the
    export, so taking it from there keeps provisioning offline. The `.bpe` extension is deliberate:
    Android's asset packer transparently expands `.gz`, and ClipTokenizer streams the gzip itself.
    """
    try:
        import open_clip.tokenizer as tokenizer
    except ImportError as error:
        raise SystemExit("open_clip is required to copy the tokenizer vocabulary: pip install open_clip_torch") from error

    source = Path(tokenizer.default_bpe())
    if not source.is_file():
        raise SystemExit(f"open_clip's BPE vocabulary was not found at {source}")

    destination = ASSETS / VOCABULARY
    shutil.copyfile(source, destination)
    return destination


def write_manifest(checkpoint: Path) -> None:
    """Refreshes only the checkpoint hash. Everything else is a contract the Kotlin side reads."""
    manifest = read_manifest()
    manifest["checkpoint_sha256"] = digest(checkpoint)
    (ASSETS / MANIFEST).write_text(json.dumps(manifest, indent=2) + "\n")


def verify() -> int:
    """Structural check of the provisioned directory. Returns a process exit code."""
    manifest = read_manifest()
    problems: list[str] = []

    for name in (IMAGE_MODEL, TEXT_MODEL, VOCABULARY):
        if not (ASSETS / name).is_file():
            problems.append(f"{name} is missing — run this script without --verify to provision it")

    if problems:
        for problem in problems:
            print(f"FAIL  {problem}")
        return 1

    vocabulary = ASSETS / VOCABULARY
    try:
        with gzip.open(vocabulary, "rt", encoding="utf-8") as handle:
            merges = sum(1 for _ in handle) - 1
        if merges < MERGE_COUNT:
            problems.append(f"{VOCABULARY} holds {merges} merges, fewer than the {MERGE_COUNT} ClipTokenizer reads")
    except OSError as error:
        problems.append(f"{VOCABULARY} is not readable gzip: {error}")

    try:
        import onnxruntime
    except ImportError:
        print("SKIP  graph shapes (onnxruntime not installed)")
    else:
        expected = {IMAGE_MODEL: ("pixels", [1, 3, 224, 224]), TEXT_MODEL: ("tokens", [1, CONTEXT_LENGTH])}
        for name, (input_name, shape) in expected.items():
            try:
                session = onnxruntime.InferenceSession(str(ASSETS / name), providers=["CPUExecutionProvider"])
            except Exception as error:  # noqa: BLE001 — any load failure is the same class of problem
                problems.append(f"{name} did not load: {error}")
                continue
            actual = session.get_inputs()[0]
            if actual.name != input_name:
                problems.append(f"{name} input is '{actual.name}', but MobileClipModel binds '{input_name}'")
            if list(actual.shape) != shape:
                problems.append(f"{name} input shape is {actual.shape}, expected {shape}")
            output = session.get_outputs()[0]
            if list(output.shape) != [1, EMBEDDING_DIMENSIONS]:
                problems.append(f"{name} output shape is {output.shape}, expected [1, {EMBEDDING_DIMENSIONS}]")

    for problem in problems:
        print(f"FAIL  {problem}")
    if problems:
        return 1

    print(f"OK    {manifest['name']} ({manifest['quantization']}), embedding_version {manifest['embedding_version']}")
    for name in (IMAGE_MODEL, TEXT_MODEL, VOCABULARY):
        print(f"      {name}  {(ASSETS / name).stat().st_size / 1_048_576:.1f} MB")
    return 0


def provision(checkpoint: Path, expect_hash: bool) -> int:
    if not checkpoint.is_file():
        raise SystemExit(f"Checkpoint not found: {checkpoint}")

    manifest = read_manifest()
    recorded = manifest.get("checkpoint_sha256")
    actual = digest(checkpoint)
    if expect_hash and recorded and recorded != actual:
        raise SystemExit(
            f"Checkpoint sha256 {actual}\ndoes not match the {recorded} recorded in {MANIFEST}.\n"
            "This is a different checkpoint than the shipped assets were built from. Re-run with "
            "--allow-new-checkpoint to provision from it and update the manifest."
        )

    # Imported here, not at module scope, so --verify stays usable without torch installed.
    from export_mobileclip2_b import export_fp32, load, quantize

    ASSETS.mkdir(parents=True, exist_ok=True)
    print(f"Loading {checkpoint.name} ...")
    model = load(checkpoint)
    print("Exporting fp32 graphs ...")
    image_fp32, text_fp32 = export_fp32(model, ASSETS)

    for source, name in ((image_fp32, IMAGE_MODEL), (text_fp32, TEXT_MODEL)):
        print(f"Quantizing {name} ...")
        quantize(source, ASSETS / name)
        source.unlink(missing_ok=True)

    print("Copying tokenizer vocabulary ...")
    copy_vocabulary()
    write_manifest(checkpoint)
    print()
    return verify()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--checkpoint", type=Path, help="Apple MobileCLIP2-B .pt checkpoint")
    parser.add_argument("--verify", action="store_true", help="check the existing assets and exit")
    parser.add_argument(
        "--allow-new-checkpoint", action="store_true",
        help="provision from a checkpoint whose hash differs from model.json, and update it",
    )
    args = parser.parse_args()

    if args.verify:
        return verify()
    if not args.checkpoint:
        parser.error("--checkpoint is required unless --verify is passed")
    return provision(args.checkpoint, expect_hash=not args.allow_new_checkpoint)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
