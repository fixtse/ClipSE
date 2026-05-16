#!/usr/bin/env python3
import os
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path


SAMPLE_INTERVAL_SECONDS = 0.35
MAX_SAMPLE_WIDTH = 640
PERSON_CLASS_ID = 0
MAX_GROUPS_PER_FRAME = 2
SCREEN_INTEREST_MAX_BOXES = 3
PRODUCT_INTEREST_MAX_BOXES = 4
PRODUCT_CLASS_IDS = [
    24,  # backpack
    26,  # handbag
    28,  # suitcase
    39,  # bottle
    40,  # wine glass
    41,  # cup
    42,  # fork
    43,  # knife
    44,  # spoon
    45,  # bowl
    46,  # banana
    47,  # apple
    48,  # sandwich
    49,  # orange
    50,  # broccoli
    51,  # carrot
    52,  # hot dog
    53,  # pizza
    54,  # donut
    55,  # cake
    63,  # laptop
    64,  # mouse
    65,  # remote
    66,  # keyboard
    67,  # cell phone
    73,  # book
    74,  # clock
    75,  # vase
    76,  # scissors
    77,  # teddy bear
    79,  # toothbrush
]
CV2_IMPORT_ATTEMPTED = False
CV2_IMPORT_RESULT = None
CV2_IMPORT_ERROR = None


def try_import_cv2():
    global CV2_IMPORT_ATTEMPTED, CV2_IMPORT_ERROR, CV2_IMPORT_RESULT
    if CV2_IMPORT_ATTEMPTED:
        return CV2_IMPORT_RESULT

    CV2_IMPORT_ATTEMPTED = True
    try:
        import cv2

        globals()["cv2"] = cv2
        CV2_IMPORT_RESULT = cv2
        return cv2
    except Exception as error:
        CV2_IMPORT_ERROR = error
        return None


def log_warning(message):
    print(f"[detect-video-focus] {message}", file=sys.stderr)


def resolve_yolo_model_path():
    return resolve_model_path(os.environ.get("CLIPSE_YOLO_MODEL", "yolo11n.pt"))


def resolve_rtdetr_model_path():
    return resolve_model_path(
        os.environ.get("CLIPSE_PRODUCT_RTDETR_MODEL", "rtdetr-l.pt")
    )


def resolve_model_path(model_name):
    model_path = Path(model_name)
    if model_path.is_absolute() or model_path.exists():
        return str(model_path)

    script_path = Path(__file__).resolve()
    candidates = [
        Path.cwd() / model_name,
        script_path.parents[3] / model_name if len(script_path.parents) > 3 else None,
        Path("/app") / model_name,
    ]
    for candidate in candidates:
        if candidate is not None and candidate.exists():
            return str(candidate)

    return model_name


def get_torch_device(detector_name):
    try:
        import torch
    except Exception as error:
        log_warning(f"Torch is unavailable for {detector_name}: {error}")
        return None

    device = 0 if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        log_warning(f"CUDA is unavailable to torch; running {detector_name} on CPU.")
    return device


def detect_yolo(file_path, start_seconds, end_seconds):
    cv2 = try_import_cv2()
    if cv2 is None:
        log_warning(f"OpenCV is unavailable; skipping YOLO detection: {CV2_IMPORT_ERROR}")
        return None

    try:
        with redirect_stdout(sys.stderr):
            from ultralytics import YOLO
    except Exception as error:
        log_warning(f"YOLO dependencies are unavailable: {error}")
        return None

    device = get_torch_device("YOLO")
    if device is None:
        return None

    try:
        capture = cv2.VideoCapture(file_path)
        if not capture.isOpened():
            log_warning("Unable to open video capture for YOLO detection.")
            return None

        model_path = resolve_yolo_model_path()
        with redirect_stdout(sys.stderr):
            model = YOLO(model_path)
        detections = []
        timestamp = start_seconds

        while timestamp < end_seconds:
            capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
            ok, frame = capture.read()
            if not ok:
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

            with redirect_stdout(sys.stderr):
                results = model.predict(
                    resized,
                    classes=[PERSON_CLASS_ID],
                    device=device,
                    imgsz=MAX_SAMPLE_WIDTH,
                    verbose=False,
                )
            result = results[0] if results else None
            boxes = [] if result is None else result.boxes
            frame_boxes = []
            if boxes is not None:
                for box in boxes:
                    confidence = float(box.conf[0].item())
                    x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
                    frame_boxes.append(
                        {
                            "x": x1 / scale,
                            "y": y1 / scale,
                            "width": max(1.0, (x2 - x1) / scale),
                            "height": max(1.0, (y2 - y1) / scale),
                            "score": confidence,
                        }
                    )

            for group in group_boxes(frame_boxes, frame_width):
                group["timestampSeconds"] = timestamp
                group["source"] = "person-group"
                detections.append(group)

            timestamp += SAMPLE_INTERVAL_SECONDS

        capture.release()
        return {
            "detections": detections,
            "detectorBackend": "yolo-cuda" if device != "cpu" else "yolo-cpu",
        }
    except Exception as error:
        log_warning(f"YOLO detection failed: {error}")
        return None


