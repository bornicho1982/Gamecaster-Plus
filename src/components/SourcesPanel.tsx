import React, { useEffect, useState } from "react";
import {
  Scene,
  SourceType,
  StageSource,
  WindowInfo,
} from "../types/broadcaster";
import {
  Layers,
  Plus,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Settings,
  Trash2,
  Copy,
  Edit3,
  Check,
  UploadCloud,
} from "lucide-react";

interface SourcesPanelProps {
  editableScene: Scene;
  selectedSourceId: string | null;
  onSelectSource: (id: string | null) => void;
  onUpdateSource: (sceneId: string, updated: StageSource) => void;
  onAddSource: (
    type: SourceType,
    name: string,
    extra?: Partial<StageSource>
  ) => void;
  onOpenProperties: (source: StageSource, sceneId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onDuplicateSource: (source: StageSource) => void;
  onTriggerInstantReplay: () => void;
  onPickImageFile: () => void;
  onPickMediaFile: () => void;
  openWindows: WindowInfo[];
  onRefreshWindows: () => void;
}

const SOURCE_TYPE_ICON: Record<SourceType, string> = {
  screen: "🖥️",
  window: "🎮",
  camera: "📷",
  lower_third: "📺",
  text: "🔤",
  image: "🖼️",
  media: "🎬",
  color: "🎨",
  replay: "⏪",
};

export const SourcesPanel: React.FC<SourcesPanelProps> = ({
  editableScene,
  selectedSourceId,
  onSelectSource,
  onUpdateSource,
  onAddSource,
  onOpenProperties,
  onDeleteSource,
  onDuplicateSource,
  onTriggerInstantReplay,
  onPickImageFile,
  onPickMediaFile,
  openWindows,
  onRefreshWindows,
}) => {
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [webcamDevices, setWebcamDevices] = useState<
    { deviceId: string; label: string }[]
  >([]);

  // Enumerate connected webcams / UVC capture cards when opening the Add Source menu
  useEffect(() => {
    if (!showAddMenu) return;
    onRefreshWindows();
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => {
        const cams = devices
          .filter((d) => d.kind === "videoinput")
          .map((d, idx) => ({
            deviceId: d.deviceId || "default_cam",
            label: d.label || `Cámara Web / Capturadora #${idx + 1}`,
          }));
        setWebcamDevices(cams);
      })
      .catch(() => {});
  }, [showAddMenu, onRefreshWindows]);

  const sortedSources = [...editableScene.sources].sort(
    (a, b) => b.zOrder - a.zOrder
  );
  const selectedSource =
    editableScene.sources.find((s) => s.id === selectedSourceId) || null;

