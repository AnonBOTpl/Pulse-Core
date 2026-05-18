import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Layers } from "lucide-react";

type VisualizerMode = "bars" | "ring";

export const VisualizerModule = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<VisualizerMode>("bars");
  const requestRef = useRef<number>(0);
  const peaksRef = useRef<number[]>(new Array(256).fill(0));

  const drawBars = (ctx: CanvasRenderingContext2D, data: number[], width: number, height: number) => {
    const barsCount = 64;
    const gap = 2;
    const barWidth = (width / barsCount) - gap;

    // Gradient: Cyjan -> Fiolet -> Róż
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, "#00f2ff");
    gradient.addColorStop(0.5, "#bc00ff");
    gradient.addColorStop(1, "#ff0095");

    ctx.fillStyle = gradient;
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(0, 242, 255, 0.5)";

    // Rysujemy tylko 64 słupki dla czytelności (z 256 pasm)
    for (let i = 0; i < 64; i++) {
        const value = data[i] || 0;
        const barHeight = value * height * 1.2;

        // Peak hold logic
        if (barHeight > peaksRef.current[i]) {
            peaksRef.current[i] = barHeight;
        } else {
            peaksRef.current[i] -= 1.5; // Opadanie szczytów
        }
        if (peaksRef.current[i] < 0) peaksRef.current[i] = 0;

        const x = i * (barWidth + gap);

        // Słupek główny
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        // Kreska szczytowa
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, height - peaksRef.current[i] - 2, barWidth, 2);
        ctx.fillStyle = gradient;
    }
  };

  const drawRing = (ctx: CanvasRenderingContext2D, data: number[], width: number, height: number) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) * 0.2;

    // Bas (pierwsze kilka pasm) powoduje pulsowanie
    const bass = (data[0] + data[1] + data[2]) / 3;
    const pulseRadius = baseRadius + (bass * 30);

    ctx.strokeStyle = "#00f2ff";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#00f2ff";

    const bars = 80;
    for (let i = 0; i < bars; i++) {
        const value = data[i % 32] || 0;
        const angle = (i / bars) * Math.PI * 2;
        const barLen = value * 60;

        const xStart = centerX + Math.cos(angle) * pulseRadius;
        const yStart = centerY + Math.sin(angle) * pulseRadius;
        const xEnd = centerX + Math.cos(angle) * (pulseRadius + barLen);
        const yEnd = centerY + Math.sin(angle) * (pulseRadius + barLen);

        // Gradient koloru promieni
        const hue = (i / bars) * 360;
        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.8)`;

        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();
    }

    // Środkowy pierścień
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  };

  const animate = async () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    // Optymalizacja rozmiaru canvasu do rzeczywistych wymiarów kontenera
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    try {
        const fftData = await invoke<number[]>("get_fft_data");

        ctx.clearRect(0, 0, rect.width, rect.height);

        if (mode === "bars") {
            drawBars(ctx, fftData, rect.width, rect.height);
        } else {
            drawRing(ctx, fftData, rect.width, rect.height);
        }
    } catch (e) {
        console.error("FFT fetch error:", e);
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
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
          width={400}
          height={300}
          className="visualizer-canvas"
        />
      </div>
    </div>
  );
};
