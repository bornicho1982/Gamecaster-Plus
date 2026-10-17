import React, { useEffect, useRef, useState, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AudioBusChannel,
  AutoSceneRule,
  DEFAULT_GLOBAL_SETTINGS,
  GlobalSettings,
  HardwareTelemetry,
  Scene,
  SourceType,
  StageSource,
  StreamChannelConfig,
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
  GlobalSettingsModal,
  SettingsTabId,
} from "./components/GlobalSettingsModal";
import { SourcesPanel } from "./components/SourcesPanel";
import { ScenesGridPanel } from "./components/ScenesGridPanel";
import { AudioAndDockPanel } from "./components/AudioAndDockPanel";
import {
  Radio,
  CircleDot,
  Pause,
  Play,
  Camera,
  RotateCcw,
  Columns,
  Smartphone,
  Monitor,
  Settings,
  Cpu,
  HardDrive,
} from "lucide-react";

const INITIAL_SCENES: Scene[] = [
  {
    id: "scene_1",
    name: "Escena 1 — Pantalla / Juego Limpio",
    sources: [
      createDefaultSource("screen", "Captura de Monitor Principal", 1),
    ],
    perSceneMicVolume: 90,
    perSceneSystemVolume: 90,
  },
  {
    id: "scene_2",
    name: "Escena 2 — Gameplay + Cámara PIP",
    sources: [
      createDefaultSource("screen", "Captura de Monitor Principal", 1),
      createDefaultSource("camera", "Cámara Web PIP", 2, {
        layout: {
          x: 1510,
          y: 828,
          width: 360,
          height: 202,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
          rotX: 0,
          rotY: 0,
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
          borderThickness: 2,
          borderRadius: 12,
          borderColor: "#00F0FF",
          dropShadowEnabled: true,
          dropShadowDistance: 10,
          dropShadowBlur: 18,
          dropShadowColor: "#000000",
          enterTransition: "fade",
          exitTransition: "fade",
          transitionDurationMs: 400,
        },
      }),
    ],
    perSceneMicVolume: 95,
    perSceneSystemVolume: 85,
  },
  {
    id: "scene_3",
    name: "Escena 3 — Charlando (Just Chatting)",
    sources: [
      createDefaultSource("color", "Fondo Elegante Obsidian", 1, {
        bgColor: "#080E20",
        gradientEndColor: "#190E30",
      }),
      createDefaultSource("camera", "Cámara Web Principal", 2, {
        layout: {
          x: 370,
          y: 120,
          width: 1180,
          height: 664,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
          rotX: 0,
          rotY: 0,
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
          dropShadowBlur: 26,
          dropShadowColor: "#000000",
          enterTransition: "fade",
          exitTransition: "fade",
          transitionDurationMs: 400,
        },
      }),
      createDefaultSource("lower_third", "Tercio Inferior Charlando", 3, {
        textContent: "GAMECASTER PLUS // ESTUDIO PRO",
        subtitleContent: "CHARLANDO EN DIRECTO CON LA COMUNIDAD",
        socialHandle: "@bornicho1982",
        accentColor: "#00F0FF",
        layout: {
          x: 64,
          y: 875,
          width: 960,
          height: 145,
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
    perSceneMicVolume: 100,
    perSceneSystemVolume: 50,
  },
  {
    id: "scene_4",
    name: "Escena 4 — Ya Volvemos (Pausa BRB)",
    sources: [
      createDefaultSource("color", "Fondo Oscuro Pausa BRB", 1, {
        bgColor: "#060913",
        gradientEndColor: "#24081B",
      }),
      createDefaultSource("text", "Cartel Central Ya Volvemos", 2, {
        textContent: "YA VOLVEMOS EN UNOS MINUTOS // BE RIGHT BACK",
        fontSize: 56,
        textColor: "#00F0FF",
        layout: {
          x: 240,
          y: 460,
          width: 1440,
          height: 140,
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
  // Global Settings State
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(
    DEFAULT_GLOBAL_SETTINGS
  );
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsTabId>("general");

  // Scenes & Studio State
  const [scenes, setScenes] = useState<Scene[]>(INITIAL_SCENES);
  const [activeSceneId, setActiveSceneId] = useState<string>("scene_1");
  const [previewSceneId, setPreviewSceneId] = useState<string>("scene_2");
  const [studioMode, setStudioMode] = useState<boolean>(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    INITIAL_SCENES[0].sources[0].id
  );

  const isPortraitCanvas = globalSettings.outputResolution === "1080x1920";
  const snapToGrid = globalSettings.snapToGrid;

  // Transitions State
  const [activeTransition, setActiveTransition] =
    useState<TransitionId>("fade");
  const [transitionDurationMs, setTransitionDurationMs] = useState<number>(500);
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
      durationMs: 750,
    },
  ]);

  // Open Windows State
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
  const audioBusesRef = useRef<AudioBusChannel[]>(audioBuses);
  useEffect(() => {
    audioBusesRef.current = audioBuses;
  }, [audioBuses]);

  const [vuLevels, setVuLevels] = useState<{ system: number; mic: number }>({
    system: 18,
    mic: 12,
  });

  // Unified Recording & Streaming State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState<boolean>(false);
  const [activeRecordingEngine, setActiveRecordingEngine] = useState<
    "composed_canvas" | "native_desktop" | null
  >(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Multistreaming Channels
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
    disk_free_gb: 128.5,
  });

  // Refs for Master PGM Canvas, Web Audio Mixing Graph & Chunked Disk Recorder
  const pgmCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRecorderRef = useRef<MediaRecorder | null>(null);
  const activeTempFileRef = useRef<string | null>(null);
  const chunkWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mixedAudioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micOutGainRef = useRef<GainNode | null>(null);
  const micMonitorGainRef = useRef<GainNode | null>(null);
  const micFilterRef = useRef<BiquadFilterNode | null>(null);
  const fileInputImageRef = useRef<HTMLInputElement | null>(null);
  const fileInputMediaRef = useRef<HTMLInputElement | null>(null);

  const activeScene =
    scenes.find((s) => s.id === activeSceneId) || scenes[0];
  const previewScene =
    scenes.find((s) => s.id === previewSceneId) || scenes[0];
  const editableScene = studioMode ? previewScene : activeScene;

  const showToast = useCallback((msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  // Ensure WDA_EXCLUDEFROMCAPTURE is applied on startup according to globalSettings
  useEffect(() => {
    invoke("set_exclude_from_capture", {
      exclude: globalSettings.excludeFromCapture,
    }).catch(() => {});
  }, [globalSettings.excludeFromCapture]);

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

  // Real Web Audio API DSP Mixing Graph (Microphone + Compressor + High-Pass Noise Gate + Audio Monitoring + Stream Destination)
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let micStream: MediaStream | null = null;
    let timerId: ReturnType<typeof setInterval>;

    const audioConstraints: MediaStreamConstraints = {
      audio:
        globalSettings.micDeviceId && globalSettings.micDeviceId !== "default"
          ? {
              deviceId: { exact: globalSettings.micDeviceId },
              echoCancellation: true,
              noiseSuppression: globalSettings.aiNoiseSuppression,
              autoGainControl: true,
            }
          : {
              echoCancellation: true,
              noiseSuppression: globalSettings.aiNoiseSuppression,
              autoGainControl: true,
            },
      video: false,
    };

    navigator.mediaDevices
      ?.getUserMedia(audioConstraints)
      .then((stream) => {
        micStream = stream;
        audioCtx = new AudioContext({ sampleRate: 48000 });
        audioCtxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);

        // OBS-style Vocal High-Pass Filter (cuts low rumble below 85Hz when Noise Gate is active)
        const filterNode = audioCtx.createBiquadFilter();
        filterNode.type = "highpass";
        filterNode.frequency.value = 85;
        micFilterRef.current = filterNode;

        // Broadcast Dynamics Compressor (prevents clipping on loud peaks)
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // Output Gain (feeds recording/stream destination)
        const outGain = audioCtx.createGain();
        outGain.gain.value = 0.9;
        micOutGainRef.current = outGain;

        // Monitor Gain (feeds speakers/headphones when Audio Monitoring is enabled)
        const monitorGain = audioCtx.createGain();
        monitorGain.gain.value = 0.0;
        micMonitorGainRef.current = monitorGain;

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        const streamDest = audioCtx.createMediaStreamDestination();
        mixedAudioDestRef.current = streamDest;

        source.connect(filterNode);
        filterNode.connect(compressor);
        compressor.connect(analyser);
        compressor.connect(outGain);
        outGain.connect(streamDest);

        compressor.connect(monitorGain);
        monitorGain.connect(audioCtx.destination);
      })
      .catch(() => {});

    timerId = setInterval(() => {
      let micVal = 6;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        micVal = Math.min(100, Math.round(avg * 1.65));
      }
      setVuLevels((prev) => {
        const sysBus = audioBusesRef.current.find((b) => b.kind === "system");
        const micBus = audioBusesRef.current.find((b) => b.kind === "mic");
        const sysTarget = sysBus?.muted
          ? 0
          : Math.round(
              ((sysBus?.volume || 80) * (0.45 + Math.random() * 0.25))
            );
        const nextSys = Math.round(prev.system * 0.4 + sysTarget * 0.6);
        const finalMic = micBus?.muted
          ? 0
          : Math.round((micVal * (micBus?.volume || 90)) / 100);
        if (
          Math.abs(prev.system - nextSys) < 2 &&
          Math.abs(prev.mic - finalMic) < 2
        ) {
          return prev;
        }
        return {
          system: nextSys,
          mic: finalMic,
        };
      });
    }, 180);

    return () => {
      clearInterval(timerId);
      micStream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close().catch(() => {});
    };
  }, [globalSettings.micDeviceId, globalSettings.aiNoiseSuppression]);

  // Synchronize live AudioBusChannel fader, mute, noise gate & OBS Monitoring mode with Web Audio DSP nodes
  useEffect(() => {
    const micBus = audioBuses.find((b) => b.kind === "mic");
    if (!micBus) return;

    const linearVol = (micBus.volume / 100) * Math.pow(10, (micBus.gainDb || 0) / 20);
    const monMode = micBus.monitoringMode || "off";

    if (micOutGainRef.current) {
      // If muted or "monitor_only", mute output to recording/stream
      const sendToOutput = !micBus.muted && monMode !== "monitor_only";
      micOutGainRef.current.gain.value = sendToOutput ? linearVol : 0;
    }
    if (micMonitorGainRef.current) {
      const sendToMonitor =
        !micBus.muted &&
        (monMode === "monitor_only" || monMode === "monitor_and_output");
      micMonitorGainRef.current.gain.value = sendToMonitor ? linearVol : 0;
    }
    if (micFilterRef.current) {
      micFilterRef.current.frequency.value = micBus.noiseSuppression ? 95 : 20;
    }
  }, [audioBuses]);

  // Session Timer for Recording / Streaming (pauses when recording is paused)
  useEffect(() => {
    if (!isRecording && !isStreaming) {
      setSessionSeconds(0);
      return;
    }
    if (isRecording && isRecordingPaused && !isStreaming) {
      return;
    }
    const id = setInterval(() => setSessionSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording, isRecordingPaused, isStreaming]);

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

  const handleAddSourceToEditableScene = useCallback(
    (type: SourceType, name: string, extra?: Partial<StageSource>) => {
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

      if (
        type === "window" ||
        type === "text" ||
        type === "lower_third" ||
        type === "color"
      ) {
        setInspectorTarget({ source: newSource, sceneId: editableScene.id });
      }
    },
    [editableScene]
  );

  // Helper to convert ArrayBuffer to Base64 without stack overflow
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  // UNIFIED MASTER RECORDING BUTTON (Supports Chunked Composed Canvas MP4/MKV with Audio or Native Desktop FFmpeg with DirectShow Audio)
  const handleToggleMasterRecord = useCallback(async () => {
    if (!isRecording) {
      const mode = globalSettings.recordingMode;
      if (mode === "native_desktop") {
        try {
          const [wStr, hStr] = globalSettings.outputResolution.split("x");
          const screenSrc = activeScene.sources.find(
            (s) => s.type === "screen" && s.layout.visible
          );
          const path = await invoke<string>("start_recording", {
            config: {
              width: Number(wStr) || 1920,
              height: Number(hStr) || 1080,
              fps: globalSettings.fps || 60,
              encoder: globalSettings.videoEncoder,
              bitrate_kbps: globalSettings.recordingBitrateKbps || 12000,
              format: globalSettings.recordingFormat,
              record_audio: true,
              audio_device: null,
              monitor_index: screenSrc?.monitorIndex ?? 0,
            },
          });
          setActiveRecordingEngine("native_desktop");
          setIsRecording(true);
          setIsRecordingPaused(false);
          showToast(
            `🔴 Grabando Pantalla Directa + Audio (${globalSettings.videoEncoder.toUpperCase()}) en: ${path}`
          );
        } catch (e) {
          showToast(`Error de grabación: ${String(e)}`);
        }
      } else {
        // Default: Composed Stage Canvas Recording with Real Web Audio Track + Chunked Disk Streaming
        const canvas = pgmCanvasRef.current;
        if (!canvas) return;
        try {
          if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
            await audioCtxRef.current.resume().catch(() => {});
          }

          const tempPath = await invoke<string>("init_canvas_recording");
          activeTempFileRef.current = tempPath;
          chunkWriteChainRef.current = Promise.resolve();

          const videoStream = canvas.captureStream(globalSettings.fps || 60);
          const combinedTracks: MediaStreamTrack[] = [
            ...videoStream.getVideoTracks(),
          ];
          if (mixedAudioDestRef.current) {
            const audioTracks = mixedAudioDestRef.current.stream.getAudioTracks();
            if (audioTracks.length > 0) {
              combinedTracks.push(...audioTracks);
            }
          }
          const combinedStream = new MediaStream(combinedTracks);

          const mimeType = MediaRecorder.isTypeSupported(
            "video/webm;codecs=vp9,opus"
          )
            ? "video/webm;codecs=vp9,opus"
            : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
            ? "video/webm;codecs=vp8,opus"
            : "video/webm";

          const recorder = new MediaRecorder(combinedStream, {
            mimeType,
            videoBitsPerSecond:
              (globalSettings.recordingBitrateKbps || 12000) * 1000,
            audioBitsPerSecond: 192000,
          });

          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0 && activeTempFileRef.current) {
              const targetFile = activeTempFileRef.current;
              const blobChunk = ev.data;
              chunkWriteChainRef.current = chunkWriteChainRef.current
                .then(async () => {
                  const buf = await blobChunk.arrayBuffer();
                  const b64 = arrayBufferToBase64(buf);
                  await invoke("append_canvas_chunk", {
                    tempPath: targetFile,
                    base64Chunk: b64,
                  });
                })
                .catch(() => {});
            }
          };

          recorder.onstop = async () => {
            const targetFile = activeTempFileRef.current;
            activeTempFileRef.current = null;
            if (!targetFile) return;

            showToast(
              `⏳ Finalizando y codificando vídeo (${globalSettings.videoEncoder.toUpperCase()} + Audio AAC)...`
            );
            try {
              await chunkWriteChainRef.current;
              const finalVideo = await invoke<string>(
                "finalize_canvas_recording",
                {
                  tempPath: targetFile,
                  encoder: globalSettings.videoEncoder,
                  bitrateKbps: globalSettings.recordingBitrateKbps || 12000,
                  format: globalSettings.recordingFormat || "mp4",
                }
              );
              showToast(`✅ Grabación con Audio guardada en disco: ${finalVideo}`);
            } catch (err) {
              showToast(`Error al finalizar grabación: ${String(err)}`);
            }
          };

          recorder.start(500);
          canvasRecorderRef.current = recorder;
          setActiveRecordingEngine("composed_canvas");
          setIsRecording(true);
          setIsRecordingPaused(false);
          showToast(
            "🔴 Grabando Escena Compuesta + Audio Mezclado en Vivo (Escritura Directa a Disco)..."
          );
        } catch (e) {
          showToast(`Error al iniciar grabación: ${String(e)}`);
        }
      }
    } else {
      // Stop active recording
      if (activeRecordingEngine === "native_desktop") {
        try {
          const savedPath = await invoke<string>("stop_recording");
          setIsRecording(false);
          setIsRecordingPaused(false);
          setActiveRecordingEngine(null);
          showToast(`✅ Grabación finalizada y guardada: ${savedPath}`);
        } catch (e) {
          showToast(`Error al detener grabación: ${String(e)}`);
        }
      } else {
        canvasRecorderRef.current?.stop();
        canvasRecorderRef.current = null;
        setIsRecording(false);
        setIsRecordingPaused(false);
        setActiveRecordingEngine(null);
      }
    }
  }, [isRecording, activeRecordingEngine, globalSettings, showToast]);

  // Pause / Resume Recording
  const handleTogglePauseRecording = () => {
    if (!isRecording) return;
    if (
      activeRecordingEngine === "composed_canvas" &&
      canvasRecorderRef.current
    ) {
      if (canvasRecorderRef.current.state === "recording") {
        canvasRecorderRef.current.pause();
        setIsRecordingPaused(true);
        showToast("⏸️ Grabación en pausa");
      } else if (canvasRecorderRef.current.state === "paused") {
        canvasRecorderRef.current.resume();
        setIsRecordingPaused(false);
        showToast("▶️ Grabación reanudada");
      }
    } else {
      setIsRecordingPaused((p) => !p);
    }
  };

  // Instant Replay Trigger
  const handleTriggerInstantReplay = useCallback(async () => {
    try {
      showToast("⏪ Generando clip de Repetición Instantánea...");
      const replayPath = await invoke<string>("trigger_instant_replay", {
        durationSec: 30,
      });
      const mediaUrl = convertFileSrc(replayPath);

      const existingReplay = activeScene.sources.find(
        (s) => s.type === "replay"
      );
      if (existingReplay) {
        handleUpdateSource(activeScene.id, {
          ...existingReplay,
          mediaUrl,
          layout: { ...existingReplay.layout, visible: true },
        });
      } else {
        handleAddSourceToEditableScene(
          "replay",
          "Repetición Instantánea (En Vivo)",
          { mediaUrl, mediaLoop: true }
        );
      }
      showToast(`✅ Repetición Instantánea guardada: ${replayPath}`);
    } catch (e) {
      showToast(`Error en Repetición Instantánea: ${String(e)}`);
    }
  }, [activeScene, handleAddSourceToEditableScene, showToast]);

  // Multistream Toggle
  const handleToggleStream = useCallback(async () => {
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
  }, [isStreaming, streamChannels, showToast]);

  // Take Screenshot
  const handleTakeScreenshot = useCallback(async () => {
    try {
      const path = await invoke<string>("take_screenshot");
      showToast(`📸 Captura PNG guardada en: ${path}`);
    } catch (e) {
      showToast(`Error en captura: ${String(e)}`);
    }
  }, [showToast]);

  // Global Hotkeys Listener (F1..F8 Scenes, Record, Stream, Screenshot, Replay, Space Push Live)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      const keyName =
        e.code === "Space"
          ? "Space"
          : e.key.length === 1
          ? e.key.toUpperCase()
          : e.key;
      parts.push(keyName);
      const combo = parts.join("+");

      const hk = globalSettings.hotkeys;
      const sceneKeys = [
        hk.scene1,
        hk.scene2,
        hk.scene3,
        hk.scene4,
        hk.scene5,
        hk.scene6,
        hk.scene7,
        hk.scene8,
      ];
      const scIdx = sceneKeys.indexOf(combo);
      if (scIdx !== -1 && scenes[scIdx]) {
        e.preventDefault();
        switchToScene(scenes[scIdx].id);
        return;
      }

      if (combo === hk.toggleRecord) {
        e.preventDefault();
        handleToggleMasterRecord();
      } else if (combo === hk.toggleStream) {
        e.preventDefault();
        handleToggleStream();
      } else if (combo === hk.takeScreenshot) {
        e.preventDefault();
        handleTakeScreenshot();
      } else if (combo === hk.instantReplay) {
        e.preventDefault();
        handleTriggerInstantReplay();
      } else if (combo === hk.pushLive && studioMode) {
        e.preventDefault();
        switchToScene(previewScene.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    globalSettings.hotkeys,
    scenes,
    studioMode,
    previewScene.id,
    switchToScene,
    handleToggleMasterRecord,
    handleToggleStream,
    handleTakeScreenshot,
    handleTriggerInstantReplay,
  ]);

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
          globalSettings,
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

  const openGlobalSettingsAt = (tab: SettingsTabId) => {
    setSettingsInitialTab(tab);
    setSettingsModalOpen(true);
  };

  const selectedSourceObj = editableScene.sources.find(
    (s) => s.id === selectedSourceId
  );

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
            handleAddSourceToEditableScene(
              "media",
              `Multimedia: ${file.name}`,
              {
                mediaUrl: url,
                mediaLoop: true,
              }
            );
          }
          e.target.value = "";
        }}
      />

      {/* TOP BROADCASTER MENU BAR & UNIFIED MASTER CONTROLS */}
      <header className="h-13 px-3.5 bg-[#0B0E17] border-b border-slate-800/90 flex items-center justify-between shrink-0 z-30">
        {/* Left: Brand Logo + Ordered Studio Menus: Archivo, Editar, Vista, Herramientas y Plugins, Configuración (⚙️) */}
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
                    label: "✨ Nueva Presentación Limpia (4 Escenas Base)",
                    action: () => {
                      setScenes(INITIAL_SCENES);
                      setActiveSceneId("scene_1");
                      showToast(
                        "✨ Escenas por defecto limpias restablecidas"
                      );
                    },
                  },
                  {
                    label: "💾 Guardar Presentación (.bpres)",
                    action: handleSaveBpres,
                  },
                  {
                    label: "📂 Cargar Presentación (.bpres)",
                    action: handleLoadBpres,
                  },
                  {
                    label: "📁 Abrir Carpeta de Vídeos en Windows",
                    action: () =>
                      invoke("open_media_folder", { sub: "recordings" }),
                  },
                ],
              },
              {
                id: "editar",
                label: "Editar",
                items: [
                  {
                    label:
                      "⚙️ Propiedades de la Fuente Seleccionada...",
                    action: () => {
                      if (selectedSourceObj) {
                        setInspectorTarget({
                          source: selectedSourceObj,
                          sceneId: editableScene.id,
                        });
                      } else {
                        showToast(
                          "Selecciona primero una fuente en la escena"
                        );
                      }
                    },
                  },
                  {
                    label: "📺 Editar Tercios Inferiores (Lower Thirds)...",
                    action: () => setActiveStudioModal("lower_thirds"),
                  },
                  {
                    label: "🔄 Restablecer Posición de Capa a Pantalla Completa",
                    action: () => {
                      if (selectedSourceObj) {
                        handleUpdateSource(editableScene.id, {
                          ...selectedSourceObj,
                          layout: {
                            ...selectedSourceObj.layout,
                            x: 0,
                            y: 0,
                            width: isPortraitCanvas ? 1080 : 1920,
                            height: isPortraitCanvas ? 1920 : 1080,
                          },
                        });
                      }
                    },
                  },
                ],
              },
              {
                id: "vista",
                label: "Vista",
                items: [
                  {
                    label: globalSettings.excludeFromCapture
                      ? "✅ Ocultar Gamecaster Plus al Capturar Pantalla (Sin Espejo)"
                      : "⬜ Ocultar Gamecaster Plus al Capturar Pantalla (Sin Espejo)",
                    action: async () => {
                      const next = !globalSettings.excludeFromCapture;
                      setGlobalSettings((g) => ({
                        ...g,
                        excludeFromCapture: next,
                      }));
                      await invoke("set_exclude_from_capture", {
                        exclude: next,
                      }).catch(() => {});
                      showToast(
                        next
                          ? "🛡️ Efecto espejo desactivado (Ventana excluida de la captura)"
                          : "👁️ Ventana incluida en la captura de pantalla"
                      );
                    },
                  },
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
                    action: () =>
                      setGlobalSettings((g) => ({
                        ...g,
                        outputResolution:
                          g.outputResolution === "1080x1920"
                            ? "1920x1080"
                            : "1080x1920",
                      })),
                  },
                  {
                    label: "🖥️ Proyector a Pantalla Completa (Sin Bordes)",
                    action: handleToggleFullscreenProjector,
                  },
                ],
              },
              {
                id: "herramientas",
                label: "Herramientas y Plugins",
                items: [
                  {
                    label: "🎬 Gestor de Grabaciones y Express Video Editor...",
                    action: () => setActiveStudioModal("recordings"),
                  },
                  {
                    label: "🤖 Cambiador Automático de Escenas (Auto Switcher)...",
                    action: () => setActiveStudioModal("auto_switcher"),
                  },
                  {
                    label: "📺 Estudio de Tercios Inferiores (Lower Thirds)...",
                    action: () => setActiveStudioModal("lower_thirds"),
                  },
                  {
                    label: "⚡ Gestor de Reglas de Transición y Stingers...",
                    action: () => setActiveStudioModal("transition_manager"),
                  },
                  {
                    label: "📡 Salida de Cámara Virtual y NDI®...",
                    action: () => setActiveStudioModal("outputs"),
                  },
                ],
              },
              {
                id: "configuracion",
                label: "Configuración ⚙️",
                items: [
                  {
                    label: "1. ⚙️ Ajustes Generales y Anti-Espejo...",
                    action: () => openGlobalSettingsAt("general"),
                  },
                  {
                    label: "2. 🖥️ Vídeo, Resolución y Lienzo (1080p/2K/4K/60FPS)...",
                    action: () => openGlobalSettingsAt("video"),
                  },
                  {
                    label: "3. 🎚️ Audio, Micrófono y Supresión de Ruido IA...",
                    action: () => openGlobalSettingsAt("audio"),
                  },
                  {
                    label: "4. 🔴 Motor de Grabación, NVENC y Carpeta...",
                    action: () => openGlobalSettingsAt("recording"),
                  },
                  {
                    label: "5. 📡 Cuentas de Transmisión (Twitch/YouTube/Kick)...",
                    action: () => openGlobalSettingsAt("streaming"),
                  },
                  {
                    label: "6. ⌨️ Atajos de Teclado Globales (Hotkeys)...",
                    action: () => openGlobalSettingsAt("hotkeys"),
                  },
                ],
              },
            ].map((menu) => (
              <div key={menu.id} className="relative">
                <button
                  onClick={() =>
                    setOpenMenu(openMenu === menu.id ? null : menu.id)
                  }
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition ${
                    openMenu === menu.id
                      ? "bg-slate-800 text-[#00F0FF]"
                      : "text-slate-300 hover:text-white hover:bg-slate-900"
                  }`}
                >
                  {menu.label}
                </button>
                {openMenu === menu.id && (
                  <div className="absolute left-0 top-full mt-1 w-80 rounded-xl bg-[#101522] border border-slate-700 shadow-2xl py-1.5 z-50">
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

        {/* Right: Clean Unified Master Controls & Telemetry */}
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
            <span>Modo Estudio</span>
          </button>

          {/* 16:9 vs 9:16 Portrait Toggle */}
          <button
            onClick={() =>
              setGlobalSettings((g) => ({
                ...g,
                outputResolution:
                  g.outputResolution === "1080x1920"
                    ? "1920x1080"
                    : "1080x1920",
              }))
            }
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
              isPortraitCanvas
                ? "bg-purple-500/20 border-purple-400 text-purple-300"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
            title="Alternar formato Horizontal 16:9 vs Vertical 9:16"
          >
            {isPortraitCanvas ? (
              <Smartphone className="w-3.5 h-3.5" />
            ) : (
              <Monitor className="w-3.5 h-3.5" />
            )}
            <span>{isPortraitCanvas ? "9:16" : "16:9"}</span>
          </button>

          {/* Stream Button */}
          <button
            onClick={handleToggleStream}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              isStreaming
                ? "bg-rose-600 text-white animate-pulse shadow-[0_0_15px_rgba(225,29,72,0.6)]"
                : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
            }`}
            title="Iniciar o detener transmisión en directo (Ctrl+F12)"
          >
            <Radio className="w-3.5 h-3.5 text-[#00F0FF]" />
            <span>{isStreaming ? "EN DIRECTO" : "Transmitir"}</span>
          </button>

          {/* ONE SINGLE UNIFIED RECORD BUTTON + PAUSE + TIMER */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleToggleMasterRecord}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                isRecording
                  ? "bg-rose-600 text-white shadow-[0_0_16px_rgba(225,29,72,0.65)]"
                  : "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40"
              }`}
              title="Iniciar o detener grabación de vídeo MP4 (Ctrl+F11)"
            >
              <CircleDot
                className={`w-3.5 h-3.5 ${
                  isRecording && !isRecordingPaused ? "animate-ping" : ""
                }`}
              />
              <span>
                {isRecording
                  ? `Detener (${formatTimer(sessionSeconds)})`
                  : "Grabar"}
              </span>
            </button>

            {isRecording && (
              <button
                onClick={handleTogglePauseRecording}
                className={`p-1.5 rounded-lg border text-xs font-bold transition ${
                  isRecordingPaused
                    ? "bg-amber-500 text-slate-950 border-amber-400"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                }`}
                title={
                  isRecordingPaused
                    ? "Reanudar grabación"
                    : "Pausar grabación"
                }
              >
                {isRecordingPaused ? (
                  <Play className="w-3.5 h-3.5" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Instant Replay Button */}
          <button
            onClick={handleTriggerInstantReplay}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold"
            title="Guardar clip de Repetición Instantánea (Ctrl+F10)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Replay</span>
          </button>

          {/* Screenshot Button */}
          <button
            onClick={handleTakeScreenshot}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            title="Tomar captura de pantalla PNG (Ctrl+F9)"
          >
            <Camera className="w-4 h-4 text-[#00F0FF]" />
          </button>

          {/* Direct Global Settings Button (⚙️) */}
          <button
            onClick={() => openGlobalSettingsAt("general")}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[#00F0FF] border border-slate-700"
            title="Abrir Centro de Configuración Global (Vídeo, Audio, Grabación, Cuentas, Atajos)"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Live Telemetry Pill */}
          <div className="hidden xl:flex items-center gap-2.5 ml-1 px-3 py-1 rounded-lg bg-[#070A12] border border-slate-800 font-mono text-[11px]">
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
        onToggleSnapToGrid={() =>
          setGlobalSettings((g) => ({ ...g, snapToGrid: !g.snapToGrid }))
        }
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
        pgmCanvasRef={pgmCanvasRef}
      />

      {/* BOTTOM 3-COLUMN MODULAR STUDIO DOCK */}
      <section className="h-[275px] bg-[#0B0E17] grid grid-cols-12 divide-x divide-slate-800/90 shrink-0 text-xs">
        {/* COLUMN 1: SCENE SOURCES */}
        <SourcesPanel
          editableScene={editableScene}
          selectedSourceId={selectedSourceId}
          onSelectSource={setSelectedSourceId}
          onUpdateSource={handleUpdateSource}
          onAddSource={handleAddSourceToEditableScene}
          onOpenProperties={(source, sceneId) =>
            setInspectorTarget({ source, sceneId })
          }
          onDeleteSource={(sourceId) =>
            setScenes((prev) =>
              prev.map((sc) =>
                sc.id === editableScene.id
                  ? {
                      ...sc,
                      sources: sc.sources.filter((i) => i.id !== sourceId),
                    }
                  : sc
              )
            )
          }
          onDuplicateSource={(src) => {
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
          onTriggerInstantReplay={handleTriggerInstantReplay}
          onPickImageFile={() => fileInputImageRef.current?.click()}
          onPickMediaFile={() => fileInputMediaRef.current?.click()}
          openWindows={openWindows}
          onRefreshWindows={refreshOpenWindows}
        />

        {/* COLUMN 2: SCENE MATRIX & TRANSITIONS */}
        <ScenesGridPanel
          scenes={scenes}
          activeSceneId={activeSceneId}
          previewSceneId={previewSceneId}
          studioMode={studioMode}
          onSelectScene={(sceneId) => {
            if (studioMode) {
              setPreviewSceneId(sceneId);
            } else {
              switchToScene(sceneId);
            }
          }}
          onPushSceneLive={switchToScene}
          onUpdateScenes={setScenes}
          activeTransition={activeTransition}
          onChangeTransition={setActiveTransition}
          transitionDurationMs={transitionDurationMs}
          onChangeTransitionDuration={setTransitionDurationMs}
          onOpenTransitionRulesModal={() =>
            setActiveStudioModal("transition_manager")
          }
        />

        {/* COLUMN 3: 3-TAB MULTI-DOCK (AUDIO MIXER, LIVE IRC CHAT, QUICK RECORDINGS) */}
        <AudioAndDockPanel
          audioBuses={audioBuses}
          onUpdateAudioBuses={setAudioBuses}
          vuLevels={vuLevels}
          perSceneAudioEnabled={perSceneAudioEnabled}
          onTogglePerSceneAudio={setPerSceneAudioEnabled}
          twitchChannel={globalSettings.twitchIrcChannel}
          onChangeTwitchChannel={(ch) =>
            setGlobalSettings((g) => ({ ...g, twitchIrcChannel: ch }))
          }
          onOpenFullRecordingsModal={() => setActiveStudioModal("recordings")}
          onNotify={showToast}
        />
      </section>

      {/* OBS STUDIO + XSPLIT BROADCAST HEALTH & DIAGNOSTICS FOOTER BAR */}
      <footer className="h-7 px-3.5 bg-[#060810] border-t border-slate-800/90 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isRecording || isStreaming
                  ? "bg-rose-500 animate-ping"
                  : "bg-emerald-400"
              }`}
            />
            <strong className="text-slate-200">
              {isRecording
                ? `GRABANDO (${formatTimer(sessionSeconds)})`
                : isStreaming
                ? `EN DIRECTO (${formatTimer(sessionSeconds)})`
                : "MOTOR LISTO"}
            </strong>
          </span>
          <span>
            Codificador:{" "}
            <strong className="text-[#00F0FF]">
              {globalSettings.videoEncoder === "h264_nvenc"
                ? "NVIDIA NVENC H.264"
                : globalSettings.videoEncoder === "h264_mf"
                ? "Windows MediaFoundation H.264"
                : "x264 (CPU)"}
            </strong>
          </span>
          <span>
            Salida:{" "}
            <strong className="text-slate-200">
              {globalSettings.outputResolution} @ {globalSettings.fps} FPS
            </strong>{" "}
            ({(1000 / (globalSettings.fps || 60)).toFixed(1)} ms/frame)
          </span>
          <span>
            Bitrate:{" "}
            <strong className="text-emerald-400">
              {globalSettings.recordingBitrateKbps} kbps
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span>
            Audio:{" "}
            <strong className="text-[#00F0FF]">
              WASAPI + WebAudio DSP 48kHz
            </strong>
          </span>
          <span>
            CPU:{" "}
            <strong className="text-slate-200">
              {telemetry.cpu_usage_percent.toFixed(1)}%
            </strong>
          </span>
          <span>
            GPU:{" "}
            <strong className="text-slate-200">
              {telemetry.gpu_vram_used_mb} MB VRAM
            </strong>
          </span>
          <span>
            Disco Libre:{" "}
            <strong className="text-emerald-400">
              {(telemetry.disk_free_gb ?? 120).toFixed(1)} GB
            </strong>
          </span>
        </div>
      </footer>

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

      {/* GLOBAL SETTINGS CENTER MODAL (6 SECTIONS) */}
      <GlobalSettingsModal
        isOpen={settingsModalOpen}
        initialTab={settingsInitialTab}
        onClose={() => setSettingsModalOpen(false)}
        settings={globalSettings}
        onUpdateSettings={setGlobalSettings}
        streamChannels={streamChannels}
        onUpdateStreamChannels={setStreamChannels}
        onNotify={showToast}
      />

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
