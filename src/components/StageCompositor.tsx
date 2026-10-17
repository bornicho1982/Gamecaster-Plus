import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  StageSource,
  Scene,
  TransitionId,
  WhiteboardTool,
  WhiteboardStroke,
} from "../types/broadcaster";
import {
  MousePointer,
  PenTool,
  Highlighter,
  ArrowUpRight,
  Square,
  Circle as CircleIcon,
  Sparkles,
  Trash2,
  Undo2,
  Grid,
  ArrowRightLeft,
  Settings,
  Lock,
} from "lucide-react";

interface StageCompositorProps {
  activeScene: Scene;
  previewScene: Scene;
  studioMode: boolean;
  isPortraitCanvas: boolean;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  selectedSourceId: string | null;
  onSelectSource: (id: string | null) => void;
  onUpdateSource: (sceneId: string, updated: StageSource) => void;
  onOpenSourceProperties: (source: StageSource, sceneId: string) => void;
  onPushLive: () => void;
  activeTransition: TransitionId;
  transitionDurationMs: number;
  transitionTriggerCount: number;
  desktopFrameDataUrl: string | null;
  windowFramesMap: Record<number, string>;
  pgmCanvasRef: React.RefObject<HTMLCanvasElement>;
}

type HandlePosition = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface DragState {
  sceneId: string;
  sourceId: string;
  mode: "move" | "resize" | "crop" | "rotate";
  handle?: HandlePosition;
  startMouseX: number;
  startMouseY: number;
  initialSource: StageSource;
}