def expand_rect(rect, frame_width, frame_height, padding_ratio):
    padding = max(frame_width, frame_height) * padding_ratio
    left = max(0.0, rect["x"] - padding)
    top = max(0.0, rect["y"] - padding)
    right = min(float(frame_width), rect["x"] + rect["width"] + padding)
    bottom = min(float(frame_height), rect["y"] + rect["height"] + padding)
    return {
        **rect,
        "x": left,
        "y": top,
        "width": max(1.0, right - left),
        "height": max(1.0, bottom - top),
    }


def detect_rtdetr_products(file_path, start_seconds, end_seconds):
    cv2 = try_import_cv2()
    if cv2 is None:
        log_warning(
            f"OpenCV is unavailable; skipping RT-DETR product detection: {CV2_IMPORT_ERROR}"
        )
        return None

    try:
        with redirect_stdout(sys.stderr):
            from ultralytics import RTDETR
    except Exception as error:
        log_warning(f"RT-DETR dependencies are unavailable: {error}")
        return None

    device = get_torch_device("RT-DETR")
    if device is None:
        return None

    try:
        capture = cv2.VideoCapture(file_path)
        if not capture.isOpened():
            log_warning("Unable to open video capture for RT-DETR detection.")
            return None

        model_path = resolve_rtdetr_model_path()
        with redirect_stdout(sys.stderr):
            model = RTDETR(model_path)
        detections = []
        previous_gray = None
        timestamp = start_seconds

        while timestamp < end_seconds:
            capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
            ok, frame = capture.read()
            if not ok:
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
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

            with redirect_stdout(sys.stderr):
                results = model.predict(
                    resized,
                    classes=PRODUCT_CLASS_IDS,
                    device=device,
                    imgsz=MAX_SAMPLE_WIDTH,
                    verbose=False,
                )
            result = results[0] if results else None
            boxes = [] if result is None else result.boxes
            frame_boxes = []
            if boxes is not None:
                for box in boxes:
                    confidence = float(box.conf[0].item())
                    if confidence < 0.22:
                        continue
                    x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
                    rect = {
                        "x": x1 / scale,
                        "y": y1 / scale,
                        "width": max(1.0, (x2 - x1) / scale),
                        "height": max(1.0, (y2 - y1) / scale),
                        "score": min(1.0, confidence + 0.12),
                        "source": "product",
                    }
                    frame_boxes.append(
                        expand_rect(rect, frame_width, frame_height, 0.035)
                    )

            for rect in detect_motion(previous_gray, gray, scale):
                rect = expand_rect(rect, frame_width, frame_height, 0.08)
                rect["score"] = min(1.0, rect["score"] + 0.2)
                rect["source"] = "product"
                frame_boxes.append(rect)

            for group in group_boxes(
                sorted(frame_boxes, key=lambda box: box["score"], reverse=True)[
                    :PRODUCT_INTEREST_MAX_BOXES
                ],
                frame_width,
            ):
                group["timestampSeconds"] = timestamp
                group["source"] = "product-group"
                detections.append(group)

            previous_gray = gray
            timestamp += SAMPLE_INTERVAL_SECONDS

        capture.release()
        return {
            "detections": detections,
            "detectorBackend": "rtdetr-cuda" if device != "cpu" else "rtdetr-cpu",
        }
    except Exception as error:
        log_warning(f"RT-DETR product detection failed: {error}")
        return None


