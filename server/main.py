import base64
import io
import os
import shutil
from contextlib import asynccontextmanager
from typing import List, Optional

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import hf_hub_download
from PIL import Image
from pydantic import BaseModel
from ultralytics import YOLO

MODEL_CACHE_DIR = os.path.expanduser("~/.cache/panora")
MODEL_CACHE_PATH = os.path.join(MODEL_CACHE_DIR, "model.pt")
HF_REPO_ID = "kitsumed/yolov8m_seg-speech-bubble"
HF_FILENAME = "model.pt"

yolo_model: Optional[YOLO] = None
model_loaded = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global yolo_model, model_loaded
    try:
        os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
        if not os.path.exists(MODEL_CACHE_PATH):
            downloaded = hf_hub_download(repo_id=HF_REPO_ID, filename=HF_FILENAME)
            shutil.copy(downloaded, MODEL_CACHE_PATH)
        _original_torch_load = torch.load
        def _patched_load(*args, **kwargs):
            kwargs.setdefault("weights_only", False)
            return _original_torch_load(*args, **kwargs)
        torch.load = _patched_load
        yolo_model = YOLO(MODEL_CACHE_PATH)
        torch.load = _original_torch_load
        model_loaded = True
    except Exception as e:
        print(f"Failed to load model: {e}")
        model_loaded = False
    yield


app = FastAPI(title="Panora YOLO Bubble Detector", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectRequest(BaseModel):
    image_data: str


class BoundsSchema(BaseModel):
    x: float
    y: float
    width: float
    height: float


class BackgroundSchema(BaseModel):
    type: str = "solid"
    color: str = "#FFFFFF"
    hasTexture: bool = False


class BubbleResult(BaseModel):
    bounds: BoundsSchema
    cropDataUrl: str
    background: BackgroundSchema
    detectedFontSizePct: Optional[float] = None
    confidence: float
    bubbleType: str = "speech"


def decode_image(image_data: str) -> Image.Image:
    if image_data.startswith("data:"):
        image_data = image_data.split(",", 1)[1]
    raw = base64.b64decode(image_data)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def encode_crop(crop: Image.Image) -> str:
    buf = io.BytesIO()
    crop.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def sample_background_color(crop: Image.Image) -> str:
    try:
        arr = np.array(crop)
        h, w = arr.shape[:2]
        border = max(2, int(min(h, w) * 0.12))
        top = arr[:border, :, :]
        bottom = arr[h - border:, :, :]
        left = arr[:, :border, :]
        right = arr[:, w - border:, :]
        edges = np.concatenate([
            top.reshape(-1, 3),
            bottom.reshape(-1, 3),
            left.reshape(-1, 3),
            right.reshape(-1, 3),
        ], axis=0)
        if edges.size == 0:
            return "#FFFFFF"
        r = int(np.median(edges[:, 0]))
        g = int(np.median(edges[:, 1]))
        b = int(np.median(edges[:, 2]))
        return f"#{r:02X}{g:02X}{b:02X}"
    except Exception:
        return "#FFFFFF"


def classify_bubble_type(box_w: float, box_h: float) -> str:
    if box_w == 0 or box_h == 0:
        return "speech"
    aspect = box_w / box_h
    if aspect > 2.5:
        return "narration"
    if aspect < 0.6:
        return "tall"
    return "speech"


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model_loaded}


@app.post("/detect-bubbles", response_model=List[BubbleResult])
async def detect_bubbles(request: DetectRequest):
    if not model_loaded or yolo_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    try:
        pil_image = decode_image(request.image_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")

    img_w, img_h = pil_image.size

    try:
        results = yolo_model(pil_image, conf=0.25, iou=0.45, verbose=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YOLO inference failed: {e}")

    bubbles: List[BubbleResult] = []

    if not results or len(results) == 0:
        return bubbles

    result = results[0]

    if result.boxes is None or len(result.boxes) == 0:
        return bubbles

    for box in result.boxes:
        try:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            confidence = float(box.conf[0])

            raw_w = x2 - x1
            raw_h = y2 - y1

            if raw_w < 5 or raw_h < 5:
                continue

            cx1 = max(0, x1)
            cy1 = max(0, y1)
            cx2 = min(img_w, x2)
            cy2 = min(img_h, y2)

            visible_w = cx2 - cx1
            visible_h = cy2 - cy1

            if visible_w < 5 or visible_h < 5:
                continue

            visible_area = visible_w * visible_h
            raw_area = raw_w * raw_h
            if raw_area > 0 and visible_area / raw_area < 0.5:
                continue

            pct_x = (x1 / img_w) * 100
            pct_y = (y1 / img_h) * 100
            pct_w = (raw_w / img_w) * 100
            pct_h = (raw_h / img_h) * 100

            crop = pil_image.crop((int(cx1), int(cy1), int(cx2), int(cy2)))
            crop_data_url = encode_crop(crop)
            bg_color = sample_background_color(crop)
            font_size_pct = round((raw_h / img_h) * 100 / 3, 2)
            bubble_type = classify_bubble_type(raw_w, raw_h)

            bubbles.append(
                BubbleResult(
                    bounds=BoundsSchema(
                        x=round(pct_x, 2),
                        y=round(pct_y, 2),
                        width=round(pct_w, 2),
                        height=round(pct_h, 2),
                    ),
                    cropDataUrl=crop_data_url,
                    background=BackgroundSchema(
                        type="solid",
                        color=bg_color,
                        hasTexture=False,
                    ),
                    detectedFontSizePct=font_size_pct,
                    confidence=round(confidence, 3),
                    bubbleType=bubble_type,
                )
            )
        except Exception:
            continue

    return bubbles


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=5001, reload=False)
