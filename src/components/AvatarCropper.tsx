"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Drag-to-position + slider-to-zoom circle cropper.
 * Output: 256x256 PNG blob of the circular crop.
 *
 * Pure-React, no extra deps. Canvas-based.
 */

interface Props {
  src: string;          // image data URL or http URL
  filename: string;
  onCropped: (blob: Blob, dataUrl: string) => void;
  onCancel: () => void;
}

const STAGE = 320;
const OUT = 256;

export function AvatarCropper({ src, filename, onCropped, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [drag, setDrag] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Initial cover-fit: scale so the SHORTER dimension fills the stage.
  // That way the entire stage is covered by image and the user pans/zooms in.
  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    setNatural({ w, h });
    const cover = Math.max(STAGE / w, STAGE / h);
    setMinScale(cover);
    setScale(cover);
    setPos({
      x: (STAGE - w * cover) / 2,
      y: (STAGE - h * cover) / 2,
    });
    setLoaded(true);
  }

  // Constrain pos so the image always covers the stage (no gaps inside the circle)
  function clampPos(p: { x: number; y: number }, w: number, h: number) {
    return {
      x: Math.min(0, Math.max(p.x, STAGE - w)),
      y: Math.min(0, Math.max(p.y, STAGE - h)),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setDrag({ startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag || !natural) return;
    const w = natural.w * scale;
    const h = natural.h * scale;
    setPos(clampPos({
      x: drag.origX + (e.clientX - drag.startX),
      y: drag.origY + (e.clientY - drag.startY),
    }, w, h));
  }
  function onMouseUp() { setDrag(null); }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    setDrag({ startX: t.clientX, startY: t.clientY, origX: pos.x, origY: pos.y });
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!drag || !natural || e.touches.length !== 1) return;
    const t = e.touches[0];
    const w = natural.w * scale;
    const h = natural.h * scale;
    setPos(clampPos({
      x: drag.origX + (t.clientX - drag.startX),
      y: drag.origY + (t.clientY - drag.startY),
    }, w, h));
  }

  // Re-clamp when scale changes
  useEffect(() => {
    if (!natural) return;
    const w = natural.w * scale;
    const h = natural.h * scale;
    setPos((p) => clampPos(p, w, h));
  }, [scale, natural]);

  async function crop() {
    if (!natural) return;
    setBusy(true);
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) { setBusy(false); return; }

    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setBusy(false); return; }

    // The visible stage shows image pixels starting at (-pos.x/scale, -pos.y/scale)
    // spanning STAGE/scale image-pixels in each direction.
    const sx = -pos.x / scale;
    const sy = -pos.y / scale;
    const sSize = STAGE / scale;

    // White fill in case of transparent source
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT, OUT);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    ctx.restore();

    canvas.toBlob(async (blob) => {
      if (!blob) { setBusy(false); return; }
      const dataUrl = canvas.toDataURL("image/png");
      onCropped(blob, dataUrl);
      setBusy(false);
    }, "image/png", 0.95);
  }

  return (
    <>
      <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={onCancel} />
      <div className="fixed inset-0 z-40 flex items-center justify-center p-6 pointer-events-none">
        <div className="card max-w-md p-6 pointer-events-auto animate-slideUp">
          <h2 className="h-section">Crop your photo</h2>
          <p className="text-sm text-ink-muted mt-1 mb-4">
            Drag to position. Use the slider to zoom. The circle is what we'll save.
          </p>

          <div
            className="relative mx-auto bg-brand-navy rounded-brand overflow-hidden touch-none select-none"
            style={{ width: STAGE, height: STAGE, cursor: drag ? "grabbing" : "grab" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onMouseUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt={filename}
              onLoad={onImgLoad}
              draggable={false}
              style={{
                position: "absolute",
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: natural ? `${natural.w * scale}px` : "100%",
                height: natural ? `${natural.h * scale}px` : "100%",
                maxWidth: "none",
                maxHeight: "none",
                objectFit: "contain",
                pointerEvents: "none",
                visibility: loaded ? "visible" : "hidden",
              }}
            />
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-white/85 text-sm">
                Loading image…
              </div>
            )}
            {/* Circle mask overlay */}
            <svg width={STAGE} height={STAGE} className="absolute inset-0 pointer-events-none">
              <defs>
                <mask id="hole">
                  <rect width={STAGE} height={STAGE} fill="white" />
                  <circle cx={STAGE / 2} cy={STAGE / 2} r={STAGE / 2 - 4} fill="black" />
                </mask>
              </defs>
              <rect width={STAGE} height={STAGE} fill="rgba(11, 31, 58, 0.55)" mask="url(#hole)" />
              <circle cx={STAGE / 2} cy={STAGE / 2} r={STAGE / 2 - 4} stroke="#FF6A1A" strokeWidth="2" fill="none" />
            </svg>
          </div>

          <div className="mt-4">
            <label className="label">Zoom</label>
            <input
              type="range"
              min={minScale}
              max={Math.max(minScale * 4, 4)}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full"
              disabled={!loaded}
            />
            <div className="meta mt-1">Slide right to zoom in. Drag the image to recenter.</div>
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-2 mt-4">
            <button onClick={crop} disabled={busy || !loaded} className="btn-primary">
              {busy ? "Cropping…" : "Use this crop"}
            </button>
            <button onClick={onCancel} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}
