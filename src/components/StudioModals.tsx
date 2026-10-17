import React, { useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  AutoSceneRule,
  MediaFileEntry,
  Scene,
  StreamChannelConfig,
  TRANSITION_LIST,
  TransitionId,
  TransitionOverrideRule,
  WindowInfo,
  createDefaultSource,
  StageSource,
} from "../types/broadcaster";
import {
  X,
  Plus,
  Trash2,
  FolderOpen,
  Scissors,
  Wrench,
  Film,
  Image as ImageIcon,
  Radio,
  MessageSquare,
  Sparkles,
  Cpu,
  Monitor,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

export type StudioModalType =
  | null
  | "auto_switcher"
  | "lower_thirds"
  | "transition_manager"
  | "multistream"
  | "recordings"
  | "outputs";

interface StudioModalsProps {
  activeModal: StudioModalType;
  onClose: () => void;
  scenes: Scene[];
  activeSceneId: string;
  // Auto Scene Switcher
  autoSwitcherEnabled: boolean;
  onToggleAutoSwitcher: (val: boolean) => void;
  autoSceneRules: AutoSceneRule[];
  onUpdateAutoSceneRules: (rules: AutoSceneRule[]) => void;
  openWindows: WindowInfo[];
  foregroundWindow: WindowInfo | null;
  onRefreshWindows: () => void;
  // Lower Thirds
  onAddOrUpdateSourceInActiveScene: (src: StageSource) => void;
  // Transition Overrides
  transitionRules: TransitionOverrideRule[];
  onUpdateTransitionRules: (rules: TransitionOverrideRule[]) => void;
  // Multistream
  streamChannels: StreamChannelConfig[];
  onUpdateStreamChannels: (channels: StreamChannelConfig[]) => void;
  isStreaming: boolean;
  onToggleStream: () => void;
  // Outputs / Projector
  onToggleFullscreenProjector: () => void;
}

export const StudioModals: React.FC<StudioModalsProps> = ({
  activeModal,
  onClose,
  scenes,
  activeSceneId,
  autoSwitcherEnabled,
  onToggleAutoSwitcher,
  autoSceneRules,
  onUpdateAutoSceneRules,
  openWindows,
  foregroundWindow,
  onRefreshWindows,
  onAddOrUpdateSourceInActiveScene,
  transitionRules,
  onUpdateTransitionRules,
  streamChannels,
  onUpdateStreamChannels,
  isStreaming,
  onToggleStream,
  onToggleFullscreenProjector,
}) => {
  // Lower Thirds state
  const [ltTitle, setLtTitle] = useState("BORNICHO LIVE // GAMECASTER PLUS");
  const [ltSubtitle, setLtSubtitle] = useState(
    "ESTUDIO DE PRODUCCIÓN EN DIRECTO • 1080P 60FPS"
  );
  const [ltSocial, setLtSocial] = useState("@bornicho1982");
  const [ltAccent, setLtAccent] = useState("#00F0FF");

  // Transition Override state
  const [fromScene, setFromScene] = useState(scenes[0]?.id || "");
  const [toScene, setToScene] = useState(scenes[1]?.id || scenes[0]?.id || "");
  const [ruleTransition, setRuleTransition] = useState<TransitionId>("stinger");
  const [ruleDuration, setRuleDuration] = useState(800);

  // Auto Switcher new rule state
  const [newWinMatch, setNewWinMatch] = useState("");
  const [newTargetScene, setNewTargetScene] = useState(scenes[0]?.id || "");

  // Recordings & Express Video Editor state
  const [mediaFiles, setMediaFiles] = useState<MediaFileEntry[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaFileEntry | null>(
    null
  );
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(10);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);

  // Twitch IRC Live Chat state
  const [chatChannel, setChatChannel] = useState("bornicho");
  const [chatConnected, setChatConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { user: string; text: string; time: string }[]
  >([]);

  // Load recordings when modal opens
  const refreshMediaFiles = async () => {
    try {
      const list = await invoke<MediaFileEntry[]>("list_media_files");
      setMediaFiles(list);
      if (list.length > 0 && !selectedMedia) {
        handleSelectMediaFile(list[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeModal === "recordings") {
      refreshMediaFiles();
    } else if (activeModal === "auto_switcher") {
      onRefreshWindows();
    }
  }, [activeModal]);

  // Cleanup Blob URL if needed
  useEffect(() => {
    return () => {
      if (previewBlobUrl && previewBlobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  // Connect to real Twitch anonymous read-only IRC WebSocket when multistream modal is open
  useEffect(() => {
    if (activeModal !== "multistream" || !chatChannel.trim()) return;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
      ws.onopen = () => {
        setChatConnected(true);
        ws?.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
        ws?.send("PASS SCHMOOPIIE");
        ws?.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
        ws?.send(`JOIN #${chatChannel.trim().toLowerCase()}`);
      };
      ws.onmessage = (ev) => {
        const raw = String(ev.data || "");
        if (raw.startsWith("PING")) {
          ws?.send("PONG :tmi.twitch.tv");
          return;
        }
        if (raw.includes("PRIVMSG")) {
          const userMatch = raw.match(/display-name=([^;]+)/);
          const msgMatch = raw.match(/PRIVMSG #[^ ]+ :(.+)/);
          if (msgMatch) {
            const user = userMatch ? userMatch[1] : "Viewer";
            const text = msgMatch[1].trim();
            const now = new Date().toLocaleTimeString();
            setChatMessages((prev) => [
              ...prev.slice(-49),
              { user, text, time: now },
            ]);
          }
        }
      };
      ws.onclose = () => setChatConnected(false);
    } catch {
      setChatConnected(false);
    }
    return () => {
      ws?.close();
    };
  }, [activeModal, chatChannel]);

  const handleSelectMediaFile = async (entry: MediaFileEntry) => {
    setSelectedMedia(entry);
    setLoadingMedia(true);
    setEditorStatus(null);
    if (previewBlobUrl && previewBlobUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    try {
      const assetUrl = convertFileSrc(entry.path);
      setPreviewBlobUrl(assetUrl);
    } catch (e) {
      setEditorStatus(`Error al abrir archivo: ${String(e)}`);
    } finally {
      setLoadingMedia(false);
    }
  };

  if (!activeModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[860px] max-h-[88vh] flex flex-col rounded-xl bg-[#0B0E17] border border-slate-700/90 shadow-[0_25px_80px_rgba(0,0,0,0.95)] overflow-hidden text-xs">
        {/* Top Bar */}
        <div className="px-5 py-3.5 bg-[#101522] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#00F0FF]" />
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-white">
              {activeModal === "auto_switcher" &&
                "Extensión Pro: Cambiador Automático de Escenas (Auto Scene Switcher)"}
              {activeModal === "lower_thirds" &&
                "Extensión Pro: Estudio de Tercios Inferiores y Rótulos Broadcast"}
              {activeModal === "transition_manager" &&
                "Extensión Pro: Gestor de Reglas de Transición y Stingers"}
              {activeModal === "multistream" &&
                "Centro de Emisión Multistreaming + Chat Unificado en Vivo"}
              {activeModal === "recordings" &&
                "Gestor de Grabaciones Reales y Express Video Editor (MP4 / Remux)"}
              {activeModal === "outputs" &&
                "Salidas de Estudio: Proyector a Pantalla Completa, Cámara Virtual y NDI"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* 1. AUTO SCENE SWITCHER (`sceneSwitcherplg.plg`) */}
          {activeModal === "auto_switcher" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#101626] border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white text-sm">
                    Demonio de Detección de Ventana Activa (Win32 GetForegroundWindow)
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    Ventana actual en primer plano:{" "}
                    <span className="text-[#00F0FF] font-mono">
                      {foregroundWindow?.title || "Gamecaster Plus Studio"}
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSwitcherEnabled}
                    onChange={(e) => onToggleAutoSwitcher(e.target.checked)}
                    className="w-4 h-4 accent-[#00F0FF]"
                  />
                  <span className="font-bold text-[#00F0FF]">
                    {autoSwitcherEnabled ? "ACTIVO" : "DESACTIVADO"}
                  </span>
                </label>
              </div>

              <div className="p-3.5 rounded-lg bg-[#101626] border border-slate-800 space-y-3">
                <div className="font-semibold text-slate-200">
                  Añadir Nueva Regla de Cambio Automático
                </div>
                <div className="grid grid-cols-12 gap-2.5 items-end">
                  <div className="col-span-6">
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Proceso / Ventana Abierta o Texto a Detectar:
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Ej: Valorant, Chrome, Notepad..."
                        value={newWinMatch}
                        onChange={(e) => setNewWinMatch(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                      />
                      <select
                        onChange={(e) => {
                          if (e.target.value) setNewWinMatch(e.target.value);
                        }}
                        className="w-40 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-300"
                      >
                        <option value="">Elegir ventana...</option>
                        {openWindows.map((w) => (
                          <option key={w.hwnd} value={w.title}>
                            {w.title.slice(0, 32)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="col-span-4">
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Cambiar Automáticamente a la Escena:
                    </label>
                    <select
                      value={newTargetScene}
                      onChange={(e) => setNewTargetScene(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                    >
                      {scenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <button
                      onClick={() => {
                        if (!newWinMatch.trim()) return;
                        onUpdateAutoSceneRules([
                          ...autoSceneRules,
                          {
                            id: `asr_${Date.now()}`,
                            windowTitleMatch: newWinMatch.trim(),
                            targetSceneId: newTargetScene || scenes[0].id,
                            enabled: true,
                          },
                        ]);
                        setNewWinMatch("");
                      }}
                      className="w-full py-1.5 rounded bg-[#00F0FF] text-slate-950 font-bold flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Añadir
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {autoSceneRules.map((r) => {
                  const sc = scenes.find((s) => s.id === r.targetSceneId);
                  return (
                    <div
                      key={r.id}
                      className="px-3.5 py-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={(e) =>
                            onUpdateAutoSceneRules(
                              autoSceneRules.map((item) =>
                                item.id === r.id
                                  ? { ...item, enabled: e.target.checked }
                                  : item
                              )
                            )
                          }
                          className="accent-[#00F0FF]"
                        />
                        <span className="font-mono text-slate-200">
                          Cuando ventana contiene{" "}
                          <strong className="text-[#00F0FF]">
                            "{r.windowTitleMatch}"
                          </strong>
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                          {sc?.name || "Escena 1"}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          onUpdateAutoSceneRules(
                            autoSceneRules.filter((item) => item.id !== r.id)
                          )
                        }
                        className="text-rose-400 hover:text-rose-300 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. LOWER THIRDS & ANIMATED TITLES STUDIO (`lowerThirdSourceplg.plg`) */}
          {activeModal === "lower_thirds" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-[#101626] border border-slate-800 space-y-3">
                  <div className="font-semibold text-white">
                    Diseñador de Tercio Inferior (Lower Third Broadcast)
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Titular Principal / Nombre del Streamer:
                    </label>
                    <input
                      type="text"
                      value={ltTitle}
                      onChange={(e) => setLtTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Subtítulo / Tema del Directo:
                    </label>
                    <input
                      type="text"
                      value={ltSubtitle}
                      onChange={(e) => setLtSubtitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Usuario / Red Social:
                      </label>
                      <input
                        type="text"
                        value={ltSocial}
                        onChange={(e) => setLtSocial(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Color de Acento Broadcast:
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[
                          "#00F0FF",
                          "#FF2A54",
                          "#F59E0B",
                          "#10B981",
                          "#7C3AED",
                        ].map((col) => (
                          <button
                            key={col}
                            onClick={() => setLtAccent(col)}
                            className={`w-6 h-6 rounded border ${
                              ltAccent === col
                                ? "border-white scale-110"
                                : "border-transparent"
                            }`}
                            style={{ backgroundColor: col }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const activeSceneObj = scenes.find(
                        (s) => s.id === activeSceneId
                      );
                      const existingLt = activeSceneObj?.sources.find(
                        (src) => src.type === "lower_third"
                      );
                      if (existingLt) {
                        onAddOrUpdateSourceInActiveScene({
                          ...existingLt,
                          textContent: ltTitle,
                          subtitleContent: ltSubtitle,
                          socialHandle: ltSocial,
                          accentColor: ltAccent,
                          layout: { ...existingLt.layout, visible: true },
                        });
                      } else {
                        const newSrc = createDefaultSource(
                          "lower_third",
                          `Lower Third: ${ltTitle.slice(0, 18)}`,
                          (activeSceneObj?.sources.length || 1) + 1,
                          {
                            textContent: ltTitle,
                            subtitleContent: ltSubtitle,
                            socialHandle: ltSocial,
                            accentColor: ltAccent,
                          }
                        );
                        onAddOrUpdateSourceInActiveScene(newSrc);
                      }
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#00F0FF] to-[#3B82F6] text-slate-950 font-bold uppercase tracking-wider hover:brightness-110 transition"
                  >
                    Lanzar / Actualizar Tercio Inferior en Escena Activa
                  </button>
                </div>

                {/* Live Graphic Preview Card */}
                <div className="p-4 rounded-lg bg-[#070A12] border border-slate-800 flex flex-col justify-between">
                  <span className="text-[11px] font-mono text-slate-400 uppercase">
                    Vista Previa en Tiempo Real:
                  </span>
                  <div
                    className="p-4 rounded-r-lg bg-gradient-to-r from-slate-950 via-slate-900/95 to-transparent border-l-8 shadow-lg my-auto"
                    style={{ borderLeftColor: ltAccent }}
                  >
                    <div className="text-lg font-display font-extrabold text-white tracking-wide">
                      {ltTitle}
                    </div>
                    <div
                      className="text-xs font-semibold mt-1"
                      style={{ color: ltAccent }}
                    >
                      {ltSubtitle} • {ltSocial}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-400 block">
                      Plantillas Rápidas de 1 Clic:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          t: "EN DIRECTO // GAMEPLAY PRO",
                          s: "COMPETITIVO • 1080P 60FPS",
                          c: "#00F0FF",
                        },
                        {
                          t: "ÚLTIMA HORA // BREAKING NEWS",
                          s: "ANÁLISIS ESPECIAL EN VIVO",
                          c: "#FF2A54",
                        },
                        {
                          t: "TORNEO FINAL // GRAN FINAL",
                          s: " RONDA DE CAMPEONES",
                          c: "#F59E0B",
                        },
                        {
                          t: "YA VOLVEMOS // PAUSA BREVE",
                          s: "NO TE VAYAS DEL STREAM",
                          c: "#7C3AED",
                        },
                      ].map((preset, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setLtTitle(preset.t);
                            setLtSubtitle(preset.s);
                            setLtAccent(preset.c);
                          }}
                          className="p-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left truncate text-[11px] text-slate-200"
                        >
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-1.5"
                            style={{ backgroundColor: preset.c }}
                          />
                          {preset.t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. TRANSITION OVERRIDE MANAGER (`transitionmanagerplg.plg`) */}
          {activeModal === "transition_manager" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#101626] border border-slate-800 space-y-3">
                <div className="font-semibold text-white">
                  Nueva Regla de Transición Personalizada entre Escenas
                </div>
                <div className="grid grid-cols-12 gap-2.5 items-end">
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Desde Escena Origen:
                    </label>
                    <select
                      value={fromScene}
                      onChange={(e) => setFromScene(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                    >
                      {scenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Hacia Escena Destino:
                    </label>
                    <select
                      value={toScene}
                      onChange={(e) => setToScene(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                    >
                      {scenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Shader de Transición GPU:
                    </label>
                    <select
                      value={ruleTransition}
                      onChange={(e) =>
                        setRuleTransition(e.target.value as TransitionId)
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                    >
                      {TRANSITION_LIST.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Duración (ms):
                    </label>
                    <input
                      type="number"
                      min={100}
                      max={3000}
                      step={50}
                      value={ruleDuration}
                      onChange={(e) => setRuleDuration(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div className="col-span-1">
                    <button
                      onClick={() => {
                        onUpdateTransitionRules([
                          ...transitionRules,
                          {
                            id: `tr_${Date.now()}`,
                            fromSceneId: fromScene,
                            toSceneId: toScene,
                            transition: ruleTransition,
                            durationMs: ruleDuration,
                          },
                        ]);
                      }}
                      className="w-full py-1.5 rounded bg-[#00F0FF] text-slate-950 font-bold flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {transitionRules.map((r) => {
                  const sFrom = scenes.find((s) => s.id === r.fromSceneId);
                  const sTo = scenes.find((s) => s.id === r.toSceneId);
                  return (
                    <div
                      key={r.id}
                      className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">
                          {sFrom?.name || "Cualquier Escena"}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#00F0FF]" />
                        <span className="font-semibold text-white">
                          {sTo?.name || "Cualquier Escena"}
                        </span>
                        <span className="px-2.5 py-0.5 rounded bg-[#00F0FF]/15 text-[#00F0FF] font-mono">
                          {r.transition.toUpperCase()} ({r.durationMs} ms)
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          onUpdateTransitionRules(
                            transitionRules.filter((item) => item.id !== r.id)
                          )
                        }
                        className="text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. MULTISTREAMING STUDIO & UNIFIED TWITCH CHAT */}
          {activeModal === "multistream" && (
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">
                    Canales de Salida RTMP / RTMPS Simultáneos
                  </span>
                  <button
                    onClick={onToggleStream}
                    className={`px-4 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                      isStreaming
                        ? "bg-rose-600 text-white"
                        : "bg-[#00F0FF] text-slate-950"
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    {isStreaming
                      ? "Detener Emisión Multistream"
                      : "Iniciar Emisión en Vivo"}
                  </button>
                </div>

                {streamChannels.map((ch) => (
                  <div
                    key={ch.id}
                    className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ch.enabled}
                          onChange={(e) =>
                            onUpdateStreamChannels(
                              streamChannels.map((c) =>
                                c.id === ch.id
                                  ? { ...c, enabled: e.target.checked }
                                  : c
                              )
                            )
                          }
                          className="w-4 h-4 accent-[#00F0FF]"
                        />
                        <span className="font-bold text-white">
                          {ch.platform} — {ch.name}
                        </span>
                      </label>
                      <span className="font-mono text-[11px] text-[#00F0FF]">
                        {ch.bitrateKbps} kbps • NVENC/x264
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Servidor RTMP URL"
                        value={ch.rtmpUrl}
                        onChange={(e) =>
                          onUpdateStreamChannels(
                            streamChannels.map((c) =>
                              c.id === ch.id
                                ? { ...c, rtmpUrl: e.target.value }
                                : c
                            )
                          )
                        }
                        className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 font-mono text-[11px]"
                      />
                      <input
                        type="password"
                        placeholder="Clave de Retransmisión (Stream Key)"
                        value={ch.streamKey}
                        onChange={(e) =>
                          onUpdateStreamChannels(
                            streamChannels.map((c) =>
                              c.id === ch.id
                                ? { ...c, streamKey: e.target.value }
                                : c
                            )
                          )
                        }
                        className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 font-mono text-[11px]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Twitch IRC Chat Dock */}
              <div className="col-span-5 flex flex-col rounded-lg bg-[#070A12] border border-slate-800 h-[380px] overflow-hidden">
                <div className="p-2.5 bg-[#101522] border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#00F0FF]" />
                    <span className="font-semibold text-white">
                      Chat IRC en Vivo:
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={chatChannel}
                      onChange={(e) => setChatChannel(e.target.value)}
                      className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-white font-mono text-[11px]"
                      placeholder="Canal Twitch"
                    />
                    <span
                      className={`w-2 h-2 rounded-full ${
                        chatConnected ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                      title={
                        chatConnected ? "Conectado a Twitch IRC" : "Conectando..."
                      }
                    />
                  </div>
                </div>
                <div className="flex-1 p-2.5 overflow-y-auto space-y-1.5 font-sans">
                  {chatMessages.length === 0 ? (
                    <div className="text-slate-500 text-center mt-12">
                      Conectado al servidor IRC de{" "}
                      <span className="text-[#00F0FF]">#{chatChannel}</span>.
                      Esperando mensajes en directo...
                    </div>
                  ) : (
                    chatMessages.map((m, idx) => (
                      <div
                        key={idx}
                        className="p-1.5 rounded bg-slate-900/70 text-[11px]"
                      >
                        <span className="text-slate-500 font-mono mr-1.5">
                          [{m.time}]
                        </span>
                        <span className="font-bold text-[#00F0FF] mr-1.5">
                          {m.user}:
                        </span>
                        <span className="text-slate-200">{m.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5. RECORDINGS MANAGER & EXPRESS VIDEO EDITOR */}
          {activeModal === "recordings" && (
            <div className="grid grid-cols-12 gap-4">
              {/* Left File List */}
              <div className="col-span-5 flex flex-col rounded-lg bg-[#101626] border border-slate-800 h-[430px] overflow-hidden">
                <div className="p-2.5 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-semibold text-white">
                    Archivos Reales en Disco ({mediaFiles.length})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={refreshMediaFiles}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                      title="Actualizar lista"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        invoke("open_media_folder", { sub: "recordings" })
                      }
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[#00F0FF] flex items-center gap-1"
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> Carpeta
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
                  {mediaFiles.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                      No hay grabaciones ni capturas aún. Pulsa "Grabar" o
                      "Captura" en la barra superior para generar archivos
                      reales.
                    </div>
                  ) : (
                    mediaFiles.map((file) => {
                      const active = selectedMedia?.path === file.path;
                      return (
                        <div
                          key={file.path}
                          onClick={() => handleSelectMediaFile(file)}
                          className={`p-2.5 cursor-pointer flex items-center justify-between transition ${
                            active
                              ? "bg-[#00F0FF]/15 text-white"
                              : "hover:bg-slate-900/70 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {file.kind === "video" ? (
                              <Film className="w-4 h-4 text-rose-400 shrink-0" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-[#00F0FF] shrink-0" />
                            )}
                            <div className="truncate">
                              <div className="font-medium truncate">
                                {file.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {(file.size_bytes / (1024 * 1024)).toFixed(2)}{" "}
                                MB • {file.created_display}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await invoke("delete_media_file", {
                                path: file.path,
                              });
                              if (selectedMedia?.path === file.path) {
                                setSelectedMedia(null);
                                setPreviewBlobUrl(null);
                              }
                              refreshMediaFiles();
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Video/Image Player & Express Video Editor */}
              <div className="col-span-7 flex flex-col justify-between rounded-lg bg-[#070A12] border border-slate-800 p-3.5 h-[430px]">
                {selectedMedia ? (
                  <>
                    <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden border border-slate-800 relative">
                      {loadingMedia ? (
                        <span className="text-[#00F0FF] font-mono">
                          Cargando binario desde disco...
                        </span>
                      ) : previewBlobUrl ? (
                        selectedMedia.kind === "video" ? (
                          <video
                            key={previewBlobUrl}
                            src={previewBlobUrl}
                            controls
                            autoPlay
                            className="max-h-[260px] w-full object-contain"
                          />
                        ) : (
                          <img
                            src={previewBlobUrl}
                            alt={selectedMedia.name}
                            className="max-h-[260px] w-full object-contain"
                          />
                        )
                      ) : (
                        <span className="text-slate-500">
                          Selecciona un archivo para previsualizar
                        </span>
                      )}
                    </div>

                    {/* Express Video Editor Toolbar */}
                    {selectedMedia.kind === "video" && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">
                            Express Video Editor (FFmpeg Lossless Trim & FastStart Remux)
                          </span>
                          {editorStatus && (
                            <span className="text-[11px] text-emerald-400 font-mono">
                              {editorStatus}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">Inicio (s):</span>
                            <input
                              type="number"
                              min={0}
                              value={trimStart}
                              onChange={(e) =>
                                setTrimStart(Number(e.target.value))
                              }
                              className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">Fin (s):</span>
                            <input
                              type="number"
                              min={1}
                              value={trimEnd}
                              onChange={(e) =>
                                setTrimEnd(Number(e.target.value))
                              }
                              className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                            />
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                setEditorStatus("Recortando vídeo...");
                                await invoke("lossless_cut_video", {
                                  path: selectedMedia.path,
                                  startSec: trimStart,
                                  endSec: trimEnd,
                                });
                                setEditorStatus("¡Clip recortado creado!");
                                refreshMediaFiles();
                              } catch (e) {
                                setEditorStatus(`Error: ${String(e)}`);
                              }
                            }}
                            className="px-3 py-1.5 rounded bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40 hover:bg-[#00F0FF]/30 font-semibold flex items-center gap-1"
                          >
                            <Scissors className="w-3.5 h-3.5" /> Recortar Clip
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                setEditorStatus("Optimizando MOOV +faststart...");
                                await invoke("optimize_mp4_faststart", {
                                  path: selectedMedia.path,
                                });
                                setEditorStatus("¡MP4 FastStart optimizado!");
                                refreshMediaFiles();
                              } catch (e) {
                                setEditorStatus(`Error: ${String(e)}`);
                              }
                            }}
                            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
                          >
                            <Wrench className="w-3.5 h-3.5 text-amber-400" />
                            Reparar / FastStart
                          </button>
                          {previewBlobUrl && (
                            <button
                              onClick={() => {
                                const newSrc = createDefaultSource(
                                  "media",
                                  selectedMedia.name,
                                  10,
                                  { mediaUrl: previewBlobUrl, mediaLoop: true }
                                );
                                onAddOrUpdateSourceInActiveScene(newSrc);
                                onClose();
                              }}
                              className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                            >
                              + Añadir al Lienzo
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="m-auto text-slate-500 text-center">
                    Selecciona una grabación o captura de la izquierda
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 6. PROJECTOR, VIRTUAL CAM & NDI OUTPUTS */}
          {activeModal === "outputs" && (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#101626] border border-slate-800 flex flex-col justify-between space-y-3">
                <div>
                  <Monitor className="w-7 h-7 text-[#00F0FF] mb-2" />
                  <h3 className="font-bold text-white text-sm">
                    Proyector de Monitor a Pantalla Completa
                  </h3>
                  <p className="text-slate-400 mt-1">
                    Envía la salida limpia del escenario a pantalla completa sin
                    bordes (`ProjectorBorder: Off`).
                  </p>
                </div>
                <button
                  onClick={() => {
                    onToggleFullscreenProjector();
                    onClose();
                  }}
                  className="w-full py-2 rounded-lg bg-[#00F0FF] text-slate-950 font-bold"
                >
                  Conmutar Pantalla Completa
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[#101626] border border-slate-800 flex flex-col justify-between space-y-3">
                <div>
                  <Cpu className="w-7 h-7 text-emerald-400 mb-2" />
                  <h3 className="font-bold text-white text-sm">
                    Cámara Virtual (Virtual Cam)
                  </h3>
                  <p className="text-slate-400 mt-1">
                    Expone la salida compuesta del estudio (incluyendo Chroma Key
                    y Lower Thirds) para Discord, Zoom, Teams o navegadores.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-emerald-400 font-semibold py-1.5 px-3 rounded bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4" /> Activa (1920×1080 @ 60FPS)
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#101626] border border-slate-800 flex flex-col justify-between space-y-3">
                <div>
                  <Radio className="w-7 h-7 text-purple-400 mb-2" />
                  <h3 className="font-bold text-white text-sm">
                    Salida NDI® / Stream Local LAN
                  </h3>
                  <p className="text-slate-400 mt-1">
                    Transmite el lienzo con canal alfa a través de tu red local
                    Gigabit sin sobrecargar la GPU.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-purple-300 font-semibold py-1.5 px-3 rounded bg-purple-500/10 border border-purple-500/30">
                  <CheckCircle2 className="w-4 h-4" /> NDI® Alpha Stream Listo
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
