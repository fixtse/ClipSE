import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np


PERSON_CLASS_IDS = {0}
PRODUCT_CLASS_IDS = {
    24,
    26,
    28,
    39,
    40,
    41,
    42,
    43,
    44,
    45,
    46,
    47,
    48,
    49,
    50,
    51,
    52,
    53,
    54,
    55,
    63,
    64,
    65,
    66,
    67,
    73,
    74,
    75,
    76,
    77,
    79,
}
SCREEN_CLASS_IDS = {62, 63, 64, 66, 67, 72, 73}
MAX_GROUPS_PER_FRAME = 2
MAX_SAMPLE_WIDTH = 640
COCO_LABELS = [
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "airplane",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "parking meter",
    "bench",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
    "backpack",
    "umbrella",
    "handbag",
    "tie",
    "suitcase",
    "frisbee",
    "skis",
    "snowboard",
    "sports ball",
    "kite",
    "baseball bat",
    "baseball glove",
    "skateboard",
    "surfboard",
    "tennis racket",
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "broccoli",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
]
COCO_LABEL_TO_ID = {label: index for index, label in enumerate(COCO_LABELS)}
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
        ]
        if candidates:
            return sorted(candidates, key=lambda path: len(str(path)))[0]

    raise RuntimeError(
        "Unable to resolve Hailo vision HEF. Put a matching HEF under /models or set HAILO_VISION_HEF_PATH."
    )


def selected_class_ids(detection_mode: str, object_labels: str | None) -> set[int] | None:
    if detection_mode in ("people", "people_strict"):
        return PERSON_CLASS_IDS
    if detection_mode == "product":
        return PRODUCT_CLASS_IDS
    if detection_mode == "screen":
        return SCREEN_CLASS_IDS
    if detection_mode == "object" and object_labels:
        ids = set()
        for value in object_labels.split(","):
            normalized = value.strip().lower().replace("_", " ")
            if normalized.isdigit():
                ids.add(int(normalized))
            elif normalized in COCO_LABEL_TO_ID:
                ids.add(COCO_LABEL_TO_ID[normalized])
        return ids or None
    return None


def source_for_mode(detection_mode: str) -> str:
    if detection_mode == "product":
        return "product"
    if detection_mode == "screen":
        return "screen-interest"
    return "person"


def group_source_for_mode(detection_mode: str) -> str:
    if detection_mode == "product":
        return "product-group"
    if detection_mode == "screen":
        return "screen-interest"
    return "person-group"


def expand_rect(rect: dict, frame_width: int, frame_height: int, padding_ratio: float) -> dict:
    padding_x = rect["width"] * padding_ratio
    padding_y = rect["height"] * padding_ratio
    x = max(0.0, rect["x"] - padding_x)
    y = max(0.0, rect["y"] - padding_y)
    right = min(float(frame_width), rect["x"] + rect["width"] + padding_x)
    bottom = min(float(frame_height), rect["y"] + rect["height"] + padding_y)
    return {
        **rect,
        "x": x,
        "y": y,
        "width": max(1.0, right - x),
        "height": max(1.0, bottom - y),
    }


def merge_boxes(boxes: list[dict]) -> dict:
    left = min(box["x"] for box in boxes)
    top = min(box["y"] for box in boxes)
    right = max(box["x"] + box["width"] for box in boxes)
    bottom = max(box["y"] + box["height"] for box in boxes)
    score = max(box["score"] for box in boxes)
    return {
        "x": left,
        "y": top,
        "width": max(1.0, right - left),
        "height": max(1.0, bottom - top),
        "score": score,
        "source": boxes[0].get("source", "person-group"),
    }


def group_boxes(boxes: list[dict], frame_width: int) -> list[dict]:
    if not boxes:
        return []
    boxes_by_center = sorted(boxes, key=lambda box: box["x"] + box["width"] / 2)
    if len(boxes_by_center) == 1:
        return boxes_by_center
    strongest = sorted(boxes_by_center, key=lambda box: box["score"], reverse=True)[
        :MAX_GROUPS_PER_FRAME
    ]
    if len(strongest) == 2:
        left, right = sorted(strongest, key=lambda box: box["x"] + box["width"] / 2)
        if (
            right["x"]
            + right["width"] / 2
            - (left["x"] + left["width"] / 2)
            < frame_width * 0.18
        ):
            return [merge_boxes(strongest)]
    return strongest


