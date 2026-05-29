import gc
import importlib.util
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from faster_whisper import WhisperModel


app = FastAPI(title="ClipSE Whisper Service")
logger = logging.getLogger("clipse.whisper")

DEFAULT_MODEL_NAME = os.environ.get("WHISPER_MODEL", "medium")
DEFAULT_PROVIDER = os.environ.get("WHISPER_PROVIDER", "faster-whisper")
MODEL_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
MODEL_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")
HAILO_WHISPER_MODEL = os.environ.get("HAILO_WHISPER_MODEL", "whisper-base")
HAILO_WHISPER_HEF_PATH = os.environ.get("HAILO_WHISPER_HEF_PATH", "")
HAILO_VLM_MODEL = os.environ.get("HAILO_VLM_MODEL", "qwen2-vl-2b")
HAILO_VLM_HEF_PATH = os.environ.get("HAILO_VLM_HEF_PATH", "")
HAILO_VISION_MODEL = os.environ.get("HAILO_VISION_MODEL", "yolov8n")
HAILO_VISION_HEF_PATH = os.environ.get("HAILO_VISION_HEF_PATH", "")
HAILO_SCREEN_OCR_HEF_PATH = os.environ.get("HAILO_SCREEN_OCR_HEF_PATH", "")
HAILO_OBJECT_LABELS = os.environ.get("HAILO_OBJECT_LABELS", "")
HAILO_TRANSCRIBE_COMMAND = os.environ.get(
    "HAILO_TRANSCRIBE_COMMAND",
    "python /app/hailo_whisper_runner.py --audio {audio} --model {model} --language {language} {hef_arg}",
)
HAILO_VLM_FOCUS_COMMAND = os.environ.get(
    "HAILO_VLM_FOCUS_COMMAND",
    "python /app/hailo_vlm_focus_runner.py --video {video} --model {model} --start {start} --end {end} --sample-interval {sample_interval} --max-samples {max_samples} {hef_arg} {optimize_memory_arg}",
)
HAILO_VISION_COMMAND = os.environ.get(
    "HAILO_VISION_COMMAND",
    "python /app/hailo_vision_focus_runner.py --video {video} --model {model} --start {start} --end {end} --detection-mode {detection_mode} --sample-interval {sample_interval} --max-samples {max_samples} {hef_arg} {ocr_hef_arg} {object_labels_arg}",
)
HAILO_COMMAND_TIMEOUT_SECONDS = int(os.environ.get("HAILO_COMMAND_TIMEOUT_SECONDS", "900"))
HAILO_VLM_FOCUS_SAMPLE_INTERVAL_SECONDS = float(
    os.environ.get("HAILO_VLM_FOCUS_SAMPLE_INTERVAL_SECONDS", "1.0")
)
HAILO_VLM_FOCUS_MAX_SAMPLES = int(os.environ.get("HAILO_VLM_FOCUS_MAX_SAMPLES", "8"))
HAILO_VISION_SAMPLE_INTERVAL_SECONDS = float(
    os.environ.get("HAILO_VISION_SAMPLE_INTERVAL_SECONDS", "0.35")
)
HAILO_VISION_MAX_SAMPLES = int(os.environ.get("HAILO_VISION_MAX_SAMPLES", "24"))
HAILO_VLM_OPTIMIZE_MEMORY_ON_DEVICE = (
    os.environ.get("HAILO_VLM_OPTIMIZE_MEMORY_ON_DEVICE", "true").lower()
    in ("1", "true", "yes")
)
MODEL_LOCK = Lock()
MODEL_CACHE: dict[str, WhisperModel] = {}
SUPPORTED_PROVIDERS = {"faster-whisper", "hailo"}
HAILO_PYTHON_PACKAGE_HELP = (
    "PyHailoRT is missing from the Whisper image. Rebuild the Hailo image with "
    "HAILORT_WHEEL_DIR pointing at the directory that contains the licensed "
    "hailort-*.whl or pyhailort-*.whl file."
)
HAILO_NATIVE_LIBRARY_HELP = (
    "PyHailoRT is installed, but the native HailoRT library is not available in "
    "the Whisper container. Put hailort_*.deb in HAILORT_WHEEL_DIR and rebuild, "
    "or set HAILO_HOST_LIB_DIR to the host directory that contains libhailort.so."
)


