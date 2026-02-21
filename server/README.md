# Panora Python Server

Local YOLO speech bubble detection server for the Panora manga translation extension.

## Setup

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --host 127.0.0.1 --port 5001
```

The first run downloads the YOLO model (~25MB) to `~/.cache/panora/`.

## Endpoints

- `GET /health` — returns `{"status": "ok", "model_loaded": true}`
- `POST /detect-bubbles` — accepts `{"image_data": "data:image/png;base64,..."}`, returns bubble bounding boxes and crops