def letterbox_frame(frame: np.ndarray, target_width: int, target_height: int) -> np.ndarray:
    frame_height, frame_width = frame.shape[:2]
    scale = min(target_width / max(1, frame_width), target_height / max(1, frame_height))
    resized_width = max(1, int(frame_width * scale))
    resized_height = max(1, int(frame_height * scale))
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
    canvas = np.zeros((target_height, target_width, 3), dtype=np.uint8)
    offset_x = (target_width - resized_width) // 2
    offset_y = (target_height - resized_height) // 2
    canvas[offset_y : offset_y + resized_height, offset_x : offset_x + resized_width] = resized
    return canvas


def run_external_frame_command(frame: np.ndarray, timestamp: float, args: argparse.Namespace) -> list[dict]:
    command_template = os.environ.get("HAILO_VISION_FRAME_COMMAND")
    if not command_template:
        return []

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as frame_file:
        cv2.imwrite(frame_file.name, frame)
        frame_path = frame_file.name

    try:
        command = command_template.format(
            frame=frame_path,
            model=args.model,
            detection_mode=args.detection_mode,
            hef_path=args.hef_path or "",
            timestamp=f"{timestamp:.3f}",
        )
        result = subprocess.run(
            command,
            shell=True,
            check=False,
            capture_output=True,
            text=True,
            timeout=float(os.environ.get("HAILO_VISION_FRAME_TIMEOUT_SECONDS", "30")),
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip())
        parsed = json.loads(result.stdout)
        detections = parsed.get("detections", parsed if isinstance(parsed, list) else [])
        return detections if isinstance(detections, list) else []
    finally:
        try:
            os.unlink(frame_path)
        except FileNotFoundError:
            pass


def run_hailo_frame_detection(frame: np.ndarray, args: argparse.Namespace) -> list[dict]:
    from hailo_apps.python.core.common.hailo_inference import HailoInfer
    from hailo_apps.python.standalone_apps.object_detection.object_detection_post_process import (
        extract_detections,
    )

    hailo_inference = getattr(args, "_hailo_inference", None)
    if hailo_inference is None:
        hef_path = resolve_hef_path(args.model, args.hef_path)
        hailo_inference = HailoInfer(str(hef_path), 1)
        args._hailo_inference = hailo_inference
        args._hailo_input_shape = hailo_inference.get_input_shape()

    input_height, input_width, _ = args._hailo_input_shape
    preprocessed = letterbox_frame(frame, input_width, input_height)
    output_payload: dict[str, object] = {}

    def inference_callback(completion_info, bindings_list):
        if completion_info.exception:
            output_payload["error"] = completion_info.exception
            return
        bindings = bindings_list[0]
        if len(bindings._output_names) == 1:
            output_payload["result"] = bindings.output().get_buffer()
        else:
            output_payload["result"] = [
                bindings.output(name).get_buffer() for name in bindings._output_names
            ]

    job = hailo_inference.run([preprocessed], inference_callback)
    job.wait(10000)
    if output_payload.get("error"):
        raise RuntimeError(str(output_payload["error"]))
    raw_result = output_payload.get("result")
    if raw_result is None:
        return []

    config_data = {
        "visualization_params": {
            "score_thres": float(os.environ.get("HAILO_VISION_SCORE_THRESHOLD", "0.22")),
            "max_boxes_to_draw": 50,
        }
    }
    extracted = extract_detections(frame, raw_result, config_data)
    class_filter = selected_class_ids(args.detection_mode, args.object_labels)
    detections = []
    frame_height, frame_width = frame.shape[:2]
    for box, class_id, score in zip(
        extracted["detection_boxes"],
        extracted["detection_classes"],
        extracted["detection_scores"],
    ):
        if class_filter is not None and int(class_id) not in class_filter:
            continue
        x1, y1, x2, y2 = [float(value) for value in box]
        rect = {
            "x": max(0.0, x1),
            "y": max(0.0, y1),
            "width": max(1.0, min(float(frame_width), x2) - max(0.0, x1)),
            "height": max(1.0, min(float(frame_height), y2) - max(0.0, y1)),
            "score": min(1.0, float(score)),
            "source": source_for_mode(args.detection_mode),
        }
        detections.append(rect)
    return detections


