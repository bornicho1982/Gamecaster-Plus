import React, { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  StageSource,
  SourceType,
  Scene,
  TransitionId,
  WhiteboardTool,
  WhiteboardStroke,
  MonitorInfo,
  WindowInfo,
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
  Unlock,
  Maximize2,
  Crosshair,
  Scissors,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  FlipHorizontal,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  UploadCloud,
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
  onAddDroppedSource?: (
    type: SourceType,
    name: string,
    extra?: Partial<StageSource>
  ) => void;
  onDeleteSource?: (sourceId: string) => void;
  onOpenSourceProperties: (source: StageSource, sceneId: string) => void;
  onPushLive: () => void;
  activeTransition: TransitionId;
  transitionDurationMs: number;
  transitionTriggerCount: number;
  pgmCanvasRef: React.RefObject<HTMLCanvasElement>;
  openWindows?: WindowInfo[];
  onRefreshWindows?: () => void;
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

export const StageCompositor: React.FC<StageCompositorProps> = React.memo(({
  activeScene,
  previewScene,
  studioMode,
  isPortraitCanvas,
  snapToGrid,
  onToggleSnapToGrid,
  selectedSourceId,
  onSelectSource,
  onUpdateSource,
  onAddDroppedSource,
  onDeleteSource,
  onOpenSourceProperties,
  onPushLive,
  activeTransition,
  transitionDurationMs,
  transitionTriggerCount,
  pgmCanvasRef,
  openWindows = [],
  onRefreshWindows,
}) => {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pgmGizmoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chromaOffscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Exact aspect-ratio fitted dimensions (prevents any CSS canvas stretching)
  const [fittedSize, setFittedSize] = useState<{ w: number; h: number }>({
    w: 880,
    h: 495,
  });
  const [stageZoom, setStageZoom] = useState<number>(1.0);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    source: StageSource;
    sceneId: string;
  } | null>(null);

  const refreshMonitorsList = useCallback(() => {
    invoke<MonitorInfo[]>("list_monitors")
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setMonitors(list);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshMonitorsList();
  }, [refreshMonitorsList]);

  // Double-buffered media element caches (updated directly via refs with ZERO React re-renders)
  const desktopImgRef = useRef<HTMLImageElement | null>(null);
  const windowImgsRef = useRef<Record<number, HTMLImageElement>>({});
  const customImgsRef = useRef<Record<string, HTMLImageElement>>({});
  const videoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const cameraVideosRef = useRef<Record<string, HTMLVideoElement>>({});
  const cameraStreamsRef = useRef<Record<string, MediaStream>>({});

  // Latest scenes ref for the background capture loop
  const scenesRef = useRef<{ active: Scene; preview: Scene; studio: boolean }>({
    active: activeScene,
    preview: previewScene,
    studio: studioMode,
  });
  useEffect(() => {
    scenesRef.current = {
      active: activeScene,
      preview: previewScene,
      studio: studioMode,
    };
  }, [activeScene, previewScene, studioMode]);

  // Transition animation state
  const transitionStartRef = useRef<number>(0);
  const isTransitioningRef = useRef<boolean>(false);

  // Dragging / Resizing state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});

  // Whiteboard Telestrator state (collapsible floating bar)
  const [showWhiteboardBar, setShowWhiteboardBar] = useState<boolean>(false);
  const [wbTool, setWbTool] = useState<WhiteboardTool>("select");
  const [wbColor, setWbColor] = useState<string>("#00F0FF");
  const [wbWidth, setWbWidth] = useState<number>(5);
  const [wbStrokes, setWbStrokes] = useState<WhiteboardStroke[]>([]);
  const activeStrokeRef = useRef<WhiteboardStroke | null>(null);

  const stageW = isPortraitCanvas ? 1080 : 1920;
  const stageH = isPortraitCanvas ? 1920 : 1080;

  // Compute exact 16:9 (or 9:16) pixel box inside stageContainerRef via ResizeObserver
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const padX = studioMode ? 110 : 24;
      const padY = studioMode ? 48 : 20;
      const availW = Math.max(240, (rect.width - padX) / (studioMode ? 2 : 1));
      const availH = Math.max(160, rect.height - padY);
      const scale = Math.min(availW / stageW, availH / stageH) * stageZoom;
      setFittedSize({
        w: Math.max(160, Math.floor(stageW * scale)),
        h: Math.max(90, Math.floor(stageH * scale)),
      });
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageW, stageH, studioMode, stageZoom]);

  // ZERO-REACT-RERENDER Background Capture Loop (updates desktopImgRef & windowImgsRef directly)
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;

    const pollFrames = async () => {
      if (cancelled) return;
      try {
        const { active, preview, studio } = scenesRef.current;
        const allSources = [
          ...active.sources,
          ...(studio ? preview.sources : []),
        ];

        const screenSrc = allSources.find(
          (s) => s.type === "screen" && s.layout.visible
        );
        const needDesktop =
          Boolean(screenSrc) ||
          allSources.some((s) => s.type === "window" && s.layout.visible && !s.windowHwnd);

        if (needDesktop) {
          const showCursor = screenSrc ? screenSrc.showCursor !== false : true;
          const monitorIndex = screenSrc?.monitorIndex ?? 0;

          const frame = await invoke<string>("capture_live_frame", {
            width: 960,
            height: 540,
            showCursor,
            monitorIndex,
          });

          if (!cancelled && frame.startsWith("data:image/jpeg;base64,")) {
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                desktopImgRef.current = img;
                resolve();
              };
              img.onerror = () => resolve();
              img.src = frame;
            });
          }
        }

        const winSources = allSources.filter(
          (s) => s.type === "window" && s.layout.visible && s.windowHwnd
        );
        for (const ws of winSources) {
          if (cancelled || !ws.windowHwnd) break;
          const hwnd = ws.windowHwnd;
          const wFrame = await invoke<string>("capture_window_frame", {
            hwnd,
            width: 960,
            height: 540,
            showCursor: ws.showCursor !== false,
            fallbackTitle: ws.windowTitle || null,
          });
          if (!cancelled && wFrame.startsWith("data:image/jpeg;base64,")) {
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                windowImgsRef.current[hwnd] = img;
                resolve();
              };
              img.onerror = () => resolve();
              img.src = wFrame;
            });
          }
        }
      } catch {
        // Ignore outside Tauri
      }

      if (!cancelled) {
        timerId = setTimeout(pollFrames, 55);
      }
    };

    pollFrames();
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, []);

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

          const startCameraStream = async () => {
            if (!navigator.mediaDevices?.getUserMedia) return;
            try {
              let preferredDeviceId = src.cameraDeviceId;
              if (!preferredDeviceId || preferredDeviceId === "default_cam") {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter((d) => d.kind === "videoinput");
                const physicalCam = videoInputs.find(
                  (d) =>
                    d.label &&
                    !/virtual|xsplit|prism|obs|poco|droidcam|iriun/i.test(d.label)
                );
                if (physicalCam && physicalCam.deviceId) {
                  preferredDeviceId = physicalCam.deviceId;
                }
              }

              const stream = await navigator.mediaDevices.getUserMedia({
                video: preferredDeviceId
                  ? {
                      deviceId: { ideal: preferredDeviceId },
                      width: { ideal: 1280 },
                      height: { ideal: 720 },
                    }
                  : { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
              });

              cameraStreamsRef.current[key] = stream;
              vid.srcObject = stream;
              await vid.play().catch(() => {});

              const trackLabel = stream.getVideoTracks()[0]?.label || "";
              if (/virtual|xsplit|prism|poco/i.test(trackLabel) && !src.cameraDeviceId) {
                const refreshed = await navigator.mediaDevices.enumerateDevices();
                const realCam = refreshed.find(
                  (d) =>
                    d.kind === "videoinput" &&
                    d.label &&
                    !/virtual|xsplit|prism|obs|poco|droidcam|iriun/i.test(d.label)
                );
                if (realCam && realCam.deviceId) {
                  stream.getTracks().forEach((t) => t.stop());
                  const realStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                      deviceId: { exact: realCam.deviceId },
                      width: { ideal: 1280 },
                      height: { ideal: 720 },
                    },
                    audio: false,
                  });
                  cameraStreamsRef.current[key] = realStream;
                  vid.srcObject = realStream;
                  await vid.play().catch(() => {});
                }
              }
            } catch {
              try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: false,
                });
                cameraStreamsRef.current[key] = fallbackStream;
                vid.srcObject = fallbackStream;
                await vid.play().catch(() => {});
              } catch {
                // No camera connected
              }
            }
          };

          startCameraStream();
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
          img.onload = () => {
            customImgsRef.current[key] = img;
          };
          img.src = src.mediaUrl;
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

  // Apply OBS Studio YCbCr Chroma Key V2 + Spill Suppression ONLY when explicitly enabled by user
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
    const w = 640;
    const h = 360;
    if (off.width !== w || off.height !== h) {
      off.width = w;
      off.height = h;
    }
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) return videoEl;

    octx.drawImage(videoEl, 0, 0, w, h);
    const frame = octx.getImageData(0, 0, w, h);
    const data = frame.data;

    let keyR = 0;
    let keyG = 255;
    let keyB = 0;
    if (src.colorKey.chromaKey.keyColor === "blue") {
      keyR = 0;
      keyG = 70;
      keyB = 255;
    } else if (src.colorKey.chromaKey.keyColor === "red") {
      keyR = 255;
      keyG = 25;
      keyB = 25;
    } else if (src.colorKey.chromaKey.keyColor === "custom") {
      const hex = src.colorKey.chromaKey.customHex.replace("#", "");
      if (hex.length === 6) {
        keyR = parseInt(hex.slice(0, 2), 16) || 0;
        keyG = parseInt(hex.slice(2, 4), 16) || 255;
        keyB = parseInt(hex.slice(4, 6), 16) || 0;
      }
    }

    const rgbToCb = (r: number, g: number, b: number) =>
      (-0.100644 * r - 0.338572 * g + 0.439216 * b) / 255.0 + 0.501961;
    const rgbToCr = (r: number, g: number, b: number) =>
      (0.439216 * r - 0.398942 * g - 0.040274 * b) / 255.0 + 0.501961;

    const targetCb = rgbToCb(keyR, keyG, keyB);
    const targetCr = rgbToCr(keyR, keyG, keyB);

    const similarity = Math.max(0.02, (src.colorKey.chromaKey.threshold / 100) * 0.52);
    const smoothness = Math.max(0.01, (src.colorKey.chromaKey.smoothing / 100) * 0.25);
    const spillReduction = Math.max(0.01, (src.colorKey.chromaKey.exposure / 100) * 0.35);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const cb = rgbToCb(r, g, b);
      const cr = rgbToCr(r, g, b);
      const dCb = targetCb - cb;
      const dCr = targetCr - cr;
      const chromaDist = Math.sqrt(dCb * dCb + dCr * dCr);

      const baseMask = chromaDist - similarity;
      const fullMask = Math.pow(Math.max(0, Math.min(1, baseMask / smoothness)), 1.5);
      const spillVal = Math.pow(Math.max(0, Math.min(1, baseMask / spillReduction)), 1.5);

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      data[i] = Math.round(lum * (1 - spillVal) + r * spillVal);
      data[i + 1] = Math.round(lum * (1 - spillVal) + g * spillVal);
      data[i + 2] = Math.round(lum * (1 - spillVal) + b * spillVal);
      data[i + 3] = Math.round(fullMask * 255);
    }
    octx.putImageData(frame, 0, 0);
    return off;
  };

  // Compute cropped visible bounds for any source
  const getCroppedBounds = (src: StageSource) => {
    const { x, y, width, height, cropTop, cropBottom, cropLeft, cropRight } = src.layout;
    const cLeftPx = (cropLeft / 100) * width;
    const cRightPx = (cropRight / 100) * width;
    const cTopPx = (cropTop / 100) * height;
    const cBottomPx = (cropBottom / 100) * height;
    return {
      drawX: x + cLeftPx,
      drawY: y + cTopPx,
      drawW: Math.max(12, width - cLeftPx - cRightPx),
      drawH: Math.max(12, height - cTopPx - cBottomPx),
    };
  };

  // Draw UI Selection Gizmo, 8 Handles (Cyan for Resize, Green for Cropped Edges), and Snap Guides
  const renderGizmoOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, scene: Scene) => {
      ctx.clearRect(0, 0, stageW, stageH);

      const selectedSrc = scene.sources.find(
        (s) => s.id === selectedSourceId && s.layout.visible
      );
      if (selectedSrc) {
        const { x, y, width, height, cropTop, cropBottom, cropLeft, cropRight, lockPosition } =
          selectedSrc.layout;
        const { drawX, drawY, drawW, drawH } = getCroppedBounds(selectedSrc);
        const hasCrop = cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0;

        ctx.save();
        if (hasCrop) {
          ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(x, y, width, height);
          ctx.setLineDash([]);
        }

        ctx.strokeStyle = lockPosition ? "#F59E0B" : "#00F0FF";
        ctx.lineWidth = 3;
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        // OBS Studio style green bars (#10B981) on any cropped edge
        ctx.strokeStyle = "#10B981";
        ctx.lineWidth = 5;
        if (cropTop > 0) {
          ctx.beginPath();
          ctx.moveTo(drawX, drawY);
          ctx.lineTo(drawX + drawW, drawY);
          ctx.stroke();
        }
        if (cropBottom > 0) {
          ctx.beginPath();
          ctx.moveTo(drawX, drawY + drawH);
          ctx.lineTo(drawX + drawW, drawY + drawH);
          ctx.stroke();
        }
        if (cropLeft > 0) {
          ctx.beginPath();
          ctx.moveTo(drawX, drawY);
          ctx.lineTo(drawX, drawY + drawH);
          ctx.stroke();
        }
        if (cropRight > 0) {
          ctx.beginPath();
          ctx.moveTo(drawX + drawW, drawY);
          ctx.lineTo(drawX + drawW, drawY + drawH);
          ctx.stroke();
        }

        const cropBadge = hasCrop ? " [RECORTADO]" : "";
        const labelText = `${selectedSrc.name} (${Math.round(drawW)}×${Math.round(drawH)})${cropBadge}`;
        ctx.font = "bold 18px Inter, sans-serif";
        const textW = ctx.measureText(labelText).width + 24;
        const pillY = drawY > 36 ? drawY - 34 : drawY + 6;
        ctx.fillStyle = lockPosition ? "#F59E0B" : "#00F0FF";
        ctx.fillRect(drawX, pillY, textW, 28);
        ctx.fillStyle = "#04070E";
        ctx.fillText(labelText, drawX + 10, pillY + 20);

        if (!lockPosition) {
          const handleSize = 14;
          const half = handleSize / 2;
          const handleCoords: { pos: HandlePosition; hx: number; hy: number; isCropped: boolean }[] = [
            { pos: "nw", hx: drawX, hy: drawY, isCropped: cropTop > 0 || cropLeft > 0 },
            { pos: "n", hx: drawX + drawW / 2, hy: drawY, isCropped: cropTop > 0 },
            { pos: "ne", hx: drawX + drawW, hy: drawY, isCropped: cropTop > 0 || cropRight > 0 },
            { pos: "e", hx: drawX + drawW, hy: drawY + drawH / 2, isCropped: cropRight > 0 },
            { pos: "se", hx: drawX + drawW, hy: drawY + drawH, isCropped: cropBottom > 0 || cropRight > 0 },
            { pos: "s", hx: drawX + drawW / 2, hy: drawY + drawH, isCropped: cropBottom > 0 },
            { pos: "sw", hx: drawX, hy: drawY + drawH, isCropped: cropBottom > 0 || cropLeft > 0 },
            { pos: "w", hx: drawX, hy: drawY + drawH / 2, isCropped: cropLeft > 0 },
          ];
          ctx.strokeStyle = "#050811";
          ctx.lineWidth = 2;
          for (const h of handleCoords) {
            ctx.fillStyle = h.isCropped ? "#10B981" : "#00F0FF";
            ctx.fillRect(h.hx - half, h.hy - half, handleSize, handleSize);
            ctx.strokeRect(h.hx - half, h.hy - half, handleSize, handleSize);
          }
        }
        ctx.restore();
      }

      if (snapGuides.x !== undefined || snapGuides.y !== undefined) {
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

  // Render a single Scene onto a target 2D context (CLEAN BROADCAST FEED)
  const renderSceneToContext = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      scene: Scene,
      drawGizmosInline: boolean,
      nowMs: number
    ) => {
      ctx.save();
      ctx.fillStyle = "#060911";
      ctx.fillRect(0, 0, stageW, stageH);
      ctx.restore();

      const sortedSources = [...scene.sources]
        .filter((s) => s.layout.visible)
        .sort((a, b) => a.zOrder - b.zOrder);

      for (const src of sortedSources) {
        const {
          x,
          y,
          width,
          height,
          rotX,
          rotY,
          rotZ,
          flipH,
          flipV,
        } = src.layout;

        if (width <= 4 || height <= 4) continue;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, src.colorKey.opacity / 100));

        const cx = x + width / 2;
        const cy = y + height / 2;
        ctx.translate(cx, cy);

        if (rotZ !== 0) {
          ctx.rotate((rotZ * Math.PI) / 180);
        }
        const scale3DX = Math.max(0.15, Math.cos((rotY * Math.PI) / 180)) * (flipH ? -1 : 1);
        const scale3DY = Math.max(0.15, Math.cos((rotX * Math.PI) / 180)) * (flipV ? -1 : 1);
        const skewX = Math.sin((rotY * Math.PI) / 180) * 0.18;
        const skewY = Math.sin((rotX * Math.PI) / 180) * 0.18;
        ctx.transform(scale3DX, skewY, skewX, scale3DY, 0, 0);
        ctx.translate(-cx, -cy);

        const { drawX, drawY, drawW: baseDrawW, drawH } = getCroppedBounds(src);
        let drawW = baseDrawW;

        let lowerThirdHeadlineFontPx = Math.round(drawH * 0.33);
        let lowerThirdSubFontPx = Math.round(drawH * 0.19);
        const lowerThirdHeadlineText =
          src.textContent || "GAMECASTER PLUS // ESTUDIO PRO";
        const lowerThirdSubText =
          [src.subtitleContent, src.socialHandle].filter(Boolean).join("  •  ") ||
          "TRANSMISIÓN EN DIRECTO // 1080P60";

        if (src.type === "lower_third") {
          ctx.font = `800 ${lowerThirdHeadlineFontPx}px Rajdhani, Inter, sans-serif`;
          const headW = ctx.measureText(lowerThirdHeadlineText).width;
          ctx.font = `700 ${lowerThirdSubFontPx}px Inter, sans-serif`;
          const subW = ctx.measureText(lowerThirdSubText).width;
          const maxTextW = Math.max(headW, subW);
          const maxAllowedW = Math.max(320, stageW - drawX - 32);
          drawW = Math.min(maxAllowedW, Math.max(drawW, Math.ceil(maxTextW + 72)));

          const availTextW = Math.max(120, drawW - 56);
          if (headW > availTextW) {
            lowerThirdHeadlineFontPx = Math.max(
              16,
              Math.floor(lowerThirdHeadlineFontPx * (availTextW / headW))
            );
          }
          if (subW > availTextW) {
            lowerThirdSubFontPx = Math.max(
              12,
              Math.floor(lowerThirdSubFontPx * (availTextW / subW))
            );
          }
        }

        if (src.effects.dropShadowEnabled) {
          ctx.shadowColor = src.effects.dropShadowColor || "rgba(0,0,0,0.85)";
          ctx.shadowBlur = src.effects.dropShadowBlur;
          ctx.shadowOffsetX = src.effects.dropShadowDistance * 0.7;
          ctx.shadowOffsetY = src.effects.dropShadowDistance * 0.7;
        }

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

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.filter = buildCssFilterForSource(src);

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
            ctx.font = "bold 20px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
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
            ctx.textBaseline = "middle";
            ctx.fillText(`🖼️ ${src.name}`, x + width / 2, y + height / 2);
          }
        } else if (src.type === "media" || src.type === "replay") {
          const vidKey = `${src.id}_${src.mediaUrl}`;
          const mVid = src.mediaUrl ? videoElementsRef.current[vidKey] : null;
          if (mVid && mVid.readyState >= 2) {
            ctx.drawImage(mVid, x, y, width, height);
          } else {
            ctx.fillStyle = "#090D16";
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = src.type === "replay" ? "#FF2A54" : "#38BDF8";
            ctx.font = "bold 22px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
              src.type === "replay"
                ? "⏪ BUFFER DE REPETICIÓN LISTO (Pulsa Replay)"
                : `🎬 ${src.name}`,
              x + width / 2,
              y + height / 2
            );
          }

          if (src.type === "replay") {
            ctx.save();
            ctx.filter = "none";
            ctx.fillStyle = "#FF2A54";
            ctx.fillRect(drawX + 16, drawY + 16, 235, 38);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 18px Rajdhani, Inter, sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            ctx.fillText("● REPETICIÓN INSTANTÁNEA", drawX + 28, drawY + 41);
            ctx.restore();
          }
        } else if (src.type === "text") {
          ctx.filter = "none";
          const txt = src.textContent || src.name;
          let fSize = src.fontSize || 52;
          const fontFam = src.fontFamily || "Rajdhani, Inter, sans-serif";
          ctx.font = `800 ${fSize}px ${fontFam}`;
          const measuredW = ctx.measureText(txt).width;
          const maxTextW = Math.max(80, drawW - 40);
          if (measuredW > maxTextW) {
            fSize = Math.max(16, Math.floor(fSize * (maxTextW / measuredW)));
            ctx.font = `800 ${fSize}px ${fontFam}`;
          }
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.lineWidth = Math.max(3, fSize * 0.08);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
          ctx.strokeText(txt, drawX + 20, drawY + drawH / 2, maxTextW);
          ctx.fillStyle = src.textColor || "#FFFFFF";
          ctx.fillText(txt, drawX + 20, drawY + drawH / 2, maxTextW);
        } else if (src.type === "lower_third") {
          ctx.filter = "none";
          const pulse = 0.92 + 0.08 * Math.sin(nowMs * 0.004);
          const bgGrad = ctx.createLinearGradient(drawX, drawY, drawX + drawW, drawY);
          bgGrad.addColorStop(0, "rgba(7, 10, 18, 0.95)");
          bgGrad.addColorStop(0.88, "rgba(15, 23, 42, 0.90)");
          bgGrad.addColorStop(1, "rgba(15, 23, 42, 0.0)");
          ctx.fillStyle = bgGrad;
          ctx.fillRect(drawX, drawY, drawW, drawH);

          ctx.fillStyle = src.accentColor || "#00F0FF";
          ctx.fillRect(drawX, drawY, 10, drawH);
          ctx.fillRect(drawX, drawY + drawH - 5, drawW * 0.78 * pulse, 5);

          const availTextW = Math.max(120, drawW - 48);

          ctx.fillStyle = src.textColor || "#FFFFFF";
          ctx.font = `800 ${lowerThirdHeadlineFontPx}px Rajdhani, Inter, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(
            lowerThirdHeadlineText,
            drawX + 28,
            drawY + drawH * 0.16,
            availTextW
          );

          ctx.fillStyle = src.accentColor || "#00F0FF";
          ctx.font = `700 ${lowerThirdSubFontPx}px Inter, sans-serif`;
          ctx.fillText(
            lowerThirdSubText,
            drawX + 28,
            drawY + drawH * 0.58,
            availTextW
          );
        }

        ctx.filter = "none";

        if (src.effects.borderEnabled && src.effects.borderThickness > 0) {
          ctx.strokeStyle = src.effects.borderColor || "#00F0FF";
          ctx.lineWidth = src.effects.borderThickness * 2;
          ctx.stroke();
        }

        ctx.restore();
      }

      if (drawGizmosInline) {
        renderGizmoOverlay(ctx, scene);
      }
    },
    [stageW, stageH, renderGizmoOverlay]
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

  // Apply GPU Transition Shader between snapshotCanvasRef and Newly Rendered Scene
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
      const pgm = pgmCanvasRef.current;
      if (pgm) {
        const ctx = pgm.getContext("2d");
        if (ctx) {
          renderSceneToContext(ctx, activeScene, false, nowMs);

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

      if (!studioMode && pgmGizmoCanvasRef.current) {
        const gctx = pgmGizmoCanvasRef.current.getContext("2d");
        if (gctx) {
          renderGizmoOverlay(gctx, activeScene);
        }
      } else if (studioMode && pgmGizmoCanvasRef.current) {
        const gctx = pgmGizmoCanvasRef.current.getContext("2d");
        if (gctx) {
          gctx.clearRect(0, 0, stageW, stageH);
        }
      }

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
    renderGizmoOverlay,
    pgmCanvasRef,
    stageW,
    stageH,
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

  // Detect if mouse clicked on one of the 8 resize/crop handles of the selected source's cropped bounds
  const hitTestHandle = (
    mx: number,
    my: number,
    src: StageSource
  ): HandlePosition | null => {
    if (src.layout.lockPosition) return null;
    const { drawX, drawY, drawW, drawH } = getCroppedBounds(src);
    const tol = 24;
    const handles: { pos: HandlePosition; hx: number; hy: number }[] = [
      { pos: "nw", hx: drawX, hy: drawY },
      { pos: "n", hx: drawX + drawW / 2, hy: drawY },
      { pos: "ne", hx: drawX + drawW, hy: drawY },
      { pos: "e", hx: drawX + drawW, hy: drawY + drawH / 2 },
      { pos: "se", hx: drawX + drawW, hy: drawY + drawH },
      { pos: "s", hx: drawX + drawW / 2, hy: drawY + drawH },
      { pos: "sw", hx: drawX, hy: drawY + drawH },
      { pos: "w", hx: drawX, hy: drawY + drawH / 2 },
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

    const topDown = [...targetScene.sources]
      .filter((s) => s.layout.visible)
      .sort((a, b) => b.zOrder - a.zOrder);

    for (const src of topDown) {
      const { drawX, drawY, drawW, drawH } = getCroppedBounds(src);
      if (mx >= drawX && mx <= drawX + drawW && my >= drawY && my <= drawY + drawH) {
        onSelectSource(src.id);
        if (!src.layout.lockPosition) {
          setDragState({
            sceneId: targetScene.id,
            sourceId: src.id,
            mode: e.shiftKey ? "rotate" : "move",
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
      const h = dragState.handle || "se";
      const w = Math.max(64, init.layout.width);
      const ht = Math.max(48, init.layout.height);
      const pctX = (dx / w) * 100;
      const pctY = (dy / ht) * 100;

      if (h.includes("w")) {
        next.layout.cropLeft = Math.max(
          0,
          Math.min(80 - init.layout.cropRight, Math.round(init.layout.cropLeft + pctX))
        );
      }
      if (h.includes("e")) {
        next.layout.cropRight = Math.max(
          0,
          Math.min(80 - init.layout.cropLeft, Math.round(init.layout.cropRight - pctX))
        );
      }
      if (h.includes("n")) {
        next.layout.cropTop = Math.max(
          0,
          Math.min(80 - init.layout.cropBottom, Math.round(init.layout.cropTop + pctY))
        );
      }
      if (h.includes("s")) {
        next.layout.cropBottom = Math.max(
          0,
          Math.min(80 - init.layout.cropTop, Math.round(init.layout.cropBottom - pctY))
        );
      }
    } else if (dragState.mode === "rotate") {
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

  const editableScene = studioMode ? previewScene : activeScene;
  const selectedSourceObj = editableScene.sources.find(
    (s) => s.id === selectedSourceId
  );

  const hasCropOnSelected =
    selectedSourceObj &&
    (selectedSourceObj.layout.cropTop > 0 ||
      selectedSourceObj.layout.cropBottom > 0 ||
      selectedSourceObj.layout.cropLeft > 0 ||
      selectedSourceObj.layout.cropRight > 0);

  // Quick Transform Helpers for Toolbar & Right-Click Menu
  const applyFitFullscreen = (src: StageSource, sceneId: string) => {
    onUpdateSource(sceneId, {
      ...src,
      layout: {
        ...src.layout,
        x: 0,
        y: 0,
        width: stageW,
        height: stageH,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
      },
    });
  };

  const applyCenterOnStage = (src: StageSource, sceneId: string) => {
    onUpdateSource(sceneId, {
      ...src,
      layout: {
        ...src.layout,
        x: Math.round((stageW - src.layout.width) / 2),
        y: Math.round((stageH - src.layout.height) / 2),
      },
    });
  };

  const applyResetCrop = (src: StageSource, sceneId: string) => {
    onUpdateSource(sceneId, {
      ...src,
      layout: {
        ...src.layout,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
      },
    });
  };

  const handleCanvasContextMenu = (
    e: React.MouseEvent<HTMLCanvasElement>,
    targetScene: Scene
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const { x: mx, y: my } = getCanvasCoords(e, e.currentTarget);

    // Hit-test top-down to select the layer under the right-click cursor
    const topDown = [...targetScene.sources]
      .filter((s) => s.layout.visible)
      .sort((a, b) => b.zOrder - a.zOrder);

    let hitSource: StageSource | undefined;
    for (const src of topDown) {
      const { drawX, drawY, drawW, drawH } = getCroppedBounds(src);
      if (mx >= drawX && mx <= drawX + drawW && my >= drawY && my <= drawY + drawH) {
        hitSource = src;
        break;
      }
    }

    const targetSrc = hitSource || selectedSourceObj;
    if (!targetSrc) return;

    onSelectSource(targetSrc.id);
    const menuX = Math.min(window.innerWidth - 260, Math.max(12, e.clientX));
    const menuY = Math.min(window.innerHeight - 340, Math.max(48, e.clientY));
    setContextMenu({
      x: menuX,
      y: menuY,
      source: targetSrc,
      sceneId: targetScene.id,
    });
  };

  const [isStageFileDragOver, setIsStageFileDragOver] = useState<boolean>(false);

  const handleStageDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsStageFileDragOver(false);
    if (!onAddDroppedSource) return;

    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const mime = (file.type || "").toLowerCase();
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (
        mime.startsWith("image/") ||
        ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext)
      ) {
        onAddDroppedSource("image", `Imagen: ${file.name}`, {
          mediaUrl: url,
        });
      } else if (
        mime.startsWith("video/") ||
        mime.startsWith("audio/") ||
        ["mp4", "mkv", "webm", "mov", "avi", "mp3", "wav", "ogg"].includes(ext)
      ) {
        onAddDroppedSource("media", `Multimedia: ${file.name}`, {
          mediaUrl: url,
          mediaLoop: true,
        });
      }
    }
  };

  return (
    <div
      className="relative flex-1 flex flex-col bg-[#05070B] border-b border-slate-800/80 overflow-hidden select-none"
      onClick={() => {
        if (contextMenu) setContextMenu(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isStageFileDragOver) setIsStageFileDragOver(true);
      }}
      onDragLeave={() => setIsStageFileDragOver(false)}
      onDrop={handleStageDropFiles}
    >
      {isStageFileDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 bg-[#050811]/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#00F0FF] m-3 rounded-xl">
          <UploadCloud className="w-10 h-10 text-[#00F0FF] animate-bounce" />
          <span className="text-sm font-bold text-[#00F0FF]">
            Suelta aquí tu Imagen o Vídeo para añadirlo al Lienzo
          </span>
        </div>
      )}
      {/* Stage Sub-Header: Quick Capture Selector (Module 1) + Quick Transform & Zoom (Module 2) */}
      <div className="h-9 px-3 bg-[#0B0E17] border-b border-slate-800/80 flex items-center justify-between text-xs shrink-0 gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="px-2 py-0.5 rounded bg-slate-800/90 text-[#00F0FF] font-mono font-semibold text-[11px]">
            {isPortraitCanvas ? "9:16 (1080×1920)" : "16:9 (1920×1080)"}
          </span>
          <button
            onClick={onToggleSnapToGrid}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
              snapToGrid
                ? "bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
            }`}
            title="Ajuste magnético a bordes y centro del escenario (SnapToGrid)"
          >
            <Grid className="w-3 h-3" />
            <span>Guías</span>
          </button>

          {selectedSourceObj && (
            <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-slate-800 text-slate-300">
              <span className="font-semibold text-[#00F0FF] max-w-[150px] truncate">
                {selectedSourceObj.name}
              </span>
              {selectedSourceObj.layout.lockPosition && (
                <Lock className="w-3 h-3 text-amber-400" />
              )}

              {/* MODULE 1: Direct Quick Monitor Selector when "screen" source is active */}
              {selectedSourceObj.type === "screen" && (
                <div className="flex items-center gap-1 ml-1">
                  <select
                    value={selectedSourceObj.monitorIndex ?? 0}
                    onClick={() => refreshMonitorsList()}
                    onChange={(e) =>
                      onUpdateSource(editableScene.id, {
                        ...selectedSourceObj,
                        monitorIndex: Number(e.target.value),
                      })
                    }
                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-100 focus:border-[#00F0FF] outline-none max-w-[190px]"
                    title="Seleccionar Monitor de Captura en Directo"
                  >
                    {monitors.length > 0 ? (
                      monitors.map((m) => (
                        <option key={m.index} value={m.index}>
                          🖥️ {m.name}
                        </option>
                      ))
                    ) : (
                      <option value={0}>🖥️ Monitor Principal #1</option>
                    )}
                  </select>
                  <button
                    onClick={() =>
                      onUpdateSource(editableScene.id, {
                        ...selectedSourceObj,
                        showCursor: selectedSourceObj.showCursor === false,
                      })
                    }
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-medium transition ${
                      selectedSourceObj.showCursor !== false
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                    title="Mostrar u ocultar el cursor del ratón en la captura de pantalla"
                  >
                    🖱️ Cursor: {selectedSourceObj.showCursor !== false ? "Sí" : "No"}
                  </button>
                </div>
              )}

              {/* MODULE 1: Direct Quick Window / Game Selector when "window" source is active */}
              {selectedSourceObj.type === "window" && (
                <div className="flex items-center gap-1 ml-1">
                  <select
                    value={selectedSourceObj.windowHwnd || 0}
                    onChange={(e) => {
                      const hwndVal = Number(e.target.value);
                      const winObj = openWindows.find((w) => w.hwnd === hwndVal);
                      onUpdateSource(editableScene.id, {
                        ...selectedSourceObj,
                        windowHwnd: hwndVal || undefined,
                        windowTitle: winObj?.title || selectedSourceObj.windowTitle,
                      });
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-100 focus:border-[#00F0FF] outline-none max-w-[210px]"
                    title="Seleccionar Ventana o Juego Abierto"
                  >
                    <option value={0}>🎮 Elegir ventana / juego...</option>
                    {openWindows.map((w) => (
                      <option key={w.hwnd} value={w.hwnd}>
                        {w.title.slice(0, 40)} ({w.width}×{w.height})
                      </option>
                    ))}
                  </select>
                  {onRefreshWindows && (
                    <button
                      onClick={onRefreshWindows}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                      title="Actualizar lista de ventanas abiertas"
                    >
                      <RefreshCw className="w-3 h-3 text-[#00F0FF]" />
                    </button>
                  )}
                </div>
              )}

              {/* MODULE 2: Quick Transform Buttons right on the Stage Header */}
              <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-slate-800">
                <button
                  onClick={() =>
                    applyFitFullscreen(selectedSourceObj, editableScene.id)
                  }
                  className="px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[10px]"
                  title="Ajustar fuente a pantalla completa (1920×1080)"
                >
                  <Maximize2 className="w-2.5 h-2.5 text-[#00F0FF]" />
                  <span>Ajustar</span>
                </button>
                <button
                  onClick={() =>
                    applyCenterOnStage(selectedSourceObj, editableScene.id)
                  }
                  className="px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[10px]"
                  title="Centrar fuente en el escenario"
                >
                  <Crosshair className="w-2.5 h-2.5 text-emerald-400" />
                  <span>Centrar</span>
                </button>
                {hasCropOnSelected && (
                  <button
                    onClick={() =>
                      applyResetCrop(selectedSourceObj, editableScene.id)
                    }
                    className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 flex items-center gap-1 text-[10px] font-semibold"
                    title="Restablecer recorte (quitar bordes verdes Alt+Drag)"
                  >
                    <Scissors className="w-2.5 h-2.5" />
                    <span>Quitar Recorte</span>
                  </button>
                )}
                <button
                  onClick={() =>
                    onOpenSourceProperties(selectedSourceObj, editableScene.id)
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[10px]"
                  title="Abrir Inspector Completo (Chroma Key, Máscaras, Color, 3D)"
                >
                  <Settings className="w-3 h-3 text-[#00F0FF]" />
                  <span>Propiedades</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Stage Zoom Controls + Collapsible Whiteboard Telestrator Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-[#070A12] border border-slate-800 rounded px-1 py-0.5 text-[10px] font-mono text-slate-300">
            <button
              onClick={() =>
                setStageZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))
              }
              className="px-1 hover:text-[#00F0FF]"
              title="Alejar vista del lienzo"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              onClick={() => setStageZoom(1.0)}
              className="px-1.5 hover:text-[#00F0FF]"
              title="Restablecer Zoom Automático (100%)"
            >
              {Math.round(stageZoom * 100)}%
            </button>
            <button
              onClick={() =>
                setStageZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))
              }
              className="px-1 hover:text-[#00F0FF]"
              title="Acercar vista del lienzo"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {wbStrokes.length > 0 && !showWhiteboardBar && (
            <button
              onClick={() => setWbStrokes([])}
              className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 text-[11px] flex items-center gap-1"
              title="Limpiar trazos de la pizarra"
            >
              <Trash2 className="w-3 h-3" /> Limpiar ({wbStrokes.length})
            </button>
          )}
          <button
            onClick={() => {
              setShowWhiteboardBar((prev) => {
                const next = !prev;
                if (!next) {
                  setWbTool("select");
                } else if (wbTool === "select") {
                  setWbTool("pen");
                }
                return next;
              });
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
              showWhiteboardBar
                ? "bg-[#00F0FF] text-slate-950 border-[#00F0FF] shadow-[0_0_12px_rgba(0,240,255,0.4)]"
                : "bg-[#070A12] text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
            }`}
            title="Desplegar barra flotante de Pizarra Táctica en Vivo (Whiteboard Telestrator)"
          >
            <span>✏️ Pizarra</span>
            {showWhiteboardBar && (
              <span className="text-[10px] font-mono uppercase px-1 rounded bg-slate-950/25">
                ON
              </span>
            )}
          </button>
        </div>
      </div>

      {/* FLOATING WHITEBOARD TELESTRATOR BAR */}
      {showWhiteboardBar && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-[#0B0E17]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#00F0FF]/50 shadow-[0_10px_30px_rgba(0,0,0,0.85)]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#00F0FF] font-bold mr-1">
            ✏️ Telestrator:
          </span>
          {[
            { id: "select", icon: MousePointer, label: "Seleccionar / Mover Capas" },
            { id: "pen", icon: PenTool, label: "Pluma Libre" },
            { id: "highlighter", icon: Highlighter, label: "Marcador Fluorescente" },
            { id: "arrow", icon: ArrowUpRight, label: "Flecha Táctica" },
            { id: "rect", icon: Square, label: "Rectángulo" },
            { id: "circle", icon: CircleIcon, label: "Círculo" },
            { id: "laser", icon: Sparkles, label: "Puntero Láser (Auto-borrado 2.5s)" },
          ].map((item) => {
            const Icon = item.icon;
            const active = wbTool === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setWbTool(item.id as WhiteboardTool)}
                title={item.label}
                className={`p-1.5 rounded-lg transition ${
                  active
                    ? "bg-[#00F0FF] text-slate-950 shadow-[0_0_8px_rgba(0,240,255,0.4)]"
                    : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}

          <div className="h-4 w-[1px] bg-slate-800 mx-1" />

          {["#00F0FF", "#FF2A54", "#F59E0B", "#10B981", "#FFFFFF"].map((c) => (
            <button
              key={c}
              onClick={() => setWbColor(c)}
              className={`w-4 h-4 rounded-full border transition ${
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
            className="w-16 h-1.5 ml-1"
            title={`Grosor de trazo: ${wbWidth}px`}
          />

          <button
            onClick={() => setWbStrokes((prev) => prev.slice(0, -1))}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
            title="Deshacer último trazo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setWbStrokes([])}
            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
            title="Borrar toda la pizarra"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setShowWhiteboardBar(false);
              setWbTool("select");
            }}
            className="ml-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
            title="Ocultar barra de pizarra"
          >
            ✕
          </button>
        </div>
      )}

      {/* MODULE 2: STUDIO RIGHT-CLICK CONTEXT MENU ON CANVAS */}
      {contextMenu && (
        <div
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-64 rounded-xl bg-[#0D121F]/95 backdrop-blur-md border border-slate-700 shadow-[0_18px_50px_rgba(0,0,0,0.9)] py-1.5 text-xs text-slate-200"
        >
          <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
            <span className="font-bold text-[#00F0FF] truncate">
              {contextMenu.source.name}
            </span>
            <span className="text-[10px] font-mono text-slate-400 uppercase">
              {contextMenu.source.type}
            </span>
          </div>

          <button
            onClick={() => {
              onOpenSourceProperties(contextMenu.source, contextMenu.sceneId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] flex items-center gap-2"
          >
            <Settings className="w-3.5 h-3.5 text-[#00F0FF]" />
            <span>Propiedades, Chroma Key y Efectos...</span>
          </button>

          <div className="my-1 border-t border-slate-800/80" />

          <button
            onClick={() => {
              applyFitFullscreen(contextMenu.source, contextMenu.sceneId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
          >
            <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ajustar a Pantalla Completa ({stageW}×{stageH})</span>
          </button>

          <button
            onClick={() => {
              applyCenterOnStage(contextMenu.source, contextMenu.sceneId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
          >
            <Crosshair className="w-3.5 h-3.5 text-[#00F0FF]" />
            <span>Centrar en el Escenario</span>
          </button>

          <button
            onClick={() => {
              applyResetCrop(contextMenu.source, contextMenu.sceneId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
          >
            <Scissors className="w-3.5 h-3.5 text-emerald-400" />
            <span>Restablecer Recorte (Crop 0%)</span>
          </button>

          <button
            onClick={() => {
              onUpdateSource(contextMenu.sceneId, {
                ...contextMenu.source,
                layout: {
                  ...contextMenu.source.layout,
                  rotX: 0,
                  rotY: 0,
                  rotZ: 0,
                },
              });
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Restablecer Giro 3D (0°)</span>
          </button>

          <button
            onClick={() => {
              onUpdateSource(contextMenu.sceneId, {
                ...contextMenu.source,
                layout: {
                  ...contextMenu.source.layout,
                  flipH: !contextMenu.source.layout.flipH,
                },
              });
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
          >
            <FlipHorizontal className="w-3.5 h-3.5 text-purple-400" />
            <span>Voltear Horizontalmente (Espejo)</span>
          </button>

          <div className="my-1 border-t border-slate-800/80" />

          <button
            onClick={() => {
              onUpdateSource(contextMenu.sceneId, {
                ...contextMenu.source,
                zOrder: contextMenu.source.zOrder + 2,
              });
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
          >
            <ArrowUp className="w-3.5 h-3.5 text-slate-300" />
            <span>Traer al Frente (Subir Capa)</span>
          </button>

          <button
            onClick={() => {
              onUpdateSource(contextMenu.sceneId, {
                ...contextMenu.source,
                zOrder: Math.max(0, contextMenu.source.zOrder - 2),
              });
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
          >
            <ArrowDown className="w-3.5 h-3.5 text-slate-300" />
            <span>Enviar al Fondo (Bajar Capa)</span>
          </button>

          <button
            onClick={() => {
              onUpdateSource(contextMenu.sceneId, {
                ...contextMenu.source,
                layout: {
                  ...contextMenu.source.layout,
                  lockPosition: !contextMenu.source.layout.lockPosition,
                },
              });
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
          >
            {contextMenu.source.layout.lockPosition ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-amber-400" />
                <span>Desbloquear Posición</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Bloquear Posición en el Lienzo</span>
              </>
            )}
          </button>

          {onDeleteSource && (
            <>
              <div className="my-1 border-t border-slate-800/80" />
              <button
                onClick={() => {
                  onDeleteSource(contextMenu.source.id);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-rose-400 hover:bg-rose-500/15 flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar Fuente de la Escena</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Central Stage Canvas Area (Measured by ResizeObserver for 1:1 16:9 / 9:16 Aspect Ratio) */}
      <div
        ref={stageContainerRef}
        onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            setStageZoom((z) =>
              Math.max(0.5, Math.min(1.6, Number((z + delta).toFixed(2))))
            );
          }
        }}
        className="flex-1 min-h-0 flex items-center justify-center gap-3 p-2.5 overflow-auto bg-[radial-gradient(ellipse_at_center,_#0D1322_0%,_#05070B_100%)]"
      >
        {/* LEFT MONITOR: PREVIEW EDITOR */}
        {studioMode && (
          <div className="flex flex-col items-center justify-center">
            <div className="w-full flex items-center justify-between px-1 mb-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  VISTA PREVIA (PREVIEW)
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  {previewScene.name}
                </span>
              </div>
            </div>
            <div
              style={{ width: `${fittedSize.w}px`, height: `${fittedSize.h}px` }}
              className="relative overflow-hidden rounded-lg border border-amber-500/40 bg-black shadow-inner"
            >
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
                onContextMenu={(e) => handleCanvasContextMenu(e, previewScene)}
                className="absolute inset-0 w-full h-full block cursor-move"
              />
            </div>
          </div>
        )}

        {/* STUDIO MODE CENTER PUSH LIVE BUTTON */}
        {studioMode && (
          <div className="flex flex-col items-center justify-center gap-2 px-1 shrink-0">
            <button
              onClick={onPushLive}
              className="px-3.5 py-2.5 rounded-lg bg-gradient-to-b from-[#00F0FF] to-[#2563EB] text-slate-950 font-display font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:brightness-110 active:scale-95 transition flex flex-col items-center gap-1"
              title="Empujar escena de Vista Previa a Emisión en Vivo"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>PUSH LIVE</span>
              <span className="text-[9px] font-mono opacity-80">
                {activeTransition.toUpperCase()} ({transitionDurationMs}ms)
              </span>
            </button>
          </div>
        )}

        {/* RIGHT / MAIN MONITOR: LIVE PROGRAM OUTPUT (PGM) */}
        <div className="flex flex-col items-center justify-center">
          {studioMode && (
            <div className="w-full flex items-center justify-between px-1 mb-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  PROGRAMA EN VIVO (PGM)
                </span>
                <span className="text-xs font-semibold text-white">
                  {activeScene.name}
                </span>
              </div>
            </div>
          )}

          {/* Exact 16:9 / 9:16 Fitted Stage Container */}
          <div
            style={{ width: `${fittedSize.w}px`, height: `${fittedSize.h}px` }}
            className={`relative overflow-hidden rounded-lg border ${
              studioMode
                ? "border-rose-500/50"
                : "border-slate-800/90 hover:border-[#00F0FF]/50"
            } bg-black shadow-[0_0_35px_rgba(0,0,0,0.85)] transition`}
          >
            {/* CLEAN RECORDABLE PROGRAM CANVAS */}
            <canvas
              ref={pgmCanvasRef}
              width={stageW}
              height={stageH}
              onMouseDown={(e) => {
                if (contextMenu) setContextMenu(null);
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
                if (!studioMode) {
                  handleCanvasContextMenu(e, activeScene);
                }
              }}
              className={`absolute inset-0 w-full h-full block ${
                wbTool !== "select"
                  ? "cursor-crosshair"
                  : studioMode
                  ? "cursor-default"
                  : "cursor-move"
              }`}
            />

            {/* TRANSPARENT UI GIZMO OVERLAY CANVAS (Identical pixel box, never recorded) */}
            <canvas
              ref={pgmGizmoCanvasRef}
              width={stageW}
              height={stageH}
              className="pointer-events-none absolute inset-0 w-full h-full block"
            />

            {/* Subtle Corner Hints */}
            {!studioMode && (
              <div className="pointer-events-none absolute bottom-2 right-2.5 flex items-center gap-2 bg-slate-950/85 backdrop-blur px-2.5 py-1 rounded border border-slate-800/80 text-[10px] text-slate-400">
                <span>Clic + Arrastrar: Mover/Estirar</span>
                <span>•</span>
                <span className="text-emerald-400 font-medium">
                  Alt + Tirador: Recortar Borde
                </span>
                <span>•</span>
                <span>Clic Derecho: Menú Rápido</span>
                <span>•</span>
                <span>Doble Clic: Propiedades ⚙️</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
