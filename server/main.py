import base64
import io
import os
from contextlib import asynccontextmanager
from typing import List, Optional

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from transformers import AutoModelForObjectDetection, AutoProcessor

MODEL_CACHE_DIR = os.path.expanduser("~/.cache/panora/rtdetr_model")
HF_REPO_ID = "ogkalu/comic-text-and-bubble-detector"

LABEL_BUBBLE = 0
LABEL_TEXT_BUBBLE = 1
LABEL_TEXT_FREE = 2

processor: Optional[AutoProcessor] = None
rtdetr_model: Optional[AutoModelForObjectDetection] = None
model_loaded = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global processor, rtdetr_model, model_loaded
    try:
        os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
        processor = AutoProcessor.from_pretrained(HF_REPO_ID, cache_dir=MODEL_CACHE_DIR)
        rtdetr_model = AutoModelForObjectDetection.from_pretrained(HF_REPO_ID, cache_dir=MODEL_CACHE_DIR)
        rtdetr_model.eval()
        model_loaded = True
    except Exception as e:
        print(f"Failed to load model: {e}")
        model_loaded = False
    yield


app = FastAPI(title="Panora RT-DETR Bubble Detector", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
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


def classify_bubble_type(box_w: float, box_h: float, is_free: bool = False) -> str:
    if is_free:
        return "text_free"
    if box_w == 0 or box_h == 0:
        return "speech"
    aspect = box_w / box_h
    if aspect > 2.5:
        return "narration"
    if aspect < 0.6:
        return "tall"
    return "speech"


def compute_iou(a: list, b: list) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model_loaded}


@app.post("/detect-bubbles", response_model=List[BubbleResult])
async def detect_bubbles(request: DetectRequest):
    if not model_loaded or rtdetr_model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    try:
        pil_image = decode_image(request.image_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")

    img_w, img_h = pil_image.size

    try:
        inputs = processor(images=pil_image, return_tensors="pt")
        with torch.no_grad():
            outputs = rtdetr_model(**inputs)
        target_sizes = torch.tensor([pil_image.size[::-1]])
        detections = processor.post_process_object_detection(
            outputs, threshold=0.25, target_sizes=target_sizes
        )[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RT-DETR inference failed: {e}")

    boxes = detections["boxes"].tolist()
    scores = detections["scores"].tolist()
    labels = detections["labels"].tolist()

    label_names = {LABEL_BUBBLE: "bubble", LABEL_TEXT_BUBBLE: "text_bubble", LABEL_TEXT_FREE: "text_free"}
    print(f"[DETECT] image={img_w}x{img_h}, detections={len(boxes)}")
    for box, score, label in zip(boxes, scores, labels):
        x1, y1, x2, y2 = box
        print(f"  {label_names.get(label, label)} score={score:.2f} box=({x1:.1f},{y1:.1f},{x2:.1f},{y2:.1f}) pct=({x1/img_w*100:.1f}%,{y1/img_h*100:.1f}%,{(x2-x1)/img_w*100:.1f}%w,{(y2-y1)/img_h*100:.1f}%h)")

    bubble_list = []
    text_bubble_list = []
    text_free_list = []

    for box, score, label in zip(boxes, scores, labels):
        if label == LABEL_BUBBLE:
            bubble_list.append((box, score))
        elif label == LABEL_TEXT_BUBBLE:
            text_bubble_list.append((box, score))
        elif label == LABEL_TEXT_FREE:
            text_free_list.append((box, score))

    used_text_bubbles = set()
    results: List[BubbleResult] = []

    def make_result(overlay_box, crop_box, confidence, is_free=False, clip_box=None):
        x1, y1, x2, y2 = overlay_box
        if clip_box is not None:
            x1 = max(x1, clip_box[0])
            y1 = max(y1, clip_box[1])
            x2 = min(x2, clip_box[2])
            y2 = min(y2, clip_box[3])
        raw_w = x2 - x1
        raw_h = y2 - y1

        if raw_w < 5 or raw_h < 5:
            return None

        cx1 = max(0, x1)
        cy1 = max(0, y1)
        cx2 = min(img_w, x2)
        cy2 = min(img_h, y2)

        visible_w = cx2 - cx1
        visible_h = cy2 - cy1

        if visible_w < 5 or visible_h < 5:
            return None

        visible_area = visible_w * visible_h
        raw_area = raw_w * raw_h
        if raw_area > 0 and visible_area / raw_area < 0.5:
            return None

        pct_x = (x1 / img_w) * 100
        pct_y = (y1 / img_h) * 100
        pct_w = (raw_w / img_w) * 100
        pct_h = (raw_h / img_h) * 100

        crop_x1 = max(0, crop_box[0])
        crop_y1 = max(0, crop_box[1])
        crop_x2 = min(img_w, crop_box[2])
        crop_y2 = min(img_h, crop_box[3])
        crop = pil_image.crop((int(crop_x1), int(crop_y1), int(crop_x2), int(crop_y2)))
        crop_data_url = encode_crop(crop)
        bg_color = sample_background_color(crop)
        font_size_pct = round((raw_h / img_h) * 100 / 2.5, 2)
        bubble_type = classify_bubble_type(raw_w, raw_h, is_free=is_free)

        return BubbleResult(
            bounds=BoundsSchema(
                x=round(pct_x, 2),
                y=round(pct_y, 2),
                width=round(pct_w, 2),
                height=round(pct_h, 2),
            ),
            cropDataUrl=crop_data_url,
            background=BackgroundSchema(type="solid", color=bg_color, hasTexture=False),
            detectedFontSizePct=font_size_pct,
            confidence=round(confidence, 3),
            bubbleType=bubble_type,
        )

    for bubble_box, bubble_score in bubble_list:
        best_idx = None
        best_iou = 0.0
        for i, (tb_box, _) in enumerate(text_bubble_list):
            if i in used_text_bubbles:
                continue
            iou = compute_iou(bubble_box, tb_box)
            if iou > best_iou:
                best_iou = iou
                best_idx = i

        if best_idx is not None and best_iou > 0.1:
            used_text_bubbles.add(best_idx)
            tb_box = text_bubble_list[best_idx][0]
            result = make_result(tb_box, tb_box, bubble_score, clip_box=bubble_box)
            if result is not None:
                results.append(result)

    for i, (tb_box, tb_score) in enumerate(text_bubble_list):
        if i in used_text_bubbles:
            continue
        bx1, by1, bx2, by2 = tb_box
        bw = bx2 - bx1
        bh = by2 - by1
        inset_x = bw * 0.06
        inset_y = bh * 0.04
        clip = [bx1 + inset_x, by1 + inset_y, bx2 - inset_x, by2 - inset_y]
        result = make_result(tb_box, tb_box, tb_score, clip_box=clip)
        if result is not None:
            results.append(result)

    for tf_box, tf_score in text_free_list:
        result = make_result(tf_box, tf_box, tf_score, is_free=True)
        if result is not None:
            results.append(result)

    return results


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=5001, reload=False)
