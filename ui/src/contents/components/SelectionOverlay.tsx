import { useEffect, useRef, useState } from "react";
import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
};

interface SelectionOverlayProps {
  onAreaSelected: (bounds: DOMRect) => void;
  onCancel: () => void;
}

export const SelectionOverlay = ({
  onAreaSelected,
  onCancel,
}: SelectionOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (startPos && currentPos) {
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);

      ctx.clearRect(x, y, width, height);

      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(x, y, width, height);

      const handleSize = 10;
      ctx.fillStyle = "#3b82f6";
      ctx.setLineDash([]);

      ctx.fillRect(
        x - handleSize / 2,
        y - handleSize / 2,
        handleSize,
        handleSize,
      );
      ctx.fillRect(
        x + width - handleSize / 2,
        y - handleSize / 2,
        handleSize,
        handleSize,
      );
      ctx.fillRect(
        x - handleSize / 2,
        y + height - handleSize / 2,
        handleSize,
        handleSize,
      );
      ctx.fillRect(
        x + width - handleSize / 2,
        y + height - handleSize / 2,
        handleSize,
        handleSize,
      );

      const dimensionsText = `${Math.round(width)} × ${Math.round(height)} px`;
      ctx.font = "14px monospace";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;

      const tooltipX = currentPos.x + 15;
      const tooltipY = currentPos.y - 10;

      ctx.strokeText(dimensionsText, tooltipX, tooltipY);
      ctx.fillText(dimensionsText, tooltipX, tooltipY);
    }

    if (!startPos) {
      const instructions =
        "Click and drag to select manga panels • ESC to cancel";
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;

      const textWidth = ctx.measureText(instructions).width;
      const textX = (canvas.width - textWidth) / 2;
      const textY = 40;

      ctx.strokeText(instructions, textX, textY);
      ctx.fillText(instructions, textX, textY);
    }
  }, [startPos, currentPos]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentPos({ x, y });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const minX = Math.min(startPos.x, x);
    const minY = Math.min(startPos.y, y);
    const maxX = Math.max(startPos.x, x);
    const maxY = Math.max(startPos.y, y);

    const width = maxX - minX;
    const height = maxY - minY;

    if (width > 50 && height > 50) {
      const selectedBounds = new DOMRect(minX, minY, width, height);
      onAreaSelected(selectedBounds);
    } else {
      onCancel();
    }

    setIsDrawing(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  const handleCanvasClick = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) {
      onCancel();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 999999,
        cursor: isDrawing ? "crosshair" : "crosshair",
      }}
    />
  );
};