def detect_screen_text_regions(frame: np.ndarray) -> list[dict]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 80, 180)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 5))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    frame_height, frame_width = frame.shape[:2]
    candidates = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        area = width * height
        if area < 2600 or width < frame_width * 0.12 or height < frame_height * 0.06:
            continue
        if width / max(1, height) < 1.2:
            continue
        candidates.append(
            {
                "x": float(x),
                "y": float(y),
                "width": float(width),
                "height": float(height),
                "score": min(1.0, area / max(1.0, frame_width * frame_height) + 0.35),
                "source": "screen-interest",
            }
        )
    return sorted(candidates, key=lambda item: item["score"], reverse=True)[:3]


def run_focus_detection(args: argparse.Namespace) -> dict:
    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        raise RuntimeError(f"Unable to open video: {args.video}")

    detections = []
    timestamp = args.start
    sample_count = 0
    try:
        while timestamp < args.end and (
            args.max_samples <= 0 or sample_count < args.max_samples
        ):
            capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
            ok, frame = capture.read()
            if not ok or frame is None:
                break

            frame_height, frame_width = frame.shape[:2]
            scale = min(1.0, MAX_SAMPLE_WIDTH / max(1, frame_width))
            resized = (
                cv2.resize(
                    frame,
                    (int(frame_width * scale), int(frame_height * scale)),
                    interpolation=cv2.INTER_AREA,
                )
                if scale < 1.0
                else frame
            )

            frame_boxes = run_external_frame_command(resized, timestamp, args)
            if not frame_boxes:
                frame_boxes = run_hailo_frame_detection(resized, args)

            if args.detection_mode == "screen":
                frame_boxes.extend(detect_screen_text_regions(resized))

            expanded_boxes = []
            for box in frame_boxes:
                rect = {
                    "x": float(box.get("x", 0)) / scale,
                    "y": float(box.get("y", 0)) / scale,
                    "width": max(1.0, float(box.get("width", 1)) / scale),
                    "height": max(1.0, float(box.get("height", 1)) / scale),
                    "score": max(0.0, min(1.0, float(box.get("score", 0.5)))),
                    "source": box.get("source") or source_for_mode(args.detection_mode),
                }
                expanded_boxes.append(expand_rect(rect, frame_width, frame_height, 0.035))

            for group in group_boxes(
                sorted(expanded_boxes, key=lambda box: box["score"], reverse=True),
                frame_width,
            ):
                group["timestampSeconds"] = round(timestamp, 3)
                group["source"] = group_source_for_mode(args.detection_mode)
                detections.append(group)

            timestamp += args.sample_interval
            sample_count += 1
    finally:
        hailo_inference = getattr(args, "_hailo_inference", None)
        close = getattr(hailo_inference, "close", None)
        if callable(close):
            close()
        capture.release()

    return {"detections": detections, "detectorBackend": "hailo-vision"}


def main() -> int:
    parser = argparse.ArgumentParser(description="ClipSE Hailo vision focus runner")
    parser.add_argument("--video", required=True)
    parser.add_argument("--model", default="yolov8n")
    parser.add_argument("--hef-path", default=None)
    parser.add_argument("--ocr-hef-path", default=None)
    parser.add_argument("--object-labels", default=None)
    parser.add_argument("--detection-mode", default="people")
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--sample-interval", type=float, default=0.35)
    parser.add_argument("--max-samples", type=int, default=0)
    args = parser.parse_args()

    try:
        print(json.dumps(run_focus_detection(args)))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