  const commitRename = (src: StageSource) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onUpdateSource(editableScene.id, {
        ...src,
        name: trimmed,
      });
    }
    setEditingId(null);
  };

  // Drag & Drop files from Windows Explorer directly onto the Sources Panel
  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const mime = (file.type || "").toLowerCase();
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (
        mime.startsWith("image/") ||
        ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext)
      ) {
        onAddSource("image", `Imagen: ${file.name}`, {
          mediaUrl: url,
        });
      } else if (
        mime.startsWith("video/") ||
        mime.startsWith("audio/") ||
        ["mp4", "mkv", "webm", "mov", "avi", "mp3", "wav", "ogg"].includes(ext)
      ) {
        onAddSource("media", `Multimedia: ${file.name}`, {
          mediaUrl: url,
          mediaLoop: true,
        });
      }
    }
  };

  return (
    <div
      className={`col-span-4 flex flex-col h-full overflow-hidden bg-[#0B0E17] relative transition ${
        isDragOver ? "ring-2 ring-inset ring-[#00F0FF] bg-[#00F0FF]/5" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragOver) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDropFiles}
    >
      {/* Drag & Drop Overlay Indicator */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-40 bg-[#070B14]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#00F0FF] rounded-lg m-1">
          <UploadCloud className="w-7 h-7 text-[#00F0FF] animate-bounce" />
          <span className="text-xs font-bold text-[#00F0FF]">
            Suelta aquí tus Imágenes o Vídeos de Windows
          </span>
          <span className="text-[10px] text-slate-300">
            Se añadirán automáticamente como capas a "{editableScene.name}"
          </span>
        </div>
      )}

      {/* Column Header */}
      <div className="px-3 py-2 bg-[#101522] border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
          <span className="font-display font-bold uppercase tracking-wider text-white truncate">
            Fuentes — {editableScene.name}
          </span>
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 shrink-0">
          {editableScene.sources.length} capas
        </span>
      </div>

      {/* Clean Sources List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
        {sortedSources.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 p-4 text-center">
            <span>Esta escena no tiene fuentes todavía.</span>
            <span className="text-[11px] text-slate-400 mt-1">
              Usa <strong>+ Añadir Fuente</strong> o arrastra imágenes/vídeos aquí.
            </span>
          </div>
        ) : (
          sortedSources.map((src) => {
            const isSel = src.id === selectedSourceId;
            const hasCrop =
              src.layout.cropTop > 0 ||
              src.layout.cropBottom > 0 ||
              src.layout.cropLeft > 0 ||
              src.layout.cropRight > 0;

            return (
              <div
                key={src.id}
                onClick={() => onSelectSource(src.id)}
                onDoubleClick={() => onOpenProperties(src, editableScene.id)}
                className={`px-3 py-1.5 flex items-center justify-between cursor-pointer transition ${
                  isSel
                    ? "bg-[#00F0FF]/15 text-white border-l-2 border-l-[#00F0FF]"
                    : "hover:bg-slate-900/70 text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                  <span className="text-sm shrink-0" title={src.type}>
                    {SOURCE_TYPE_ICON[src.type] || "📦"}
                  </span>

                  {editingId === src.id ? (
                    <div
                      className="flex items-center gap-1 flex-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(src);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="w-full bg-slate-950 border border-[#00F0FF] rounded px-1.5 py-0.5 text-xs text-white outline-none"
                      />
                      <button
                        onClick={() => commitRename(src)}
                        className="p-0.5 text-emerald-400 hover:text-emerald-300"
                        title="Guardar nombre"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="truncate font-medium">{src.name}</span>
                  )}

                  {hasCrop && (
                    <span className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono uppercase shrink-0">
                      CROP
                    </span>
                  )}
                  {src.colorKey.chromaKey.enabled && (
                    <span className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono uppercase shrink-0">
                      CHROMA
                    </span>
                  )}
                  {src.effects.shader !== "none" && (
                    <span className="px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-mono uppercase shrink-0">
                      {src.effects.shader}
                    </span>
                  )}
                </div>

                {/* Quick Rename, Visibility & Lock Toggles */}
                <div
                  className="flex items-center gap-0.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setEditingId(src.id);
                      setEditingName(src.name);
                    }}
                    className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition"
                    title="Renombrar capa"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() =>
                      onUpdateSource(editableScene.id, {
                        ...src,
                        layout: {
                          ...src.layout,
                          visible: !src.layout.visible,
                        },
                      })
                    }
                    className={`p-1 rounded transition ${
                      src.layout.visible
                        ? "text-[#00F0FF] hover:bg-slate-800"
                        : "text-slate-600 hover:text-slate-400"
                    }`}
                    title={
                      src.layout.visible
                        ? "Ocultar capa en el lienzo"
                        : "Mostrar capa en el lienzo"
                    }
                  >
                    {src.layout.visible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={() =>
                      onUpdateSource(editableScene.id, {
                        ...src,
                        layout: {
                          ...src.layout,
                          lockPosition: !src.layout.lockPosition,
                        },
                      })
                    }
                    className={`p-1 rounded transition ${
                      src.layout.lockPosition
                        ? "text-amber-400 hover:bg-slate-800"
                        : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                    }`}
                    title={
                      src.layout.lockPosition
                        ? "Desbloquear posición"
                        : "Bloquear posición en el lienzo"
                    }
                  >
                    {src.layout.lockPosition ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Fixed Bottom Action Toolbar: + Añadir Fuente, ⚙️ Propiedades, 🔼 Subir, 🔽 Bajar, 📋 Duplicar, 🗑️ Eliminar */}
      <div className="px-2.5 py-2 bg-[#101522] border-t border-slate-800 flex items-center justify-between gap-1.5 shrink-0 relative">
        <div className="relative">
          <button
            onClick={() => setShowAddMenu((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00F0FF] text-slate-950 font-bold hover:brightness-110 transition text-[11px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Añadir Fuente</span>
          </button>

          {showAddMenu && (
            <div className="absolute left-0 bottom-full mb-2 w-72 max-h-[340px] overflow-y-auto rounded-xl bg-[#101522] border border-slate-700 shadow-2xl py-1.5 z-50">
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Capturas de Pantalla y Juegos
              </div>
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onAddSource("screen", "Captura de Monitor Principal");
                }}
                className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
              >
                🖥️ Captura de Pantalla / Monitor
              </button>

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onRefreshWindows();
                  onAddSource("window", "Captura de Juego / Ventana", {
                    windowHwnd: openWindows[0]?.hwnd || 0,
                    windowTitle: openWindows[0]?.title || "Ventana de Juego",
                  });
                }}
                className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
              >
                🎮 Captura de Juego / Ventana...
              </button>

              {/* Direct detected open windows quick-add */}
              {openWindows.slice(0, 3).map((win) => (
                <button
                  key={win.hwnd}
                  onClick={() => {
                    setShowAddMenu(false);
                    onAddSource("window", `Ventana: ${win.title.slice(0, 24)}`, {
                      windowHwnd: win.hwnd,
                      windowTitle: win.title,
                    });
                  }}
                  className="w-full pl-6 pr-3.5 py-1 text-left text-[11px] text-slate-400 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] truncate transition"
                  title={`Añadir directamente: ${win.title}`}
                >
                  ↳ 🎮 {win.title}
                </button>
              ))}

              <div className="my-1 border-t border-slate-800" />
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Cámaras y Multimedia
              </div>

              {webcamDevices.length > 0 ? (
                webcamDevices.map((cam) => (
                  <button
                    key={cam.deviceId}
                    onClick={() => {
                      setShowAddMenu(false);
                      onAddSource("camera", `Cámara: ${cam.label.slice(0, 26)}`, {
                        cameraDeviceId: cam.deviceId,
                      });
                    }}
                    className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] truncate transition"
                  >
                    📷 {cam.label}
                  </button>
                ))
              ) : (
                <button
                  onClick={() => {
                    setShowAddMenu(false);
                    onAddSource("camera", "Cámara Web PIP");
                  }}
                  className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
                >
                  📷 Cámara Web / Capturadora UVC
                </button>
              )}

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onPickImageFile();
                }}
                className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
              >
                🖼️ Imagen / Marca de Agua (Disco)...
              </button>

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onPickMediaFile();
                }}
                className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
              >
                🎬 Vídeo / Archivo Multimedia (Disco)...
              </button>

              <div className="my-1 border-t border-slate-800" />
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Gráficos Broadcast y Efectos
              </div>

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onAddSource("lower_third", "Tercio Inferior Broadcast");
                }}
                className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
              >
                📺 Tercio Inferior Animado (Lower Third)
              </button>

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onAddSource("text", "Rótulo en Directo");
                }}
                className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
              >
                🔤 Texto / Rótulo Personalizado
              </button>

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onAddSource("color", "Fondo Degradado");
                }}
                className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
              >
                🎨 Fondo de Color / Degradado
              </button>

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onTriggerInstantReplay();
                }}
                className="w-full px-3.5 py-1.5 text-left text-xs text-slate-200 hover:bg-[#00F0FF]/15 hover:text-[#00F0FF] transition"
              >
                ⏪ Fuente de Repetición Instantánea
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={!selectedSource}
            onClick={() =>
              selectedSource &&
              onOpenProperties(selectedSource, editableScene.id)
            }
            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 text-[11px] font-medium"
            title="Abrir Propiedades de la fuente seleccionada (Layout, Chroma Key, Efectos)"
          >
            <Settings className="w-3.5 h-3.5 text-[#00F0FF]" />
            <span>Propiedades</span>
          </button>

          <button
            disabled={!selectedSource}
            onClick={() =>
              selectedSource &&
              onUpdateSource(editableScene.id, {
                ...selectedSource,
                zOrder: selectedSource.zOrder + 2,
              })
            }
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            title="Subir capa (adelante)"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          <button
            disabled={!selectedSource}
            onClick={() =>
              selectedSource &&
              onUpdateSource(editableScene.id, {
                ...selectedSource,
                zOrder: Math.max(0, selectedSource.zOrder - 2),
              })
            }
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            title="Bajar capa (atrás)"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            disabled={!selectedSource}
            onClick={() => selectedSource && onDuplicateSource(selectedSource)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            title="Duplicar fuente seleccionada"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            disabled={!selectedSource}
            onClick={() => selectedSource && onDeleteSource(selectedSource.id)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 disabled:opacity-40 text-rose-400"
            title="Eliminar fuente seleccionada"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