@contextmanager
def loaded_whisper_model(model_name: str, unload_after: bool) -> WhisperModel:
    cache_key = f"{model_name}:{MODEL_DEVICE}:{MODEL_COMPUTE_TYPE}"
    with MODEL_LOCK:
        if cache_key not in MODEL_CACHE:
            MODEL_CACHE[cache_key] = WhisperModel(
                model_name,
                device=MODEL_DEVICE,
                compute_type=MODEL_COMPUTE_TYPE,
            )

        try:
            yield MODEL_CACHE[cache_key]
        finally:
            if unload_after:
                whisper_model = MODEL_CACHE.pop(cache_key, None)
                ctranslate_model = getattr(whisper_model, "model", None)
                unload_model = getattr(ctranslate_model, "unload_model", None)
                if callable(unload_model):
                    try:
                        unload_model()
                    except Exception:
                        logger.exception("Failed to unload Whisper model %s", cache_key)
                gc.collect()


def detect_hailo_runtime() -> dict[str, Any]:
    device_paths = [*Path("/dev").glob("hailo*"), *Path("/dev").glob("h1x-*")]
    devices = sorted(str(path) for path in device_paths)
    cli_path = shutil.which("hailortcli") or (
        "/host/usr/bin/hailortcli" if Path("/host/usr/bin/hailortcli").exists() else None
    )
    python_package_available = importlib.util.find_spec("hailo_platform") is not None
    python_import_available = False
    python_import_error = None
    cli_scan = None

    if python_package_available:
        try:
            import hailo_platform  # noqa: F401

            python_import_available = True
        except Exception as error:
            python_import_error = str(error)

    if cli_path:
        try:
            cli_scan_result = subprocess.run(
                [cli_path, "scan"],
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
            )
            cli_scan = {
                "exitCode": cli_scan_result.returncode,
                "stdout": cli_scan_result.stdout.strip(),
                "stderr": cli_scan_result.stderr.strip(),
            }
        except Exception as error:
            cli_scan = {"error": str(error)}

    available = bool(devices) and python_import_available
    return {
        "available": available,
        "devices": devices,
        "hailortcli": cli_path,
        "pythonPackageAvailable": python_package_available,
        "pythonPackageError": python_import_error,
        "pythonImportAvailable": python_import_available,
        "pythonImportError": python_import_error,
        "scan": cli_scan,
        "transcribeCommandConfigured": bool(HAILO_TRANSCRIBE_COMMAND),
        "model": HAILO_WHISPER_MODEL,
        "hefPathConfigured": bool(HAILO_WHISPER_HEF_PATH),
        "vlm": {
            "model": HAILO_VLM_MODEL,
            "hefPathConfigured": bool(HAILO_VLM_HEF_PATH),
            "focusCommandConfigured": bool(HAILO_VLM_FOCUS_COMMAND),
        },
        "vision": {
            "model": HAILO_VISION_MODEL,
            "hefPathConfigured": bool(HAILO_VISION_HEF_PATH),
            "screenOcrHefPathConfigured": bool(HAILO_SCREEN_OCR_HEF_PATH),
            "objectLabelsConfigured": bool(HAILO_OBJECT_LABELS),
            "focusCommandConfigured": bool(HAILO_VISION_COMMAND),
        },
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "defaultProvider": DEFAULT_PROVIDER,
        "defaultModel": DEFAULT_MODEL_NAME,
        "device": MODEL_DEVICE,
        "computeType": MODEL_COMPUTE_TYPE,
        "loaded": bool(MODEL_CACHE),
        "busy": MODEL_LOCK.locked(),
        "providers": {
            "faster-whisper": {
                "available": True,
                "default": DEFAULT_PROVIDER == "faster-whisper",
            },
            "hailo": detect_hailo_runtime(),
        },
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(default=DEFAULT_MODEL_NAME),
    language: str | None = Form(default=None),
    unload_after: bool = Form(default=True),
    provider: str = Form(default=DEFAULT_PROVIDER),
) -> dict:
    provider_name = normalize_provider(provider)
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name

    try:
        started_at = time.perf_counter()
        if provider_name == "hailo":
            response = transcribe_with_hailo(
                audio_path=temp_path,
                model_name=model or HAILO_WHISPER_MODEL,
                language=language,
            )
            response["provider"] = provider_name
            response["elapsedSeconds"] = round(time.perf_counter() - started_at, 3)
            return response

        try:
            with loaded_whisper_model(
                model_name=model or DEFAULT_MODEL_NAME,
                unload_after=unload_after,
            ) as whisper_model:
                segments, info = whisper_model.transcribe(
                    temp_path,
                    language=None if language in (None, "", "auto") else language,
                    vad_filter=True,
                    beam_size=5,
                    word_timestamps=True,
                )

                segment_items = []
                full_text_parts = []

                for segment in segments:
                    text = segment.text.strip()
                    if not text:
                        continue

                    word_items = []
                    for word in segment.words or []:
                        word_text = word.word.strip()
                        if not word_text:
                            continue

                        word_items.append(
                            {
                                "start": round(word.start, 3),
                                "end": round(word.end, 3),
                                "text": word_text,
                            }
                        )

                    segment_items.append(
                        {
                            "start": round(segment.start, 3),
                            "end": round(segment.end, 3),
                            "text": text,
                            "words": word_items,
                        }
                    )
                    full_text_parts.append(text)
        except RuntimeError as error:
            raise HTTPException(
                status_code=503,
                detail=f"Whisper transcription failed: {error}",
            ) from error

        if not segment_items:
            raise HTTPException(status_code=422, detail="No speech detected")

        return {
            "text": " ".join(full_text_parts).strip(),
            "language": info.language or language or "unknown",
            "duration": round(info.duration, 3) if info.duration else None,
            "segments": segment_items,
            "provider": provider_name,
            "elapsedSeconds": round(time.perf_counter() - started_at, 3),
        }
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass


