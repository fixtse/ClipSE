import argparse
import json
import os
import sys
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np


HAILO_MODEL_NAMES = {
    "whisper-tiny": "Whisper-Tiny",
    "whisper-base": "Whisper-Base",
    "whisper-small": "Whisper-Small",
    "tiny": "Whisper-Tiny",
    "base": "Whisper-Base",
    "small": "Whisper-Small",
}
HEF_SEARCH_ROOTS = (
    Path("/models"),
    Path("/usr/local/hailo/resources"),
    Path("/opt/hailo-apps"),
)
HAILO_WHISPER_TIMEOUT_MS = int(os.environ.get("HAILO_WHISPER_TIMEOUT_MS", "60000"))
HAILO_WHISPER_DEBUG = os.environ.get("HAILO_WHISPER_DEBUG", "false").lower() in (
    "1",
    "true",
    "yes",
)
HAILO_WHISPER_GAIN_DB = float(os.environ.get("HAILO_WHISPER_GAIN_DB", "0"))


def log_debug(message: str) -> None:
    if HAILO_WHISPER_DEBUG:
        print(f"[hailo-whisper] {message}", file=sys.stderr)


def summarize_waveform(audio_data: np.ndarray, sample_rate: int) -> dict:
    if audio_data.size == 0:
        return {
            "samples": 0,
            "durationSeconds": 0.0,
            "min": 0.0,
            "max": 0.0,
            "mean": 0.0,
            "rms": 0.0,
        }
    audio = audio_data.astype(np.float32)
    rms = float(np.sqrt(np.mean(np.square(audio))))
    return {
        "samples": int(audio.size),
        "durationSeconds": float(audio.size) / float(sample_rate),
        "min": float(np.min(audio)),
        "max": float(np.max(audio)),
        "mean": float(np.mean(audio)),
        "rms": rms,
    }


def apply_gain(audio_data: np.ndarray, gain_db: float) -> np.ndarray:
    if gain_db == 0:
        return audio_data
    gain = 10 ** (gain_db / 20.0)
    adjusted = audio_data * gain
    return np.clip(adjusted, -1.0, 1.0).astype(audio_data.dtype)


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
        for hef_path in root.rglob("*.hef"):
            if normalized_stem in hef_path.stem.lower().replace("_", "-"):
                return hef_path

    try:
        from hailo_apps.python.core.common.core import resolve_hef_path as resolve_hailo_apps_hef_path
        from hailo_apps.python.core.common.defines import HAILO10H_ARCH, WHISPER_CHAT_APP
    except Exception as error:
        raise RuntimeError(
            "hailo-apps is required for automatic Whisper HEF resolution. "
            "Put a matching HEF under /models or set HAILO_WHISPER_HEF_PATH."
        ) from error

    resolved = resolve_hailo_apps_hef_path(
        None,
        app_name=WHISPER_CHAT_APP,
        arch=HAILO10H_ARCH,
    )
    if resolved is None:
        raise RuntimeError(f"Unable to resolve Hailo Whisper model: {model}")
    return Path(resolved)


def convert_audio_to_wav_s16le(audio_path: str) -> tuple[np.ndarray, float]:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_path = temp_file.name

    try:
        log_debug(f"Converting audio to 16 kHz mono s16le WAV: {audio_path}")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                audio_path,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                temp_path,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return read_wav_as_float32(temp_path)
    finally:
        Path(temp_path).unlink(missing_ok=True)


def read_wav_as_float32(audio_path: str) -> tuple[np.ndarray, float]:
    with wave.open(audio_path, "rb") as wav_file:
        frames = wav_file.getnframes()
        sample_rate = wav_file.getframerate()
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        raw_audio = wav_file.readframes(frames)

    log_debug(
        "Loaded WAV metadata: "
        f"frames={frames} sample_rate={sample_rate} channels={channels} sample_width={sample_width}"
    )

    if sample_width != 2:
        raise ValueError("Hailo Whisper expects 16-bit PCM WAV audio")
    if channels != 1:
        raise ValueError("Hailo Whisper expects mono WAV audio")
    if sample_rate != 16000:
        raise ValueError("Hailo Whisper expects 16 kHz WAV audio")

    audio_data = np.frombuffer(raw_audio, dtype=np.int16)
    audio_data = audio_data.astype(np.float32) / 32768.0
    return audio_data.astype("<f4"), frames / sample_rate


def transcribe(input_audio_path: str, model: str, language: str, hef_path: str | None) -> dict:
    from hailo_platform import VDevice
    from hailo_platform.genai import Speech2Text, Speech2TextTask

    try:
        from hailo_apps.python.core.common.defines import SHARED_VDEVICE_GROUP_ID
    except Exception:
        SHARED_VDEVICE_GROUP_ID = "SHARED_VDEVICE"

    resolved_hef_path = resolve_hef_path(model, hef_path)
    try:
        audio_data, duration = read_wav_as_float32(input_audio_path)
    except Exception:
        audio_data, duration = convert_audio_to_wav_s16le(input_audio_path)
    log_debug(f"Audio duration seconds (pre-gain): {duration:.3f}")
    log_debug(f"Waveform stats (pre-gain): {summarize_waveform(audio_data, 16000)}")
    if HAILO_WHISPER_GAIN_DB != 0:
        log_debug(f"Applying gain normalization: {HAILO_WHISPER_GAIN_DB} dB")
        audio_data = apply_gain(audio_data, HAILO_WHISPER_GAIN_DB)
        log_debug(f"Waveform stats (post-gain): {summarize_waveform(audio_data, 16000)}")
    log_debug(f"Using HEF: {resolved_hef_path}")
    log_debug(f"Using model: {model} language: {language or 'auto'}")
    params = VDevice.create_params()
    params.group_id = SHARED_VDEVICE_GROUP_ID
    vdevice = None
    speech2text = None

    try:
        vdevice = VDevice(params)
        speech2text = Speech2Text(vdevice, str(resolved_hef_path))
        segments = speech2text.generate_all_segments(
            audio_data=audio_data,
            task=Speech2TextTask.TRANSCRIBE,
            language=language or "en",
            timeout_ms=HAILO_WHISPER_TIMEOUT_MS,
        )
        log_debug(f"Segments returned: {len(segments or [])}")
        segment_items = []
        for segment in segments or []:
            text = getattr(segment, "text", "").strip()
            if not text:
                continue
            start = getattr(segment, "start_sec", 0)
            end = getattr(segment, "end_sec", duration)
            segment_items.append(
                {
                    "start": round(float(start), 3),
                    "end": round(float(end), 3),
                    "text": text,
                    "words": [],
                }
            )
        text = " ".join(segment["text"] for segment in segment_items).strip()
        if not text:
            raise RuntimeError("No speech detected")
        return {
            "text": text,
            "language": language or "unknown",
            "duration": round(duration, 3),
            "segments": segment_items,
        }
    finally:
        if speech2text:
            speech2text.release()
        if vdevice:
            vdevice.release()


def main() -> int:
    parser = argparse.ArgumentParser(description="ClipSE Hailo Whisper runner")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="whisper-base")
    parser.add_argument("--language", default="en")
    parser.add_argument("--hef-path", default=None)
    args = parser.parse_args()

    normalized_model = HAILO_MODEL_NAMES.get(args.model.lower(), args.model)
    try:
        print(
            json.dumps(
                transcribe(
                    input_audio_path=args.audio,
                    model=normalized_model,
                    language="" if args.language == "auto" else args.language,
                    hef_path=args.hef_path,
                )
            )
        )
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
