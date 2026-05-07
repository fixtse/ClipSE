#!/usr/bin/env python3
import os
import json
import sys


SAMPLE_INTERVAL_SECONDS = 0.75
MAX_SAMPLE_WIDTH = 640
PERSON_CLASS_ID = 0


def try_import_cv2():
    try:
        import cv2

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

            results = model.predict(
                resized,
                classes=[PERSON_CLASS_ID],
                device=0,
                imgsz=MAX_SAMPLE_WIDTH,
                verbose=False,
            )
            result = results[0] if results else None
            boxes = [] if result is None else result.boxes
            if boxes is not None:
                for box in boxes[:2]:
                    confidence = float(box.conf[0].item())
                    x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
                    detections.append(
                        {
                            "timestampSeconds": timestamp,
                            "x": x1 / scale,
                            "y": y1 / scale,
                            "width": max(1.0, (x2 - x1) / scale),
                            "height": max(1.0, (y2 - y1) / scale),
                            "score": confidence,
                            "source": "person",
                        }
                    )

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
                :2
            ]
            for face in ranked_faces:
                rect = scale_rect(face, scale)
                rect["score"] = min(1.0, float((face[2] * face[3]) / 16000))
                rect["source"] = "face"
                rect["timestampSeconds"] = timestamp
                detections.append(rect)
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
