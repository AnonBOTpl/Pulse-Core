import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Layers } from "lucide-react";

type VisualizerMode = "bars" | "ring";

const FFT_BINS = 256;
const POLL_INTERVAL = 33; // ~30 fps polling

function drawBars(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  peaks: number[],
) {
  const barsCount = 64;
  const gap = 2;
  const barWidth = (width / barsCount) - gap;

  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, "#00f2ff");
  gradient.addColorStop(0.5, "#bc00ff");
  gradient.addColorStop(1, "#ff0095");

  ctx.fillStyle = gradient;
  ctx.shadowBlur = 15;
  ctx.shadowColor = "rgba(0, 242, 255, 0.5)";

  for (let i = 0; i < barsCount; i++) {
    const value = data[i] || 0;
    const barHeight = value * height * 1.5;

    if (barHeight > peaks[i]) {
      peaks[i] = barHeight;
    } else {
      peaks[i] -= 1.0;
    }
    if (peaks[i] < 0) peaks[i] = 0;

    const x = i * (barWidth + gap);
    ctx.fillRect(x, height - barHeight, barWidth, barHeight);

    ctx.fillStyle = "#fff";
    ctx.fillRect(x, height - peaks[i] - 2, barWidth, 2);
    ctx.fillStyle = gradient;
  }
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.25;

  const bass = (data[0] + data[1] + data[2] + data[3]) / 4;
  const pulseRadius = baseRadius + (bass * 40);

  ctx.shadowBlur = 20;
  ctx.shadowColor = "#00f2ff";

  const bars = 80;
  for (let i = 0; i < bars; i++) {
    const value = data[i % 48] || 0;
    const angle = (i / bars) * Math.PI * 2;
    const barLen = value * 80;

    const xStart = centerX + Math.cos(angle) * pulseRadius;
    const yStart = centerY + Math.sin(angle) * pulseRadius;
    const xEnd = centerX + Math.cos(angle) * (pulseRadius + barLen);
    const yEnd = centerY + Math.sin(angle) * (pulseRadius + barLen);

    const hue = (i / bars) * 360;
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.8)`;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(xStart, yStart);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawIdle(ctx: CanvasRenderingContext2D, width: number, height: number, phase: number) {
  const centerY = height / 2;
  const pulse = Math.sin(phase) * 10;

  ctx.strokeStyle = "rgba(0, 242, 255, 0.3)";
  ctx.lineWidth = 1;
  ctx.shadowBlur = 10;
  ctx.shadowColor = "rgba(0, 242, 255, 0.2)";

  ctx.beginPath();
  ctx.moveTo(width * 0.1, centerY);
  for (let x = width * 0.1; x < width * 0.9; x += 10) {
    const y = centerY + Math.sin(x * 0.05 + phase) * (2 + pulse * 0.2);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function draw(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  mode: VisualizerMode,
  peaks: number[],
  phase: number,
) {
  ctx.clearRect(0, 0, width, height);

  const hasData = data.some(v => v > 0);

  if (hasData) {
    if (mode === "bars") {
      drawBars(ctx, data, width, height, peaks);
    } else {
      drawRing(ctx, data, width, height);
    }
  } else {
    drawIdle(ctx, width, height, phase);
  }
}

export const VisualizerModule = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<VisualizerMode>("bars");

  const fftDataRef = useRef<number[]>(new Array(FFT_BINS).fill(0));
  const peaksRef = useRef<number[]>(new Array(64).fill(0));
  const idlePhaseRef = useRef(0);
  const animationIdRef = useRef(0);
  const pollIdRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    sizeCanvas();

    const resizeObserver = new ResizeObserver(() => sizeCanvas());
    resizeObserver.observe(canvas.parentElement || canvas);

    pollIdRef.current = window.setInterval(async () => {
      try {
        fftDataRef.current = await invoke<number[]>("get_fft_data");
      } catch {
        // ignore
      }
    }, POLL_INTERVAL);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) {
        animationIdRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, fftDataRef.current, Math.floor(w / dpr), Math.floor(h / dpr), mode, peaksRef.current, idlePhaseRef.current);
      ctx.restore();

      idlePhaseRef.current += 0.05;
      animationIdRef.current = requestAnimationFrame(render);
    };

    animationIdRef.current = requestAnimationFrame(render);

    return () => {
      resizeObserver.disconnect();
      clearInterval(pollIdRef.current);
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [mode]);

  return (
    <div className="bento-module visualizer-module">
      <div className="visualizer-header">
        <p className="module-label">SPECTRUM ANALYZER</p>
        <button
          className="btn-mode-toggle"
          onClick={() => setMode(m => (m === "bars" ? "ring" : "bars"))}
          title="Przełącz tryb wizualizacji"
        >
          {mode === "bars" ? <Sparkles size={16} /> : <Layers size={16} />}
        </button>
      </div>

      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="visualizer-canvas"
        />
      </div>
    </div>
  );
};
