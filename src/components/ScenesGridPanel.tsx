import React, { useState } from "react";
import {
  Scene,
  TRANSITION_LIST,
  TransitionId,
  createDefaultSource,
} from "../types/broadcaster";
import {
  Plus,
  Trash2,
  Sliders,
  Edit3,
  Copy,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";

interface ScenesGridPanelProps {
  scenes: Scene[];
  activeSceneId: string;
  previewSceneId: string;
  studioMode: boolean;
  onSelectScene: (sceneId: string) => void;
  onPushSceneLive: (sceneId: string) => void;
  onUpdateScenes: (next: Scene[]) => void;
  activeTransition: TransitionId;
  onChangeTransition: (tr: TransitionId) => void;
  transitionDurationMs: number;
  onChangeTransitionDuration: (ms: number) => void;
  onOpenTransitionRulesModal: () => void;
}

const SOURCE_ICON_MAP: Record<string, string> = {
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

export const ScenesGridPanel: React.FC<ScenesGridPanelProps> = ({
  scenes,
  activeSceneId,
  previewSceneId,
  studioMode,
  onSelectScene,
  onPushSceneLive,
  onUpdateScenes,
  activeTransition,
  onChangeTransition,
  transitionDurationMs,
  onChangeTransitionDuration,
  onOpenTransitionRulesModal,
}) => {
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");

  const commitRename = () => {
    if (!editingSceneId) return;
    const trimmed = editingName.trim();
    if (trimmed) {
      onUpdateScenes(
        scenes.map((sc) =>
          sc.id === editingSceneId ? { ...sc, name: trimmed } : sc
        )
      );
    }
    setEditingSceneId(null);
  };

  const handleAddNewScene = () => {
    const idx = scenes.length + 1;
    const newSc: Scene = {
      id: `scene_${Date.now()}`,
      name: `Escena ${idx}: Personalizada`,
      sources: [
        createDefaultSource("screen", "Captura de Monitor Principal", 1),
      ],
      perSceneMicVolume: 90,
      perSceneSystemVolume: 85,
    };
    onUpdateScenes([...scenes, newSc]);
    onSelectScene(newSc.id);
  };

  const handleDuplicateScene = (sc: Scene) => {
    const clonedSources = sc.sources.map((src) => ({
      ...JSON.parse(JSON.stringify(src)),
      id: `src_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }));

    const newSc: Scene = {
      ...JSON.parse(JSON.stringify(sc)),
      id: `scene_${Date.now()}`,
      name: `${sc.name} (Copia)`,
      sources: clonedSources,
    };
    onUpdateScenes([...scenes, newSc]);
    onSelectScene(newSc.id);
  };

  const handleMoveScene = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= scenes.length) return;
    const next = [...scenes];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    onUpdateScenes(next);
  };

  return (
    <div className="col-span-4 flex flex-col h-full overflow-hidden bg-[#0B0E17]">
      {/* Column Header */}
      <div className="px-3 py-2 bg-[#101522] border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#00F0FF]" />
          <span className="font-display font-bold uppercase tracking-wider text-white">
            Matriz de Escenas ({scenes.length})
          </span>
        </div>
        <span className="text-[10px] text-slate-400">
          Atajos rápidos: F1..F{Math.min(8, scenes.length)}
        </span>
      </div>

      {/* Compact Scene Grid */}
      <div className="flex-1 p-2.5 overflow-y-auto grid grid-cols-2 gap-2">
        {scenes.map((sc, idx) => {
          const isLive = sc.id === activeSceneId;
          const isPrev = studioMode && sc.id === previewSceneId;
          const isRenaming = editingSceneId === sc.id;

          // Unique icon set for the layers in this scene
          const layerTypes = Array.from(new Set(sc.sources.map((s) => s.type)));

          return (
            <div
              key={sc.id}
              onClick={() => onSelectScene(sc.id)}
              onDoubleClick={() => {
                setEditingSceneId(sc.id);
                setEditingName(sc.name);
              }}
              className={`p-2 rounded-xl border cursor-pointer flex flex-col justify-between transition ${
                isLive
                  ? "bg-rose-500/15 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                  : isPrev
                  ? "bg-amber-500/15 border-amber-400"
                  : "bg-[#101626] border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-[#00F0FF] border border-slate-800 font-bold">
                    F{idx + 1}
                  </span>
                  {/* Reorder Buttons */}
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      disabled={idx === 0}
                      onClick={() => handleMoveScene(idx, -1)}
                      className="p-0.5 text-slate-500 hover:text-slate-200 disabled:opacity-20"
                      title="Mover escena a la izquierda"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button
                      disabled={idx === scenes.length - 1}
                      onClick={() => handleMoveScene(idx, 1)}
                      className="p-0.5 text-slate-500 hover:text-slate-200 disabled:opacity-20"
                      title="Mover escena a la derecha"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  {isLive && (
                    <span className="px-1 py-0.5 rounded bg-rose-600 text-white font-bold text-[8px] uppercase tracking-wider">
                      VIVO
                    </span>
                  )}
                  {isPrev && (
                    <span className="px-1 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[8px] uppercase tracking-wider">
                      PREV
                    </span>
                  )}

                  <button
                    onClick={() => handleDuplicateScene(sc)}
                    className="text-slate-500 hover:text-[#00F0FF] p-1 rounded hover:bg-slate-800"
                    title="Duplicar escena completa"
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </button>

                  <button
                    onClick={() => {
                      setEditingSceneId(sc.id);
                      setEditingName(sc.name);
                    }}
                    className="text-slate-500 hover:text-slate-200 p-1 rounded hover:bg-slate-800"
                    title="Renombrar escena"
                  >
                    <Edit3 className="w-2.5 h-2.5" />
                  </button>

                  {scenes.length > 1 && (
                    <button
                      onClick={() => {
                        const remaining = scenes.filter((item) => item.id !== sc.id);
                        onUpdateScenes(remaining);
                        if (activeSceneId === sc.id) {
                          onPushSceneLive(remaining[0].id);
                        }
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800"
                      title="Eliminar escena"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>

              {isRenaming ? (
                <input
                  type="text"
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingSceneId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 w-full bg-slate-950 border border-[#00F0FF] rounded px-1.5 py-0.5 text-white font-semibold text-xs outline-none"
                />
              ) : (
                <div className="font-semibold text-white truncate mt-1 text-xs">
                  {sc.name}
                </div>
              )}

              {/* Layer Types Badges + Push Live Button */}
              <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1 pt-1 border-t border-slate-800/40">
                <div className="flex items-center gap-0.5 truncate max-w-[120px]" title={`${sc.sources.length} capas en esta escena`}>
                  {layerTypes.map((t) => (
                    <span key={t} className="text-[11px] leading-none">
                      {SOURCE_ICON_MAP[t] || "📦"}
                    </span>
                  ))}
                  <span className="text-[9px] text-slate-500 font-mono ml-0.5">
                    ({sc.sources.length})
                  </span>
                </div>

                {studioMode && !isLive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPushSceneLive(sc.id);
                    }}
                    className="text-[#00F0FF] hover:underline font-semibold text-[10px]"
                  >
                    Vivo →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Transition Bar + Add Scene Button */}
      <div className="px-2.5 py-2 bg-[#101522] border-t border-slate-800 flex items-center gap-1.5 shrink-0">
        <select
          value={activeTransition}
          onChange={(e) => onChangeTransition(e.target.value as TransitionId)}
          className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white outline-none text-[11px]"
          title="Transición de Escena en GPU"
        >
          {TRANSITION_LIST.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.label}
            </option>
          ))}
        </select>

        <div
          className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5"
          title="Duración de la transición en milisegundos"
        >
          <input
            type="number"
            min={50}
            max={3000}
            step={50}
            value={transitionDurationMs}
            onChange={(e) => onChangeTransitionDuration(Number(e.target.value))}
            className="w-11 bg-transparent font-mono text-[#00F0FF] outline-none text-right text-[11px]"
          />
          <span className="text-[10px] text-slate-400">ms</span>
        </div>

        <button
          onClick={onOpenTransitionRulesModal}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[#00F0FF]"
          title="Reglas de Transición Automática por Escena"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleAddNewScene}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00F0FF] text-slate-950 font-bold hover:brightness-110 transition text-[11px] shrink-0"
          title="Crear nueva escena"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Escena</span>
        </button>
      </div>
    </div>
  );
};