@app.post("/benchmark")
async def benchmark(
    file: UploadFile = File(...),
    model: str = Form(default=DEFAULT_MODEL_NAME),
    language: str | None = Form(default=None),
    providers: list[str] = Query(default=["faster-whisper", "hailo"]),
) -> dict:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name

    try:
        results = []
        for provider in providers:
            provider_name = normalize_provider(provider)
            started_at = time.perf_counter()
            try:
                if provider_name == "hailo":
                    result = transcribe_with_hailo(
                        audio_path=temp_path,
                        model_name=model or HAILO_WHISPER_MODEL,
                        language=language,
                    )
                else:
                    with loaded_whisper_model(
                        model_name=model or DEFAULT_MODEL_NAME,
                        unload_after=True,
                    ) as whisper_model:
                        segments, info = whisper_model.transcribe(
                            temp_path,
                            language=None if language in (None, "", "auto") else language,
                            vad_filter=True,
                            beam_size=5,
                            word_timestamps=True,
                        )
                        result = normalize_transcription_response(
                            segments=segments,
                            language=info.language or language or "unknown",
                            duration=round(info.duration, 3) if info.duration else None,
                        )

                results.append(
                    {
                        "provider": provider_name,
                        "ok": True,
                        "elapsedSeconds": round(time.perf_counter() - started_at, 3),
                        "textLength": len(result.get("text", "")),
                        "segmentCount": len(result.get("segments", [])),
                        "language": result.get("language", "unknown"),
                        "duration": result.get("duration"),
                    }
                )
            except Exception as error:
                results.append(
                    {
                        "provider": provider_name,
                        "ok": False,
                        "elapsedSeconds": round(time.perf_counter() - started_at, 3),
                        "error": str(error),
                    }
                )

        return {"results": results}
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass


@app.post("/focus-detections")
async def focus_detections(
    file: UploadFile = File(...),
    start_seconds: float = Form(default=0),
    end_seconds: float = Form(default=1),
    model: str | None = Form(default=None),
    detection_mode: str = Form(default="people"),
    detector_backend: str = Form(default="hailo-vision"),
    sample_interval_seconds: float | None = Form(default=None),
    max_samples: int | None = Form(default=None),
) -> dict:
    runtime = detect_hailo_runtime()
    if not runtime["available"]:
        raise unavailable_hailo_runtime_exception(runtime)
    normalized_detection_mode = normalize_detection_mode(detection_mode)
    normalized_detector_backend = normalize_detector_backend(detector_backend)
    use_hailo_vision = normalized_detector_backend == "hailo-vision" and bool(
        HAILO_VISION_COMMAND
    )
    if not use_hailo_vision and not HAILO_VLM_FOCUS_COMMAND:
        raise HTTPException(
            status_code=503,
            detail="HAILO_VISION_COMMAND or HAILO_VLM_FOCUS_COMMAND is required for Hailo focus detection",
        )

    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name

    try:
        command_template = HAILO_VISION_COMMAND if use_hailo_vision else HAILO_VLM_FOCUS_COMMAND
        effective_sample_interval = (
            sample_interval_seconds
            if sample_interval_seconds is not None
            else HAILO_VISION_SAMPLE_INTERVAL_SECONDS
            if use_hailo_vision
            else HAILO_VLM_FOCUS_SAMPLE_INTERVAL_SECONDS
        )
        effective_max_samples = (
            max_samples
            if max_samples is not None
            else HAILO_VISION_MAX_SAMPLES
            if use_hailo_vision
            else HAILO_VLM_FOCUS_MAX_SAMPLES
        )
        command = command_template.format(
            video=temp_path,
            model=model or (HAILO_VISION_MODEL if use_hailo_vision else HAILO_VLM_MODEL),
            start=f"{start_seconds:.3f}",
            end=f"{end_seconds:.3f}",
            sample_interval=f"{effective_sample_interval:.3f}",
            max_samples=effective_max_samples,
            detection_mode=normalized_detection_mode,
            hef_path=HAILO_VISION_HEF_PATH if use_hailo_vision else HAILO_VLM_HEF_PATH,
            hef_arg=(
                f"--hef-path {HAILO_VISION_HEF_PATH}"
                if use_hailo_vision and HAILO_VISION_HEF_PATH
                else f"--hef-path {HAILO_VLM_HEF_PATH}"
                if HAILO_VLM_HEF_PATH
                else ""
            ),
            ocr_hef_path=HAILO_SCREEN_OCR_HEF_PATH,
            ocr_hef_arg=(
                f"--ocr-hef-path {HAILO_SCREEN_OCR_HEF_PATH}"
                if use_hailo_vision and HAILO_SCREEN_OCR_HEF_PATH
                else ""
            ),
            object_labels=HAILO_OBJECT_LABELS,
            object_labels_arg=(
                f"--object-labels {HAILO_OBJECT_LABELS}"
                if use_hailo_vision and HAILO_OBJECT_LABELS
                else ""
            ),
            optimize_memory_arg=(
                "--optimize-memory-on-device" if HAILO_VLM_OPTIMIZE_MEMORY_ON_DEVICE else ""
            ),
        )
        result = subprocess.run(
            command,
            shell=True,
            check=False,
            capture_output=True,
            text=True,
            timeout=HAILO_COMMAND_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            raise HTTPException(
                status_code=503,
                detail=f"Hailo focus detection failed: {result.stderr.strip() or result.stdout.strip()}",
            )
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise HTTPException(
                status_code=503,
                detail="Hailo focus detection returned invalid JSON",
            ) from error
        return validate_focus_payload(payload)
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass


def normalize_provider(provider: str) -> str:
    provider_name = (provider or DEFAULT_PROVIDER).strip().lower()
    if provider_name not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported Whisper provider: {provider_name}",
        )
    return provider_name


def normalize_detection_mode(detection_mode: str) -> str:
    mode = (detection_mode or "people").strip().lower()
    if mode not in {"people", "people_strict", "product", "screen", "object"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported focus detection mode: {mode}",
        )
    return mode


def normalize_detector_backend(detector_backend: str) -> str:
    backend = (detector_backend or "hailo-vision").strip().lower()
    if backend not in {"hailo-vlm", "hailo-vision"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported Hailo focus backend: {backend}",
        )
    return backend