def scale_rect(rect, scale):
    x, y, width, height = rect
    return {
        "x": float(x / scale),
        "y": float(y / scale),
        "width": float(width / scale),
        "height": float(height / scale),
    }


def group_boxes(boxes, frame_width):
    if len(boxes) == 0:
        return []

    boxes_by_center = sorted(boxes, key=lambda box: box["x"] + box["width"] / 2)

    if len(boxes_by_center) == 1:
        return boxes_by_center

    if len(boxes_by_center) == MAX_GROUPS_PER_FRAME:
        left = boxes_by_center[0]
        right = boxes_by_center[1]
        left_center = left["x"] + left["width"] / 2
        right_center = right["x"] + right["width"] / 2
        if right_center - left_center < frame_width * 0.18:
            return [merge_boxes(boxes_by_center)]
        return sorted(boxes, key=lambda box: box["score"], reverse=True)

    gaps = []
    for index in range(len(boxes_by_center) - 1):
        left = boxes_by_center[index]
        right = boxes_by_center[index + 1]
        left_center = left["x"] + left["width"] / 2
        right_center = right["x"] + right["width"] / 2
        gaps.append((right_center - left_center, index))

    largest_gap, split_index = max(gaps, key=lambda gap: gap[0])
    if largest_gap < frame_width * 0.18:
        return [merge_boxes(boxes_by_center)]

    return [
        merge_boxes(boxes_by_center[: split_index + 1]),
        merge_boxes(boxes_by_center[split_index + 1 :]),
    ]


def merge_boxes(boxes):
    left = min(box["x"] for box in boxes)
    top = min(box["y"] for box in boxes)
    right = max(box["x"] + box["width"] for box in boxes)
    bottom = max(box["y"] + box["height"] for box in boxes)
    score = sum(box["score"] for box in boxes) / len(boxes)
    return {
        "x": left,
        "y": top,
        "width": max(1.0, right - left),
        "height": max(1.0, bottom - top),
        "score": min(1.0, score + 0.08 * (len(boxes) - 1)),
    }


