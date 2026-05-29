import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np


VLM_MODEL_NAMES = {
    "qwen2-vl-2b": "qwen2-vl-2b",
    "qwen2.5-vl-3b": "qwen2.5-vl-3b",
    "vlm": "vlm",
}
HEF_SEARCH_ROOTS = (
    Path("/models"),
    Path("/usr/local/hailo/resources"),
    Path("/opt/hailo-apps"),
)


def resolve_hef_path(model: str, explicit_hef_path: str | None) -> Path:
    if explicit_hef_path:
        hef_path = Path(explicit_hef_path)
        if hef_path.exists():
            return hef_path
        raise FileNotFoundError(f"HEF file does not exist: {hef_path}")

    normalized_stem = model.lower().replace("_", "-")
    for root in HEF_SEARCH_ROOTS:
        if not root.exists():
            continue
        candidates = [
            path
            for path in root.rglob("*.hef")
            if normalized_stem in path.stem.lower().replace("_", "-")
            or "vlm" in path.stem.lower()
        ]
        if candidates:
            return sorted(candidates, key=lambda path: len(str(path)))[0]

    raise RuntimeError(
        "Unable to resolve Hailo VLM HEF. Put a matching HEF under /models or set HAILO_VLM_HEF_PATH."
    )


def extract_frame(video_path: str, timestamp_seconds: float) -> tuple[np.ndarray, int, int]:
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise RuntimeError(f"Unable to open video: {video_path}")

    capture.set(cv2.CAP_PROP_POS_MSEC, timestamp_seconds * 1000)
    ok, frame = capture.read()
    capture.release()

    if not ok or frame is None:
        raise RuntimeError(f"Unable to read frame at {timestamp_seconds:.3f}s")

    height, width = frame.shape[:2]
    return frame, width, height


def convert_frame_for_vlm(frame: np.ndarray, target_shape: tuple[int, int, int], target_dtype) -> np.ndarray:
    target_height, target_width, target_channels = target_shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(
        rgb,
        (target_width, target_height),
        interpolation=cv2.INTER_LINEAR,
    )
    if target_channels == 1 and resized.shape[2] == 3:
        resized = cv2.cvtColor(resized, cv2.COLOR_RGB2GRAY)
        resized = np.expand_dims(resized, axis=2)
    return resized.astype(target_dtype)


def parse_focus_json(text: str) -> dict | None:
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def fallback_face_detection(frame: np.ndarray) -> dict | None:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(36, 36),
    )
    if len(faces) == 0:
        return None

    x, y, width, height = sorted(
        faces,
        key=lambda face: face[2] * face[3],
        reverse=True,
    )[0]
    frame_height, frame_width = frame.shape[:2]
    return {
        "centerX": (float(x) + float(width) / 2) / frame_width,
        "centerY": (float(y) + float(height) / 2) / frame_height,
        "width": float(width) / frame_width,
        "height": float(height) / frame_height,
        "confidence": min(1.0, float(width * height) / 16000),
    }


def run_vlm_focus(
    video_path: str,
    model: str,
    hef_path: str | None,
    start_seconds: float,
    end_seconds: float,
    sample_interval_seconds: float,
    max_samples: int,
    optimize_memory_on_device: bool,
) -> dict:
    from hailo_platform import VDevice
    from hailo_platform.genai import VLM

    resolved_hef_path = resolve_hef_path(model, hef_path)
    vdevice = None
    vlm = None
    detections = []
    timestamp = start_seconds
    sample_count = 0

    try:
        vdevice = VDevice()
        vlm = VLM(vdevice, str(resolved_hef_path), optimize_memory_on_device)
        frame_shape = tuple(vlm.input_frame_shape())
        frame_dtype = vlm.input_frame_format_type()

        while timestamp < end_seconds and sample_count < max_samples:
            frame, frame_width, frame_height = extract_frame(video_path, timestamp)
            vlm_frame = convert_frame_for_vlm(frame, frame_shape, frame_dtype)
            prompt = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {
                            "type": "text",
                            "text": (
                                "Find the primary visible face or speaking person. "
                                "Return only JSON with centerX, centerY, width, height, confidence. "
                                "Use normalized values from 0 to 1. If no person is visible, return confidence 0."
                            ),
                        },
                    ],
                }
            ]
            vlm.clear_context()
            response = vlm.generate_all(
                prompt=prompt,
                frames=[vlm_frame],
                max_generated_tokens=80,
                temperature=0.1,
                seed=42,
            )
            parsed = parse_focus_json(str(response)) or fallback_face_detection(frame)
            if parsed and float(parsed.get("confidence", 0) or 0) > 0:
                width = max(0.05, min(1.0, float(parsed.get("width", 0.22) or 0.22)))
                height = max(0.05, min(1.0, float(parsed.get("height", 0.32) or 0.32)))
                center_x = max(0.0, min(1.0, float(parsed.get("centerX", 0.5) or 0.5)))
                center_y = max(0.0, min(1.0, float(parsed.get("centerY", 0.5) or 0.5)))
                detections.append(
                    {
                        "timestampSeconds": round(timestamp, 3),
                        "x": round(max(0.0, center_x - width / 2) * frame_width, 3),
                        "y": round(max(0.0, center_y - height / 2) * frame_height, 3),
                        "width": round(width * frame_width, 3),
                        "height": round(height * frame_height, 3),
                        "score": round(
                            max(0.0, min(1.0, float(parsed.get("confidence", 0.6) or 0.6))),
                            3,
                        ),
                        "source": "person-group",
                    }
                )

            timestamp += sample_interval_seconds
            sample_count += 1

        return {"detections": detections, "detectorBackend": "hailo-vlm"}
    finally:
        if vlm:
            vlm.release()
        if vdevice:
            vdevice.release()


def main() -> int:
    parser = argparse.ArgumentParser(description="ClipSE Hailo VLM focus runner")
    parser.add_argument("--video", required=True)
    parser.add_argument("--model", default="qwen2-vl-2b")
    parser.add_argument("--hef-path", default=None)
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--sample-interval", type=float, default=1.0)
    parser.add_argument("--max-samples", type=int, default=8)
    parser.add_argument("--optimize-memory-on-device", action="store_true")
    args = parser.parse_args()

    normalized_model = VLM_MODEL_NAMES.get(args.model.lower(), args.model)
    try:
        print(
            json.dumps(
                run_vlm_focus(
                    video_path=args.video,
                    model=normalized_model,
                    hef_path=args.hef_path,
                    start_seconds=args.start,
                    end_seconds=args.end,
                    sample_interval_seconds=args.sample_interval,
                    max_samples=args.max_samples,
                    optimize_memory_on_device=args.optimize_memory_on_device,
                )
            )
        )
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