def unavailable_hailo_runtime_exception(runtime: dict[str, Any]) -> HTTPException:
    if not runtime["pythonPackageAvailable"]:
        error_detail = runtime["pythonPackageError"]
        return HTTPException(
            status_code=503,
            detail=(
                f"{HAILO_PYTHON_PACKAGE_HELP} Import error: {error_detail}"
                if error_detail
                else HAILO_PYTHON_PACKAGE_HELP
            ),
        )
    if not runtime.get("pythonImportAvailable", False):
        error_detail = runtime.get("pythonImportError") or runtime["pythonPackageError"]
        return HTTPException(
            status_code=503,
            detail=(
                f"{HAILO_NATIVE_LIBRARY_HELP} Import error: {error_detail}"
                if error_detail
                else HAILO_NATIVE_LIBRARY_HELP
            ),
        )
    return HTTPException(status_code=503, detail="Hailo runtime was not detected")


def transcribe_with_hailo(
    audio_path: str,
    model_name: str,
    language: str | None,
) -> dict:
    runtime = detect_hailo_runtime()
    if not runtime["available"]:
        raise unavailable_hailo_runtime_exception(runtime)

    if not HAILO_TRANSCRIBE_COMMAND:
        raise HTTPException(
            status_code=503,
            detail="HAILO_TRANSCRIBE_COMMAND is required for Hailo Whisper",
        )

    command = HAILO_TRANSCRIBE_COMMAND.format(
        audio=audio_path,
        model=model_name or HAILO_WHISPER_MODEL,
        language="" if language in (None, "", "auto") else language,
        hef_path=HAILO_WHISPER_HEF_PATH,
        hef_arg=f"--hef-path {HAILO_WHISPER_HEF_PATH}" if HAILO_WHISPER_HEF_PATH else "",
    )
    result = subprocess.run(
        command,
        shell=True,
        check=False,
        capture_output=True,
        text=True,
        timeout=HAILO_COMMAND_TIMEOUT_SECONDS,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=503,
            detail=f"Hailo Whisper failed: {result.stderr.strip() or result.stdout.strip()}",
        )

    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError:
        text = result.stdout.strip()
        if not text:
            raise HTTPException(status_code=422, detail="No speech detected")
        parsed = {
            "text": text,
            "language": language or "unknown",
            "duration": None,
            "segments": [{"start": 0, "end": 0, "text": text, "words": []}],
        }

    return validate_transcription_payload(parsed)


def normalize_transcription_response(segments: Any, language: str, duration: float | None) -> dict:
    segment_items = []
    full_text_parts = []

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        word_items = []
        for word in segment.words or []:
            word_text = word.word.strip()
            if not word_text:
                continue

            word_items.append(
                {
                    "start": round(word.start, 3),
                    "end": round(word.end, 3),
                    "text": word_text,
                }
            )

        segment_items.append(
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": text,
                "words": word_items,
            }
        )
        full_text_parts.append(text)

    return {
        "text": " ".join(full_text_parts).strip(),
        "language": language,
        "duration": duration,
        "segments": segment_items,
    }


def validate_transcription_payload(payload: Any) -> dict:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=503, detail="Hailo Whisper returned invalid JSON")

    text = payload.get("text")
    segments = payload.get("segments")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=422, detail="No speech detected")
    if not isinstance(segments, list):
        raise HTTPException(
            status_code=503,
            detail="Hailo Whisper response must include a segments array",
        )

    return {
        "text": text.strip(),
        "language": payload.get("language") or "unknown",
        "duration": payload.get("duration"),
        "segments": segments,
    }


def validate_focus_payload(payload: Any) -> dict:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=503, detail="Hailo VLM returned invalid JSON")
    detections = payload.get("detections")
    if not isinstance(detections, list):
        raise HTTPException(
            status_code=503,
            detail="Hailo VLM response must include a detections array",
        )
    return {
        "detections": detections,
        "detectorBackend": (
            "hailo-vision"
            if payload.get("detectorBackend") == "hailo-vision"
            else "hailo-vlm"
        ),
    }