export const StageCompositor: React.FC<StageCompositorProps> = ({
  activeScene,
  previewScene,
  studioMode,
  isPortraitCanvas,
  snapToGrid,
  onToggleSnapToGrid,
  selectedSourceId,
  onSelectSource,
  onUpdateSource,
  onOpenSourceProperties,
  onPushLive,
  activeTransition,
  transitionDurationMs,
  transitionTriggerCount,
  desktopFrameDataUrl,
  windowFramesMap,
  pgmCanvasRef,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chromaOffscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Media element caches
  const desktopImgRef = useRef<HTMLImageElement | null>(null);
  const windowImgsRef = useRef<Record<number, HTMLImageElement>>({});
  const customImgsRef = useRef<Record<string, HTMLImageElement>>({});
  const videoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const cameraVideosRef = useRef<Record<string, HTMLVideoElement>>({});
  const cameraStreamsRef = useRef<Record<string, MediaStream>>({});

  // Transition animation state
  const transitionStartRef = useRef<number>(0);
  const isTransitioningRef = useRef<boolean>(false);

  // Dragging / Resizing state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});

  // Whiteboard Telestrator state
  const [wbTool, setWbTool] = useState<WhiteboardTool>("select");
  const [wbColor, setWbColor] = useState<string>("#00F0FF");
  const [wbWidth, setWbWidth] = useState<number>(5);
  const [wbStrokes, setWbStrokes] = useState<WhiteboardStroke[]>([]);
  const activeStrokeRef = useRef<WhiteboardStroke | null>(null);

  const stageW = isPortraitCanvas ? 1080 : 1920;
  const stageH = isPortraitCanvas ? 1920 : 1080;

  // Keep desktop Image updated
  useEffect(() => {
    if (!desktopFrameDataUrl) return;
    if (!desktopImgRef.current) {
      desktopImgRef.current = new Image();
    }
    desktopImgRef.current.src = desktopFrameDataUrl;
  }, [desktopFrameDataUrl]);

  // Keep window Images updated
  useEffect(() => {
    Object.entries(windowFramesMap).forEach(([hwndStr, dataUrl]) => {
      const hwnd = Number(hwndStr);
      if (!windowImgsRef.current[hwnd]) {
        windowImgsRef.current[hwnd] = new Image();
      }
      windowImgsRef.current[hwnd].src = dataUrl;
    });
  }, [windowFramesMap]);

  // Manage camera & media video elements across active and preview scenes
  useEffect(() => {
    const allSources = [
      ...activeScene.sources,
      ...(studioMode ? previewScene.sources : []),
    ];

    allSources.forEach((src) => {
      if (src.type === "camera" && src.layout.visible) {
        const key = src.cameraDeviceId || "default_cam";
        if (!cameraVideosRef.current[key]) {
          const vid = document.createElement("video");
          vid.autoplay = true;
          vid.muted = true;
          vid.playsInline = true;
          cameraVideosRef.current[key] = vid;

          const constraints: MediaStreamConstraints = {
            video: src.cameraDeviceId
              ? { deviceId: { exact: src.cameraDeviceId }, width: 1280, height: 720 }
              : { width: 1280, height: 720 },
            audio: false,
          };

          navigator.mediaDevices
            ?.getUserMedia(constraints)
            .then((stream) => {
              cameraStreamsRef.current[key] = stream;
              vid.srcObject = stream;
              vid.play().catch(() => {});
            })
            .catch(() => {
              // Fallback if specific device constraint fails
              navigator.mediaDevices
                ?.getUserMedia({ video: true, audio: false })
                .then((stream) => {
                  cameraStreamsRef.current[key] = stream;
                  vid.srcObject = stream;
                  vid.play().catch(() => {});
                })
                .catch(() => {});
            });
        }
      } else if ((src.type === "media" || src.type === "replay") && src.mediaUrl) {
        const key = `${src.id}_${src.mediaUrl}`;
        if (!videoElementsRef.current[key]) {
          const vid = document.createElement("video");
          vid.src = src.mediaUrl;
          vid.loop = src.mediaLoop !== false;
          vid.muted = false;
          vid.playsInline = true;
          vid.autoplay = true;
          vid.play().catch(() => {
            vid.muted = true;
            vid.play().catch(() => {});
          });
          videoElementsRef.current[key] = vid;
        } else {
          videoElementsRef.current[key].loop = src.mediaLoop !== false;
        }
      } else if (src.type === "image" && src.mediaUrl) {
        const key = `${src.id}_${src.mediaUrl}`;
        if (!customImgsRef.current[key]) {
          const img = new Image();
          img.src = src.mediaUrl;
          customImgsRef.current[key] = img;
        }
      }
    });
  }, [activeScene, previewScene, studioMode]);

  // Cleanup camera streams on unmount
  useEffect(() => {
    return () => {
      Object.values(cameraStreamsRef.current).forEach((stream) => {
        stream.getTracks().forEach((t) => t.stop());
      });
    };
  }, []);

  // Trigger scene transition animation when transitionTriggerCount increments
  useEffect(() => {
    if (transitionTriggerCount <= 0) return;
    const pgmCanvas = pgmCanvasRef.current;
    if (!pgmCanvas) return;

    if (!snapshotCanvasRef.current) {
      snapshotCanvasRef.current = document.createElement("canvas");
    }
    const snap = snapshotCanvasRef.current;
    snap.width = stageW;
    snap.height = stageH;
    const sctx = snap.getContext("2d");
    if (sctx) {
      sctx.drawImage(pgmCanvas, 0, 0, stageW, stageH);
      transitionStartRef.current = performance.now();
      isTransitioningRef.current = true;
    }
  }, [transitionTriggerCount, pgmCanvasRef, stageW, stageH]);

  // Build CSS filter string for the 14 HLSL effects + color grading
  const buildCssFilterForSource = (src: StageSource): string => {
    const { brightness, contrast, saturation, hue } = src.colorKey;
    const { shader, intensity } = src.effects;
    const factor = intensity / 100;

    const filters: string[] = [];
    if (brightness !== 0) filters.push(`brightness(${100 + brightness}%)`);
    if (contrast !== 0) filters.push(`contrast(${100 + contrast}%)`);
    if (saturation !== 0) filters.push(`saturate(${100 + saturation}%)`);
    if (hue !== 0) filters.push(`hue-rotate(${hue}deg)`);

    switch (shader) {
      case "bloom":
        filters.push(`brightness(${100 + 35 * factor}%) contrast(${100 + 20 * factor}%)`);
        break;
      case "monochrome":
        filters.push(`grayscale(${Math.round(100 * factor)}%)`);
        break;
      case "oldmovie":
        filters.push(
          `sepia(${Math.round(90 * factor)}%) contrast(${100 + 25 * factor}%) brightness(${100 - 8 * factor}%)`
        );
        break;
      case "sketchpencilstroke":
        filters.push(
          `grayscale(100%) contrast(${100 + 180 * factor}%) brightness(${100 + 20 * factor}%)`
        );
        break;
      case "invertcolor":
        filters.push(`invert(${Math.round(100 * factor)}%)`);
        break;
      case "cool":
        filters.push(`hue-rotate(${Math.round(35 * factor)}deg) saturate(${100 + 25 * factor}%)`);
        break;
      case "warm":
        filters.push(`sepia(${Math.round(45 * factor)}%) saturate(${100 + 40 * factor}%)`);
        break;
      case "sincity":
        filters.push(`contrast(${100 + 110 * factor}%) saturate(${100 - 45 * factor}%)`);
        break;
      case "blur":
        filters.push(`blur(${(12 * factor).toFixed(1)}px)`);
        break;
      case "sharpen":
        filters.push(`contrast(${100 + 45 * factor}%) saturate(${100 + 15 * factor}%)`);
        break;
      case "smoothen":
        filters.push(`blur(${(1.8 * factor).toFixed(1)}px) brightness(${100 + 5 * factor}%)`);
        break;
      case "lut":
        filters.push(
          `contrast(${100 + 22 * factor}%) saturate(${100 + 30 * factor}%) hue-rotate(${Math.round(-8 * factor)}deg)`
        );
        break;
      default:
        break;
    }

    return filters.length > 0 ? filters.join(" ") : "none";
  };

  // Apply Chroma Key pixel processing ONLY when explicitly enabled by user (Golden Rule #3)
  const getChromaKeyedDrawable = (
    videoEl: HTMLVideoElement,
    src: StageSource
  ): HTMLCanvasElement | HTMLVideoElement => {
    if (!src.colorKey.chromaKey.enabled) {
      return videoEl;
    }
    if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      return videoEl;
    }

    if (!chromaOffscreenRef.current) {
      chromaOffscreenRef.current = document.createElement("canvas");
    }
    const off = chromaOffscreenRef.current;
    const w = 480;
    const h = 270;
    if (off.width !== w || off.height !== h) {
      off.width = w;
      off.height = h;
    }
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) return videoEl;

    octx.drawImage(videoEl, 0, 0, w, h);
    const frame = octx.getImageData(0, 0, w, h);
    const data = frame.data;

    let targetR = 0;
    let targetG = 255;
    let targetB = 0;
    if (src.colorKey.chromaKey.keyColor === "blue") {
      targetR = 0;
      targetG = 60;
      targetB = 255;
    } else if (src.colorKey.chromaKey.keyColor === "red") {
      targetR = 255;
      targetG = 20;
      targetB = 20;
    } else if (src.colorKey.chromaKey.keyColor === "custom") {
      const hex = src.colorKey.chromaKey.customHex.replace("#", "");
      if (hex.length === 6) {
        targetR = parseInt(hex.slice(0, 2), 16) || 0;
        targetG = parseInt(hex.slice(2, 4), 16) || 255;
        targetB = parseInt(hex.slice(4, 6), 16) || 0;
      }
    }

    const thresh = (src.colorKey.chromaKey.threshold / 100) * 220;
    const smooth = (src.colorKey.chromaKey.smoothing / 100) * 65 + 1;

    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i] - targetR;
      const dg = data[i + 1] - targetG;
      const db = data[i + 2] - targetB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < thresh) {
        data[i + 3] = 0;
      } else if (dist < thresh + smooth) {
        data[i + 3] = Math.round(((dist - thresh) / smooth) * 255);
      }
    }
    octx.putImageData(frame, 0, 0);
    return off;
  };

  // Render a single Scene onto a target 2D context
  const renderSceneToContext = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      scene: Scene,
      isEditableSelectionCanvas: boolean,
      nowMs: number
    ) => {
      // 1. Deep Obsidian Stage Backdrop
      ctx.save();
      ctx.fillStyle = "#060911";
      ctx.fillRect(0, 0, stageW, stageH);

      // Subtle reference grid when no fullscreen source covers it
      ctx.strokeStyle = "rgba(30, 41, 59, 0.35)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < stageW; gx += 120) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, stageH);
        ctx.stroke();
      }
      for (let gy = 0; gy < stageH; gy += 120) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(stageW, gy);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Sort visible sources by zOrder ascending
      const sortedSources = [...scene.sources]
        .filter((s) => s.layout.visible)
        .sort((a, b) => a.zOrder - b.zOrder);

      for (const src of sortedSources) {
        const {
          x,
          y,
          width,
          height,
          cropTop,
          cropBottom,
          cropLeft,
          cropRight,
          rotX,
          rotY,
          rotZ,
          flipH,
          flipV,
        } = src.layout;

        if (width <= 4 || height <= 4) continue;

        ctx.save();

        // Opacity
        ctx.globalAlpha = Math.max(0, Math.min(1, src.colorKey.opacity / 100));

        // Center transform for 2D/3D rotation and flip
        const cx = x + width / 2;
        const cy = y + height / 2;
        ctx.translate(cx, cy);

        // Apply 2D Roll (rotZ) and simulated 3D Pitch/Yaw foreshortening
        if (rotZ !== 0) {
          ctx.rotate((rotZ * Math.PI) / 180);
        }
        const scale3DX = Math.max(0.15, Math.cos((rotY * Math.PI) / 180)) * (flipH ? -1 : 1);
        const scale3DY = Math.max(0.15, Math.cos((rotX * Math.PI) / 180)) * (flipV ? -1 : 1);
        const skewX = Math.sin((rotY * Math.PI) / 180) * 0.18;
        const skewY = Math.sin((rotX * Math.PI) / 180) * 0.18;
        ctx.transform(scale3DX, skewY, skewX, scale3DY, 0, 0);
        ctx.translate(-cx, -cy);

        // Compute cropped rectangle inside [x, y, width, height]
        const cLeftPx = (cropLeft / 100) * width;
        const cRightPx = (cropRight / 100) * width;
        const cTopPx = (cropTop / 100) * height;
        const cBottomPx = (cropBottom / 100) * height;
        const drawX = x + cLeftPx;
        const drawY = y + cTopPx;
        const drawW = Math.max(8, width - cLeftPx - cRightPx);
        const drawH = Math.max(8, height - cTopPx - cBottomPx);

        // Drop Shadow
        if (src.effects.dropShadowEnabled) {
          ctx.shadowColor = src.effects.dropShadowColor || "rgba(0,0,0,0.85)";
          ctx.shadowBlur = src.effects.dropShadowBlur;
          ctx.shadowOffsetX = src.effects.dropShadowDistance * 0.7;
          ctx.shadowOffsetY = src.effects.dropShadowDistance * 0.7;
        }

        // Shape Mask Clipping (Rectangle, Rounded, Circle/Oval, Diamond)
        ctx.beginPath();
        const mask = src.effects.maskShape;
        if (mask === "circle") {
          ctx.ellipse(
            drawX + drawW / 2,
            drawY + drawH / 2,
            drawW / 2,
            drawH / 2,
            0,
            0,
            Math.PI * 2
          );
        } else if (mask === "diamond") {
          ctx.moveTo(drawX + drawW / 2, drawY);
          ctx.lineTo(drawX + drawW, drawY + drawH / 2);
          ctx.lineTo(drawX + drawW / 2, drawY + drawH);
          ctx.lineTo(drawX, drawY + drawH / 2);
          ctx.closePath();
        } else if (mask === "rounded" || src.effects.borderRadius > 0) {
          const rad = mask === "rounded" ? Math.min(drawW, drawH) * 0.12 : src.effects.borderRadius;
          ctx.roundRect(drawX, drawY, drawW, drawH, rad);
        } else {
          ctx.rect(drawX, drawY, drawW, drawH);
        }
        ctx.clip();

        // Reset shadow after clip so internal content doesn't double-shadow
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Apply CSS Shader Filter
        ctx.filter = buildCssFilterForSource(src);

        // Draw Source Content by Type
        if (src.type === "screen") {
          const dImg = desktopImgRef.current;
          if (dImg && dImg.complete && dImg.naturalWidth > 0) {
            ctx.drawImage(dImg, x, y, width, height);
          } else {
            ctx.fillStyle = "#0F172A";
            ctx.fillRect(x, y, width, height);
          }
        } else if (src.type === "window") {
          const wImg =
            (src.windowHwnd && windowImgsRef.current[src.windowHwnd]) ||
            desktopImgRef.current;
          if (wImg && wImg.complete && wImg.naturalWidth > 0) {
            ctx.drawImage(wImg, x, y, width, height);
          } else {
            ctx.fillStyle = "#111827";
            ctx.fillRect(x, y, width, height);
          }
          // Subtle Window Source Indicator in top-left
          if (src.windowTitle) {
            ctx.save();
            ctx.filter = "none";
            ctx.fillStyle = "rgba(7, 10, 18, 0.78)";
            ctx.fillRect(drawX + 12, drawY + 12, Math.min(drawW - 24, 420), 34);
            ctx.fillStyle = "#00F0FF";
            ctx.font = "bold 16px Inter, sans-serif";
            ctx.fillText(
              `🎮 ${src.windowTitle.slice(0, 38)}`,
              drawX + 22,
              drawY + 34
            );
            ctx.restore();
          }
        } else if (src.type === "camera") {
          const camKey = src.cameraDeviceId || "default_cam";
          const camVid = cameraVideosRef.current[camKey];
          if (camVid && camVid.readyState >= 2) {
            const drawable = getChromaKeyedDrawable(camVid, src);
            if (src.effects.shader === "magnifysmooth") {
              // Magnify smooth shader: zoom center 1.6x
              const sw = camVid.videoWidth || 1280;
              const sh = camVid.videoHeight || 720;
              ctx.drawImage(
                drawable,
                sw * 0.2,
                sh * 0.2,
                sw * 0.6,
                sh * 0.6,
                x,
                y,
                width,
                height
              );
            } else {
              ctx.drawImage(drawable, x, y, width, height);
            }
          } else {
            const grad = ctx.createLinearGradient(x, y, x + width, y + height);
            grad.addColorStop(0, "#0F172A");
            grad.addColorStop(1, "#1E1B4B");
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = "#00F0FF";
            ctx.font = "bold 22px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("📷 CÁMARA WEB EN VIVO", x + width / 2, y + height / 2);
          }
        } else if (src.type === "color") {
          const grad = ctx.createLinearGradient(x, y, x + width, y + height);
          grad.addColorStop(0, src.bgColor || "#0D1528");
          grad.addColorStop(1, src.gradientEndColor || src.bgColor || "#1E1035");
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, width, height);
        } else if (src.type === "image") {
          const imgKey = `${src.id}_${src.mediaUrl}`;
          const cImg = src.mediaUrl ? customImgsRef.current[imgKey] : null;
          if (cImg && cImg.complete && cImg.naturalWidth > 0) {
            ctx.drawImage(cImg, x, y, width, height);
          } else {
            ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = "#38BDF8";
            ctx.font = "bold 24px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`🖼️ ${src.name}`, x + width / 2, y + height / 2);
          }
        } else if (src.type === "media" || src.type === "replay") {
          const vidKey = `${src.id}_${src.mediaUrl}`;
          const mVid = src.mediaUrl ? videoElementsRef.current[vidKey] : null;
          if (mVid && mVid.readyState >= 2) {
            ctx.drawImage(mVid, x, y, width, height);
          } else if (desktopImgRef.current && src.type === "replay") {
            ctx.drawImage(desktopImgRef.current, x, y, width, height);
          } else {
            ctx.fillStyle = "#090D16";
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = "#F43F5E";
            ctx.font = "bold 24px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
              src.type === "replay"
                ? "⏪ INSTANT REPLAY BUFFER"
                : `🎬 ${src.name}`,
              x + width / 2,
              y + height / 2
            );
          }

          if (src.type === "replay") {
            // Broadcast Replay Badge overlay
            ctx.save();
            ctx.filter = "none";
            ctx.fillStyle = "#FF2A54";
            ctx.fillRect(drawX + 16, drawY + 16, 220, 38);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 18px Rajdhani, Inter, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("● REPETICIÓN INSTANTÁNEA", drawX + 28, drawY + 41);
            ctx.restore();
          }
        } else if (src.type === "text") {
          ctx.filter = "none";
          const fSize = src.fontSize || 52;
          ctx.font = `800 ${fSize}px ${src.fontFamily || "Rajdhani, Inter, sans-serif"}`;
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.lineWidth = Math.max(3, fSize * 0.08);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
          const txt = src.textContent || src.name;
          ctx.strokeText(txt, drawX + 20, drawY + drawH / 2);
          ctx.fillStyle = src.textColor || "#FFFFFF";
          ctx.fillText(txt, drawX + 20, drawY + drawH / 2);
        } else if (src.type === "lower_third") {
          ctx.filter = "none";
          // Animated broadcast lower-third bar
          const pulse = 0.92 + 0.08 * Math.sin(nowMs * 0.004);
          const bgGrad = ctx.createLinearGradient(drawX, drawY, drawX + drawW, drawY);
          bgGrad.addColorStop(0, "rgba(7, 10, 18, 0.94)");
          bgGrad.addColorStop(0.85, "rgba(15, 23, 42, 0.88)");
          bgGrad.addColorStop(1, "rgba(15, 23, 42, 0.0)");
          ctx.fillStyle = bgGrad;
          ctx.fillRect(drawX, drawY, drawW, drawH);

          // Left Accent Bar
          ctx.fillStyle = src.accentColor || "#00F0FF";
          ctx.fillRect(drawX, drawY, 10, drawH);
          ctx.fillRect(drawX, drawY + drawH - 5, drawW * 0.72 * pulse, 5);

          // Headline
          ctx.fillStyle = src.textColor || "#FFFFFF";
          ctx.font = `800 ${Math.round(drawH * 0.34)}px Rajdhani, Inter, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(
            src.textContent || "GAMECASTER PLUS STUDIO",
            drawX + 28,
            drawY + drawH * 0.16
          );

          // Subtitle + Social badge
          ctx.fillStyle = src.accentColor || "#00F0FF";
          ctx.font = `700 ${Math.round(drawH * 0.2)}px Inter, sans-serif`;
          const sub = [src.subtitleContent, src.socialHandle]
            .filter(Boolean)
            .join("  •  ");
          ctx.fillText(
            sub || "TRANSMISIÓN EN DIRECTO // 1080P60",
            drawX + 28,
            drawY + drawH * 0.58
          );
        }

        ctx.filter = "none";

        // Custom Border
        if (src.effects.borderEnabled && src.effects.borderThickness > 0) {
          ctx.strokeStyle = src.effects.borderColor || "#00F0FF";
          ctx.lineWidth = src.effects.borderThickness * 2;
          ctx.stroke();
        }

        ctx.restore();

        // Draw interactive Cyan Selection Box + 8 Resize Handles if selected
        if (isEditableSelectionCanvas && src.id === selectedSourceId) {
          ctx.save();
          ctx.strokeStyle = src.layout.lockPosition ? "#F59E0B" : "#00F0FF";
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, width, height);

          // Source Label Pill
          const labelText = `${src.name} (${Math.round(width)}×${Math.round(height)})`;
          ctx.font = "bold 18px Inter, sans-serif";
          const textW = ctx.measureText(labelText).width + 24;
          const pillY = y > 36 ? y - 34 : y + 6;
          ctx.fillStyle = src.layout.lockPosition ? "#F59E0B" : "#00F0FF";
          ctx.fillRect(x, pillY, textW, 28);
          ctx.fillStyle = "#04070E";
          ctx.fillText(labelText, x + 10, pillY + 20);

          // 8 Resize Handles
          if (!src.layout.lockPosition) {
            const handleSize = 14;
            const half = handleSize / 2;
            const handleCoords: [number, number][] = [
              [x, y],
              [x + width / 2, y],
              [x + width, y],
              [x + width, y + height / 2],
              [x + width, y + height],
              [x + width / 2, y + height],
              [x, y + height],
              [x, y + height / 2],
            ];
            ctx.fillStyle = "#00F0FF";
            ctx.strokeStyle = "#050811";
            ctx.lineWidth = 2;
            for (const [hx, hy] of handleCoords) {
              ctx.fillRect(hx - half, hy - half, handleSize, handleSize);
              ctx.strokeRect(hx - half, hy - half, handleSize, handleSize);
            }
          }
          ctx.restore();
        }
      }

      // 3. Magnetic Snap Alignment Guides
      if (isEditableSelectionCanvas && (snapGuides.x !== undefined || snapGuides.y !== undefined)) {
        ctx.save();
        ctx.strokeStyle = "#FF2A54";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        if (snapGuides.x !== undefined) {
          ctx.beginPath();
          ctx.moveTo(snapGuides.x, 0);
          ctx.lineTo(snapGuides.x, stageH);
          ctx.stroke();
        }
        if (snapGuides.y !== undefined) {
          ctx.beginPath();
          ctx.moveTo(0, snapGuides.y);
          ctx.lineTo(stageW, snapGuides.y);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
    [stageW, stageH, selectedSourceId, snapGuides]
  );

  // Render Whiteboard Telestrator annotations onto context
  const renderWhiteboardToContext = useCallback(
    (ctx: CanvasRenderingContext2D, nowMs: number) => {
      const allStrokes = [
        ...wbStrokes.filter(
          (s) => s.tool !== "laser" || nowMs - s.createdAt < 2500
        ),
        ...(activeStrokeRef.current ? [activeStrokeRef.current] : []),
      ];

      for (const stroke of allStrokes) {
        if (stroke.points.length === 0) continue;
        ctx.save();
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (stroke.tool === "highlighter") {
          ctx.globalAlpha = 0.42;
          ctx.lineWidth = stroke.width * 3.2;
        } else if (stroke.tool === "laser") {
          const age = nowMs - stroke.createdAt;
          ctx.globalAlpha = Math.max(0, 1 - age / 2500);
          ctx.shadowColor = stroke.color;
          ctx.shadowBlur = 18;
        }

        const pts = stroke.points;
        const first = pts[0];
        const last = pts[pts.length - 1];

        if (stroke.tool === "rect") {
          ctx.strokeRect(
            first.x,
            first.y,
            last.x - first.x,
            last.y - first.y
          );
        } else if (stroke.tool === "circle") {
          const rx = Math.abs(last.x - first.x) / 2;
          const ry = Math.abs(last.y - first.y) / 2;
          const cx = (first.x + last.x) / 2;
          const cy = (first.y + last.y) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (stroke.tool === "arrow") {
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(last.x, last.y);
          ctx.stroke();

          const angle = Math.atan2(last.y - first.y, last.x - first.x);
          const headLen = stroke.width * 4.5 + 14;
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(
            last.x - headLen * Math.cos(angle - Math.PI / 6),
            last.y - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            last.x - headLen * Math.cos(angle + Math.PI / 6),
            last.y - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }

        ctx.restore();
      }
    },
    [wbStrokes]
  );

  // Apply GPU Transition Shader between snapshotCanvasRef (Old Scene) and Newly Rendered Scene
  const applyTransitionEffect = (
    ctx: CanvasRenderingContext2D,
    oldSnap: HTMLCanvasElement,
    progress: number,
    trType: TransitionId
  ) => {
    const t = Math.max(0, Math.min(1, progress));

    if (trType === "cut") {
      if (t < 0.5) {
        ctx.drawImage(oldSnap, 0, 0, stageW, stageH);
      }
      return;
    }

    if (trType === "fade") {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(oldSnap, 0, 0, stageW, stageH);
      ctx.restore();
      return;
    }

    if (trType === "fadetoblack" || trType === "fadetowhite") {
      const shade = trType === "fadetowhite" ? "#FFFFFF" : "#000000";
      ctx.save();
      if (t < 0.5) {
        ctx.drawImage(oldSnap, 0, 0, stageW, stageH);
        ctx.globalAlpha = t * 2;
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, stageW, stageH);
      } else {
        ctx.globalAlpha = (1 - t) * 2;
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, stageW, stageH);
      }
      ctx.restore();
      return;
    }

    if (trType === "clock" || trType === "fan") {
      ctx.save();
      ctx.beginPath();
      const cx = stageW / 2;
      const cy = stageH / 2;
      const radius = Math.hypot(stageW, stageH);
      if (trType === "clock") {
        ctx.moveTo(cx, cy);
        ctx.arc(
          cx,
          cy,
          radius,
          -Math.PI / 2 + t * Math.PI * 2,
          -Math.PI / 2 + Math.PI * 2
        );
        ctx.closePath();
      } else {
        for (let q = 0; q < 4; q++) {
          const base = (q * Math.PI) / 2;
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, radius, base + (t * Math.PI) / 2, base + Math.PI / 2);
          ctx.closePath();
        }
      }
      ctx.clip();
      ctx.drawImage(oldSnap, 0, 0, stageW, stageH);
      ctx.restore();
      return;
    }

    if (trType === "collapse" || trType === "hole") {
      ctx.save();
      const cx = stageW / 2;
      const cy = stageH / 2;
      const maxR = Math.hypot(cx, cy);
      ctx.beginPath();
      if (trType === "collapse") {
        ctx.arc(cx, cy, maxR * (1 - t), 0, Math.PI * 2);
      } else {
        ctx.rect(0, 0, stageW, stageH);
        ctx.arc(cx, cy, maxR * t, 0, Math.PI * 2, true);
      }
      ctx.clip();
      ctx.drawImage(oldSnap, 0, 0, stageW, stageH);
      ctx.restore();
      return;
    }

    if (
      trType === "move_left" ||
      trType === "move_right" ||
      trType === "move_top" ||
      trType === "move_bottom"
    ) {
      ctx.save();
      let dx = 0;
      let dy = 0;
      if (trType === "move_left") dx = -t * stageW;
      if (trType === "move_right") dx = t * stageW;
      if (trType === "move_top") dy = -t * stageH;
      if (trType === "move_bottom") dy = t * stageH;
      ctx.drawImage(oldSnap, dx, dy, stageW, stageH);
      ctx.restore();
      return;
    }

    if (trType === "move_left_right" || trType === "move_top_bottom") {
      const bands = 10;
      ctx.save();
      for (let i = 0; i < bands; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        if (trType === "move_left_right") {
          const bh = stageH / bands;
          const by = i * bh;
          ctx.drawImage(
            oldSnap,
            0,
            by,
            stageW,
            bh,
            dir * t * stageW,
            by,
            stageW,
            bh
          );
        } else {
          const bw = stageW / bands;
          const bx = i * bw;
          ctx.drawImage(
            oldSnap,
            bx,
            0,
            bw,
            stageH,
            bx,
            dir * t * stageH,
            bw,
            stageH
          );
        }
      }
      ctx.restore();
      return;
    }

    if (
      trType === "zoom" ||
      trType === "easeOutBounce" ||
      trType === "easeOutElastic" ||
      trType === "easeInOutBack" ||
      trType === "wave"
    ) {
      let scale = 1 - t;
      if (trType === "easeOutBounce") {
        const u = 1 - t;
        scale = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      } else if (trType === "easeOutElastic") {
        const u = 1 - t;
        scale =
          u === 0
            ? 0
            : Math.pow(2, -8 * (1 - u)) * Math.sin((1 - u) * 12) + u;
      } else if (trType === "easeInOutBack") {
        const s = 1.70158;
        const u = 1 - t;
        scale = u * u * ((s + 1) * u - s);
      }
      scale = Math.max(0.01, Math.abs(scale));
      ctx.save();
      ctx.globalAlpha = 1 - t;
      const sw = stageW * scale;
      const sh = stageH * scale;
      ctx.drawImage(
        oldSnap,
        (stageW - sw) / 2,
        (stageH - sh) / 2,
        sw,
        sh
      );
      ctx.restore();
      return;
    }

    if (trType === "stinger") {
      // Broadcast Alpha Stinger Wipe
      ctx.save();
      if (t < 0.5) {
        ctx.drawImage(oldSnap, 0, 0, stageW, stageH);
      }
      const sweepX = (t * 2.4 - 0.7) * stageW;
      const grad = ctx.createLinearGradient(
        sweepX - 360,
        0,
        sweepX + 360,
        stageH
      );
      grad.addColorStop(0, "rgba(0, 240, 255, 0)");
      grad.addColorStop(0.35, "rgba(0, 240, 255, 0.95)");
      grad.addColorStop(0.5, "rgba(255, 42, 84, 0.98)");
      grad.addColorStop(0.65, "rgba(124, 58, 237, 0.95)");
      grad.addColorStop(1, "rgba(124, 58, 237, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, stageW, stageH);
      ctx.restore();
    }
  };

  // Master 60 FPS Animation Loop
  useEffect(() => {
    let rafId = 0;

    const renderLoop = (nowMs: number) => {
      // 1. Render Program (PGM) Canvas
      const pgm = pgmCanvasRef.current;
      if (pgm) {
        const ctx = pgm.getContext("2d");
        if (ctx) {
          renderSceneToContext(ctx, activeScene, !studioMode, nowMs);

          // Apply active transition shader if running
          if (isTransitioningRef.current && snapshotCanvasRef.current) {
            const elapsed = nowMs - transitionStartRef.current;
            const dur = Math.max(80, transitionDurationMs);
            if (elapsed < dur) {
              applyTransitionEffect(
                ctx,
                snapshotCanvasRef.current,
                elapsed / dur,
                activeTransition
              );
            } else {
              isTransitioningRef.current = false;
            }
          }

          renderWhiteboardToContext(ctx, nowMs);
        }
      }

      // 2. Render Studio Mode Preview Canvas if Studio Mode (`SplitView`) is enabled
      if (studioMode && previewCanvasRef.current) {
        const pctx = previewCanvasRef.current.getContext("2d");
        if (pctx) {
          renderSceneToContext(pctx, previewScene, true, nowMs);
        }
      }

      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [
    activeScene,
    previewScene,
    studioMode,
    activeTransition,
    transitionDurationMs,
    renderSceneToContext,
    renderWhiteboardToContext,
    pgmCanvasRef,
  ]);

  // Convert Mouse event client coordinates to normalized Stage coordinates (1920x1080 or 1080x1920)
  const getCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement>,
    canvasEl: HTMLCanvasElement
  ): { x: number; y: number } => {
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = stageW / Math.max(1, rect.width);
    const scaleY = stageH / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Detect if mouse clicked on one of the 8 resize handles of the selected source
  const hitTestHandle = (
    mx: number,
    my: number,
    src: StageSource
  ): HandlePosition | null => {
    if (src.layout.lockPosition) return null;
    const { x, y, width, height } = src.layout;
    const tol = 22;
    const handles: { pos: HandlePosition; hx: number; hy: number }[] = [
      { pos: "nw", hx: x, hy: y },
      { pos: "n", hx: x + width / 2, hy: y },
      { pos: "ne", hx: x + width, hy: y },
      { pos: "e", hx: x + width, hy: y + height / 2 },
      { pos: "se", hx: x + width, hy: y + height },
      { pos: "s", hx: x + width / 2, hy: y + height },
      { pos: "sw", hx: x, hy: y + height },
      { pos: "w", hx: x, hy: y + height / 2 },
    ];
    for (const h of handles) {
      if (Math.abs(mx - h.hx) <= tol && Math.abs(my - h.hy) <= tol) {
        return h.pos;
      }
    }
    return null;
  };

  // Mouse Down on Interactive Canvas
  const handleCanvasMouseDown = (
    e: React.MouseEvent<HTMLCanvasElement>,
    targetScene: Scene
  ) => {
    const canvasEl = e.currentTarget;
    const { x: mx, y: my } = getCanvasCoords(e, canvasEl);

    // If Whiteboard tool is active, start drawing a stroke
    if (wbTool !== "select") {
      activeStrokeRef.current = {
        id: `wb_${Date.now()}`,
        tool: wbTool,
        color: wbColor,
        width: wbWidth,
        points: [{ x: mx, y: my }],
        createdAt: performance.now(),
      };
      return;
    }

    // 1. Check if clicking a handle on the currently selected source
    const currentSelected = targetScene.sources.find(
      (s) => s.id === selectedSourceId && s.layout.visible
    );
    if (currentSelected) {
      const handle = hitTestHandle(mx, my, currentSelected);
      if (handle) {
        setDragState({
          sceneId: targetScene.id,
          sourceId: currentSelected.id,
          mode: e.altKey ? "crop" : "resize",
          handle,
          startMouseX: mx,
          startMouseY: my,
          initialSource: JSON.parse(JSON.stringify(currentSelected)),
        });
        return;
      }
    }

    // 2. Hit-test visible sources from top Z-order to bottom Z-order
    const topDown = [...targetScene.sources]
      .filter((s) => s.layout.visible)
      .sort((a, b) => b.zOrder - a.zOrder);

    for (const src of topDown) {
      const { x, y, width, height } = src.layout;
      if (mx >= x && mx <= x + width && my >= y && my <= y + height) {
        onSelectSource(src.id);
        if (!src.layout.lockPosition) {
          setDragState({
            sceneId: targetScene.id,
            sourceId: src.id,
            mode: e.shiftKey ? "rotate" : e.altKey ? "crop" : "move",
            startMouseX: mx,
            startMouseY: my,
            initialSource: JSON.parse(JSON.stringify(src)),
          });
        }
        return;
      }
    }

    onSelectSource(null);
  };

  // Mouse Move on Interactive Canvas
  const handleCanvasMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>,
    targetScene: Scene
  ) => {
    const canvasEl = e.currentTarget;
    const { x: mx, y: my } = getCanvasCoords(e, canvasEl);

    if (activeStrokeRef.current) {
      activeStrokeRef.current.points.push({ x: mx, y: my });
      return;
    }

    if (!dragState || dragState.sceneId !== targetScene.id) return;

    const dx = mx - dragState.startMouseX;
    const dy = my - dragState.startMouseY;
    const init = dragState.initialSource;
    const next: StageSource = JSON.parse(JSON.stringify(init));

    if (dragState.mode === "move") {
      let nx = init.layout.x + dx;
      let ny = init.layout.y + dy;
      const guides: { x?: number; y?: number } = {};

      if (snapToGrid) {
        const snapTol = 18;
        // Snap to left/right/center X
        if (Math.abs(nx) < snapTol) {
          nx = 0;
          guides.x = 0;
        } else if (Math.abs(nx + init.layout.width - stageW) < snapTol) {
          nx = stageW - init.layout.width;
          guides.x = stageW;
        } else if (
          Math.abs(nx + init.layout.width / 2 - stageW / 2) < snapTol
        ) {
          nx = stageW / 2 - init.layout.width / 2;
          guides.x = stageW / 2;
        }

        // Snap to top/bottom/center Y
        if (Math.abs(ny) < snapTol) {
          ny = 0;
          guides.y = 0;
        } else if (Math.abs(ny + init.layout.height - stageH) < snapTol) {
          ny = stageH - init.layout.height;
          guides.y = stageH;
        } else if (
          Math.abs(ny + init.layout.height / 2 - stageH / 2) < snapTol
        ) {
          ny = stageH / 2 - init.layout.height / 2;
          guides.y = stageH / 2;
        }
      }
      setSnapGuides(guides);
      next.layout.x = Math.round(nx);
      next.layout.y = Math.round(ny);
    } else if (dragState.mode === "resize" && dragState.handle) {
      const h = dragState.handle;
      let { x, y, width, height } = init.layout;
      const minW = 64;
      const minH = 48;

      if (h.includes("e")) width = Math.max(minW, width + dx);
      if (h.includes("s")) height = Math.max(minH, height + dy);
      if (h.includes("w")) {
        const candidateW = width - dx;
        if (candidateW >= minW) {
          x += dx;
          width = candidateW;
        }
      }
      if (h.includes("n")) {
        const candidateH = height - dy;
        if (candidateH >= minH) {
          y += dy;
          height = candidateH;
        }
      }

      if (init.layout.keepAspectRatio) {
        const ratio = init.layout.width / Math.max(1, init.layout.height);
        height = Math.round(width / ratio);
      }

      next.layout.x = Math.round(x);
      next.layout.y = Math.round(y);
      next.layout.width = Math.round(width);
      next.layout.height = Math.round(height);
    } else if (dragState.mode === "crop") {
      // Alt + Drag interactive edge cropping
      next.layout.cropLeft = Math.max(
        0,
        Math.min(45, Math.round(init.layout.cropLeft + dx * 0.05))
      );
      next.layout.cropTop = Math.max(
        0,
        Math.min(45, Math.round(init.layout.cropTop + dy * 0.05))
      );
    } else if (dragState.mode === "rotate") {
      // Shift + Drag interactive 3D rotation
      next.layout.rotZ = Math.max(
        -180,
        Math.min(180, Math.round(init.layout.rotZ + dx * 0.25))
      );
      next.layout.rotY = Math.max(
        -75,
        Math.min(75, Math.round(init.layout.rotY + dy * 0.2))
      );
    }

    onUpdateSource(targetScene.id, next);
  };

  const handleCanvasMouseUp = () => {
    if (activeStrokeRef.current) {
      const completed = activeStrokeRef.current;
      activeStrokeRef.current = null;
      setWbStrokes((prev) => [...prev, completed]);
    }
    if (dragState) {
      setDragState(null);
      setSnapGuides({});
    }
  };

  const selectedSourceObj = (studioMode ? previewScene : activeScene).sources.find(
    (s) => s.id === selectedSourceId
  );

  return (
    <div className="relative flex-1 flex flex-col bg-[#05070B] border-b border-slate-800/80 overflow-hidden select-none">
      {/* Stage Sub-Header & Whiteboard Telestrator Bar */}
      <div className="h-9 px-3 bg-[#0B0E17] border-b border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-slate-800/90 text-[#00F0FF] font-mono font-semibold text-[11px]">
            {isPortraitCanvas ? "9:16 VERTICAL (1080×1920)" : "16:9 UHD/FHD (1920×1080)"}
          </span>
          <button
            onClick={onToggleSnapToGrid}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition ${
              snapToGrid
                ? "bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
            }`}
            title="Ajuste magnético a bordes y centro del escenario (SnapToGrid)"
          >
            <Grid className="w-3.5 h-3.5" />
            Guías Magnéticas
          </button>

          {selectedSourceObj && (
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-800 text-slate-300">
              <span className="text-slate-400">Capa activa:</span>
              <span className="font-semibold text-[#00F0FF]">
                {selectedSourceObj.name}
              </span>
              {selectedSourceObj.layout.lockPosition && (
                <Lock className="w-3 h-3 text-amber-400" />
              )}
              <button
                onClick={() =>
                  onOpenSourceProperties(
                    selectedSourceObj,
                    studioMode ? previewScene.id : activeScene.id
                  )
                }
                className="ml-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[11px]"
              >
                <Settings className="w-3 h-3 text-[#00F0FF]" />
                Propiedades
              </button>
            </div>
          )}
        </div>

        {/* Built-in Whiteboard Telestrator (`whiteboardoverlayplg.plg`) */}
        <div className="flex items-center gap-1 bg-[#070A12] px-2 py-0.5 rounded-md border border-slate-800/90">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">
            Pizarra En Vivo:
          </span>
          {[
            { id: "select", icon: MousePointer, label: "Seleccionar / Mover Capas" },
            { id: "pen", icon: PenTool, label: "Pluma Libre" },
            { id: "highlighter", icon: Highlighter, label: "Marcador Fluorescente" },
            { id: "arrow", icon: ArrowUpRight, label: "Flecha Táctica" },
            { id: "rect", icon: Square, label: "Rectángulo" },
            { id: "circle", icon: CircleIcon, label: "Círculo" },
            { id: "laser", icon: Sparkles, label: "Puntero Láser" },
          ].map((item) => {
            const Icon = item.icon;
            const active = wbTool === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setWbTool(item.id as WhiteboardTool)}
                title={item.label}
                className={`p-1 rounded transition ${
                  active
                    ? "bg-[#00F0FF] text-slate-950 shadow-[0_0_8px_rgba(0,240,255,0.4)]"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}

          <div className="h-3.5 w-[1px] bg-slate-800 mx-1" />

          {["#00F0FF", "#FF2A54", "#F59E0B", "#10B981", "#FFFFFF"].map((c) => (
            <button
              key={c}
              onClick={() => setWbColor(c)}
              className={`w-3.5 h-3.5 rounded-full border ${
                wbColor === c ? "border-white scale-125" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
              title={`Color ${c}`}
            />
          ))}

          <input
            type="range"
            min={2}
            max={16}
            value={wbWidth}
            onChange={(e) => setWbWidth(Number(e.target.value))}
            className="w-12 h-1 ml-1"
            title={`Grosor de trazo: ${wbWidth}px`}
          />

          <button
            onClick={() => setWbStrokes((prev) => prev.slice(0, -1))}
            className="p-1 text-slate-400 hover:text-white"
            title="Deshacer último trazo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setWbStrokes([])}
            className="p-1 text-rose-400 hover:text-rose-300"
            title="Limpiar pizarra"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Central Stage Canvas Area (Single PGM or Dual SplitView Studio Mode) */}
      <div className="flex-1 flex items-center justify-center gap-3 p-3 overflow-hidden bg-[radial-gradient(ellipse_at_center,_#0D1322_0%,_#05070B_100%)]">
        {/* LEFT MONITOR: PREVIEW EDITOR (Only visible when Studio Mode SplitView is ON) */}
        {studioMode && (
          <div className="flex-1 h-full flex flex-col items-center justify-center min-w-0">
            <div className="w-full flex items-center justify-between px-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  VISTA PREVIA (PREVIEW EDITOR)
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  {previewScene.name}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Edición privada — Arrastra o redimensiona capas
              </span>
            </div>
            <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden rounded-lg border border-amber-500/40 bg-black/90 shadow-inner p-1">
              <canvas
                ref={previewCanvasRef}
                width={stageW}
                height={stageH}
                onMouseDown={(e) => handleCanvasMouseDown(e, previewScene)}
                onMouseMove={(e) => handleCanvasMouseMove(e, previewScene)}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                onDoubleClick={() => {
                  if (selectedSourceObj) {
                    onOpenSourceProperties(selectedSourceObj, previewScene.id);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (selectedSourceObj) {
                    onOpenSourceProperties(selectedSourceObj, previewScene.id);
                  }
                }}
                className={`${
                  isPortraitCanvas ? "h-full w-auto" : "w-full h-auto max-h-full"
                } object-contain rounded cursor-move`}
              />
            </div>
          </div>
        )}

        {/* STUDIO MODE CENTER PUSH LIVE BUTTON */}
        {studioMode && (
          <div className="flex flex-col items-center justify-center gap-2 px-1">
            <button
              onClick={onPushLive}
              className="px-4 py-3 rounded-lg bg-gradient-to-b from-[#00F0FF] to-[#2563EB] text-slate-950 font-display font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:brightness-110 active:scale-95 transition flex flex-col items-center gap-1"
              title="Empujar escena de Vista Previa a Emisión en Vivo (BroadcasterPushLive)"
            >
              <ArrowRightLeft className="w-5 h-5" />
              <span>PUSH LIVE</span>
              <span className="text-[9px] font-mono opacity-80">
                {activeTransition.toUpperCase()} ({transitionDurationMs}ms)
              </span>
            </button>
          </div>
        )}

        {/* RIGHT / MAIN MONITOR: LIVE PROGRAM OUTPUT (PGM) */}
        <div className="flex-1 h-full flex flex-col items-center justify-center min-w-0">
          {studioMode && (
            <div className="w-full flex items-center justify-between px-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  PROGRAMA EN VIVO (PGM)
                </span>
                <span className="text-xs font-semibold text-white">
                  {activeScene.name}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                60.0 FPS • Direct3D / Canvas Compositor
              </span>
            </div>
          )}

          <div
            className={`relative flex-1 w-full flex items-center justify-center overflow-hidden rounded-lg border ${
              studioMode
                ? "border-rose-500/50"
                : "border-slate-800/90 hover:border-[#00F0FF]/50"
            } bg-black/95 shadow-[0_0_35px_rgba(0,0,0,0.85)] p-1 transition`}
          >
            <canvas
              ref={pgmCanvasRef}
              width={stageW}
              height={stageH}
              onMouseDown={(e) => {
                if (!studioMode || wbTool !== "select") {
                  handleCanvasMouseDown(e, activeScene);
                }
              }}
              onMouseMove={(e) => {
                if (!studioMode || wbTool !== "select") {
                  handleCanvasMouseMove(e, activeScene);
                }
              }}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onDoubleClick={() => {
                if (!studioMode && selectedSourceObj) {
                  onOpenSourceProperties(selectedSourceObj, activeScene.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!studioMode && selectedSourceObj) {
                  onOpenSourceProperties(selectedSourceObj, activeScene.id);
                }
              }}
              className={`${
                isPortraitCanvas ? "h-full w-auto" : "w-full h-auto max-h-full"
              } object-contain rounded ${
                wbTool !== "select"
                  ? "cursor-crosshair"
                  : studioMode
                  ? "cursor-default"
                  : "cursor-move"
              }`}
            />

            {/* Subtle Corner Hints */}
            {!studioMode && (
              <div className="pointer-events-none absolute bottom-2.5 right-3 flex items-center gap-2 bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded border border-slate-800/80 text-[10px] text-slate-400">
                <span>Clic + Arrastrar: Mover/Estirar</span>
                <span>•</span>
                <span>Alt + Arrastrar: Recortar</span>
                <span>•</span>
                <span>Shift + Arrastrar: Rotar 3D</span>
                <span>•</span>
                <span>Doble Clic: Propiedades ⚙️</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