def detect_motion(previous_gray, gray, scale):
    if previous_gray is None:
        return []

    diff = cv2.absdiff(previous_gray, gray)
    _, threshold = cv2.threshold(diff, 28, 255, cv2.THRESH_BINARY)
    threshold = cv2.dilate(threshold, None, iterations=2)
    contours, _ = cv2.findContours(
        threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    boxes = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 400:
            continue
        x, y, width, height = cv2.boundingRect(contour)
        rect = scale_rect((x, y, width, height), scale)
        rect["score"] = min(1.0, float(area / 12000))
        rect["source"] = "motion"
        boxes.append(rect)

    return sorted(boxes, key=lambda box: box["score"], reverse=True)[:2]


def detect_screen_interest(file_path, start_seconds, end_seconds):
    cv2 = try_import_cv2()
    if cv2 is None:
        return None

    capture = cv2.VideoCapture(file_path)
    if not capture.isOpened():
        return None

    detections = []
    previous_gray = None
    timestamp = start_seconds

    while timestamp < end_seconds:
        capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ok, frame = capture.read()
        if not ok:
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
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        if previous_gray is not None:
            diff = cv2.absdiff(previous_gray, gray)
            _, threshold = cv2.threshold(diff, 18, 255, cv2.THRESH_BINARY)
            threshold = cv2.morphologyEx(
                threshold,
                cv2.MORPH_CLOSE,
                cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)),
                iterations=2,
            )
            contours, _ = cv2.findContours(
                threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            boxes = []

            for contour in contours:
                area = cv2.contourArea(contour)
                if area < 18:
                    continue
                x, y, width, height = cv2.boundingRect(contour)
                aspect_ratio = width / max(1, height)
                is_cursor_like = (
                    18 <= area <= 2600
                    and width <= resized.shape[1] * 0.16
                    and height <= resized.shape[0] * 0.16
                    and 0.2 <= aspect_ratio <= 5.0
                )
                is_screen_motion = area >= 2600
                if not is_cursor_like and not is_screen_motion:
                    continue

                rect = scale_rect((x, y, width, height), scale)
                rect["score"] = min(
                    1.0,
                    float(area / 3500) + (0.35 if is_cursor_like else 0.0),
                )
                rect["source"] = "screen-interest"
                boxes.append(rect)

            for rect in sorted(boxes, key=lambda box: box["score"], reverse=True)[
                :SCREEN_INTEREST_MAX_BOXES
            ]:
                rect["timestampSeconds"] = timestamp
                detections.append(rect)

        previous_gray = gray
        timestamp += SAMPLE_INTERVAL_SECONDS

    capture.release()
    return detections


def detect_opencv(file_path, start_seconds, end_seconds, include_motion_fallback=True):
    cv2 = try_import_cv2()
    if cv2 is None:
        log_warning(f"OpenCV is unavailable; skipping OpenCV detection: {CV2_IMPORT_ERROR}")
        return None

    capture = cv2.VideoCapture(file_path)
    if not capture.isOpened():
        return None

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    detections = []
    previous_gray = None
    timestamp = start_seconds

    while timestamp < end_seconds:
        capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ok, frame = capture.read()
        if not ok:
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
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(36, 36),
        )

        if len(faces) > 0:
            ranked_faces = sorted(faces, key=lambda face: face[2] * face[3], reverse=True)[
                :4
            ]
            frame_boxes = []
            for face in ranked_faces:
                rect = scale_rect(face, scale)
                rect["score"] = min(1.0, float((face[2] * face[3]) / 16000))
                frame_boxes.append(rect)
            for group in group_boxes(frame_boxes, frame_width):
                group["source"] = "face-group"
                group["timestampSeconds"] = timestamp
                detections.append(group)
        elif include_motion_fallback:
            for rect in detect_motion(previous_gray, gray, scale):
                rect["timestampSeconds"] = timestamp
                detections.append(rect)

        previous_gray = gray
        timestamp += SAMPLE_INTERVAL_SECONDS

    capture.release()
    return detections


def main():
    if len(sys.argv) not in (4, 5):
        print(json.dumps({"detections": [], "detectorBackend": "opencv"}))
        return

    file_path = sys.argv[1]
    start_seconds = float(sys.argv[2])
    end_seconds = float(sys.argv[3])
    detection_mode = sys.argv[4] if len(sys.argv) == 5 else "people"

    if detection_mode == "screen":
        screen_detections = detect_screen_interest(file_path, start_seconds, end_seconds)
        print(
            json.dumps(
                {
                    "detections": screen_detections or [],
                    "detectorBackend": "opencv",
                }
            )
        )
        return

    if detection_mode == "product":
        rtdetr_result = detect_rtdetr_products(file_path, start_seconds, end_seconds)
        if rtdetr_result is not None and len(rtdetr_result["detections"]) > 0:
            print(json.dumps(rtdetr_result))
            return
        if rtdetr_result is not None:
            log_warning(
                "RT-DETR ran but found no product detections; falling back to motion interest."
            )
        product_detections = detect_screen_interest(
            file_path, start_seconds, end_seconds
        )
        print(
            json.dumps(
                {
                    "detections": product_detections or [],
                    "detectorBackend": (
                        rtdetr_result["detectorBackend"]
                        if rtdetr_result is not None
                        else "opencv"
                    ),
                }
            )
        )
        return

    yolo_result = detect_yolo(file_path, start_seconds, end_seconds)
    if yolo_result is not None and len(yolo_result["detections"]) > 0:
        print(json.dumps(yolo_result))
        return
    if yolo_result is not None:
        log_warning("YOLO ran but found no person detections; falling back to OpenCV.")

    opencv_detections = detect_opencv(
        file_path,
        start_seconds,
        end_seconds,
        include_motion_fallback=detection_mode != "people_strict",
    )
    print(
        json.dumps(
            {
                "detections": opencv_detections or [],
                "detectorBackend": "opencv",
            }
        )
    )


if __name__ == "__main__":
    main()
