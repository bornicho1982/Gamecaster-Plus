import React, { useState } from "react";
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

  const sortedSources = [...editableScene.sources].sort(
    (a, b) => b.zOrder - a.zOrder
  );
  const selectedSource =
    editableScene.sources.find((s) => s.id === selectedSourceId) || null;

  return (
    <div className="col-span-4 flex flex-col h-full overflow-hidden bg-[#0B0E17]">
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
              Usa el botón <strong>+ Añadir Fuente</strong> de abajo.
            </span>
          </div>
        ) : (
          sortedSources.map((src) => {
            const isSel = src.id === selectedSourceId;
            return (
              <div
                key={src.id}
                onClick={() => onSelectSource(src.id)}
                onDoubleClick={() => onOpenProperties(src, editableScene.id)}
                className={`px-3 py-2 flex items-center justify-between cursor-pointer transition ${
                  isSel
                    ? "bg-[#00F0FF]/15 text-white border-l-2 border-l-[#00F0FF]"
                    : "hover:bg-slate-900/70 text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm shrink-0" title={src.type}>
                    {SOURCE_TYPE_ICON[src.type] || "📦"}
                  </span>
                  <span className="truncate font-medium">{src.name}</span>
                  {src.effects.shader !== "none" && (
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-mono uppercase shrink-0">
                      {src.effects.shader}
                    </span>
                  )}
                </div>

                {/* Quick Visibility & Lock Toggles */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
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

      {/* Fixed Bottom Action Toolbar: + Añadir Fuente, ⚙️ Propiedades, 🔼 Subir, 🔽 Bajar, 🗑️ Eliminar */}
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
            <div className="absolute left-0 bottom-full mb-2 w-64 rounded-xl bg-[#101522] border border-slate-700 shadow-2xl py-1.5 z-50">
              {[
                {
                  label: "🖥️ Captura de Pantalla / Monitor",
                  action: () => {
                    setShowAddMenu(false);
                    onAddSource("screen", "Captura de Monitor Principal");
                  },
                },
                {
                  label: "🎮 Captura de Juego / Ventana...",
                  action: () => {
                    setShowAddMenu(false);
                    onRefreshWindows();
                    onAddSource("window", "Captura de Juego / Ventana", {
                      windowHwnd: openWindows[0]?.hwnd || 0,
                      windowTitle: openWindows[0]?.title || "Ventana de Juego",
                    });
                  },
                },
                {
                  label: "📷 Cámara Web / Capturadora UVC",
                  action: () => {
                    setShowAddMenu(false);
                    onAddSource("camera", "Cámara Web PIP");
                  },
                },
                {
                  label: "📺 Tercio Inferior Animado (Lower Third)",
                  action: () => {
                    setShowAddMenu(false);
                    onAddSource("lower_third", "Tercio Inferior Broadcast");
                  },
                },
                {
                  label: "🔤 Texto / Rótulo Personalizado",
                  action: () => {
                    setShowAddMenu(false);
                    onAddSource("text", "Rótulo en Directo");
                  },
                },
                {
                  label: "🖼️ Imagen / Marca de Agua (Disco)...",
                  action: () => {
                    setShowAddMenu(false);
                    onPickImageFile();
                  },
                },
                {
                  label: "🎬 Vídeo / Archivo Multimedia (Disco)...",
                  action: () => {
                    setShowAddMenu(false);
                    onPickMediaFile();
                  },
                },
                {
                  label: "🎨 Fondo de Color / Degradado",
                  action: () => {
                    setShowAddMenu(false);
                    onAddSource("color", "Fondo Degradado");
                  },
                },
                {
                  label: "⏪ Fuente de Repetición Instantánea",
                  action: () => {
                    setShowAddMenu(false);
                    onTriggerInstantReplay();
                  },
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
