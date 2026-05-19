import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Layers, Activity, Columns } from "lucide-react";

type VisualizerMode = "bars" | "ring" | "mirror" | "oscilloscope";

interface PulseTheme {
  name: string;
  barGradient: string[];
  peakColor: string;
  glowColor: string;
}

const FFT_BINS = 256;
const VISUAL_BARS = 64;
const POLL_INTERVAL = 33;
const BEAT_DURATION = 80;
const BEAT_COOLDOWN = 200;
const IDLE_TIMEOUT = 200;
const PEAK_DECAY = 0.992;
const CORNER_RADIUS = 4;
const BAR_GAP = 2;
const BAR_OPACITY = 0.9;
const GLOW_SPREAD = 8;

const THEMES: PulseTheme[] = [
  { name: "Neon Cyberpunk", barGradient: ["#ff00ff", "#00ffff"], peakColor: "#ffffff", glowColor: "#bf00ff" },
  { name: "Solar Flare", barGradient: ["#ff4500", "#ffdd00"], peakColor: "#ffffff", glowColor: "#ff6600" },
  { name: "Matrix Green", barGradient: ["#003300", "#00ff41"], peakColor: "#00ff41", glowColor: "#00cc33" },
  { name: "Arctic Ice", barGradient: ["#004466", "#aaeeff"], peakColor: "#ffffff", glowColor: "#00aaff" },
  { name: "Synthwave Dusk", barGradient: ["#6600ff", "#ff0066", "#ffaa00"], peakColor: "#ffaa00", glowColor: "#ff0066" },
];

function createBandCorrection(count: number): number[] {
  const TREBLE_EXPONENT = 0.8;
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1 || 1);
    return Math.pow(10, t * TREBLE_EXPONENT);
  });
}

