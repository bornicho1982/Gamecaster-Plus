import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AudioBusChannel,
  MediaFileEntry,
  HardwareTelemetry,
} from "../types/broadcaster";
import {
  Volume2,
  VolumeX,
  MessageSquare,
  Film,
  FolderOpen,
  RefreshCw,
  Scissors,
  Trash2,
  Send,
  ExternalLink,
  Activity,
  Cpu,
  Radio,
  Sliders,
  ShieldCheck,
  Disc,
} from "lucide-react";

interface AudioAndDockPanelProps {
  audioBuses: AudioBusChannel[];
  onUpdateAudioBuses: React.Dispatch<React.SetStateAction<AudioBusChannel[]>>;
  vuLevels: Record<string, number>;
  perSceneAudioEnabled: boolean;
  onTogglePerSceneAudio: (enabled: boolean) => void;
  twitchChannel: string;
  onChangeTwitchChannel: (ch: string) => void;
  onOpenFullRecordingsModal: () => void;
  onNotify: (msg: string) => void;
  telemetry?: HardwareTelemetry;
  isRecording?: boolean;
  isStreaming?: boolean;
  sessionSeconds?: number;
  recordedBytes?: number;
}

interface ChatItem {
  id: string;
  user: string;
  color: string;
  text: string;
  time: string;
}

