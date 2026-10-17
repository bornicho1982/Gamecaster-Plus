import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GlobalSettings,
  HotkeyConfig,
  StreamChannelConfig,
} from "../types/broadcaster";
import {
  Settings,
  Monitor,
  Volume2,
  Film,
  Radio,
  Keyboard,
  X,
  FolderOpen,
  ShieldCheck,
  Plus,
  Trash2,
  Package,
} from "lucide-react";

export type SettingsTabId =
  | "general"
  | "video"
  | "audio"
  | "recording"
  | "streaming"
  | "hotkeys"
  | "store";

interface GlobalSettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsTabId;
  onClose: () => void;
  settings: GlobalSettings;
  onUpdateSettings: (next: GlobalSettings) => void;
  streamChannels: StreamChannelConfig[];
  onUpdateStreamChannels: (channels: StreamChannelConfig[]) => void;
  onNotify: (msg: string) => void;
}

export const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({
  isOpen,
  initialTab = "general",
  onClose,
  settings,
  onUpdateSettings,
  streamChannels,
  onUpdateStreamChannels,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [recordingHotkeyField, setRecordingHotkeyField] = useState<
    keyof HotkeyConfig | null
  >(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Enumerate real microphone and system audio devices
  useEffect(() => {
    if (!isOpen) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => {
        setAudioInputs(devices.filter((d) => d.kind === "audioinput"));
        setAudioOutputs(devices.filter((d) => d.kind === "audiooutput"));
      })
      .catch(() => {});
  }, [isOpen]);

  // Capture key combination when editing a hotkey
  useEffect(() => {
    if (!recordingHotkeyField) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

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

      onUpdateSettings({
        ...settings,
        hotkeys: {
          ...settings.hotkeys,
          [recordingHotkeyField]: combo,
        },
      });
      setRecordingHotkeyField(null);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recordingHotkeyField, settings, onUpdateSettings]);

  if (!isOpen) return null;

  const navItems: {
    id: SettingsTabId;
    label: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: "general", label: "1. General", icon: Settings },
    { id: "video", label: "2. Vídeo y Lienzo", icon: Monitor },
    { id: "audio", label: "3. Audio y Dispositivos", icon: Volume2 },
    { id: "recording", label: "4. Grabación", icon: Film },
    { id: "streaming", label: "5. Transmisión (Cuentas)", icon: Radio },
    { id: "hotkeys", label: "6. Atajos de Teclado", icon: Keyboard },
    { id: "store", label: "7. Microsoft Store (MSIX)", icon: Package },
  ];

  const handleToggleExcludeFromCapture = async (exclude: boolean) => {
    onUpdateSettings({ ...settings, excludeFromCapture: exclude });
    try {
      await invoke("set_exclude_from_capture", { exclude });
      onNotify(
        exclude
          ? "🛡️ Ventana oculta de la captura de pantalla (Sin efecto espejo)"
          : "👁️ Ventana visible en la captura de pantalla"
      );
    } catch {
      // Ignore outside Tauri
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-4xl h-[620px] rounded-2xl bg-[#0B0E17] border border-slate-700/90 shadow-[0_25px_70px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden text-xs text-slate-200">
        {/* Top Modal Header */}
        <div className="px-5 py-3.5 bg-[#101522] border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-[#00F0FF]" />
            <h2 className="font-display font-bold text-sm uppercase tracking-wider text-white">
              Centro de Configuración Global — Gamecaster Plus Studio v4.6
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Body: Left Navigation Sidebar + Right Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar */}
          <aside className="w-60 bg-[#080B12] border-r border-slate-800/90 p-3 flex flex-col justify-between shrink-0">
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-semibold text-left transition ${
                      active
                        ? "bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40 shadow-[0_0_15px_rgba(0,240,255,0.12)]"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/80 border border-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-1">
              <div className="flex items-center gap-1.5 text-[#00F0FF] font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Motor Nativo Activo</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Sin marcas de agua • 60 FPS • Aceleración GPU Direct3D / NVENC.
              </p>
            </div>
          </aside>

          {/* Right Section Content */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            {/* 1. GENERAL */}
            {activeTab === "general" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-display font-bold uppercase tracking-wider text-white">
                    1. Ajustes Generales del Estudio
                  </h3>
                  <p className="text-slate-400 mt-0.5">
                    Configura el comportamiento principal de la ventana, idioma y protecciones de emisión.
                  </p>
                </div>

                <div className="space-y-3 bg-[#101626] p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">
                        Idioma de la Interfaz
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Idioma predeterminado para menús, paneles y herramientas.
                      </div>
                    </div>
                    <select
                      value={settings.language}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          language: e.target.value as "es" | "en",
                        })
                      }
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white outline-none"
                    >
                      <option value="es">Español (España / Latinoamérica)</option>
                      <option value="en">English (Broadcast Studio)</option>
                    </select>
                  </div>

                  <div className="h-[1px] bg-slate-800/80" />

                  <label className="flex items-start justify-between gap-4 cursor-pointer">
                    <div>
                      <div className="font-semibold text-[#00F0FF]">
                        Ocultar ventana de Gamecaster Plus al capturar pantalla (Evitar efecto espejo)
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Aplica la API nativa Win32 <code className="text-slate-300">SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)</code> para que al capturar tu monitor principal nunca se vea Gamecaster Plus dentro de sí mismo.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.excludeFromCapture}
                      onChange={(e) =>
                        handleToggleExcludeFromCapture(e.target.checked)
                      }
                      className="mt-1 w-4 h-4 accent-[#00F0FF]"
                    />
                  </label>

                  <div className="h-[1px] bg-slate-800/80" />

                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <div>
                      <div className="font-semibold text-white">
                        Ajuste magnético a bordes y centro (Snap to Grid)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Al mover cámaras o textos en el lienzo, se alinean magnéticamente a los bordes y ejes centrales.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.snapToGrid}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          snapToGrid: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#00F0FF]"
                    />
                  </label>

                  <div className="h-[1px] bg-slate-800/80" />

                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <div>
                      <div className="font-semibold text-white">
                        Pedir confirmación antes de detener una transmisión en vivo
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Evita cortes accidentales cuando estás emitiendo en directo.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.confirmBeforeStopStream}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          confirmBeforeStopStream: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#00F0FF]"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* 2. VIDEO & CANVAS */}
            {activeTab === "video" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-display font-bold uppercase tracking-wider text-white">
                    2. Vídeo y Lienzo de Composición
                  </h3>
                  <p className="text-slate-400 mt-0.5">
                    Configura la resolución maestra del escenario, tasa de refresco (FPS) y rango de color.
                  </p>
                </div>

                <div className="space-y-4 bg-[#101626] p-4 rounded-xl border border-slate-800">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1.5">
                        Resolución de Salida del Lienzo
                      </label>
                      <select
                        value={settings.outputResolution}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            outputResolution: e.target
                              .value as GlobalSettings["outputResolution"],
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                      >
                        <option value="1920x1080">
                          1920×1080 (Full HD 1080p • 16:9)
                        </option>
                        <option value="2560x1440">
                          2560×1440 (QHD 2K • 16:9)
                        </option>
                        <option value="3840x2160">
                          3840×2160 (Ultra HD 4K • 16:9)
                        </option>
                        <option value="1080x1920">
                          1080×1920 (Vertical 9:16 • TikTok / Shorts / Reels)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1.5">
                        Fotogramas por Segundo (FPS)
                      </label>
                      <select
                        value={settings.fps}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            fps: Number(e.target.value) as 30 | 60 | 120,
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                      >
                        <option value={30}>30 FPS (Estándar Ligero)</option>
                        <option value={60}>60 FPS (Broadcast Gaming Fluido)</option>
                        <option value={120}>120 FPS (Ultra Alta Velocidad)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1.5">
                      Espacio y Rango de Color GPU
                    </label>
                    <select
                      value={settings.colorSpace}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          colorSpace: e.target
                            .value as GlobalSettings["colorSpace"],
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                    >
                      <option value="Rec.709 (Full)">
                        Rec.709 (Rango Completo 0-255 • Recomendado)
                      </option>
                      <option value="Rec.709 (Partial)">
                        Rec.709 (Rango Limitado 16-235 Broadcast TV)
                      </option>
                      <option value="sRGB">sRGB (Colorimetría Monitor PC)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 3. AUDIO & DEVICES */}
            {activeTab === "audio" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-display font-bold uppercase tracking-wider text-white">
                    3. Audio y Dispositivos DSP
                  </h3>
                  <p className="text-slate-400 mt-0.5">
                    Selecciona tus dispositivos reales de entrada/salida, modo Mono Mix y supresión de ruido IA.
                  </p>
                </div>

                <div className="space-y-4 bg-[#101626] p-4 rounded-xl border border-slate-800">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1.5">
                      Dispositivo de Micrófono / Entrada de Voz
                    </label>
                    <select
                      value={settings.micDeviceId}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          micDeviceId: e.target.value,
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                    >
                      <option value="default">
                        Micrófono Predeterminado del Sistema (WASAPI)
                      </option>
                      {audioInputs.map((d, idx) => (
                        <option key={d.deviceId || idx} value={d.deviceId}>
                          🎤 {d.label || `Micrófono #${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1.5">
                      Dispositivo de Audio del Sistema / Juego (Loopback)
                    </label>
                    <select
                      value={settings.systemAudioDeviceId}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          systemAudioDeviceId: e.target.value,
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                    >
                      <option value="default">
                        Altavoces / Auriculares Predeterminados (WASAPI Loopback)
                      </option>
                      {audioOutputs.map((d, idx) => (
                        <option key={d.deviceId || idx} value={d.deviceId}>
                          🔊 {d.label || `Salida de Audio #${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1.5">
                        Modo de Mezcla Estéreo / Mono
                      </label>
                      <select
                        value={settings.monoMixMode}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            monoMixMode: e.target
                              .value as GlobalSettings["monoMixMode"],
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                      >
                        <option value="stereo">Estéreo Original (L + R)</option>
                        <option value="average">
                          Mono Promedio ((L + R) / 2)
                        </option>
                        <option value="l_to_r">
                          Copiar Canal Izquierdo a Derecho (L → R)
                        </option>
                        <option value="r_to_l">
                          Copiar Canal Derecho a Izquierdo (R → L)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1.5">
                        Compensación Global de Sincronía Labial (Delay ms)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={2000}
                        step={10}
                        value={settings.globalAudioDelayMs}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            globalAudioDelayMs: Number(e.target.value),
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[#00F0FF] font-mono outline-none"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between pt-2 border-t border-slate-800 cursor-pointer">
                    <div>
                      <div className="font-semibold text-emerald-400">
                        Supresión de Ruido IA (DeepFilterNet3 / Cancelación de Teclado y Ventiladores)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Limpia el ruido de fondo del micrófono en tiempo real sin distorsionar la voz.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.aiNoiseSuppression}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          aiNoiseSuppression: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-emerald-400"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* 4. RECORDING */}
            {activeTab === "recording" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-display font-bold uppercase tracking-wider text-white">
                    4. Motor de Grabación Unificado
                  </h3>
                  <p className="text-slate-400 mt-0.5">
                    Configura qué graba el botón maestro <strong className="text-rose-400">Grabar</strong> de la barra superior y el codificador de vídeo.
                  </p>
                </div>

                <div className="space-y-4 bg-[#101626] p-4 rounded-xl border border-slate-800">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1.5">
                      Modo del Botón Principal "Grabar"
                    </label>
                    <select
                      value={settings.recordingMode}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          recordingMode: e.target
                            .value as GlobalSettings["recordingMode"],
                        })
                      }
                      className="w-full bg-slate-950 border border-[#00F0FF]/50 rounded-lg px-3 py-2 text-white font-semibold outline-none"
                    >
                      <option value="composed_canvas">
                        🎬 Modo Composición de Escena (Lienzo MP4: Juego + Cámara PIP + Tercios + Pizarra) — Recomendado
                      </option>
                      <option value="native_desktop">
                        🖥️ Modo Captura Directa de Pantalla (FFmpeg GDI / NVENC Directo en Disco)
                      </option>
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1.5">
                        Formato Contenedor
                      </label>
                      <select
                        value={settings.recordingFormat}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            recordingFormat: e.target.value as "mp4" | "mkv",
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                      >
                        <option value="mp4">MP4 (H.264 + AAC Universal)</option>
                        <option value="mkv">MKV (Matroska Tolerante)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1.5">
                        Codificador de Vídeo
                      </label>
                      <select
                        value={settings.videoEncoder}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            videoEncoder: e.target
                              .value as GlobalSettings["videoEncoder"],
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                      >
                        <option value="h264_nvenc">
                          NVIDIA NVENC H.264 (GPU Directo)
                        </option>
                        <option value="h264_mf">
                          Windows MediaFoundation H.264 (Oficial Microsoft Store)
                        </option>
                        <option value="libx264">x264 Ultrafast (CPU)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1.5">
                        Bitrate de Vídeo (Kbps)
                      </label>
                      <input
                        type="number"
                        min={2000}
                        max={60000}
                        step={1000}
                        value={settings.recordingBitrateKbps}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            recordingBitrateKbps: Number(e.target.value),
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[#00F0FF] font-mono outline-none"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between pt-2 border-t border-slate-800 cursor-pointer">
                    <div>
                      <div className="font-semibold text-white">
                        Optimización Web Automática (<code className="text-[#00F0FF]">-movflags +faststart</code>)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Coloca el índice MOOV al principio del archivo MP4 al terminar para reproducción inmediata en Windows y navegadores.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.faststartOptimization}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          faststartOptimization: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#00F0FF]"
                    />
                  </label>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">
                        Carpeta de Salida de Grabaciones y Capturas
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        %USERPROFILE%\Videos\Gamecaster\Recordings
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        invoke("open_media_folder", { sub: "recordings" })
                      }
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[#00F0FF] font-semibold flex items-center gap-1.5"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Abrir Carpeta en Windows
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. STREAMING (ACCOUNTS & IRC CHAT) */}
            {activeTab === "streaming" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-display font-bold uppercase tracking-wider text-white">
                      5. Cuentas de Transmisión (Multistream RTMP) y Chat IRC
                    </h3>
                    <p className="text-slate-400 mt-0.5">
                      Activa uno o varios destinos simultáneos para el botón <strong className="text-[#00F0FF]">Transmitir</strong>.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next: StreamChannelConfig = {
                        id: `ch_${Date.now()}`,
                        platform: "Custom RTMP",
                        name: "Servidor RTMP Personalizado",
                        rtmpUrl: "rtmp://live.twitch.tv/app",
                        streamKey: "",
                        bitrateKbps: 6000,
                        enabled: true,
                      };
                      onUpdateStreamChannels([...streamChannels, next]);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#00F0FF] text-slate-950 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Añadir Canal
                  </button>
                </div>

                {/* Twitch IRC Channel Setting */}
                <div className="p-3.5 rounded-xl bg-[#101626] border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-white">
                      Canal de Twitch para el Chat en Vivo (Pestaña Inferior Derecha)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Se conecta en tiempo real por WebSocket IRC sin necesidad de tokens OAuth.
                    </div>
                  </div>
                  <input
                    type="text"
                    value={settings.twitchIrcChannel}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        twitchIrcChannel: e.target.value,
                      })
                    }
                    placeholder="ej: bornicho"
                    className="w-48 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-[#00F0FF] font-mono outline-none"
                  />
                </div>

                {/* Channels List */}
                <div className="space-y-2.5">
                  {streamChannels.map((ch) => (
                    <div
                      key={ch.id}
                      className="p-3.5 rounded-xl bg-[#101626] border border-slate-800 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ch.enabled}
                            onChange={(e) =>
                              onUpdateStreamChannels(
                                streamChannels.map((item) =>
                                  item.id === ch.id
                                    ? { ...item, enabled: e.target.checked }
                                    : item
                                )
                              )
                            }
                            className="w-4 h-4 accent-[#00F0FF]"
                          />
                          <select
                            value={ch.platform}
                            onChange={(e) =>
                              onUpdateStreamChannels(
                                streamChannels.map((item) =>
                                  item.id === ch.id
                                    ? {
                                        ...item,
                                        platform: e.target
                                          .value as StreamChannelConfig["platform"],
                                      }
                                    : item
                                )
                              )
                            }
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-bold"
                          >
                            <option value="Twitch">Twitch</option>
                            <option value="YouTube Live">YouTube Live</option>
                            <option value="Kick">Kick</option>
                            <option value="Facebook Live">Facebook Live</option>
                            <option value="Custom RTMP">Custom RTMP</option>
                          </select>
                          <input
                            type="text"
                            value={ch.name}
                            onChange={(e) =>
                              onUpdateStreamChannels(
                                streamChannels.map((item) =>
                                  item.id === ch.id
                                    ? { ...item, name: e.target.value }
                                    : item
                                )
                              )
                            }
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200"
                          />
                        </label>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">
                            Bitrate:
                          </span>
                          <input
                            type="number"
                            value={ch.bitrateKbps}
                            onChange={(e) =>
                              onUpdateStreamChannels(
                                streamChannels.map((item) =>
                                  item.id === ch.id
                                    ? {
                                        ...item,
                                        bitrateKbps: Number(e.target.value),
                                      }
                                    : item
                                )
                              )
                            }
                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-[#00F0FF]"
                          />
                          <button
                            onClick={() =>
                              onUpdateStreamChannels(
                                streamChannels.filter((i) => i.id !== ch.id)
                              )
                            }
                            className="p-1 text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <span className="block text-[10px] text-slate-400 mb-1">
                            Servidor RTMP / Ingest URL
                          </span>
                          <input
                            type="text"
                            value={ch.rtmpUrl}
                            onChange={(e) =>
                              onUpdateStreamChannels(
                                streamChannels.map((item) =>
                                  item.id === ch.id
                                    ? { ...item, rtmpUrl: e.target.value }
                                    : item
                                )
                              )
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-slate-200"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 mb-1">
                            Clave de Retransmisión (Stream Key)
                          </span>
                          <input
                            type="password"
                            value={ch.streamKey}
                            placeholder="live_xxxxxxxxxxxxxxxxxx"
                            onChange={(e) =>
                              onUpdateStreamChannels(
                                streamChannels.map((item) =>
                                  item.id === ch.id
                                    ? { ...item, streamKey: e.target.value }
                                    : item
                                )
                              )
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-[#00F0FF]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. HOTKEYS */}
            {activeTab === "hotkeys" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-display font-bold uppercase tracking-wider text-white">
                    6. Atajos de Teclado Globales (Hotkeys)
                  </h3>
                  <p className="text-slate-400 mt-0.5">
                    Haz clic en cualquier botón de atajo y pulsa la nueva tecla o combinación en tu teclado.
                  </p>
                </div>

                <div className="bg-[#101626] rounded-xl border border-slate-800 divide-y divide-slate-800/80">
                  {(
                    [
                      { key: "scene1", label: "Cambiar a Escena 1" },
                      { key: "scene2", label: "Cambiar a Escena 2" },
                      { key: "scene3", label: "Cambiar a Escena 3" },
                      { key: "scene4", label: "Cambiar a Escena 4" },
                      {
                        key: "toggleRecord",
                        label: "Iniciar / Detener Grabación",
                      },
                      {
                        key: "toggleStream",
                        label: "Iniciar / Detener Transmisión en Directo",
                      },
                      {
                        key: "takeScreenshot",
                        label: "Tomar Captura de Pantalla PNG",
                      },
                      {
                        key: "instantReplay",
                        label: "Guardar Repetición Instantánea (Replay)",
                      },
                      {
                        key: "pushLive",
                        label: "Empujar Vista Previa a En Vivo (Modo Estudio)",
                      },
                    ] as { key: keyof HotkeyConfig; label: string }[]
                  ).map((item) => {
                    const isListening = recordingHotkeyField === item.key;
                    return (
                      <div
                        key={item.key}
                        className="px-4 py-2.5 flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-200">
                          {item.label}
                        </span>
                        <button
                          onClick={() =>
                            setRecordingHotkeyField(
                              isListening ? null : item.key
                            )
                          }
                          className={`min-w-[130px] px-3 py-1 rounded-lg font-mono font-bold text-center border transition ${
                            isListening
                              ? "bg-amber-500/20 border-amber-400 text-amber-300 animate-pulse"
                              : "bg-slate-950 border-slate-700 text-[#00F0FF] hover:border-[#00F0FF]"
                          }`}
                        >
                          {isListening
                            ? "Pulsa tecla..."
                            : settings.hotkeys[item.key]}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 7: MICROSOFT STORE & MSIX PACKAGING */}
            {activeTab === "store" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#101626] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-[#00F0FF]" />
                      <h3 className="font-semibold text-sm text-white">
                        Empaquetado y Publicación en Microsoft Store (MSIX)
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] border border-emerald-500/40">
                      100% CLEAN-ROOM COMPLIANT
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Gamecaster Plus ha sido construido siguiendo estrictos estándares clean-room, libre de licencias virales conflictivas, con arquitectura Direct3D11 / WASAPI / Tauri v2 nativa de 64-bit lista para ser distribuida directamente a través de Microsoft Partner Center y Windows 10/11 Store.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#101626] border border-slate-800 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Identidad del Paquete MSIX
                    </span>
                    <div className="font-mono text-white text-[11px]">
                      com.bornicho.gamecasterplus.studio
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Nombre para Microsoft Partner Center
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#101626] border border-slate-800 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Editor (Publisher)
                    </span>
                    <div className="font-mono text-white text-[11px]">
                      CN=Bornicho Studio, O=Bornicho, C=ES
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Firma de código de confianza Windows
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#101626] border border-slate-800 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Permisos y Capacidades Windows
                    </span>
                    <div className="font-mono text-emerald-400 text-[11px]">
                      runFullTrust, graphicsCapture, microphone, webcam
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Declaradas en AppxManifest.xml
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#101626] border border-slate-800 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Compatibilidad de SO
                    </span>
                    <div className="font-mono text-white text-[11px]">
                      Windows 10 Build 19041+ & Windows 11
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Arquitectura nativa x86_64
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#101626] border border-slate-800 space-y-2">
                  <span className="font-semibold text-white block">
                    Comando de Generación de Instalador MSIX / MSI:
                  </span>
                  <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-[11px] text-[#00F0FF] border border-slate-800 select-all">
                    npx tauri build --bundles msi,nsis
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    Genera el instalador firmado (.msi o paquete msix) en <code>src-tauri/target/release/bundle/</code> para subirlo a la Tienda de Microsoft o distribuirlo en tu sitio web.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#101522] border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            Todos los cambios se aplican en tiempo real sobre el motor de estudio.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-[#00F0FF] text-slate-950 font-bold hover:brightness-110 transition"
          >
            Guardar y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
