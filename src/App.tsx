import React, { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AudioBusChannel,
  AutoSceneRule,
  HardwareTelemetry,
  Scene,
  SourceType,
  StageSource,
  StreamChannelConfig,
  TRANSITION_LIST,
  TransitionId,
  TransitionOverrideRule,
  WindowInfo,
  createDefaultSource,
} from "./types/broadcaster";
import { GamecasterLogo } from "./components/GamecasterLogo";
import { StageCompositor } from "./components/StageCompositor";
import { SourcePropertiesModal } from "./components/SourcePropertiesModal";
import { StudioModals, StudioModalType } from "./components/StudioModals";
import {
  Radio,
  CircleDot,
  Camera,
  RotateCcw,
  Columns,
  Smartphone,
  Monitor,
  Plus,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  Settings,
  Volume2,
  VolumeX,
  Sliders,
  FolderOpen,
  Film,
  Sparkles,
  Layers,
  Cpu,
  HardDrive,
} from "lucide-react";

const INITIAL_SCENES: Scene[] = [
  {
    id: "scene_1",
    name: "Escena 1: Estudio Principal",
    sources: [
      createDefaultSource("screen", "Captura de Monitor Principal", 1),
      createDefaultSource("lower_third", "Tercio Inferior Broadcast", 2, {
        textContent: "GAMECASTER PLUS // ESTUDIO PRO",
        subtitleContent: "COMPOSITOR DIRECT3D • 1080P 60FPS SIN MARCA DE AGUA",
        socialHandle: "@bornicho1982",
        accentColor: "#00F0FF",
      }),
    ],
    perSceneMicVolume: 90,
    perSceneSystemVolume: 85,
  },
  {
    id: "scene_2",
    name: "Escena 2: Gameplay + PIP",
    sources: [
      createDefaultSource("screen", "Captura de Juego / Escritorio", 1),
      createDefaultSource("text", "Rótulo Superior En Vivo", 2, {
        textContent: "PARTIDA EN DIRECTO • 60 FPS",
        fontSize: 42,
        textColor: "#00F0FF",
      }),
    ],
    perSceneMicVolume: 95,
    perSceneSystemVolume: 90,
  },
  {
    id: "scene_3",
    name: "Escena 3: Charlando (Just Chatting)",
    sources: [
      createDefaultSource("color", "Fondo Degradado Obsidian", 1, {
        bgColor: "#0B132B",
        gradientEndColor: "#1C0F36",
      }),
      createDefaultSource("screen", "Monitor en Ventana PIP", 2, {
        layout: {
          x: 110,
          y: 130,
          width: 1120,
          height: 630,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
          rotX: 0,
          rotY: 8,
          rotZ: 0,
          flipH: false,
          flipV: false,
          keepAspectRatio: true,
          lockPosition: false,
          visible: true,
        },
        effects: {
          shader: "none",
          intensity: 75,
          maskShape: "rounded",
          borderEnabled: true,
          borderThickness: 3,
          borderRadius: 16,
          borderColor: "#00F0FF",
          dropShadowEnabled: true,
          dropShadowDistance: 14,
          dropShadowBlur: 24,
          dropShadowColor: "#000000",
          enterTransition: "fade",
          exitTransition: "fade",
          transitionDurationMs: 400,
        },
      }),
      createDefaultSource("lower_third", "Tercio Inferior Charlando", 3, {
        textContent: "CHARLANDO CON EL CHAT EN VIVO",
        subtitleContent: "DEBATE Y ANÁLISIS EN DIRECTO",
        socialHandle: "@bornicho1982",
        accentColor: "#7C3AED",
      }),
    ],
    perSceneMicVolume: 100,
    perSceneSystemVolume: 50,
  },
  {
    id: "scene_4",
    name: "Escena 4: Ya Volvemos (BRB)",
    sources: [
      createDefaultSource("color", "Fondo Cyber Pausa", 1, {
        bgColor: "#070A14",
        gradientEndColor: "#2A081E",
      }),
      createDefaultSource("text", "Mensaje Ya Volvemos", 2, {
        textContent: "YA VOLVEMOS EN UNOS MINUTOS...",
        fontSize: 68,
        textColor: "#FF2A54",
        layout: {
          x: 340,
          y: 440,
          width: 1240,
          height: 160,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
          rotX: 0,
          rotY: 0,
          rotZ: 0,
          flipH: false,
          flipV: false,
          keepAspectRatio: false,
          lockPosition: false,
          visible: true,
        },
      }),
    ],
    perSceneMicVolume: 0,
    perSceneSystemVolume: 100,
    perSceneMicMuted: true,
  },
];

