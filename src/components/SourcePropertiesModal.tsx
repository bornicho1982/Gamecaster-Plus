import React, { useEffect, useState } from "react";
import {
  StageSource,
  SHADER_EFFECT_LIST,
  TRANSITION_LIST,
  MaskShape,
  ShaderEffectId,
  TransitionId,
  WindowInfo,
} from "../types/broadcaster";
import {
  X,
  Move,
  Palette,
  Sparkles,
  Play,
  Maximize2,
  AlignCenter,
  Minimize2,
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
} from "lucide-react";

interface SourcePropertiesModalProps {
  source: StageSource;
  sceneId: string;
  isPortraitCanvas: boolean;
  openWindows: WindowInfo[];
  onRefreshWindows: () => void;
  onUpdate: (sceneId: string, updated: StageSource) => void;
  onClose: () => void;
}

export const SourcePropertiesModal: React.FC<SourcePropertiesModalProps> = ({
  source,
  sceneId,
  isPortraitCanvas,
  openWindows,
  onRefreshWindows,
  onUpdate,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<
    "layout" | "color" | "effects" | "transition"
  >("layout");
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);

  const stageW = isPortraitCanvas ? 1080 : 1920;
  const stageH = isPortraitCanvas ? 1920 : 1080;

  useEffect(() => {
    if (source.type === "camera") {
      navigator.mediaDevices
        ?.enumerateDevices()
        .then((devs) => {
          setCameraDevices(devs.filter((d) => d.kind === "videoinput"));
        })
        .catch(() => {});
    } else if (source.type === "window") {
      onRefreshWindows();
    }
  }, [source.type, onRefreshWindows]);

  const updateLayout = (patch: Partial<StageSource["layout"]>) => {
    onUpdate(sceneId, {
      ...source,
      layout: { ...source.layout, ...patch },
    });
  };

  const updateColorKey = (patch: Partial<StageSource["colorKey"]>) => {
    onUpdate(sceneId, {
      ...source,
      colorKey: { ...source.colorKey, ...patch },
    });
  };

  const updateChroma = (
    patch: Partial<StageSource["colorKey"]["chromaKey"]>
  ) => {
    onUpdate(sceneId, {
      ...source,
      colorKey: {
        ...source.colorKey,
        chromaKey: { ...source.colorKey.chromaKey, ...patch },
      },
    });
  };

  const updateEffects = (patch: Partial<StageSource["effects"]>) => {
    onUpdate(sceneId, {
      ...source,
      effects: { ...source.effects, ...patch },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="w-[690px] max-h-[88vh] flex flex-col rounded-xl bg-[#0B0E17] border border-slate-700/80 shadow-[0_25px_70px_rgba(0,0,0,0.9)] overflow-hidden text-xs">
        {/* Header */}
        <div className="px-4 py-3 bg-[#101522] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded bg-[#00F0FF]/15 text-[#00F0FF] font-mono font-bold uppercase text-[10px]">
              {source.type}
            </span>
            <input
              type="text"
              value={source.name}
              onChange={(e) =>
                onUpdate(sceneId, { ...source, name: e.target.value })
              }
              className="bg-slate-900/90 border border-slate-700 rounded px-2.5 py-1 text-sm font-semibold text-white focus:border-[#00F0FF] outline-none"
            />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source-Specific Source Configuration Strip */}
        {(source.type === "window" ||
          source.type === "camera" ||
          source.type === "text" ||
          source.type === "lower_third" ||
          source.type === "color") && (
          <div className="px-4 py-2.5 bg-[#0D121F] border-b border-slate-800/90 flex flex-wrap items-center gap-3">
            {source.type === "window" && (
              <div className="flex items-center gap-2 w-full">
                <span className="text-slate-400 font-medium">
                  Ventana / Juego de Windows:
                </span>
                <select
                  value={source.windowHwnd || 0}
                  onChange={(e) => {
                    const hwnd = Number(e.target.value);
                    const winObj = openWindows.find((w) => w.hwnd === hwnd);
                    onUpdate(sceneId, {
                      ...source,
                      windowHwnd: hwnd,
                      windowTitle: winObj?.title || "Escritorio Principal",
                    });
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 outline-none"
                >
                  <option value={0}>Monitor Principal (Captura Completa)</option>
                  {openWindows.map((w) => (
                    <option key={w.hwnd} value={w.hwnd}>
                      {w.title} (PID {w.process_id} • {w.width}×{w.height})
                    </option>
                  ))}
                </select>
                <button
                  onClick={onRefreshWindows}
                  className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[#00F0FF]"
                >
                  Actualizar Lista
                </button>
              </div>
            )}

            {source.type === "camera" && (
              <div className="flex items-center gap-2 w-full">
                <span className="text-slate-400 font-medium">
                  Dispositivo de Cámara UVC:
                </span>
                <select
                  value={source.cameraDeviceId || ""}
                  onChange={(e) =>
                    onUpdate(sceneId, {
                      ...source,
                      cameraDeviceId: e.target.value || undefined,
                    })
                  }
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 outline-none"
                >
                  <option value="">Cámara Predeterminada del Sistema</option>
                  {cameraDevices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Cámara USB #${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(source.type === "text" || source.type === "lower_third") && (
              <div className="grid grid-cols-2 gap-2.5 w-full">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Texto / Titular Principal:
                  </label>
                  <input
                    type="text"
                    value={source.textContent || ""}
                    onChange={(e) =>
                      onUpdate(sceneId, {
                        ...source,
                        textContent: e.target.value,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white"
                  />
                </div>
                {source.type === "lower_third" ? (
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Subtítulo / Red Social:
                    </label>
                    <input
                      type="text"
                      value={source.subtitleContent || ""}
                      onChange={(e) =>
                        onUpdate(sceneId, {
                          ...source,
                          subtitleContent: e.target.value,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white"
                    />
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Tamaño (px):
                      </label>
                      <input
                        type="number"
                        min={16}
                        max={160}
                        value={source.fontSize || 52}
                        onChange={(e) =>
                          onUpdate(sceneId, {
                            ...source,
                            fontSize: Number(e.target.value),
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Color:
                      </label>
                      <input
                        type="color"
                        value={source.textColor || "#FFFFFF"}
                        onChange={(e) =>
                          onUpdate(sceneId, {
                            ...source,
                            textColor: e.target.value,
                          })
                        }
                        className="h-7 w-12 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {source.type === "color" && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Color Primario:</span>
                  <input
                    type="color"
                    value={source.bgColor || "#0D1528"}
                    onChange={(e) =>
                      onUpdate(sceneId, { ...source, bgColor: e.target.value })
                    }
                    className="h-7 w-12 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Degradado Secundario:</span>
                  <input
                    type="color"
                    value={source.gradientEndColor || "#1E1035"}
                    onChange={(e) =>
                      onUpdate(sceneId, {
                        ...source,
                        gradientEndColor: e.target.value,
                      })
                    }
                    className="h-7 w-12 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4 XSplit Broadcaster Inspector Tabs */}
        <div className="flex border-b border-slate-800 bg-[#0B0E17] px-3 pt-2 gap-1">
          {[
            {
              id: "layout",
              label: "1. Disposición y 3D (Layout)",
              icon: Move,
            },
            {
              id: "color",
              label: "2. Color y Chroma Key",
              icon: Palette,
            },
            {
              id: "effects",
              label: "3. 14 Shaders, Máscara y Bordes",
              icon: Sparkles,
            },
            {
              id: "transition",
              label: "4. Transiciones de Capa",
              icon: Play,
            },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg font-medium transition border-b-2 ${
                  active
                    ? "bg-[#141B2D] text-[#00F0FF] border-[#00F0FF]"
                    : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: LAYOUT, CROP & 3D ROTATION */}
          {activeTab === "layout" && (
            <div className="space-y-4">
              {/* Quick Presets Row */}
              <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-800">
                <button
                  onClick={() =>
                    updateLayout({
                      x: 0,
                      y: 0,
                      width: stageW,
                      height: stageH,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-[#00F0FF]/25 font-medium"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Ajustar a Pantalla Completa (Ctrl+Shift+F)
                </button>
                <button
                  onClick={() =>
                    updateLayout({
                      x: Math.round((stageW - source.layout.width) / 2),
                      y: Math.round((stageH - source.layout.height) / 2),
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                  Centrar en Lienzo
                </button>
                <button
                  onClick={() =>
                    updateLayout({
                      width: Math.round(stageW / 4),
                      height: Math.round(stageH / 4),
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  Tamaño PIP 1/4
                </button>
                <button
                  onClick={() => updateLayout({ flipH: !source.layout.flipH })}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded border ${
                    source.layout.flipH
                      ? "bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF]"
                      : "bg-slate-900 border-slate-700 text-slate-300"
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  Voltear H
                </button>
                <button
                  onClick={() => updateLayout({ flipV: !source.layout.flipV })}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded border ${
                    source.layout.flipV
                      ? "bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF]"
                      : "bg-slate-900 border-slate-700 text-slate-300"
                  }`}
                >
                  <FlipVertical className="w-3.5 h-3.5" />
                  Voltear V
                </button>
              </div>

              {/* Position & Dimensions */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Posición X (px)", key: "x", min: -960, max: 1920 },
                  { label: "Posición Y (px)", key: "y", min: -540, max: 1920 },
                  { label: "Ancho W (px)", key: "width", min: 64, max: 3840 },
                  { label: "Alto H (px)", key: "height", min: 48, max: 2160 },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="p-2.5 rounded-lg bg-[#101626] border border-slate-800"
                  >
                    <label className="block text-[10px] text-slate-400 mb-1">
                      {item.label}
                    </label>
                    <input
                      type="number"
                      min={item.min}
                      max={item.max}
                      value={
                        source.layout[
                          item.key as keyof typeof source.layout
                        ] as number
                      }
                      onChange={(e) =>
                        updateLayout({ [item.key]: Number(e.target.value) })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white"
                    />
                  </div>
                ))}
              </div>

              {/* Edge Cropping (Top, Bottom, Left, Right) */}
              <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Recorte de Bordes (Cropping — Alt + Arrastrar)
                  </span>
                  <button
                    onClick={() =>
                      updateLayout({
                        cropTop: 0,
                        cropBottom: 0,
                        cropLeft: 0,
                        cropRight: 0,
                      })
                    }
                    className="text-[11px] text-[#00F0FF] hover:underline"
                  >
                    Restablecer Recorte
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Superior (Top %)", key: "cropTop" },
                    { label: "Inferior (Bottom %)", key: "cropBottom" },
                    { label: "Izquierda (Left %)", key: "cropLeft" },
                    { label: "Derecha (Right %)", key: "cropRight" },
                  ].map((c) => {
                    const val = source.layout[
                      c.key as keyof typeof source.layout
                    ] as number;
                    return (
                      <div key={c.key} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-400">{c.label}</span>
                          <span className="font-mono text-[#00F0FF]">
                            {val}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={45}
                          value={val}
                          onChange={(e) =>
                            updateLayout({ [c.key]: Number(e.target.value) })
                          }
                          className="w-full"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3D Plane Rotation (Pitch X, Yaw Y, Roll Z) */}
              <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Rotación Tridimensional 3D (Shift + Arrastrar)
                  </span>
                  <button
                    onClick={() => updateLayout({ rotX: 0, rotY: 0, rotZ: 0 })}
                    className="flex items-center gap-1 text-[11px] text-[#00F0FF] hover:underline"
                  >
                    <RotateCcw className="w-3 h-3" /> Resetear 0°
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: "Inclinación X (Pitch)",
                      key: "rotX",
                      min: -75,
                      max: 75,
                    },
                    {
                      label: "Giro Y (Yaw 3D)",
                      key: "rotY",
                      min: -75,
                      max: 75,
                    },
                    {
                      label: "Rotación Z (Roll 2D)",
                      key: "rotZ",
                      min: -180,
                      max: 180,
                    },
                  ].map((r) => {
                    const val = source.layout[
                      r.key as keyof typeof source.layout
                    ] as number;
                    return (
                      <div key={r.key} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-400">{r.label}</span>
                          <span className="font-mono text-[#00F0FF]">
                            {val}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={r.min}
                          max={r.max}
                          value={val}
                          onChange={(e) =>
                            updateLayout({ [r.key]: Number(e.target.value) })
                          }
                          className="w-full"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COLOR GRADING & CHROMA KEY */}
          {activeTab === "color" && (
            <div className="space-y-4">
              {/* Primary Color Grading */}
              <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Corrección de Color y Opacidad de Capa
                  </span>
                  <button
                    onClick={() =>
                      updateColorKey({
                        brightness: 0,
                        contrast: 0,
                        saturation: 0,
                        hue: 0,
                        opacity: 100,
                      })
                    }
                    className="text-[11px] text-[#00F0FF] hover:underline"
                  >
                    Valores por Defecto
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Opacidad (Alpha %)",
                      key: "opacity",
                      min: 5,
                      max: 100,
                    },
                    {
                      label: "Brillo (Brightness)",
                      key: "brightness",
                      min: -80,
                      max: 80,
                    },
                    {
                      label: "Contraste (Contrast)",
                      key: "contrast",
                      min: -80,
                      max: 80,
                    },
                    {
                      label: "Saturación (Saturation)",
                      key: "saturation",
                      min: -100,
                      max: 100,
                    },
                    {
                      label: "Matiz (Hue °)",
                      key: "hue",
                      min: -180,
                      max: 180,
                    },
                  ].map((c) => {
                    const val = source.colorKey[
                      c.key as keyof typeof source.colorKey
                    ] as number;
                    return (
                      <div key={c.key} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-400">{c.label}</span>
                          <span className="font-mono text-[#00F0FF]">{val}</span>
                        </div>
                        <input
                          type="range"
                          min={c.min}
                          max={c.max}
                          value={val}
                          onChange={(e) =>
                            updateColorKey({ [c.key]: Number(e.target.value) })
                          }
                          className="w-full"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chroma Key HSL/RGB (Disabled by default per Golden Rule #3) */}
              <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white block">
                      Chroma Key en Tiempo Real (Pantalla Verde / Azul)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Desactivado por defecto para preservar la imagen natural de tu cámara
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={source.colorKey.chromaKey.enabled}
                      onChange={(e) =>
                        updateChroma({ enabled: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#00F0FF]"
                    />
                    <span className="font-semibold text-[#00F0FF]">
                      Activar Chroma Key
                    </span>
                  </label>
                </div>

                {source.colorKey.chromaKey.enabled && (
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">Color Clave:</span>
                      {(["green", "blue", "red", "custom"] as const).map(
                        (col) => (
                          <button
                            key={col}
                            onClick={() => updateChroma({ keyColor: col })}
                            className={`px-3 py-1 rounded uppercase font-semibold text-[11px] border ${
                              source.colorKey.chromaKey.keyColor === col
                                ? "bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF]"
                                : "bg-slate-900 border-slate-700 text-slate-300"
                            }`}
                          >
                            {col === "green"
                              ? "Verde"
                              : col === "blue"
                              ? "Azul"
                              : col === "red"
                              ? "Rojo"
                              : "Cuentagotas"}
                          </button>
                        )
                      )}
                      {source.colorKey.chromaKey.keyColor === "custom" && (
                        <input
                          type="color"
                          value={source.colorKey.chromaKey.customHex}
                          onChange={(e) =>
                            updateChroma({ customHex: e.target.value })
                          }
                          className="h-7 w-12 rounded cursor-pointer"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">
                            Umbral de Recorte (Threshold)
                          </span>
                          <span className="font-mono text-[#00F0FF]">
                            {source.colorKey.chromaKey.threshold}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={90}
                          value={source.colorKey.chromaKey.threshold}
                          onChange={(e) =>
                            updateChroma({ threshold: Number(e.target.value) })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">
                            Suavizado de Bordes (Alpha Smoothing)
                          </span>
                          <span className="font-mono text-[#00F0FF]">
                            {source.colorKey.chromaKey.smoothing}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={80}
                          value={source.colorKey.chromaKey.smoothing}
                          onChange={(e) =>
                            updateChroma({ smoothing: Number(e.target.value) })
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: 14 SHADER EFFECTS, SHAPE MASKS, BORDERS & DROP SHADOW */}
          {activeTab === "effects" && (
            <div className="space-y-4">
              {/* 14 HLSL Pixel Shader Effects (`re3/effects.re3` & `re3/filters.re3`) */}
              <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Filtro de Pixel Shader en Tiempo Real (14 Motores RE3)
                  </span>
                  <span className="font-mono text-[#00F0FF]">
                    Intensidad: {source.effects.intensity}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={source.effects.shader}
                    onChange={(e) =>
                      updateEffects({
                        shader: e.target.value as ShaderEffectId,
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white outline-none"
                  >
                    {SHADER_EFFECT_LIST.map((sh) => (
                      <option key={sh.id} value={sh.id}>
                        {sh.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={source.effects.intensity}
                    onChange={(e) =>
                      updateEffects({ intensity: Number(e.target.value) })
                    }
                    className="w-full self-center"
                  />
                </div>
              </div>

              {/* Shape Masking */}
              <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-2.5">
                <span className="font-semibold text-slate-200 block">
                  Máscara Geométrica de Recorte (Shape Mask)
                </span>
                <div className="grid grid-cols-5 gap-2">
                  {(
                    [
                      { id: "none", label: "Sin Máscara" },
                      { id: "rectangle", label: "Rectángulo" },
                      { id: "rounded", label: "Redondeado" },
                      { id: "circle", label: "Círculo / Óvalo" },
                      { id: "diamond", label: "Diamante" },
                    ] as { id: MaskShape; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => updateEffects({ maskShape: m.id })}
                      className={`py-2 px-2 rounded text-center font-medium border transition ${
                        source.effects.maskShape === m.id
                          ? "bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF]"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Border & Drop Shadow */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-slate-200">
                      Borde Personalizado
                    </span>
                    <input
                      type="checkbox"
                      checked={source.effects.borderEnabled}
                      onChange={(e) =>
                        updateEffects({ borderEnabled: e.target.checked })
                      }
                      className="accent-[#00F0FF]"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Grosor:</span>
                    <input
                      type="range"
                      min={1}
                      max={16}
                      value={source.effects.borderThickness}
                      onChange={(e) =>
                        updateEffects({
                          borderThickness: Number(e.target.value),
                        })
                      }
                      className="flex-1"
                    />
                    <input
                      type="color"
                      value={source.effects.borderColor}
                      onChange={(e) =>
                        updateEffects({ borderColor: e.target.value })
                      }
                      className="w-8 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-slate-200">
                      Sombra Paralela (Drop Shadow)
                    </span>
                    <input
                      type="checkbox"
                      checked={source.effects.dropShadowEnabled}
                      onChange={(e) =>
                        updateEffects({ dropShadowEnabled: e.target.checked })
                      }
                      className="accent-[#00F0FF]"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Desenfoque:</span>
                    <input
                      type="range"
                      min={0}
                      max={45}
                      value={source.effects.dropShadowBlur}
                      onChange={(e) =>
                        updateEffects({
                          dropShadowBlur: Number(e.target.value),
                        })
                      }
                      className="flex-1"
                    />
                    <input
                      type="color"
                      value={source.effects.dropShadowColor}
                      onChange={(e) =>
                        updateEffects({ dropShadowColor: e.target.value })
                      }
                      className="w-8 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PER-SOURCE ENTER / EXIT TRANSITIONS */}
          {activeTab === "transition" && (
            <div className="p-3 rounded-lg bg-[#101626] border border-slate-800 space-y-4">
              <p className="text-slate-400">
                Configura la animación individual que ejecutará esta fuente cuando
                actives o desactives su icono de visibilidad (ojo) en la escena.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Animación de Entrada (Mostrar Capa):
                  </label>
                  <select
                    value={source.effects.enterTransition}
                    onChange={(e) =>
                      updateEffects({
                        enterTransition: e.target.value as TransitionId,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white"
                  >
                    {TRANSITION_LIST.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Animación de Salida (Ocultar Capa):
                  </label>
                  <select
                    value={source.effects.exitTransition}
                    onChange={(e) =>
                      updateEffects({
                        exitTransition: e.target.value as TransitionId,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white"
                  >
                    {TRANSITION_LIST.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">
                    Duración de Transición de Fuente (ms):
                  </span>
                  <span className="font-mono text-[#00F0FF]">
                    {source.effects.transitionDurationMs} ms
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={2500}
                  step={50}
                  value={source.effects.transitionDurationMs}
                  onChange={(e) =>
                    updateEffects({
                      transitionDurationMs: Number(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#101522] border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Todos los cambios se aplican en vivo sobre el compositor a 60 FPS
          </span>
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-[#00F0FF] text-slate-950 font-bold hover:brightness-110 transition"
          >
            Cerrar Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
