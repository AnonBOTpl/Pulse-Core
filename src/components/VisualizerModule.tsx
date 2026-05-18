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
        const barHeight = value * height * 1.5; // Zwiększone wzmocnienie dla lepszego efektu

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
            // Sprawdź czy dane nie są same zera (cisza)
            const hasData = fftData.some(v => v > 0);

            if (hasData) {
                if (mode === "bars") {
                    drawBars(ctx, fftData, rect.width, rect.height);
                } else {
                    drawRing(ctx, fftData, rect.width, rect.height);
                }
            } else {
                // Jeśli cisza, możemy narysować coś statycznego lub zostawić czyste
            }
        } catch (e) {
            // Ciche logowanie błędów FFT, aby nie zaśmiecać konsoli przy zmianach utworów
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