function downsampleBands(source: number[], targetCount: number): number[] {
  const result = new Array(targetCount).fill(0);
  const binSize = source.length / targetCount;
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.floor((i + 1) * binSize);
    let sum = 0;
    for (let j = start; j < end; j++) sum += source[j] || 0;
    result[i] = (end > start) ? sum / (end - start) : 0;
  }
  return result;
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  data: number[],
  peaks: number[],
  width: number,
  height: number,
  glow: number,
  theme: PulseTheme,
) {
  const count = data.length;
  const barWidth = (width - (count - 1) * BAR_GAP) / count;

  ctx.shadowBlur = GLOW_SPREAD + glow;
  ctx.shadowColor = theme.glowColor;

  for (let i = 0; i < count; i++) {
    const val = data[i] || 0;
    if (val <= 0 && peaks[i] <= 0) continue;

    const barHeight = val * height;
    const x = i * (barWidth + BAR_GAP);
    const y = height - barHeight;

    if (val > 0) {
      const gradient = ctx.createLinearGradient(x, height, x, y);
      const colors = theme.barGradient;
      if (colors.length === 3) {
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(0.5, colors[1]);
        gradient.addColorStop(1, colors[2]);
      } else {
        colors.forEach((c, idx) => gradient.addColorStop(idx / (colors.length - 1), c));
      }

      ctx.fillStyle = gradient;
      ctx.globalAlpha = BAR_OPACITY;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === "function") {
        (ctx as any).roundRect(x, y, barWidth, barHeight, [CORNER_RADIUS, CORNER_RADIUS, 0, 0]);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    }

    if (peaks[i] > 0) {
      const peakY = height - (peaks[i] * height);
      const prevShadow = ctx.shadowBlur;
      ctx.shadowBlur = 0;
      ctx.fillStyle = theme.peakColor;
      ctx.globalAlpha = 1;
      ctx.fillRect(x, peakY - 2, barWidth, 2);
      ctx.shadowBlur = prevShadow;
    }
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawMirrorBars(
  ctx: CanvasRenderingContext2D,
  data: number[],
  peaks: number[],
  width: number,
  height: number,
  glow: number,
  theme: PulseTheme,
) {
  const centerX = width / 2;
  const halfWidth = centerX;
  const count = data.length;
  const gap = BAR_GAP / 2;

  const doRender = (startX: number, availW: number) => {
    const bw = (availW - (count - 1) * gap) / count;
    ctx.shadowBlur = GLOW_SPREAD + glow;
    ctx.shadowColor = theme.glowColor;

    for (let i = 0; i < count; i++) {
      const val = data[i] || 0;
      if (val <= 0 && peaks[i] <= 0) continue;

      const barHeight = val * height;
      const x = startX + i * (bw + gap);
      const y = height - barHeight;

      if (val > 0) {
        const gradient = ctx.createLinearGradient(x, height, x, y);
        const colors = theme.barGradient;
        if (colors.length === 3) {
          gradient.addColorStop(0, colors[0]);
          gradient.addColorStop(0.5, colors[1]);
          gradient.addColorStop(1, colors[2]);
        } else {
          colors.forEach((c, idx) => gradient.addColorStop(idx / (colors.length - 1), c));
        }
        ctx.fillStyle = gradient;
        ctx.globalAlpha = BAR_OPACITY;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") {
          (ctx as any).roundRect(x, y, bw, barHeight, [CORNER_RADIUS, CORNER_RADIUS, 0, 0]);
        } else {
          ctx.rect(x, y, bw, barHeight);
        }
        ctx.fill();
      }

      if (peaks[i] > 0) {
        const peakY = height - (peaks[i] * height);
        const prevShadow = ctx.shadowBlur;
        ctx.shadowBlur = 0;
        ctx.fillStyle = theme.peakColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(x, peakY - 2, bw, 2);
        ctx.shadowBlur = prevShadow;
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  };

  ctx.save();
  ctx.translate(centerX, 0);
  doRender(0, halfWidth);
  ctx.restore();

  ctx.save();
  ctx.translate(centerX, 0);
  ctx.scale(-1, 1);
  doRender(0, halfWidth);
  ctx.restore();
}

function drawOscilloscope(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  glow: number,
  theme: PulseTheme,
) {
  const count = data.length;
  if (count < 2) return;
  const step = width / (count - 1);

  ctx.save();
  ctx.shadowBlur = GLOW_SPREAD + glow;
  ctx.shadowColor = theme.glowColor;
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.barGradient[theme.barGradient.length - 1];

  for (let i = 0; i < count; i++) {
    const x = i * step;
    const y = height - (data[i] * height * 0.8) - (height * 0.1);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevX = (i - 1) * step;
      const prevY = height - (data[i - 1] * height * 0.8) - (height * 0.1);
      const midX = (prevX + x) / 2;
      const midY = (prevY + y) / 2;
      ctx.quadraticCurveTo(prevX, prevY, midX, midY);
    }
  }
  ctx.stroke();
  ctx.restore();
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

function renderFrame(
  ctx: CanvasRenderingContext2D,
  _data: number[],
  peaks: number[],
  width: number,
  height: number,
  mode: VisualizerMode,
  phase: number,
  glow: number,
  theme: PulseTheme,
) {
  ctx.clearRect(0, 0, width, height);

  const hasData = _data.some(v => v > 0.01);

  if (hasData) {
    switch (mode) {
      case "bars":
        drawBars(ctx, _data, peaks, width, height, glow, theme);
        break;
      case "mirror":
        drawMirrorBars(ctx, _data, peaks, width, height, glow, theme);
        break;
      case "oscilloscope":
        drawOscilloscope(ctx, _data, width, height, glow, theme);
        break;
      case "ring":
        drawRing(ctx, _data, width, height);
        break;
    }
  } else {
    drawIdle(ctx, width, height, phase);
  }
}

function updateAnimationStep(
  displayed: number[],
  targets: number[],
  peaks: number[],
  decayFactor: number,
  isIdle: boolean,
) {
  const count = displayed.length;
  for (let i = 0; i < count; i++) {
    const target = isIdle ? 0 : (targets[i] || 0);
    if (target > displayed[i]) {
      displayed[i] = target;
    } else {
      displayed[i] = displayed[i] * decayFactor + target * (1 - decayFactor);
    }

    if (displayed[i] > peaks[i]) {
      peaks[i] = displayed[i];
    } else {
      peaks[i] *= PEAK_DECAY;
    }

    if (displayed[i] < 0.001) displayed[i] = 0;
    if (peaks[i] < 0.001) peaks[i] = 0;
  }
}

interface VisualizerModuleProps {
  isPlaying: boolean;
  isPaused: boolean;
}

export const VisualizerModule = ({ isPlaying, isPaused }: VisualizerModuleProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<VisualizerMode>("bars");
  const [themeIndex, setThemeIndex] = useState(0);
  const [showControls, setShowControls] = useState(false);

  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  isPlayingRef.current = isPlaying;
  isPausedRef.current = isPaused;

  const fftDataRef = useRef<number[]>(new Array(FFT_BINS).fill(0));
  const displayedBandsRef = useRef<number[]>(new Array(VISUAL_BARS).fill(0));
  const targetBandsRef = useRef<number[]>(new Array(VISUAL_BARS).fill(0));
  const peaksRef = useRef<number[]>(new Array(VISUAL_BARS).fill(0));
  const bandCorrectionRef = useRef<number[]>(createBandCorrection(FFT_BINS));
  const idlePhaseRef = useRef(0);
  const animationIdRef = useRef(0);
  const pollIdRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const lastBeatRef = useRef(0);
  const isBeatRef = useRef(false);
  const sensitivityRef = useRef(1.0);
  const decayFactorRef = useRef(0.92);
  const beatThresholdRef = useRef(0.7);

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
        const raw = await invoke<number[]>("get_fft_data");
        fftDataRef.current = raw;

        if (!isPlayingRef.current || isPausedRef.current) {
          displayedBandsRef.current.fill(0);
          targetBandsRef.current.fill(0);
          peaksRef.current.fill(0);
          isBeatRef.current = false;
          return;
        }

        lastUpdateRef.current = Date.now();

        const sensitivity = sensitivityRef.current;
        const correction = bandCorrectionRef.current;
        const corrected = new Array(FFT_BINS);
        for (let i = 0; i < FFT_BINS; i++) {
          corrected[i] = Math.min(Math.max((raw[i] || 0) * sensitivity * (correction[i] || 1), 0), 1);
        }

        targetBandsRef.current = downsampleBands(corrected, VISUAL_BARS);

        if (raw.length >= 2) {
          const now = Date.now();
          if (now - lastBeatRef.current > BEAT_COOLDOWN) {
            const bassAvg = (raw[0] + Math.min(raw[1], raw[2])) / 2;
            if (bassAvg > beatThresholdRef.current) {
              lastBeatRef.current = now;
              isBeatRef.current = true;
              setTimeout(() => { isBeatRef.current = false; }, BEAT_DURATION);
            }
          }
        }
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
      const cssW = Math.floor(w / dpr);
      const cssH = Math.floor(h / dpr);
      const isIdle = (Date.now() - lastUpdateRef.current) > IDLE_TIMEOUT;

      updateAnimationStep(
        displayedBandsRef.current,
        targetBandsRef.current,
        peaksRef.current,
        decayFactorRef.current,
        isIdle,
      );

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const glow = isBeatRef.current ? 25 : 12;
      renderFrame(
        ctx,
        displayedBandsRef.current,
        peaksRef.current,
        cssW, cssH,
        mode,
        idlePhaseRef.current,
        glow,
        THEMES[themeIndex],
      );

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
  }, [mode, themeIndex]);

  const cycleTheme = () => setThemeIndex(i => (i + 1) % THEMES.length);

  const modeIcons: Record<VisualizerMode, React.ReactNode> = {
    bars: <Sparkles size={14} />,
    ring: <Layers size={14} />,
    mirror: <Columns size={14} />,
    oscilloscope: <Activity size={14} />,
  };

  const modes: VisualizerMode[] = ["bars", "mirror", "oscilloscope", "ring"];

  return (
    <div className="bento-module visualizer-module">
      <div className="visualizer-header">
        <div className="visualizer-title-row">
          <p className="module-label">SPECTRUM ANALYZER</p>
          <button
            className="btn-theme-cycler"
            onClick={cycleTheme}
            title={`Motyw: ${THEMES[themeIndex].name}`}
          >
            <span className="theme-dot" style={{ background: THEMES[themeIndex].glowColor }} />
          </button>
        </div>
        <div className="visualizer-mode-row">
          {modes.map(m => (
            <button
              key={m}
              className={`btn-mode-icon ${m === mode ? "active" : ""}`}
              onClick={() => setMode(m)}
              title={m.charAt(0).toUpperCase() + m.slice(1)}
            >
              {modeIcons[m]}
            </button>
          ))}
          <button
            className="btn-mode-icon btn-settings-toggle"
            onClick={() => setShowControls(s => !s)}
            title="Ustawienia"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        </div>
      </div>

      {showControls && (
        <div className="visualizer-controls">
          <div className="control-item">
            <label className="control-label">Czułość</label>
            <input
              type="range"
              min="0.2"
              max="3.0"
              step="0.1"
              defaultValue="1.0"
              className="control-slider"
              onChange={e => { sensitivityRef.current = parseFloat(e.target.value); }}
            />
          </div>
          <div className="control-item">
            <label className="control-label">Grawitacja</label>
            <input
              type="range"
              min="0.80"
              max="0.99"
              step="0.01"
              defaultValue="0.92"
              className="control-slider"
              onChange={e => { decayFactorRef.current = parseFloat(e.target.value); }}
            />
          </div>
          <div className="control-item">
            <label className="control-label">Bas</label>
            <input
              type="range"
              min="0.3"
              max="1.5"
              step="0.05"
              defaultValue="0.7"
              className="control-slider"
              onChange={e => { beatThresholdRef.current = parseFloat(e.target.value); }}
            />
          </div>
        </div>
      )}

      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="visualizer-canvas"
        />
      </div>
    </div>
  );
};