export const App: React.FC = () => {
  // Scenes & Studio State
  const [scenes, setScenes] = useState<Scene[]>(INITIAL_SCENES);
  const [activeSceneId, setActiveSceneId] = useState<string>("scene_1");
  const [previewSceneId, setPreviewSceneId] = useState<string>("scene_2");
  const [studioMode, setStudioMode] = useState<boolean>(false);
  const [isPortraitCanvas, setIsPortraitCanvas] = useState<boolean>(false);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    INITIAL_SCENES[0].sources[0].id
  );

  // Transitions State
  const [activeTransition, setActiveTransition] =
    useState<TransitionId>("fade");
  const [transitionDurationMs, setTransitionDurationMs] = useState<number>(600);
  const [transitionTriggerCount, setTransitionTriggerCount] =
    useState<number>(0);
  const [transitionRules, setTransitionRules] = useState<
    TransitionOverrideRule[]
  >([
    {
      id: "tr_default_1",
      fromSceneId: "scene_1",
      toSceneId: "scene_4",
      transition: "stinger",
      durationMs: 800,
    },
  ]);

  // Capture Frames & Open Windows State
  const [desktopFrame, setDesktopFrame] = useState<string | null>(null);
  const [windowFramesMap, setWindowFramesMap] = useState<
    Record<number, string>
  >({});
  const [openWindows, setOpenWindows] = useState<WindowInfo[]>([]);
  const [foregroundWindow, setForegroundWindow] = useState<WindowInfo | null>(
    null
  );

  // Auto Scene Switcher State
  const [autoSwitcherEnabled, setAutoSwitcherEnabled] =
    useState<boolean>(false);
  const [autoSceneRules, setAutoSceneRules] = useState<AutoSceneRule[]>([
    {
      id: "asr_1",
      windowTitleMatch: "Notepad",
      targetSceneId: "scene_2",
      enabled: true,
    },
  ]);

  // Pro 6-Track Audio Mixer State
  const [perSceneAudioEnabled, setPerSceneAudioEnabled] =
    useState<boolean>(true);
  const [audioBuses, setAudioBuses] = useState<AudioBusChannel[]>([
    {
      id: "bus_system",
      name: "Audio del Sistema / Juego",
      kind: "system",
      volume: 85,
      muted: false,
      gainDb: 0,
      delayMs: 0,
      monoMix: false,
      noiseSuppression: false,
      noiseGateThreshold: -45,
      tracks: [true, true, false, false, false, false],
    },
    {
      id: "bus_mic",
      name: "Micrófono Principal (IA DSP)",
      kind: "mic",
      volume: 90,
      muted: false,
      gainDb: 2,
      delayMs: 40,
      monoMix: true,
      noiseSuppression: true,
      noiseGateThreshold: -38,
      tracks: [true, false, true, false, false, false],
    },
  ]);
  const [vuLevels, setVuLevels] = useState<{ system: number; mic: number }>({
    system: 18,
    mic: 12,
  });

  // Recording, Composed Canvas Recording & Streaming State
  const [isRecordingNative, setIsRecordingNative] = useState<boolean>(false);
  const [isRecordingCanvas, setIsRecordingCanvas] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Multistreaming Channels (pre-loaded with user's Twitch & Kick setup from Placements.bpres)
  const [streamChannels, setStreamChannels] = useState<StreamChannelConfig[]>([
    {
      id: "ch_twitch",
      platform: "Twitch",
      name: "bornicho",
      rtmpUrl: "rtmp://live.twitch.tv/app",
      streamKey: "",
      bitrateKbps: 6000,
      enabled: true,
    },
    {
      id: "ch_kick",
      platform: "Kick",
      name: "kick.com",
      rtmpUrl: "rtmps://fa723fc1b171.global-contribute.live-video.net/app",
      streamKey: "",
      bitrateKbps: 6000,
      enabled: false,
    },
    {
      id: "ch_youtube",
      platform: "YouTube Live",
      name: "Canal Principal 4K60",
      rtmpUrl: "rtmp://a.rtmp.youtube.com/live2",
      streamKey: "",
      bitrateKbps: 9000,
      enabled: false,
    },
  ]);

  // Modals & Dropdowns
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showAddSourceMenu, setShowAddSourceMenu] = useState<boolean>(false);
  const [inspectorTarget, setInspectorTarget] = useState<{
    source: StageSource;
    sceneId: string;
  } | null>(null);
  const [activeStudioModal, setActiveStudioModal] =
    useState<StudioModalType>(null);

  // Telemetry
  const [telemetry, setTelemetry] = useState<HardwareTelemetry>({
    cpu_brand: "AMD Ryzen / Intel Core",
    cpu_usage_percent: 4.2,
    ram_used_gb: 7.4,
    ram_total_gb: 32.0,
    gpu_name: "NVIDIA GeForce RTX 3060",
    gpu_vram_used_mb: 1420,
    gpu_vram_total_mb: 12288,
    gpu_utilization_percent: 11,
  });

  // Refs for Master PGM Canvas & Composed Canvas Recorder
  const pgmCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRecorderRef = useRef<MediaRecorder | null>(null);
  const canvasChunksRef = useRef<Blob[]>([]);
  const fileInputImageRef = useRef<HTMLInputElement | null>(null);
  const fileInputMediaRef = useRef<HTMLInputElement | null>(null);

  const activeScene =
    scenes.find((s) => s.id === activeSceneId) || scenes[0];
  const previewScene =
    scenes.find((s) => s.id === previewSceneId) || scenes[0];
  const editableScene = studioMode ? previewScene : activeScene;

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const refreshOpenWindows = useCallback(async () => {
    try {
      const wins = await invoke<WindowInfo[]>("list_open_windows");
      setOpenWindows(wins);
    } catch {
      // Ignore outside Tauri
    }
  }, []);

  // Switch active scene with Transition Override check & Per-Scene Audio
  const switchToScene = useCallback(
    (targetSceneId: string) => {
      if (targetSceneId === activeSceneId) return;

      // Check Transition Override Manager rules
      const rule = transitionRules.find(
        (r) => r.fromSceneId === activeSceneId && r.toSceneId === targetSceneId
      );
      if (rule) {
        setActiveTransition(rule.transition);
        setTransitionDurationMs(rule.durationMs);
      }

      setActiveSceneId(targetSceneId);
      setTransitionTriggerCount((c) => c + 1);

      const nextSc = scenes.find((s) => s.id === targetSceneId);
      if (nextSc) {
        if (nextSc.sources.length > 0) {
          setSelectedSourceId(nextSc.sources[nextSc.sources.length - 1].id);
        }
        // Apply Per-Scene Audio profile if enabled (`perSceneAudioplg.plg`)
        if (perSceneAudioEnabled) {
          setAudioBuses((prev) =>
            prev.map((bus) => {
              if (bus.kind === "mic") {
                return {
                  ...bus,
                  volume: nextSc.perSceneMicVolume ?? bus.volume,
                  muted: nextSc.perSceneMicMuted ?? false,
                };
              }
              if (bus.kind === "system") {
                return {
                  ...bus,
                  volume: nextSc.perSceneSystemVolume ?? bus.volume,
                };
              }
              return bus;
            })
          );
        }
      }
    },
    [activeSceneId, transitionRules, scenes, perSceneAudioEnabled]
  );

  // Golden Rule #4: Sequential async loop for desktop & window capture (Zero CPU spike)
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;

    const pollCapture = async () => {
      if (cancelled) return;
      try {
        const frame = await invoke<string>("capture_live_frame", {
          width: 960,
          height: 540,
        });
        if (!cancelled && frame.startsWith("data:image/jpeg;base64,")) {
          setDesktopFrame(frame);
        }

        // Capture any active specific window sources
        const allSources = [
          ...activeScene.sources,
          ...(studioMode ? previewScene.sources : []),
        ];
        const winSources = allSources.filter(
          (s) => s.type === "window" && s.layout.visible && s.windowHwnd
        );
        for (const ws of winSources) {
          if (ws.windowHwnd) {
            const wFrame = await invoke<string>("capture_window_frame", {
              hwnd: ws.windowHwnd,
              width: 960,
              height: 540,
            });
            if (!cancelled && wFrame.startsWith("data:image/jpeg;base64,")) {
              setWindowFramesMap((prev) => ({
                ...prev,
                [ws.windowHwnd!]: wFrame,
              }));
            }
          }
        }
      } catch {
        // Fallback when not in Tauri
      }
      if (!cancelled) {
        timerId = setTimeout(pollCapture, 110);
      }
    };

    pollCapture();
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [activeScene, previewScene, studioMode]);

  // Sequential Hardware Telemetry & Auto Scene Switcher Loop
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;

    const pollTelemetryAndWindow = async () => {
      if (cancelled) return;
      try {
        const hw = await invoke<HardwareTelemetry>("get_hardware_telemetry");
        if (!cancelled) setTelemetry(hw);

        const fg = await invoke<WindowInfo | null>("get_active_window_info");
        if (!cancelled && fg) {
          setForegroundWindow(fg);
          if (autoSwitcherEnabled) {
            const matchedRule = autoSceneRules.find(
              (r) =>
                r.enabled &&
                fg.title
                  .toLowerCase()
                  .includes(r.windowTitleMatch.toLowerCase())
            );
            if (matchedRule && matchedRule.targetSceneId !== activeSceneId) {
              switchToScene(matchedRule.targetSceneId);
            }
          }
        }
      } catch {
        // Ignore
      }
      if (!cancelled) {
        timerId = setTimeout(pollTelemetryAndWindow, 1800);
      }
    };

    pollTelemetryAndWindow();
    refreshOpenWindows();
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [
    autoSwitcherEnabled,
    autoSceneRules,
    activeSceneId,
    switchToScene,
    refreshOpenWindows,
  ]);

  // Real Web Audio API Microphone Analyzer + System Audio Meter
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let micStream: MediaStream | null = null;
    let timerId: ReturnType<typeof setInterval>;

    navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        micStream = stream;
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
      })
      .catch(() => {});

    timerId = setInterval(() => {
      let micVal = 8;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        micVal = Math.min(100, Math.round(avg * 1.6));
      }
      setVuLevels((prev) => {
        const sysBus = audioBuses.find((b) => b.kind === "system");
        const micBus = audioBuses.find((b) => b.kind === "mic");
        const sysTarget = sysBus?.muted
          ? 0
          : Math.round(
              ((sysBus?.volume || 80) * (0.45 + Math.random() * 0.25))
            );
        const finalMic = micBus?.muted
          ? 0
          : Math.round((micVal * (micBus?.volume || 90)) / 100);
        return {
          system: Math.round(prev.system * 0.4 + sysTarget * 0.6),
          mic: finalMic,
        };
      });
    }, 120);

    return () => {
      clearInterval(timerId);
      micStream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close().catch(() => {});
    };
  }, [audioBuses]);

  // Session Timer for Recording / Streaming
  useEffect(() => {
    if (!isRecordingNative && !isRecordingCanvas && !isStreaming) {
      setSessionSeconds(0);
      return;
    }
    const id = setInterval(() => setSessionSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecordingNative, isRecordingCanvas, isStreaming]);

  const formatTimer = (sec: number) => {
    const h = Math.floor(sec / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((sec % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Source Manipulation Helpers
  const handleUpdateSource = (sceneId: string, updated: StageSource) => {
    setScenes((prev) =>
      prev.map((sc) =>
        sc.id === sceneId
          ? {
              ...sc,
              sources: sc.sources.map((s) =>
                s.id === updated.id ? updated : s
              ),
            }
          : sc
      )
    );
    if (inspectorTarget && inspectorTarget.source.id === updated.id) {
      setInspectorTarget({ source: updated, sceneId });
    }
  };

  const handleAddSourceToEditableScene = (
    type: SourceType,
    name: string,
    extra?: Partial<StageSource>
  ) => {
    const maxZ = editableScene.sources.reduce(
      (max, s) => Math.max(max, s.zOrder),
      0
    );
    const newSource = createDefaultSource(type, name, maxZ + 1, extra);
    setScenes((prev) =>
      prev.map((sc) =>
        sc.id === editableScene.id
          ? { ...sc, sources: [...sc.sources, newSource] }
          : sc
      )
    );
    setSelectedSourceId(newSource.id);
    setShowAddSourceMenu(false);

    if (
      type === "window" ||
      type === "text" ||
      type === "lower_third" ||
      type === "color"
    ) {
      setInspectorTarget({ source: newSource, sceneId: editableScene.id });
    }
  };

  // Native Desktop Recording Toggle
  const handleToggleNativeRecording = async () => {
    try {
      if (!isRecordingNative) {
        const path = await invoke<string>("start_recording");
        setIsRecordingNative(true);
        showToast(`🔴 Grabando MP4 Nativo en: ${path}`);
      } else {
        const savedPath = await invoke<string>("stop_recording");
        setIsRecordingNative(false);
        showToast(`✅ Grabación MP4 finalizada y guardada: ${savedPath}`);
      }
    } catch (e) {
      showToast(`Error de grabación: ${String(e)}`);
    }
  };

  // Composed Stage Canvas Recording Toggle (Records Scene + Webcam PIP + Lower Thirds + Filters + Whiteboard)
  const handleToggleComposedCanvasRecording = async () => {
    if (!isRecordingCanvas) {
      const canvas = pgmCanvasRef.current;
      if (!canvas) return;
      try {
        const stream = canvas.captureStream(60);
        const mimeType = MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp9"
        )
          ? "video/webm;codecs=vp9"
          : "video/webm";
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 8_000_000,
        });
        canvasChunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            canvasChunksRef.current.push(ev.data);
          }
        };
        recorder.onstop = async () => {
          const blob = new Blob(canvasChunksRef.current, { type: mimeType });
          const arrayBuf = await blob.arrayBuffer();
          const uint8 = Array.from(new Uint8Array(arrayBuf));
          showToast(
            "⏳ Codificando Lienzo Compuesto a MP4 H.264 (+faststart)..."
          );
          try {
            const finalMp4 = await invoke<string>(
              "save_composed_canvas_recording",
              { bytes: uint8 }
            );
            showToast(`✅ Vídeo del Lienzo Compuesto guardado: ${finalMp4}`);
          } catch (err) {
            showToast(`Error al codificar lienzo: ${String(err)}`);
          }
        };
        recorder.start(250);
        canvasRecorderRef.current = recorder;
        setIsRecordingCanvas(true);
        showToast(
          "🔴 Grabando Lienzo Compuesto a 60 FPS (Escena + Cámara + Capas + Pizarra)..."
        );
      } catch (e) {
        showToast(`Error al iniciar grabador de lienzo: ${String(e)}`);
      }
    } else {
      canvasRecorderRef.current?.stop();
      canvasRecorderRef.current = null;
      setIsRecordingCanvas(false);
    }
  };

  // Instant Replay Trigger (Saves Replay MP4 & Injects/Updates Replay Layer on Stage)
  const handleTriggerInstantReplay = async () => {
    try {
      showToast("⏪ Generando clip de Repetición Instantánea...");
      const replayPath = await invoke<string>("trigger_instant_replay", {
        durationSec: 30,
      });
      const bytes = await invoke<number[]>("read_media_file_bytes", {
        path: replayPath,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);

      const existingReplay = activeScene.sources.find(
        (s) => s.type === "replay"
      );
      if (existingReplay) {
        handleUpdateSource(activeScene.id, {
          ...existingReplay,
          mediaUrl: blobUrl,
          layout: { ...existingReplay.layout, visible: true },
        });
      } else {
        handleAddSourceToEditableScene(
          "replay",
          "Repetición Instantánea (En Vivo)",
          { mediaUrl: blobUrl, mediaLoop: true }
        );
      }
      showToast(`✅ Repetición Instantánea guardada y en reproducción: ${replayPath}`);
    } catch (e) {
      showToast(`Error en Repetición Instantánea: ${String(e)}`);
    }
  };

  // Multistream Toggle
  const handleToggleStream = async () => {
    try {
      if (!isStreaming) {
        const enabledTargets = streamChannels
          .filter((c) => c.enabled)
          .map((c) => ({
            platform: c.platform,
            rtmp_url: c.rtmpUrl,
            stream_key: c.streamKey,
            bitrate_kbps: c.bitrateKbps,
          }));
        const msg = await invoke<string>("start_multistream", {
          targets: enabledTargets,
        });
        setIsStreaming(true);
        showToast(`📡 ${msg}`);
      } else {
        const msg = await invoke<string>("stop_multistream");
        setIsStreaming(false);
        showToast(`⏹️ ${msg}`);
      }
    } catch (e) {
      showToast(`Aviso de Stream: ${String(e)}`);
    }
  };

  // Fullscreen Projector Toggle
  const handleToggleFullscreenProjector = async () => {
    try {
      const win = getCurrentWindow();
      const isFull = await win.isFullscreen();
      await win.setFullscreen(!isFull);
    } catch {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Save / Load .bpres Presentation
  const handleSaveBpres = async () => {
    try {
      const payload = JSON.stringify(
        {
          version: "4.6.0-CleanRoom",
          savedAt: new Date().toISOString(),
          activeSceneId,
          activeTransition,
          transitionDurationMs,
          scenes,
          audioBuses,
          autoSceneRules,
          transitionRules,
        },
        null,
        2
      );
      const savedPath = await invoke<string>("save_bpres_presentation", {
        filename: "Placements.bpres",
        content: payload,
      });
      showToast(`💾 Presentación .bpres guardada en: ${savedPath}`);
    } catch (e) {
      showToast(`Error al guardar .bpres: ${String(e)}`);
    }
  };

  const handleLoadBpres = async () => {
    try {
      const content = await invoke<string>("load_bpres_presentation", {
        filename: "Placements.bpres",
      });
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
        setScenes(parsed.scenes);
        setActiveSceneId(parsed.activeSceneId || parsed.scenes[0].id);
        showToast("📂 Presentación Placements.bpres cargada correctamente");
      }
    } catch (e) {
      showToast(`Aviso al cargar .bpres: ${String(e)}`);
    }
  };

  return (
    <div
      className="h-screen w-screen flex flex-col bg-[#07090E] text-slate-100 overflow-hidden select-none"
      onClick={() => {
        if (openMenu) setOpenMenu(null);
      }}
    >
      {/* Hidden File Inputs for Local Image & Video Sources */}
      <input
        ref={fileInputImageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const url = URL.createObjectURL(file);
            handleAddSourceToEditableScene("image", `Imagen: ${file.name}`, {
              mediaUrl: url,
            });
          }
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputMediaRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const url = URL.createObjectURL(file);
            handleAddSourceToEditableScene("media", `Multimedia: ${file.name}`, {
              mediaUrl: url,
              mediaLoop: true,
            });
          }
          e.target.value = "";
        }}
      />

      {/* TOP BROADCASTER MENU BAR & MASTER CONTROLS */}
      <header className="h-13 px-3.5 bg-[#0B0E17] border-b border-slate-800/90 flex items-center justify-between shrink-0 z-30">
        {/* Left: Brand Logo + Classic XSplit Broadcaster Top Menus */}
        <div className="flex items-center gap-5">
          <GamecasterLogo size={32} showText={true} />

          <nav
            className="flex items-center gap-1 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {[
              {
                id: "archivo",
                label: "Archivo",
                items: [
                  {
                    label: "Nueva Presentación en Blanco",
                    action: () => {
                      setScenes(INITIAL_SCENES);
                      setActiveSceneId("scene_1");
                      showToast("✨ Presentación restablecida");
                    },
                  },
                  {
                    label: "Guardar Presentación (.bpres)",
                    action: handleSaveBpres,
                  },
                  {
                    label: "Cargar Presentación (.bpres)",
                    action: handleLoadBpres,
                  },
                  {
                    label: "Abrir Carpeta de Grabaciones en Windows",
                    action: () =>
                      invoke("open_media_folder", { sub: "recordings" }),
                  },
                ],
              },
              {
                id: "transmision",
                label: "Transmisión",
                items: [
                  {
                    label: "Configurar Canales Multistream y Chat IRC...",
                    action: () => setActiveStudioModal("multistream"),
                  },
                  {
                    label: isStreaming
                      ? "⏹️ Detener Emisión en Directo"
                      : "📡 Iniciar Emisión en Directo",
                    action: handleToggleStream,
                  },
                ],
              },
              {
                id: "grabacion",
                label: "Grabación",
                items: [
                  {
                    label: isRecordingNative
                      ? "⏹️ Detener Grabación de Escritorio (MP4)"
                      : "🔴 Iniciar Grabación de Escritorio (MP4)",
                    action: handleToggleNativeRecording,
                  },
                  {
                    label: isRecordingCanvas
                      ? "⏹️ Detener Grabación de Lienzo Compuesto"
                      : "🎬 Grabar Lienzo Compuesto (Escena + Cámara + Capas)",
                    action: handleToggleComposedCanvasRecording,
                  },
                  {
                    label: "Gestor de Grabaciones y Express Video Editor...",
                    action: () => setActiveStudioModal("recordings"),
                  },
                ],
              },
              {
                id: "salidas",
                label: "Salidas",
                items: [
                  {
                    label: "Proyector a Pantalla Completa (Sin Bordes)",
                    action: handleToggleFullscreenProjector,
                  },
                  {
                    label: "Panel de Cámara Virtual y Salida NDI®...",
                    action: () => setActiveStudioModal("outputs"),
                  },
                ],
              },
              {
                id: "plugins",
                label: "Extensiones Pro (7 Integradas)",
                items: [
                  {
                    label: "1. Cambiador Automático de Escenas (Auto Switcher)",
                    action: () => setActiveStudioModal("auto_switcher"),
                  },
                  {
                    label: "2. Estudio de Tercios Inferiores (Lower Thirds)",
                    action: () => setActiveStudioModal("lower_thirds"),
                  },
                  {
                    label: "3. Gestor de Reglas de Transición y Stingers",
                    action: () => setActiveStudioModal("transition_manager"),
                  },
                  {
                    label: "4. Disparar Repetición Instantánea (Instant Replay)",
                    action: handleTriggerInstantReplay,
                  },
                  {
                    label: "5. Express Video Editor & Reparador MP4",
                    action: () => setActiveStudioModal("recordings"),
                  },
                  {
                    label: "6. Multistreaming & Chat Unificado Twitch IRC",
                    action: () => setActiveStudioModal("multistream"),
                  },
                ],
              },
              {
                id: "vista",
                label: "Vista",
                items: [
                  {
                    label: studioMode
                      ? "Desactivar Modo Estudio (Vista Única PGM)"
                      : "Activar Modo Estudio (Preview + PGM SplitView)",
                    action: () => setStudioMode((v) => !v),
                  },
                  {
                    label: isPortraitCanvas
                      ? "Cambiar a Lienzo Horizontal 16:9 (1920×1080)"
                      : "Cambiar a Lienzo Vertical 9:16 (1080×1920 TikTok/Shorts)",
                    action: () => setIsPortraitCanvas((v) => !v),
                  },
                ],
              },
            ].map((menu) => (
              <div key={menu.id} className="relative">
                <button
                  onClick={() =>
                    setOpenMenu(openMenu === menu.id ? null : menu.id)
                  }
                  className={`px-2.5 py-1.5 rounded font-medium transition ${
                    openMenu === menu.id
                      ? "bg-slate-800 text-[#00F0FF]"
                      : "text-slate-300 hover:text-white hover:bg-slate-900"
                  }`}
                >
                  {menu.label}
                </button>
                {openMenu === menu.id && (
                  <div className="absolute left-0 top-full mt-1 w-72 rounded-lg bg-[#101522] border border-slate-700 shadow-2xl py-1.5 z-50">
                    {menu.items.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setOpenMenu(null);
                          item.action();
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Center/Right: Master Action Buttons & Hardware Telemetry */}
        <div className="flex items-center gap-2">
          {/* Studio Mode Toggle (`SplitView`) */}
          <button
            onClick={() => setStudioMode((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
              studioMode
                ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
            title="Conmutar Modo Estudio (Editor de Vista Previa + Programa en Vivo)"
          >
            <Columns className="w-3.5 h-3.5" />
            Modo Estudio
          </button>

          {/* 16:9 vs 9:16 Portrait Toggle */}
          <button
            onClick={() => setIsPortraitCanvas((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
              isPortraitCanvas
                ? "bg-purple-500/20 border-purple-400 text-purple-300"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
            title="Alternar relación de aspecto 16:9 Horizontal vs 9:16 Vertical"
          >
            {isPortraitCanvas ? (
              <Smartphone className="w-3.5 h-3.5" />
            ) : (
              <Monitor className="w-3.5 h-3.5" />
            )}
            {isPortraitCanvas ? "9:16" : "16:9"}
          </button>

          {/* Stream Button */}
          <button
            onClick={handleToggleStream}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              isStreaming
                ? "bg-rose-600 text-white animate-pulse shadow-[0_0_15px_rgba(225,29,72,0.6)]"
                : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-[#00F0FF]" />
            {isStreaming ? "EN DIRECTO" : "Transmitir"}
          </button>

          {/* Native Desktop Record Button */}
          <button
            onClick={handleToggleNativeRecording}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              isRecordingNative
                ? "bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.6)]"
                : "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40"
            }`}
            title="Grabación nativa FFmpeg gdigrab en MP4"
          >
            <CircleDot className="w-3.5 h-3.5" />
            {isRecordingNative ? "Parar MP4" : "Grabar MP4"}
          </button>

          {/* Composed Stage Canvas Record Button */}
          <button
            onClick={handleToggleComposedCanvasRecording}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              isRecordingCanvas
                ? "bg-amber-500 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.6)]"
                : "bg-[#00F0FF]/15 hover:bg-[#00F0FF]/25 text-[#00F0FF] border border-[#00F0FF]/40"
            }`}
            title="Graba el lienzo compuesto a 60 FPS (incluyendo cámara PIP, textos, filtros y pizarra) en un MP4 final"
          >
            <Layers className="w-3.5 h-3.5" />
            {isRecordingCanvas ? "Guardar Lienzo MP4" : "Grabar Lienzo"}
          </button>

          {/* Instant Replay Button */}
          <button
            onClick={handleTriggerInstantReplay}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold"
            title="Guardar y reproducir Repetición Instantánea en escena"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            Replay
          </button>

          {/* Screenshot Button */}
          <button
            onClick={async () => {
              try {
                const path = await invoke<string>("take_screenshot");
                showToast(`📸 Captura PNG guardada en: ${path}`);
              } catch (e) {
                showToast(`Error en captura: ${String(e)}`);
              }
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            title="Tomar captura de pantalla PNG sin compresión"
          >
            <Camera className="w-4 h-4 text-[#00F0FF]" />
          </button>

          {/* Recordings Gallery Shortcut */}
          <button
            onClick={() => setActiveStudioModal("recordings")}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            title="Abrir Gestor de Grabaciones y Express Video Editor"
          >
            <Film className="w-4 h-4 text-amber-400" />
          </button>

          {/* Live Telemetry Pill */}
          <div className="hidden xl:flex items-center gap-2.5 ml-1 px-3 py-1 rounded-lg bg-[#070A12] border border-slate-800 font-mono text-[11px]">
            {(isRecordingNative || isRecordingCanvas || isStreaming) && (
              <span className="text-rose-400 font-bold">
                ● {formatTimer(sessionSeconds)}
              </span>
            )}
            <span className="flex items-center gap-1 text-slate-300">
              <Cpu className="w-3 h-3 text-[#00F0FF]" />
              {telemetry.cpu_usage_percent.toFixed(1)}%
            </span>
            <span className="flex items-center gap-1 text-slate-300">
              <HardDrive className="w-3 h-3 text-emerald-400" />
              {telemetry.gpu_vram_used_mb}MB VRAM
            </span>
          </div>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {statusBanner && (
        <div className="bg-gradient-to-r from-[#00F0FF]/20 via-slate-900 to-[#00F0FF]/20 border-b border-[#00F0FF]/40 px-4 py-1.5 text-center text-xs font-medium text-[#00F0FF] flex items-center justify-center gap-3">
          <span>{statusBanner}</span>
          <button
            onClick={() => setActiveStudioModal("recordings")}
            className="underline font-bold text-white hover:text-[#00F0FF]"
          >
            Ver en Galería / Editor Express
          </button>
        </div>
      )}

      {/* CENTRAL INTERACTIVE STAGE AREA */}
      <StageCompositor
        activeScene={activeScene}
        previewScene={previewScene}
        studioMode={studioMode}
        isPortraitCanvas={isPortraitCanvas}
        snapToGrid={snapToGrid}
        onToggleSnapToGrid={() => setSnapToGrid((v) => !v)}
        selectedSourceId={selectedSourceId}
        onSelectSource={setSelectedSourceId}
        onUpdateSource={handleUpdateSource}
        onOpenSourceProperties={(source, sceneId) =>
          setInspectorTarget({ source, sceneId })
        }
        onPushLive={() => switchToScene(previewScene.id)}
        activeTransition={activeTransition}
        transitionDurationMs={transitionDurationMs}
        transitionTriggerCount={transitionTriggerCount}
        desktopFrameDataUrl={desktopFrame}
        windowFramesMap={windowFramesMap}
        pgmCanvasRef={pgmCanvasRef}
      />

      {/* BOTTOM 3-COLUMN XSPLIT BROADCASTER STUDIO DOCK */}
      <section className="h-[275px] bg-[#0B0E17] grid grid-cols-12 divide-x divide-slate-800/90 shrink-0 text-xs">
        {/* COLUMN 1 (LEFT): SCENE SOURCES (`Fuentes de la Escena`) */}
        <div className="col-span-4 flex flex-col h-full overflow-hidden">
          <div className="px-3 py-2 bg-[#101522] border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span className="font-display font-bold uppercase tracking-wider text-white">
                Fuentes — {editableScene.name}
              </span>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowAddSourceMenu((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#00F0FF] text-slate-950 font-bold hover:brightness-110 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir Fuente
              </button>

              {showAddSourceMenu && (
                <div className="absolute right-0 bottom-full mb-1.5 w-64 rounded-xl bg-[#101522] border border-slate-700 shadow-2xl py-1.5 z-50">
                  {[
                    {
                      label: "🖥️ Captura de Pantalla / Monitor",
                      action: () =>
                        handleAddSourceToEditableScene(
                          "screen",
                          "Captura de Monitor"
                        ),
                    },
                    {
                      label: "🎮 Captura de Juego / Ventana...",
                      action: () => {
                        refreshOpenWindows();
                        handleAddSourceToEditableScene(
                          "window",
                          "Captura de Juego / Ventana",
                          {
                            windowHwnd: openWindows[0]?.hwnd || 0,
                            windowTitle:
                              openWindows[0]?.title || "Ventana de Juego",
                          }
                        );
                      },
                    },
                    {
                      label: "📷 Cámara Web / Capturadora UVC",
                      action: () =>
                        handleAddSourceToEditableScene(
                          "camera",
                          "Cámara Web PIP"
                        ),
                    },
                    {
                      label: "📺 Tercio Inferior Animado (Lower Third)",
                      action: () =>
                        handleAddSourceToEditableScene(
                          "lower_third",
                          "Tercio Inferior Broadcast"
                        ),
                    },
                    {
                      label: "🔤 Texto / Rótulo Personalizado",
                      action: () =>
                        handleAddSourceToEditableScene(
                          "text",
                          "Rótulo en Directo"
                        ),
                    },
                    {
                      label: "🖼️ Imagen / Marca de Agua (Disco)...",
                      action: () => {
                        setShowAddSourceMenu(false);
                        fileInputImageRef.current?.click();
                      },
                    },
                    {
                      label: "🎬 Vídeo / Archivo Multimedia (Disco)...",
                      action: () => {
                        setShowAddSourceMenu(false);
                        fileInputMediaRef.current?.click();
                      },
                    },
                    {
                      label: "🎨 Fondo de Color / Degradado",
                      action: () =>
                        handleAddSourceToEditableScene(
                          "color",
                          "Fondo Degradado"
                        ),
                    },
                    {
                      label: "⏪ Fuente de Repetición Instantánea",
                      action: handleTriggerInstantReplay,
                    },
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={item.action}
                      className="w-full px-3.5 py-2 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sources List (Top Z-Order first) */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {[...editableScene.sources]
              .sort((a, b) => b.zOrder - a.zOrder)
              .map((src) => {
                const isSel = src.id === selectedSourceId;
                return (
                  <div
                    key={src.id}
                    onClick={() => setSelectedSourceId(src.id)}
                    onDoubleClick={() =>
                      setInspectorTarget({
                        source: src,
                        sceneId: editableScene.id,
                      })
                    }
                    className={`px-3 py-2 flex items-center justify-between cursor-pointer transition ${
                      isSel
                        ? "bg-[#00F0FF]/15 text-white"
                        : "hover:bg-slate-900/70 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateSource(editableScene.id, {
                            ...src,
                            layout: {
                              ...src.layout,
                              visible: !src.layout.visible,
                            },
                          });
                        }}
                        className={`p-1 rounded ${
                          src.layout.visible
                            ? "text-[#00F0FF]"
                            : "text-slate-600"
                        }`}
                        title="Mostrar / Ocultar fuente en el lienzo"
                      >
                        {src.layout.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateSource(editableScene.id, {
                            ...src,
                            layout: {
                              ...src.layout,
                              lockPosition: !src.layout.lockPosition,
                            },
                          });
                        }}
                        className={`p-1 rounded ${
                          src.layout.lockPosition
                            ? "text-amber-400"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                        title="Bloquear / Desbloquear posición con el ratón"
                      >
                        {src.layout.lockPosition ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <span className="truncate font-medium">{src.name}</span>
                      {src.effects.shader !== "none" && (
                        <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-mono uppercase">
                          {src.effects.shader}
                        </span>
                      )}
                    </div>

                    {/* Row Controls: Z-Order Up/Down, Duplicate, Properties, Delete */}
                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          handleUpdateSource(editableScene.id, {
                            ...src,
                            zOrder: src.zOrder + 2,
                          })
                        }
                        className="p-1 text-slate-400 hover:text-white"
                        title="Subir capa (Z-Order)"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          handleUpdateSource(editableScene.id, {
                            ...src,
                            zOrder: Math.max(0, src.zOrder - 2),
                          })
                        }
                        className="p-1 text-slate-400 hover:text-white"
                        title="Bajar capa (Z-Order)"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          const clone: StageSource = {
                            ...JSON.parse(JSON.stringify(src)),
                            id: `src_${Date.now()}`,
                            name: `${src.name} (Copia)`,
                            zOrder: src.zOrder + 1,
                          };
                          clone.layout.x += 40;
                          clone.layout.y += 40;
                          setScenes((prev) =>
                            prev.map((sc) =>
                              sc.id === editableScene.id
                                ? { ...sc, sources: [...sc.sources, clone] }
                                : sc
                            )
                          );
                        }}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Duplicar fuente"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setInspectorTarget({
                            source: src,
                            sceneId: editableScene.id,
                          })
                        }
                        className="p-1 text-[#00F0FF] hover:brightness-125"
                        title="Abrir Inspector de Propiedades (Layout, Chroma Key, 14 Shaders)"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setScenes((prev) =>
                            prev.map((sc) =>
                              sc.id === editableScene.id
                                ? {
                                    ...sc,
                                    sources: sc.sources.filter(
                                      (item) => item.id !== src.id
                                    ),
                                  }
                                : sc
                            )
                          )
                        }
                        className="p-1 text-slate-500 hover:text-rose-400"
                        title="Eliminar fuente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* COLUMN 2 (CENTER): UNLIMITED SCENE MATRIX (`Escenas`) & 15 GPU TRANSITIONS */}
        <div className="col-span-4 flex flex-col h-full overflow-hidden">
          <div className="px-3 py-2 bg-[#101522] border-b border-slate-800 flex items-center justify-between">
            <span className="font-display font-bold uppercase tracking-wider text-white">
              Matriz de Escenas ({scenes.length} Ilimitadas)
            </span>
            <button
              onClick={() => {
                const idx = scenes.length + 1;
                const newSc: Scene = {
                  id: `scene_${Date.now()}`,
                  name: `Escena ${idx}: Personalizada`,
                  sources: [
                    createDefaultSource("screen", "Captura de Monitor", 1),
                  ],
                };
                setScenes((prev) => [...prev, newSc]);
                switchToScene(newSc.id);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[#00F0FF] font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Nueva Escena
            </button>
          </div>

          {/* Scene Grid */}
          <div className="flex-1 p-2.5 overflow-y-auto grid grid-cols-2 gap-2">
            {scenes.map((sc, idx) => {
              const isLive = sc.id === activeSceneId;
              const isPrev = studioMode && sc.id === previewSceneId;
              return (
                <div
                  key={sc.id}
                  onClick={() => {
                    if (studioMode) {
                      setPreviewSceneId(sc.id);
                    } else {
                      switchToScene(sc.id);
                    }
                  }}
                  className={`p-2.5 rounded-lg border cursor-pointer flex flex-col justify-between transition ${
                    isLive
                      ? "bg-rose-500/15 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                      : isPrev
                      ? "bg-amber-500/15 border-amber-400"
                      : "bg-[#101626] border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400">
                      F{idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      {isLive && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[9px] uppercase">
                          LIVE
                        </span>
                      )}
                      {isPrev && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[9px] uppercase">
                          PREVIEW
                        </span>
                      )}
                      {scenes.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const remaining = scenes.filter(
                              (item) => item.id !== sc.id
                            );
                            setScenes(remaining);
                            if (activeSceneId === sc.id) {
                              setActiveSceneId(remaining[0].id);
                            }
                          }}
                          className="text-slate-500 hover:text-rose-400 p-0.5"
                          title="Eliminar escena"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="font-semibold text-white truncate mt-1.5">
                    {sc.name}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                    <span>{sc.sources.length} capas</span>
                    {studioMode && !isLive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          switchToScene(sc.id);
                        }}
                        className="text-[#00F0FF] hover:underline font-semibold"
                      >
                        Push Live →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom GPU Transition Bar */}
          <div className="px-2.5 py-2 bg-[#101522] border-t border-slate-800 flex items-center gap-2">
            <select
              value={activeTransition}
              onChange={(e) =>
                setActiveTransition(e.target.value as TransitionId)
              }
              className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white outline-none"
              title="Seleccionar Transición de Escena en GPU (re3/transitions.re3)"
            >
              {TRANSITION_LIST.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded px-2 py-1">
              <input
                type="number"
                min={50}
                max={3000}
                step={50}
                value={transitionDurationMs}
                onChange={(e) =>
                  setTransitionDurationMs(Number(e.target.value))
                }
                className="w-12 bg-transparent font-mono text-[#00F0FF] outline-none text-right"
              />
              <span className="text-[10px] text-slate-400">ms</span>
            </div>
            <button
              onClick={() => setActiveStudioModal("transition_manager")}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[#00F0FF]"
              title="Gestor de Reglas de Transición por Escena"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* COLUMN 3 (RIGHT): PRO 6-TRACK AUDIO MIXER & EXTENSIONS (`Mezclador Pro 6 Pistas`) */}
        <div className="col-span-4 flex flex-col h-full overflow-hidden">
          <div className="px-3 py-2 bg-[#101522] border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span className="font-display font-bold uppercase tracking-wider text-white">
                Audio Mixer Pro (6 Pistas + Delay)
              </span>
            </div>
            <label
              className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer"
              title="Guardar/Restaurar automáticamente el volumen por cada escena (perSceneAudioplg.plg)"
            >
              <input
                type="checkbox"
                checked={perSceneAudioEnabled}
                onChange={(e) => setPerSceneAudioEnabled(e.target.checked)}
                className="accent-[#00F0FF]"
              />
              <span>Audio por Escena</span>
            </label>
          </div>

          <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5">
            {audioBuses.map((bus) => {
              const level =
                bus.kind === "system" ? vuLevels.system : vuLevels.mic;
              return (
                <div
                  key={bus.id}
                  className="p-2.5 rounded-lg bg-[#101626] border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setAudioBuses((prev) =>
                            prev.map((b) =>
                              b.id === bus.id ? { ...b, muted: !b.muted } : b
                            )
                          )
                        }
                        className={`p-1 rounded ${
                          bus.muted
                            ? "bg-rose-500/20 text-rose-400"
                            : "bg-slate-800 text-[#00F0FF]"
                        }`}
                      >
                        {bus.muted ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="font-semibold text-white">
                        {bus.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Delay ms input for lip-sync */}
                      <div
                        className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5"
                        title="Compensación de retraso de audio en milisegundos (Sincronía Labial)"
                      >
                        <span className="text-[10px] text-slate-400">
                          Delay:
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={2000}
                          step={10}
                          value={bus.delayMs}
                          onChange={(e) =>
                            setAudioBuses((prev) =>
                              prev.map((b) =>
                                b.id === bus.id
                                  ? { ...b, delayMs: Number(e.target.value) }
                                  : b
                              )
                            )
                          }
                          className="w-10 bg-transparent font-mono text-[10px] text-[#00F0FF] outline-none text-right"
                        />
                        <span className="text-[9px] text-slate-500">ms</span>
                      </div>

                      <span className="font-mono text-[#00F0FF] w-9 text-right">
                        {bus.muted ? "MUTE" : `${bus.volume}%`}
                      </span>
                    </div>
                  </div>

                  {/* Fader + Real-time Segmented LED VU Meter */}
                  <div className="space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={bus.volume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setAudioBuses((prev) =>
                          prev.map((b) =>
                            b.id === bus.id ? { ...b, volume: v } : b
                          )
                        );
                      }}
                      className="w-full h-1.5"
                    />
                    <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden p-0.5 flex gap-0.5">
                      {Array.from({ length: 24 }).map((_, idx) => {
                        const threshold = (idx + 1) * (100 / 24);
                        const lit = level >= threshold;
                        const barColor =
                          idx > 19
                            ? "bg-rose-500"
                            : idx > 14
                            ? "bg-amber-400"
                            : "bg-emerald-400";
                        return (
                          <div
                            key={idx}
                            className={`flex-1 h-full rounded-sm transition-all duration-75 ${
                              lit ? barColor : "bg-slate-800/60"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* 6-Track Routing Matrix + AI Noise Suppression */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 mr-1">Pistas:</span>
                      {bus.tracks.map((tActive, tIdx) => (
                        <button
                          key={tIdx}
                          onClick={() =>
                            setAudioBuses((prev) =>
                              prev.map((b) =>
                                b.id === bus.id
                                  ? {
                                      ...b,
                                      tracks: b.tracks.map((val, i) =>
                                        i === tIdx ? !val : val
                                      ),
                                    }
                                  : b
                              )
                            )
                          }
                          className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                            tActive
                              ? "bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40"
                              : "bg-slate-900 text-slate-500"
                          }`}
                          title={`Asignar a Pista Multipista #${tIdx + 1}`}
                        >
                          T{tIdx + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() =>
                        setAudioBuses((prev) =>
                          prev.map((b) =>
                            b.id === bus.id
                              ? { ...b, noiseSuppression: !b.noiseSuppression }
                              : b
                          )
                        )
                      }
                      className={`px-2 py-0.5 rounded font-semibold ${
                        bus.noiseSuppression
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-slate-900 text-slate-500"
                      }`}
                      title="Filtro de Supresión de Ruido IA (DeepFilterNet3 / RTX)"
                    >
                      IA Noise Gate {bus.noiseSuppression ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Studio Extensions Bar */}
          <div className="px-2.5 py-1.5 bg-[#101522] border-t border-slate-800 flex items-center justify-between gap-1">
            <button
              onClick={() => setActiveStudioModal("auto_switcher")}
              className="flex-1 py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1 truncate text-[11px]"
            >
              <Sparkles className="w-3 h-3 text-[#00F0FF]" /> Auto Switcher
            </button>
            <button
              onClick={() => setActiveStudioModal("lower_thirds")}
              className="flex-1 py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1 truncate text-[11px]"
            >
              Lower Thirds
            </button>
            <button
              onClick={() =>
                invoke("open_media_folder", { sub: "recordings" })
              }
              className="py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-[#00F0FF] flex items-center gap-1 text-[11px]"
              title="Abrir carpeta de vídeos grabados en Windows"
            >
              <FolderOpen className="w-3 h-3" /> Vídeos
            </button>
          </div>
        </div>
      </section>

      {/* FLOATING 4-TAB SOURCE PROPERTIES INSPECTOR */}
      {inspectorTarget && (
        <SourcePropertiesModal
          source={inspectorTarget.source}
          sceneId={inspectorTarget.sceneId}
          isPortraitCanvas={isPortraitCanvas}
          openWindows={openWindows}
          onRefreshWindows={refreshOpenWindows}
          onUpdate={handleUpdateSource}
          onClose={() => setInspectorTarget(null)}
        />
      )}

      {/* BUILT-IN STUDIO EXTENSIONS & EXPRESS VIDEO EDITOR MODALS */}
      <StudioModals
        activeModal={activeStudioModal}
        onClose={() => setActiveStudioModal(null)}
        scenes={scenes}
        activeSceneId={activeSceneId}
        autoSwitcherEnabled={autoSwitcherEnabled}
        onToggleAutoSwitcher={setAutoSwitcherEnabled}
        autoSceneRules={autoSceneRules}
        onUpdateAutoSceneRules={setAutoSceneRules}
        openWindows={openWindows}
        foregroundWindow={foregroundWindow}
        onRefreshWindows={refreshOpenWindows}
        onAddOrUpdateSourceInActiveScene={(src) => {
          const exists = activeScene.sources.some((s) => s.id === src.id);
          if (exists) {
            handleUpdateSource(activeScene.id, src);
          } else {
            setScenes((prev) =>
              prev.map((sc) =>
                sc.id === activeScene.id
                  ? { ...sc, sources: [...sc.sources, src] }
                  : sc
              )
            );
            setSelectedSourceId(src.id);
          }
        }}
        transitionRules={transitionRules}
        onUpdateTransitionRules={setTransitionRules}
        streamChannels={streamChannels}
        onUpdateStreamChannels={setStreamChannels}
        isStreaming={isStreaming}
        onToggleStream={handleToggleStream}
        onToggleFullscreenProjector={handleToggleFullscreenProjector}
      />
    </div>
  );
};
export default App;
