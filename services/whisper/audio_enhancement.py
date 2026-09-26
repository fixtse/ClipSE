import logging
import subprocess
import tempfile
from pathlib import Path


logger = logging.getLogger("clipse.whisper")

# Conservative speech-focused processing. Keep the input duration and sample rate
# stable so Whisper's word timestamps still refer to the original recording.
SPEECH_FILTERS = (
    "highpass=f=80,"
    "lowpass=f=7600,"
    "afftdn=nf=-25:nr=8,"
    "equalizer=f=250:t=q:w=1:g=-2,"
    "equalizer=f=3000:t=q:w=1:g=3,"
    "acompressor=threshold=0.1:ratio=2:attack=20:release=250,"
    "loudnorm=I=-19:TP=-2:LRA=11"
)


def enhance_audio(input_path: str) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as output_file:
        output_path = output_file.name

    try:
        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error",
                "-y", "-i", input_path, "-vn", "-af", SPEECH_FILTERS,
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output_path,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise ValueError(result.stderr.strip() or "FFmpeg could not process the audio")
        if Path(output_path).stat().st_size <= 44:
            raise ValueError("Enhanced audio is empty")
        return output_path
    except Exception:
        Path(output_path).unlink(missing_ok=True)
        logger.exception("Audio enhancement failed for %s", input_path)
        raise
