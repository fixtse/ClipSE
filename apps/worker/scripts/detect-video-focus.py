#!/usr/bin/env python3
import os
import json
import sys


SAMPLE_INTERVAL_SECONDS = 0.35
MAX_SAMPLE_WIDTH = 640
PERSON_CLASS_ID = 0
MAX_GROUPS_PER_FRAME = 2
ACTIVE_BOX_SCORE_RATIO = 1.55


def try_import_cv2():
    try:
        import cv2

        globals()["cv2"] = cv2
        return cv2
    except Exception:
        return None


def detect_yolo_cuda(file_path, start_seconds, end_seconds):
    cv2 = try_import_cv2()
    if cv2 is None:
        return None

    try:
        import torch
        from ultralytics import YOLO
    except Exception:
        return None

    if not torch.cuda.is_available():
        return None

    try:
        capture = cv2.VideoCapture(file_path)
        if not capture.isOpened():
            return None

        model_name = os.environ.get("CONTENTCLIP_YOLO_MODEL", "yolo11n.pt")
        model = YOLO(model_name)
        detections = []
        previous_gray = read_gray_frame(
            cv2, capture, max(0, start_seconds - SAMPLE_INTERVAL_SECONDS)
        )
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

            results = model.predict(
                resized,
                classes=[PERSON_CLASS_ID],
                device=0,
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
                    motion_score = get_box_motion_score(
                        previous_gray,
                        gray,
                        (x1, y1, x2 - x1, y2 - y1),
                        focus="upper-body",
                    )
                    rect = scale_rect((x1, y1, x2 - x1, y2 - y1), scale)
                    rect["score"] = combine_detection_and_motion_score(
                        confidence, motion_score
                    )
                    frame_boxes.append(rect)

            for group in select_focus_boxes(frame_boxes, frame_width):
                group["timestampSeconds"] = timestamp
                group["source"] = "person-group"
                detections.append(group)

            previous_gray = gray
            timestamp += SAMPLE_INTERVAL_SECONDS

        capture.release()
        return detections
    except Exception:
        return None


def scale_rect(rect, scale):
    x, y, width, height = rect
    return {
        "x": float(x / scale),
        "y": float(y / scale),
        "width": float(width / scale),
        "height": float(height / scale),
    }


def read_gray_frame(cv2, capture, timestamp_seconds):
    capture.set(cv2.CAP_PROP_POS_MSEC, timestamp_seconds * 1000)
    ok, frame = capture.read()
    if not ok:
        return None

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
    return cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)


def get_box_motion_score(previous_gray, gray, rect, focus):
    if previous_gray is None or previous_gray.shape != gray.shape:
        return 0.0

    x, y, width, height = [int(round(value)) for value in rect]
    frame_height, frame_width = gray.shape[:2]
    left = max(0, min(frame_width - 1, x))
    right = max(left + 1, min(frame_width, x + max(1, width)))
    top = max(0, min(frame_height - 1, y))
    bottom = max(top + 1, min(frame_height, y + max(1, height)))

    if focus == "mouth":
        region_top = top + int((bottom - top) * 0.45)
        region_bottom = top + int((bottom - top) * 0.95)
    elif focus == "upper-body":
        region_top = top
        region_bottom = top + int((bottom - top) * 0.65)
    else:
        region_top = top
        region_bottom = bottom

    region_top = max(top, min(bottom - 1, region_top))
    region_bottom = max(region_top + 1, min(bottom, region_bottom))
    previous_roi = previous_gray[region_top:region_bottom, left:right]
    roi = gray[region_top:region_bottom, left:right]
    if previous_roi.size == 0 or roi.size == 0:
        return 0.0

    diff = cv2.absdiff(previous_roi, roi)
    mean_diff = float(diff.mean())
    active_ratio = float((diff > 14).sum()) / float(diff.size)
    return min(1.0, mean_diff / 18.0 + active_ratio * 3.0)


def combine_detection_and_motion_score(detection_score, motion_score):
    return min(1.0, detection_score * 0.35 + motion_score * 0.65)


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


def select_focus_boxes(boxes, frame_width):
    if len(boxes) <= 1:
        return boxes

    sorted_by_score = sorted(boxes, key=lambda box: box["score"], reverse=True)
    primary = sorted_by_score[0]
    secondary = sorted_by_score[1]

    if (
        secondary["score"] <= 0
        or primary["score"] >= secondary["score"] * ACTIVE_BOX_SCORE_RATIO
    ):
        return [primary]

    return group_boxes(boxes, frame_width)


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


def detect_opencv(file_path, start_seconds, end_seconds):
    cv2 = try_import_cv2()
    if cv2 is None:
        return None

    capture = cv2.VideoCapture(file_path)
    if not capture.isOpened():
        return None

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    detections = []
    previous_gray = read_gray_frame(
        cv2, capture, max(0, start_seconds - SAMPLE_INTERVAL_SECONDS)
    )
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
                base_score = min(1.0, float((face[2] * face[3]) / 16000))
                motion_score = get_box_motion_score(
                    previous_gray,
                    gray,
                    face,
                    focus="mouth",
                )
                rect["score"] = combine_detection_and_motion_score(
                    base_score, motion_score
                )
                frame_boxes.append(rect)
            for group in select_focus_boxes(frame_boxes, frame_width):
                group["source"] = "face-group"
                group["timestampSeconds"] = timestamp
                detections.append(group)
        else:
            for rect in detect_motion(previous_gray, gray, scale):
                rect["timestampSeconds"] = timestamp
                detections.append(rect)

        previous_gray = gray
        timestamp += SAMPLE_INTERVAL_SECONDS

    capture.release()
    return detections


def main():
    if len(sys.argv) != 4:
        print(json.dumps({"detections": [], "detectorBackend": "opencv"}))
        return

    file_path = sys.argv[1]
    start_seconds = float(sys.argv[2])
    end_seconds = float(sys.argv[3])
    yolo_detections = detect_yolo_cuda(file_path, start_seconds, end_seconds)
    if yolo_detections is not None and len(yolo_detections) > 0:
        print(
            json.dumps(
                {"detections": yolo_detections, "detectorBackend": "yolo-cuda"}
            )
        )
        return

    opencv_detections = detect_opencv(file_path, start_seconds, end_seconds)
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
