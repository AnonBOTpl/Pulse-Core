import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Layers } from "lucide-react";

type VisualizerMode = "bars" | "ring";

export const VisualizerModule = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<VisualizerMode>("bars");
  const requestRef = useRef<number>(0);
  const peaksRef = useRef<number[]>(new Array(256).fill(0));
  const isComponentMounted = useRef(true);
  const idleAnimRef = useRef(0);

  const drawBars = (ctx: CanvasRenderingContext2D, data: number[], width: number, height: number) => {
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

        if (barHeight > peaksRef.current[i]) {
            peaksRef.current[i] = barHeight;
        } else {
            peaksRef.current[i] -= 1.0;
        }
        if (peaksRef.current[i] < 0) peaksRef.current[i] = 0;

        const x = i * (barWidth + gap);
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        ctx.fillStyle = "#fff";
        ctx.fillRect(x, height - peaksRef.current[i] - 2, barWidth, 2);
        ctx.fillStyle = gradient;
    }
  };

  const drawRing = (ctx: CanvasRenderingContext2D, data: number[], width: number, height: number) => {
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
  };

  const drawIdle = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    idleAnimRef.current += 0.05;
    const centerX = width / 2;
    const centerY = height / 2;
    const pulse = Math.sin(idleAnimRef.current) * 10;

    ctx.strokeStyle = "rgba(0, 242, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(0, 242, 255, 0.2)";

    // Rysujemy delikatną linię bazową (neonowy horyzont)
    ctx.beginPath();
    ctx.moveTo(width * 0.1, centerY);
    for (let x = width * 0.1; x < width * 0.9; x += 10) {
        const y = centerY + Math.sin(x * 0.05 + idleAnimRef.current) * (2 + pulse * 0.2);
        ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Delikatny zarys pierścienia w trybie ring
    if (mode === "ring") {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (Math.min(width, height) * 0.25) + pulse * 0.1, 0, Math.PI * 2);
        ctx.stroke();
    }
  };

  useEffect(() => {
    isComponentMounted.current = true;

    const animate = async () => {
        if (!isComponentMounted.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, rect.width, rect.height);

        try {
            const fftData = await invoke<number[]>("get_fft_data");
            const hasData = fftData.some(v => v > 0);

            if (hasData) {
                if (mode === "bars") {
                    drawBars(ctx, fftData, rect.width, rect.height);
                } else {
                    drawRing(ctx, fftData, rect.width, rect.height);
                }
            } else {
                drawIdle(ctx, rect.width, rect.height);
            }
        } catch (e) {
            drawIdle(ctx, rect.width, rect.height);
        }

        ctx.restore();
        requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
        isComponentMounted.current = false;
        cancelAnimationFrame(requestRef.current);
    };
  }, [mode]);

  return (
    <div className="bento-module visualizer-module">
      <div className="visualizer-header">
        <p className="module-label">SPECTRUM ANALYZER</p>
        <button
          className="btn-mode-toggle"
          onClick={() => setMode(m => m === "bars" ? "ring" : "bars")}
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
