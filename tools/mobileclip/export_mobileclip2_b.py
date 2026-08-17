#!/usr/bin/env python3
"""Export Apple's accepted MobileCLIP2-B checkpoint into two Android inference graphs.

Emits both precisions. The fp32 graphs are the faithful export; the INT8 graphs are what actually
ships, because `MobileClipModel` loads `*_int8.onnx`. Exporting without quantizing would leave the
app pointing at files that were never produced, which is the state this script was in before.
"""
from pathlib import Path
import argparse
import torch
import open_clip

from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.shape_inference import quant_pre_process

IMAGE_SIZE = 224
CONTEXT_LENGTH = 77
EMBEDDING_DIMENSIONS = 512


class ImageEncoder(torch.nn.Module):
    def __init__(self, model):
        super().__init__(); self.model = model
    def forward(self, pixels):
        return torch.nn.functional.normalize(self.model.encode_image(pixels), dim=-1)


class TextEncoder(torch.nn.Module):
    def __init__(self, model):
        super().__init__(); self.model = model
    def forward(self, tokens):
        return torch.nn.functional.normalize(self.model.encode_text(tokens), dim=-1)


def load(checkpoint: Path):
    """image_mean/std are zero/one because normalization lives in the Kotlin preprocessor.

    `MobileClipModel.preprocess` feeds planar RGB in 0..1 with no mean subtraction, so the exported
    graph has to expect exactly that. Changing either side alone silently degrades every embedding.
    """
    model, _, _ = open_clip.create_model_and_transforms(
        "MobileCLIP2-B", pretrained=str(checkpoint), image_mean=(0, 0, 0), image_std=(1, 1, 1)
    )
    model.eval()
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    return model


def export_fp32(model, output: Path) -> tuple[Path, Path]:
    image_path = output / "mobileclip2_b_image_fp32.onnx"
    text_path = output / "mobileclip2_b_text_fp32.onnx"

    torch.onnx.export(
        ImageEncoder(model), (torch.zeros(1, 3, IMAGE_SIZE, IMAGE_SIZE),), image_path,
        input_names=["pixels"], output_names=["embedding"], opset_version=18, dynamo=False,
    )
    torch.onnx.export(
        TextEncoder(model), (torch.zeros(1, CONTEXT_LENGTH, dtype=torch.long),), text_path,
        input_names=["tokens"], output_names=["embedding"], opset_version=18, dynamo=False,
    )
    return image_path, text_path


def quantize(source: Path, destination: Path) -> Path:
    """Dynamic INT8, per-tensor — the quantization `assets/mobileclip/model.json` records.

    per_channel stays off deliberately: per-channel weights are more accurate but produce a graph
    ONNX Runtime's mobile build handles less predictably, and model.json is the contract the Kotlin
    side and the integration test were verified against.

    quant_pre_process runs first because dynamic quantization on a graph with unresolved symbolic
    shapes silently skips MatMul nodes, producing a file that is INT8 in name and fp32 in size.
    """
    prepared = destination.with_suffix(".prepared.onnx")
    try:
        quant_pre_process(str(source), str(prepared), skip_symbolic_shape=False)
        quantize_dynamic(str(prepared), str(destination), weight_type=QuantType.QInt8, per_channel=False)
    finally:
        prepared.unlink(missing_ok=True)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkpoint", type=Path, help="Apple MobileCLIP2-B .pt checkpoint")
    parser.add_argument("output", type=Path, help="directory to write the ONNX graphs into")
    parser.add_argument(
        "--keep-fp32", action="store_true",
        help="keep the intermediate fp32 graphs; they are ~4x the INT8 size and are not shipped",
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    model = load(args.checkpoint)
    image_fp32, text_fp32 = export_fp32(model, args.output)

    for source, name in ((image_fp32, "image"), (text_fp32, "text")):
        destination = quantize(source, args.output / f"mobileclip2_b_{name}_int8.onnx")
        print(f"{destination.name}: {destination.stat().st_size / 1_048_576:.1f} MB")
        if not args.keep_fp32:
            source.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
