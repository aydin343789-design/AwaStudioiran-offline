import asyncio
import hmac
import io
import logging
import os
import threading
import wave
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from piper import PiperVoice
from piper.config import SynthesisConfig

VOICE_ID = "fa_IR-amir-medium"
logger = logging.getLogger(__name__)
MODEL_BASE_URL = os.getenv(
    "PIPER_MODEL_BASE_URL",
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/amir/medium",
).rstrip("/")
MODEL_DIR = Path(os.getenv("PIPER_MODEL_DIR", "/data/piper"))
MODEL_PATH = MODEL_DIR / f"{VOICE_ID}.onnx"
CONFIG_PATH = MODEL_DIR / f"{VOICE_ID}.onnx.json"
API_TOKEN = os.getenv("PIPER_API_TOKEN", "").strip()
MAX_CHARS = 12000
voice: Optional[PiperVoice] = None
voice_lock = threading.Lock()


def download_if_missing(url: str, destination: Path, minimum_size: int) -> None:
    if destination.exists() and destination.stat().st_size >= minimum_size:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    with requests.get(url, stream=True, timeout=(20, 240)) as response:
        response.raise_for_status()
        with temporary.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)
    if temporary.stat().st_size < minimum_size:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded file is unexpectedly small: {destination.name}")
    temporary.replace(destination)


def load_model() -> PiperVoice:
    download_if_missing(f"{MODEL_BASE_URL}/{MODEL_PATH.name}", MODEL_PATH, 10_000_000)
    download_if_missing(f"{MODEL_BASE_URL}/{CONFIG_PATH.name}", CONFIG_PATH, 500)
    return PiperVoice.load(MODEL_PATH, CONFIG_PATH, use_cuda=False)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global voice
    if not API_TOKEN:
        raise RuntimeError("Set PIPER_API_TOKEN before starting the public TTS API.")
    voice = await asyncio.to_thread(load_model)
    yield
    voice = None


app = FastAPI(title="Avaye Iran Azad - Open Piper TTS", version="1.0.0", lifespan=lifespan)


class TTSRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    voice_id: str = Field(default=VOICE_ID, alias="voiceId")
    speed: float = Field(default=1.0, ge=0.7, le=1.2)


def require_token(authorization: Optional[str]) -> None:
    expected = f"Bearer {API_TOKEN}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    return {"status": "ok" if voice is not None else "loading", "service": "piper-persian", "voice": VOICE_ID}


@app.get("/v1/voices")
async def list_voices(authorization: Optional[str] = Header(default=None)):
    require_token(authorization)
    return {
        "voices": [
            {
                "voice_id": VOICE_ID,
                "name": "امیر · فارسی (Piper، آفلاین/متن‌باز)",
                "labels": {"language": "fa-IR", "gender": "male", "quality": "medium"},
            }
        ]
    }


@app.post("/v1/tts")
async def text_to_speech(
    body: TTSRequest,
    authorization: Optional[str] = Header(default=None),
):
    require_token(authorization)
    if body.voice_id != VOICE_ID:
        raise HTTPException(status_code=400, detail="This Piper endpoint only serves the configured Persian voice.")
    current_voice = voice
    if current_voice is None:
        raise HTTPException(status_code=503, detail="Piper model is not ready.")

    def synthesize() -> bytes:
        audio = io.BytesIO()
        config = SynthesisConfig(length_scale=1.0 / body.speed)
        with voice_lock, wave.open(audio, "wb") as wav_file:
            current_voice.synthesize_wav(body.text.strip(), wav_file, syn_config=config)
        return audio.getvalue()

    try:
        wav_bytes = await asyncio.to_thread(synthesize)
    except Exception as error:
        logger.exception("Piper TTS generation failed")
        raise HTTPException(status_code=500, detail="TTS generation failed.") from error
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="persian-tts.wav"'},
    )