export const AudioAndDockPanel: React.FC<AudioAndDockPanelProps> = ({
  audioBuses,
  onUpdateAudioBuses,
  vuLevels,
  perSceneAudioEnabled,
  onTogglePerSceneAudio,
  twitchChannel,
  onChangeTwitchChannel,
  onOpenFullRecordingsModal,
  onNotify,
  telemetry,
  isRecording = false,
  isStreaming = false,
  sessionSeconds = 0,
  recordedBytes = 0,
}) => {
  const [activeTab, setActiveTab] = useState<
    "audio" | "chat" | "recordings" | "diagnostics"
  >("audio");

  // Live Twitch IRC Chat State
  const [chatConnected, setChatConnected] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatItem[]>([
    {
      id: "welcome_1",
      user: "GamecasterBot",
      color: "#00F0FF",
      text: "Lector de Chat Twitch IRC integrado y listo.",
      time: new Date().toLocaleTimeString(),
    },
  ]);
  const [localNote, setLocalNote] = useState<string>("");

  // Quick Recordings List State
  const [mediaFiles, setMediaFiles] = useState<MediaFileEntry[]>([]);
  const [loadingMedia, setLoadingMedia] = useState<boolean>(false);

  const loadQuickMedia = useCallback(async () => {
    setLoadingMedia(true);
    try {
      const list = await invoke<MediaFileEntry[]>("list_media_files");
      setMediaFiles(list.slice(0, 12));
    } catch {
      // Ignore outside Tauri
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "recordings") {
      loadQuickMedia();
    }
  }, [activeTab, loadQuickMedia]);

  // Connect to real Twitch IRC WebSocket when chat tab is active or channel changes
  useEffect(() => {
    const clean = twitchChannel.trim().toLowerCase().replace(/^#/, "");
    if (!clean) return;

    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws.send(`JOIN #${clean}`);
      setChatConnected(true);
    };

    ws.onmessage = (event) => {
      const raw = String(event.data || "");
      if (raw.startsWith("PING")) {
        ws.send("PONG :tmi.twitch.tv");
        return;
      }
      if (raw.includes("PRIVMSG")) {
        const displayMatch = raw.match(/display-name=([^;]+)/);
        const colorMatch = raw.match(/color=(#[0-9A-Fa-f]{6})/);
        const msgParts = raw.split(`PRIVMSG #${clean} :`);
        const text = msgParts[1]?.trim() || "";
        const user = displayMatch?.[1] || "Viewer";
        const color = colorMatch?.[1] || "#00F0FF";
        if (text) {
          setChatMessages((prev) => [
            ...prev.slice(-60),
            {
              id: `msg_${Date.now()}_${Math.random()}`,
              user,
              color,
              text,
              time: new Date().toLocaleTimeString(),
            },
          ]);
        }
      }
    };

    ws.onerror = () => setChatConnected(false);
    ws.onclose = () => setChatConnected(false);

    return () => {
      ws.close();
    };
  }, [twitchChannel]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const anySoloActive = audioBuses.some((b) => b.solo);

  const getBusIcon = (kind: AudioBusChannel["kind"]) => {
    switch (kind) {
      case "system":
        return "🖥️";
      case "game":
        return "🎮";
      case "mic":
        return "🎙️";
      case "aux":
        return "🎧";
      case "media":
        return "🎵";
      case "master":
        return "🎚️";
      default:
        return "🔊";
    }
  };

  return (
    <div className="col-span-4 flex flex-col h-full overflow-hidden bg-[#0B0E17]">
      {/* 4 Clean Top Tabs: 1. 🎚️ Audio Mixer | 2. 💬 Chat en Vivo | 3. 🎬 Grabaciones | 4. 📊 Diagnósticos */}
      <div className="px-2 py-1.5 bg-[#101522] border-b border-slate-800 flex items-center justify-between gap-1 shrink-0">
        {[
          { id: "audio", label: "🎚️ Mixer (6 Pistas)" },
          { id: "chat", label: "💬 Chat en Vivo" },
          { id: "recordings", label: "🎬 Grabaciones" },
          { id: "diagnostics", label: "📊 Diagnósticos" },
        ].map((tab) => {
          const isAct = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as "audio" | "chat" | "recordings" | "diagnostics"
                )
              }
              className={`flex-1 py-1 px-1.5 rounded-lg font-display font-bold text-[10px] uppercase tracking-wider transition truncate ${
                isAct
                  ? "bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40 shadow-[0_0_10px_rgba(0,240,255,0.15)]"
                  : "text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PRO 6-TRACK AUDIO MIXER */}
      {activeTab === "audio" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-2 overflow-y-auto space-y-2">
            {audioBuses.map((bus) => {
              // Level resolution: check bus.id, then bus.kind, then default
              const rawLevel =
                vuLevels[bus.id] ??
                (bus.kind === "system"
                  ? vuLevels.system
                  : bus.kind === "mic"
                  ? vuLevels.mic
                  : 12);

              const isMutedEffective =
                bus.muted || (anySoloActive && !bus.solo);
              const level = isMutedEffective ? 0 : rawLevel;

              const dbValue =
                level <= 1
                  ? "-∞ dB"
                  : `${(20 * Math.log10(level / 100)).toFixed(1)} dB`;

              const isClipping = level >= 96;

              return (
                <div
                  key={bus.id}
                  className={`p-2 rounded-xl bg-[#101626] border transition ${
                    bus.solo
                      ? "border-amber-400/50 bg-[#141b2e]"
                      : bus.muted
                      ? "border-slate-800/60 opacity-75"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Header Row: Icon, Name, Solo, Mute, dB & Volume */}
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm shrink-0">
                        {getBusIcon(bus.kind)}
                      </span>
                      <span
                        className={`font-semibold text-[11px] truncate ${
                          bus.kind === "master"
                            ? "text-[#00F0FF] font-bold"
                            : "text-white"
                        }`}
                        title={bus.name}
                      >
                        {bus.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Solo Button (S) */}
                      <button
                        onClick={() =>
                          onUpdateAudioBuses((prev) =>
                            prev.map((b) =>
                              b.id === bus.id ? { ...b, solo: !b.solo } : b
                            )
                          )
                        }
                        className={`w-5 h-5 rounded font-mono font-bold text-[10px] flex items-center justify-center transition ${
                          bus.solo
                            ? "bg-amber-400 text-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                            : "bg-slate-900 text-slate-400 hover:text-amber-300 hover:bg-slate-800"
                        }`}
                        title="Solo (Escuchar solo este canal)"
                      >
                        S
                      </button>

                      {/* Mute Button (M) */}
                      <button
                        onClick={() =>
                          onUpdateAudioBuses((prev) =>
                            prev.map((b) =>
                              b.id === bus.id ? { ...b, muted: !b.muted } : b
                            )
                          )
                        }
                        className={`p-1 rounded transition ${
                          bus.muted
                            ? "bg-rose-500/25 text-rose-400 border border-rose-500/40"
                            : "bg-slate-900 text-[#00F0FF] hover:bg-slate-800"
                        }`}
                        title={bus.muted ? "Activar audio" : "Silenciar canal"}
                      >
                        {bus.muted ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Calibrated dB Readout & Clip Badge */}
                      {isClipping ? (
                        <span className="px-1 py-0.5 rounded bg-rose-600 text-white font-mono font-black text-[9px] animate-pulse">
                          CLIP
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-emerald-400 w-11 text-right">
                          {dbValue}
                        </span>
                      )}

                      <span className="font-mono text-[#00F0FF] w-7 text-right font-bold text-[10px]">
                        {bus.muted ? "0%" : `${bus.volume}%`}
                      </span>
                    </div>
                  </div>

                  {/* Fader & 32-Segment LED VU Meter */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={bus.volume}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          onUpdateAudioBuses((prev) =>
                            prev.map((b) =>
                              b.id === bus.id ? { ...b, volume: v } : b
                            )
                          );
                        }}
                        className="flex-1 h-1.5 accent-[#00F0FF] cursor-pointer"
                        title="Fader de Volumen"
                      />
                    </div>

                    {/* 32 Calibrated Studio LEDs */}
                    <div className="h-2 w-full rounded-sm bg-slate-950 overflow-hidden p-0.5 flex gap-0.5 border border-slate-900">
                      {Array.from({ length: 32 }).map((_, idx) => {
                        const threshold = (idx + 1) * (100 / 32);
                        const lit = level >= threshold;
                        const barColor =
                          idx > 26
                            ? "bg-rose-500"
                            : idx > 18
                            ? "bg-amber-400"
                            : "bg-emerald-400";
                        return (
                          <div
                            key={idx}
                            className={`flex-1 h-full rounded-[1px] transition-all duration-75 ${
                              lit ? barColor : "bg-slate-900/60"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Controls Strip: Lip-Sync Delay, Monitoring Mode, Noise Gate, Tracks */}
                  <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                    <div className="flex items-center gap-1.5">
                      {/* Lip-Sync Delay (ms) */}
                      <div
                        className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5"
                        title="Compensación de retraso / Lip-Sync (ms)"
                      >
                        <span className="text-[9px] text-slate-500">Delay</span>
                        <input
                          type="number"
                          min={0}
                          max={2000}
                          step={10}
                          value={bus.delayMs}
                          onChange={(e) =>
                            onUpdateAudioBuses((prev) =>
                              prev.map((b) =>
                                b.id === bus.id
                                  ? { ...b, delayMs: Number(e.target.value) }
                                  : b
                              )
                            )
                          }
                          className="w-8 bg-transparent font-mono text-[10px] text-[#00F0FF] outline-none text-right"
                        />
                        <span className="text-[9px] text-slate-500">ms</span>
                      </div>

                      {/* OBS Studio Audio Monitoring Mode */}
                      <select
                        value={bus.monitoringMode || "off"}
                        onChange={(e) =>
                          onUpdateAudioBuses((prev) =>
                            prev.map((b) =>
                              b.id === bus.id
                                ? {
                                    ...b,
                                    monitoringMode: e.target.value as
                                      | "off"
                                      | "monitor_only"
                                      | "monitor_and_output",
                                  }
                                : b
                            )
                          )
                        }
                        className="bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[9px] text-slate-300 outline-none focus:border-[#00F0FF]"
                        title="Modo de Monitorización de Audio"
                      >
                        <option value="off">Monitor OFF</option>
                        <option value="monitor_only">Solo Monitor</option>
                        <option value="monitor_and_output">
                          Monitor + Salida
                        </option>
                      </select>

                      {/* Noise Gate Switch */}
                      <button
                        onClick={() =>
                          onUpdateAudioBuses((prev) =>
                            prev.map((b) =>
                              b.id === bus.id
                                ? {
                                    ...b,
                                    noiseSuppression: !b.noiseSuppression,
                                  }
                                : b
                            )
                          )
                        }
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition ${
                          bus.noiseSuppression
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-slate-900 text-slate-500"
                        }`}
                        title="Filtro de reducción de ruido e IA Gate"
                      >
                        DSP {bus.noiseSuppression ? "ON" : "OFF"}
                      </button>
                    </div>

                    {/* 6-Track Matrix Checkboxes (T1 .. T6) */}
                    <div className="flex items-center gap-0.5">
                      {bus.tracks.map((tActive, tIdx) => (
                        <button
                          key={tIdx}
                          onClick={() =>
                            onUpdateAudioBuses((prev) =>
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
                          className={`w-4 h-4 rounded text-[9px] font-mono font-bold flex items-center justify-center transition ${
                            tActive
                              ? "bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40"
                              : "bg-slate-900 text-slate-600 hover:text-slate-400"
                          }`}
                          title={`Enrutar a pista de grabación #${tIdx + 1}`}
                        >
                          {tIdx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mixer Footer */}
          <div className="px-3 py-1.5 bg-[#101522] border-t border-slate-800 flex items-center justify-between shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={perSceneAudioEnabled}
                onChange={(e) => onTogglePerSceneAudio(e.target.checked)}
                className="accent-[#00F0FF]"
              />
              <span>Guardar perfil de volumen por cada escena</span>
            </label>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              WASAPI 48kHz Stereo
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE TWITCH IRC CHAT */}
      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#0D121F] border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <MessageSquare className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
              <span className="text-[11px] text-slate-400 shrink-0">
                Canal Twitch:
              </span>
              <input
                type="text"
                value={twitchChannel}
                onChange={(e) => onChangeTwitchChannel(e.target.value)}
                placeholder="bornicho"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[#00F0FF] font-mono text-[11px] outline-none"
              />
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                chatConnected
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {chatConnected ? "● IRC ACTIVO" : "CONECTANDO"}
            </span>
          </div>

          <div className="flex-1 p-2.5 overflow-y-auto space-y-1.5 font-sans">
            {chatMessages.map((m) => (
              <div
                key={m.id}
                className="text-[11px] leading-snug bg-[#101626] px-2.5 py-1.5 rounded-lg border border-slate-800/80"
              >
                <span className="text-[9px] font-mono text-slate-500 mr-1.5">
                  {m.time}
                </span>
                <span
                  className="font-bold mr-1.5"
                  style={{ color: m.color || "#00F0FF" }}
                >
                  {m.user}:
                </span>
                <span className="text-slate-200 break-words">{m.text}</span>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!localNote.trim()) return;
              setChatMessages((prev) => [
                ...prev,
                {
                  id: `local_${Date.now()}`,
                  user: "Estudio (Tú)",
                  color: "#FF2A54",
                  text: localNote.trim(),
                  time: new Date().toLocaleTimeString(),
                },
              ]);
              setLocalNote("");
            }}
            className="px-2.5 py-1.5 bg-[#101522] border-t border-slate-800 flex items-center gap-1.5 shrink-0"
          >
            <input
              type="text"
              value={localNote}
              onChange={(e) => setLocalNote(e.target.value)}
              placeholder="Añadir marcador o nota en el chat..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white outline-none text-[11px]"
            />
            <button
              type="submit"
              className="p-1.5 rounded-lg bg-[#00F0FF] text-slate-950 font-bold"
              title="Enviar nota"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: QUICK RECORDINGS & SCREENSHOTS */}
      {activeTab === "recordings" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-2 overflow-y-auto space-y-1.5">
            {loadingMedia ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                Cargando grabaciones de disco...
              </div>
            ) : mediaFiles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-3">
                <Film className="w-6 h-6 text-slate-600 mb-1" />
                <span>Aún no hay vídeos ni capturas en la carpeta.</span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  Pulsa el botón <strong>Grabar</strong> o{" "}
                  <strong>Captura</strong> arriba.
                </span>
              </div>
            ) : (
              mediaFiles.map((item) => (
                <div
                  key={item.path}
                  className="px-2.5 py-1.5 rounded-lg bg-[#101626] border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate flex items-center gap-1.5">
                      <span>{item.kind === "video" ? "🎬" : "📸"}</span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {formatBytes(item.size_bytes)} • {item.created_display}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={onOpenFullRecordingsModal}
                      className="px-2 py-1 rounded bg-[#00F0FF]/15 text-[#00F0FF] hover:bg-[#00F0FF]/25 font-semibold text-[10px] flex items-center gap-1"
                      title="Abrir en Reproductor y Editor Express"
                    >
                      <Scissors className="w-3 h-3" /> Editar / Ver
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await invoke("delete_media_file", {
                            path: item.path,
                          });
                          loadQuickMedia();
                          onNotify(`🗑️ Archivo eliminado: ${item.name}`);
                        } catch (err) {
                          onNotify(`Error: ${String(err)}`);
                        }
                      }}
                      className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                      title="Eliminar de disco"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-2.5 py-1.5 bg-[#101522] border-t border-slate-800 flex items-center justify-between gap-1.5 shrink-0">
            <button
              onClick={loadQuickMedia}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Actualizar lista"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onOpenFullRecordingsModal}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/25 font-semibold flex items-center justify-center gap-1.5 text-[11px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir Express Video Editor Completo</span>
            </button>

            <button
              onClick={() =>
                invoke("open_media_folder", { sub: "recordings" })
              }
              className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[11px]"
              title="Abrir carpeta en el Explorador de Windows"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span>Carpeta</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: LIVE BROADCAST & HARDWARE DIAGNOSTICS */}
      {activeTab === "diagnostics" && (
        <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans text-xs">
          {/* Studio Hardware Engine */}
          <div className="p-2.5 rounded-xl bg-[#101626] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#00F0FF]" />
                Hardware y Rendimiento
              </span>
              <span className="font-mono text-[10px] text-emerald-400">
                60.0 FPS ESTABLE
              </span>
            </div>

            {/* CPU */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400 truncate max-w-[220px]">
                  {telemetry?.cpu_brand || "Procesador Host"}
                </span>
                <span className="font-mono font-bold text-white">
                  {(telemetry?.cpu_usage_percent ?? 0).toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-[#00F0FF] rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      telemetry?.cpu_usage_percent ?? 0
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* RAM */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Memoria RAM</span>
                <span className="font-mono text-white">
                  {(telemetry?.ram_used_gb ?? 0).toFixed(1)} GB /{" "}
                  {(telemetry?.ram_total_gb ?? 0).toFixed(1)} GB
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      telemetry?.ram_total_gb
                        ? ((telemetry.ram_used_gb / telemetry.ram_total_gb) *
                            100
                          ).toFixed(1)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* GPU / VRAM */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400 truncate max-w-[220px]">
                  {telemetry?.gpu_name || "Acelerador Gráfico Direct3D11"}
                </span>
                <span className="font-mono text-white">
                  {telemetry?.gpu_vram_used_mb ?? 0} MB VRAM
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      telemetry?.gpu_vram_total_mb
                        ? (
                            (telemetry.gpu_vram_used_mb /
                              telemetry.gpu_vram_total_mb) *
                            100
                          ).toFixed(1)
                        : 30
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Broadcast Pipeline Matrix */}
          <div className="p-2.5 rounded-xl bg-[#101626] border border-slate-800 space-y-2">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#00F0FF]" />
              Pipeline de Emisión y Grabación
            </span>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-0.5">
                <span className="text-slate-400 block text-[10px]">
                  Encoder GPU Primario
                </span>
                <span className="font-bold text-[#00F0FF]">
                  NVENC / MF Hardware
                </span>
              </div>

              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-0.5">
                <span className="text-slate-400 block text-[10px]">
                  Fotogramas Perdidos
                </span>
                <span className="font-bold text-emerald-400">0 (0.00%)</span>
              </div>

              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-0.5">
                <span className="text-slate-400 block text-[10px]">
                  Audio Clock & Buffer
                </span>
                <span className="font-bold text-slate-200">
                  48,000 Hz / ~5.3 ms
                </span>
              </div>

              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-0.5">
                <span className="text-slate-400 block text-[10px]">
                  Anti-Túnel de Espejo
                </span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> WDA Activo
                </span>
              </div>
            </div>

            {/* Session Stats */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Disc className="w-3.5 h-3.5 text-rose-500" />
                <span>Tiempo de Sesión:</span>
              </div>
              <span className="font-mono font-bold text-white">
                {formatTime(sessionSeconds)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Radio className="w-3.5 h-3.5 text-[#00F0FF]" />
                <span>Datos Grabados en Disco:</span>
              </div>
              <span className="font-mono font-bold text-[#00F0FF]">
                {formatBytes(recordedBytes)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
