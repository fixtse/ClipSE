import gc
import logging
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel


app = FastAPI(title="ContentClip Whisper Service")
logger = logging.getLogger("contentclip.whisper")

DEFAULT_MODEL_NAME = os.environ.get("WHISPER_MODEL", "medium")
MODEL_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
MODEL_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")
MODEL_LOCK = Lock()
MODEL_CACHE: dict[str, WhisperModel] = {}


@contextmanager
def loaded_whisper_model(model_name: str) -> WhisperModel:
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
            whisper_model = MODEL_CACHE.pop(cache_key, None)
            ctranslate_model = getattr(whisper_model, "model", None)
            unload_model = getattr(ctranslate_model, "unload_model", None)
            if callable(unload_model):
                try:
                    unload_model()
                except Exception:
                    logger.exception("Failed to unload Whisper model %s", cache_key)
            gc.collect()


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "defaultModel": DEFAULT_MODEL_NAME,
        "device": MODEL_DEVICE,
        "computeType": MODEL_COMPUTE_TYPE,
        "loaded": bool(MODEL_CACHE),
        "busy": MODEL_LOCK.locked(),
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(default=DEFAULT_MODEL_NAME),
    language: str | None = Form(default=None),
) -> dict:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name

    try:
        try:
            with loaded_whisper_model(model_name=model or DEFAULT_MODEL_NAME) as whisper_model:
                segments, info = whisper_model.transcribe(
                    temp_path,
                    language=None if language in (None, "", "auto") else language,
                    vad_filter=True,
                    beam_size=5,
                )

                segment_items = []
                full_text_parts = []

                for segment in segments:
                    text = segment.text.strip()
                    if not text:
                        continue

                    segment_items.append(
                        {
                            "start": round(segment.start, 3),
                            "end": round(segment.end, 3),
                            "text": text,
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
        }
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
