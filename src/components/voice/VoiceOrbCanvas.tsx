import React, { useRef, useEffect } from 'react';

export type LiveVoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'muted'
  | 'error'
  | 'ended';

interface VoiceOrbCanvasProps {
  status: LiveVoiceState;
  volume: number; // 0 to 1, real microphone audio volume
  frequencyData: Uint8Array | null; // real frequency bins
  aiSpeakingPower?: number; // 0 to 1, real AI speech amplitude
  size?: number;
}

interface Particle {
  x: number;
  y: number;
  baseRadius: number;
  angle: number;
  speed: number;
  orbitRadius: number;
  size: number;
  alpha: number;
}

export const VoiceOrbCanvas: React.FC<VoiceOrbCanvasProps> = ({
  status,
  volume,
  frequencyData,
  aiSpeakingPower = 0,
  size = 320,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep references to latest dynamic inputs without retriggering effect
  const stateRef = useRef({ status, volume, frequencyData, aiSpeakingPower });
  useEffect(() => {
    stateRef.current = { status, volume, frequencyData, aiSpeakingPower };
  }, [status, volume, frequencyData, aiSpeakingPower]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    // Responsive High-DPI Canvas Setup
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Initialize Orbital Particles
    const particleCount = 32;
    const particles: Particle[] = Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * Math.PI * 2;
      return {
        x: 0,
        y: 0,
        baseRadius: 65 + Math.random() * 45,
        angle,
        speed: (Math.random() * 0.008 + 0.004) * (i % 2 === 0 ? 1 : -1),
        orbitRadius: 70 + Math.random() * 50,
        size: Math.random() * 2.2 + 1,
        alpha: Math.random() * 0.5 + 0.25,
      };
    });

    // Smooth state interpolated values
    let smoothedEnergy = 0;
    let rotation = 0;

    const render = () => {
      const current = stateRef.current;
      time += 0.025;

      // Determine active dynamic power
      let activePower = 0;
      if (current.status === 'listening') {
        // Direct real mic volume
        activePower = Math.min(1, current.volume * 2.2);
      } else if (current.status === 'speaking') {
        // AI speech audio power
        activePower = Math.min(1, (current.aiSpeakingPower || 0) * 1.6);
      } else if (current.status === 'processing') {
        // Swirling processing rhythm
        activePower = 0.28 + Math.sin(time * 3) * 0.12;
      } else if (current.status === 'connecting') {
        activePower = 0.15 + Math.sin(time * 2) * 0.08;
      } else if (current.status === 'muted') {
        activePower = 0.02;
      } else if (current.status === 'error') {
        activePower = 0.08;
      }

      // Smooth interpolation for jitter-free 60fps movement
      smoothedEnergy += (activePower - smoothedEnergy) * 0.15;

      // Color scheme based on authentic status
      let primaryColor = { r: 16, g: 185, b: 129 }; // Emerald default
      let secondaryColor = { r: 52, g: 211, b: 153 };
      let ambientColor = { r: 6, g: 182, b: 212 }; // Cyan touch

      if (current.status === 'processing') {
        // Amber-emerald thinking state
        primaryColor = { r: 245, g: 158, b: 11 };
        secondaryColor = { r: 217, g: 119, b: 6 };
        ambientColor = { r: 16, g: 185, b: 129 };
        rotation += 0.035; // Accelerate swirl during processing
      } else if (current.status === 'speaking') {
        // Luminous vibrant emerald-cyan for JEXA speaking
        primaryColor = { r: 20, g: 210, b: 150 };
        secondaryColor = { r: 56, g: 189, b: 248 };
        ambientColor = { r: 45, g: 212, b: 191 };
        rotation += 0.012;
      } else if (current.status === 'muted') {
        primaryColor = { r: 100, g: 116, b: 139 };
        secondaryColor = { r: 71, g: 85, b: 105 };
        ambientColor = { r: 51, g: 65, b: 85 };
        rotation += 0.003;
      } else if (current.status === 'error') {
        primaryColor = { r: 244, g: 63, b: 94 };
        secondaryColor = { r: 225, g: 29, b: 72 };
        ambientColor = { r: 251, g: 113, b: 133 };
        rotation += 0.005;
      } else {
        // Listening / Connecting: subtle steady rotation
        rotation += 0.008;
      }

      // Clear frame
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;

      // 1. Soft Ambient Background Bloom
      const ambientRadius = 80 + smoothedEnergy * 45;
      const ambientGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ambientRadius);
      ambientGrad.addColorStop(
        0,
        `rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, ${0.16 + smoothedEnergy * 0.2})`
      );
      ambientGrad.addColorStop(
        0.5,
        `rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, ${0.08 + smoothedEnergy * 0.12})`
      );
      ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = ambientGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, ambientRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Outer Ethereal Resonance Rings (Audio Reactive Waveforms)
      const ringCount = 3;
      for (let r = 0; r < ringCount; r++) {
        const ringBase = 58 + r * 16 + smoothedEnergy * (18 + r * 10);
        const points = 36;
        const waveScale = smoothedEnergy * (12 + r * 6);

        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          // Harmonic wave equation based on time and audio frequency
          const harmonic1 = Math.sin(angle * (3 + r) + time * (1.5 + r * 0.5));
          const harmonic2 = Math.cos(angle * (5 - r) - time * 2);
          const offset = (harmonic1 * 0.6 + harmonic2 * 0.4) * waveScale;
          const rad = ringBase + offset;

          const px = cx + Math.cos(angle + rotation) * rad;
          const py = cy + Math.sin(angle + rotation) * rad;

          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();

        const ringAlpha = (0.28 - r * 0.07) * (0.6 + smoothedEnergy * 0.7);
        ctx.strokeStyle = `rgba(${secondaryColor.r}, ${secondaryColor.g}, ${secondaryColor.b}, ${ringAlpha})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 3. Floating Starlight Orbital Particles
      particles.forEach((p) => {
        p.angle += p.speed;
        const currentOrbit = p.orbitRadius + smoothedEnergy * 28;
        const px = cx + Math.cos(p.angle) * currentOrbit;
        const py = cy + Math.sin(p.angle) * currentOrbit;

        ctx.fillStyle = `rgba(${secondaryColor.r}, ${secondaryColor.g}, ${secondaryColor.b}, ${
          p.alpha * (0.5 + smoothedEnergy * 0.8)
        })`;
        ctx.beginPath();
        ctx.arc(px, py, p.size * (1 + smoothedEnergy * 0.6), 0, Math.PI * 2);
        ctx.fill();
      });

      // 4. Central Living Fluid Energy Orb
      const baseCoreRadius = 46 + smoothedEnergy * 24;
      const corePoints = 48;

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= corePoints; i++) {
        const angle = (i / corePoints) * Math.PI * 2;
        // Natural fluid surface tension calculation
        const wave =
          Math.sin(angle * 4 + time * 2.2) * (3 + smoothedEnergy * 9) +
          Math.cos(angle * 6 - time * 1.8) * (2 + smoothedEnergy * 6);
        const rad = baseCoreRadius + wave;

        const px = cx + Math.cos(angle + rotation * 0.8) * rad;
        const py = cy + Math.sin(angle + rotation * 0.8) * rad;

        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();

      // Fluid Core Multi-stop Gradient
      const coreGrad = ctx.createRadialGradient(
        cx - 6,
        cy - 6,
        2,
        cx,
        cy,
        baseCoreRadius + 14
      );
      coreGrad.addColorStop(
        0,
        `rgba(255, 255, 255, ${0.9 + smoothedEnergy * 0.1})`
      );
      coreGrad.addColorStop(
        0.25,
        `rgba(${secondaryColor.r}, ${secondaryColor.g}, ${secondaryColor.b}, ${0.85 + smoothedEnergy * 0.15})`
      );
      coreGrad.addColorStop(
        0.7,
        `rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, 0.7)`
      );
      coreGrad.addColorStop(
        1,
        `rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.1)`
      );

      ctx.fillStyle = coreGrad;
      ctx.shadowColor = `rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, ${0.4 + smoothedEnergy * 0.4})`;
      ctx.shadowBlur = 18 + smoothedEnergy * 16;
      ctx.fill();
      ctx.restore();

      // 5. Central Specular Highlight (Organic Depth)
      ctx.beginPath();
      const highlightRadius = baseCoreRadius * 0.38;
      const hx = cx - baseCoreRadius * 0.28;
      const hy = cy - baseCoreRadius * 0.28;
      ctx.arc(hx, hy, highlightRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.45 + smoothedEnergy * 0.25})`;
      ctx.fill();

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [size]);

  return (
    <div
      className="relative flex items-center justify-center mx-auto select-none pointer-events-none"
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="block"
      />
    </div>
  );
};
