import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AudioBusChannel, MediaFileEntry } from "../types/broadcaster";
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
} from "lucide-react";

interface AudioAndDockPanelProps {
  audioBuses: AudioBusChannel[];
  onUpdateAudioBuses: React.Dispatch<React.SetStateAction<AudioBusChannel[]>>;
  vuLevels: { system: number; mic: number };
  perSceneAudioEnabled: boolean;
  onTogglePerSceneAudio: (enabled: boolean) => void;
  twitchChannel: string;
  onChangeTwitchChannel: (ch: string) => void;
  onOpenFullRecordingsModal: () => void;
  onNotify: (msg: string) => void;
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
}) => {
  const [activeTab, setActiveTab] = useState<"audio" | "chat" | "recordings">(
    "audio"
  );

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

  return (
    <div className="col-span-4 flex flex-col h-full overflow-hidden bg-[#0B0E17]">
      {/* 3 Clean Top Tabs: 1. 🎚️ Audio Mixer | 2. 💬 Chat en Vivo | 3. 🎬 Grabaciones Rápidas */}
      <div className="px-2 py-1.5 bg-[#101522] border-b border-slate-800 flex items-center justify-between gap-1 shrink-0">
        {[
          { id: "audio", label: "🎚️ Audio Mixer" },
          { id: "chat", label: "💬 Chat en Vivo" },
          { id: "recordings", label: "🎬 Grabaciones" },
        ].map((tab) => {
          const isAct = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(tab.id as "audio" | "chat" | "recordings")
              }
              className={`flex-1 py-1.5 px-2 rounded-lg font-display font-bold text-[11px] uppercase tracking-wider transition ${
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

      {/* TAB 1: AUDIO MIXER PRO */}
      {activeTab === "audio" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-2.5 overflow-y-auto space-y-2">
            {audioBuses.map((bus) => {
              const level =
                bus.kind === "system" ? vuLevels.system : vuLevels.mic;
              const dbValue =
                bus.muted || level <= 1
                  ? "-∞ dB"
                  : `${(20 * Math.log10(level / 100)).toFixed(1)} dB`;
              return (
                <div
                  key={bus.id}
                  className="p-2.5 rounded-xl bg-[#101626] border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() =>
                          onUpdateAudioBuses((prev) =>
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
                        title="Silenciar / Activar canal"
                      >
                        {bus.muted ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="font-semibold text-white truncate">
                        {bus.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* OBS Audio Monitoring Mode Selector */}
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
                        className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-300 outline-none focus:border-[#00F0FF]"
                        title="Modo de Monitorización de Audio (Estilo OBS Studio)"
                      >
                        <option value="off">Monitor OFF</option>
                        <option value="monitor_only">Solo Monitor</option>
                        <option value="monitor_and_output">Monitor + Salida</option>
                      </select>

                      <div
                        className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5"
                        title="Compensación de retraso de audio (Delay ms)"
                      >
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
                          className="w-9 bg-transparent font-mono text-[10px] text-[#00F0FF] outline-none text-right"
                        />
                        <span className="text-[9px] text-slate-500">ms</span>
                      </div>

                      <span className="font-mono text-[10px] text-emerald-400 w-12 text-right">
                        {dbValue}
                      </span>
                      <span className="font-mono text-[#00F0FF] w-8 text-right font-bold text-[10px]">
                        {bus.muted ? "MUTE" : `${bus.volume}%`}
                      </span>
                    </div>
                  </div>

                  {/* Fader + Segmented LED VU Meter */}
                  <div className="space-y-1">
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
                      <span className="text-slate-400 mr-0.5">Pistas:</span>
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
                          className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                            tActive
                              ? "bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40"
                              : "bg-slate-900 text-slate-500"
                          }`}
                          title={`Pista Multipista #${tIdx + 1}`}
                        >
                          T{tIdx + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() =>
                        onUpdateAudioBuses((prev) =>
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
                    >
                      IA Noise Gate {bus.noiseSuppression ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

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
            <span className="text-[10px] font-mono text-emerald-400">
              WASAPI 48kHz
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
    </div>
  );
};
