#!/usr/bin/env python3
import json
import sys

import cv2


SAMPLE_INTERVAL_SECONDS = 0.75
MAX_SAMPLE_WIDTH = 640


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


def main():
    if len(sys.argv) != 4:
        print(json.dumps({"detections": []}))
        return

    file_path = sys.argv[1]
    start_seconds = float(sys.argv[2])
    end_seconds = float(sys.argv[3])
    capture = cv2.VideoCapture(file_path)
    if not capture.isOpened():
        print(json.dumps({"detections": []}))
        return

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
    print(json.dumps({"detections": detections}))


if __name__ == "__main__":
    main()
