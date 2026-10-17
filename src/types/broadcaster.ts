export type SourceType =
  | "screen"
  | "window"
  | "camera"
  | "text"
  | "lower_third"
  | "image"
  | "media"
  | "color"
  | "replay";

export type ShaderEffectId =
  | "none"
  | "bloom"
  | "monochrome"
  | "oldmovie"
  | "sketchpencilstroke"
  | "invertcolor"
  | "magnifysmooth"
  | "cool"
  | "warm"
  | "sincity"
  | "blur"
  | "sharpen"
  | "smoothen"
  | "lut";

export type MaskShape = "none" | "rectangle" | "rounded" | "circle" | "diamond";

export type TransitionId =
  | "cut"
  | "fade"
  | "fadetoblack"
  | "fadetowhite"
  | "clock"
  | "fan"
  | "collapse"
  | "hole"
  | "move_left"
  | "move_right"
  | "move_left_right"
  | "move_top"
  | "move_bottom"
  | "move_top_bottom"
  | "wave"
  | "zoom"
  | "easeOutBounce"
  | "easeOutElastic"
  | "easeInOutBack"
  | "stinger";

export interface SourceLayout {
  x: number; // Normalized 0..1920 canvas coordinates
  y: number; // Normalized 0..1080 canvas coordinates
  width: number;
  height: number;
  cropTop: number; // Percentage 0..45
  cropBottom: number;
  cropLeft: number;
  cropRight: number;
  rotX: number; // 3D Pitch -180..180
  rotY: number; // 3D Yaw -180..180
  rotZ: number; // 2D/3D Roll -180..180
  flipH: boolean;
  flipV: boolean;
  keepAspectRatio: boolean;
  lockPosition: boolean;
  visible: boolean;
}

export interface ChromaKeySettings {
  enabled: boolean; // Golden Rule #3: MUST default to false
  keyColor: "green" | "blue" | "red" | "custom";
  customHex: string;
  threshold: number; // 0..100
  exposure: number; // 0..100
  smoothing: number; // 0..100
}

export interface SourceColorKey {
  brightness: number; // -100..100 (0 default)
  contrast: number; // -100..100 (0 default)
  saturation: number; // -100..100 (0 default)
  hue: number; // -180..180 (0 default)
  opacity: number; // 0..100 (100 default)
  chromaKey: ChromaKeySettings;
  aiBgRemoval: boolean;
  removeChair: boolean;
}

export interface SourceEffects {
  shader: ShaderEffectId;
  intensity: number; // 0..100
  maskShape: MaskShape;
  borderEnabled: boolean;
  borderThickness: number;
  borderRadius: number;
  borderColor: string;
  dropShadowEnabled: boolean;
  dropShadowDistance: number;
  dropShadowBlur: number;
  dropShadowColor: string;
  enterTransition: TransitionId;
  exitTransition: TransitionId;
  transitionDurationMs: number;
}

export interface StageSource {
  id: string;
  name: string;
  type: SourceType;
  zOrder: number;
  layout: SourceLayout;
  colorKey: SourceColorKey;
  effects: SourceEffects;
  // Type-specific payloads
  windowHwnd?: number;
  windowTitle?: string;
  cameraDeviceId?: string;
  textContent?: string;
  subtitleContent?: string;
  socialHandle?: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  accentColor?: string;
  bgColor?: string;
  gradientEndColor?: string;
  mediaUrl?: string;
  mediaLoop?: boolean;
  showCursor?: boolean;
  hideYellowBorder?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  sources: StageSource[];
  perSceneMicVolume?: number;
  perSceneSystemVolume?: number;
  perSceneMicMuted?: boolean;
}

export interface TransitionOverrideRule {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  transition: TransitionId;
  durationMs: number;
}

export interface AudioBusChannel {
  id: string;
  name: string;
  kind: "system" | "mic" | "media";
  volume: number; // 0..100
  muted: boolean;
  gainDb: number; // -20..+20 dB
  delayMs: number; // 0..2000 ms lip-sync offset
  monoMix: boolean;
  noiseSuppression: boolean;
  noiseGateThreshold: number; // -60..0 dB
  tracks: boolean[]; // 6 tracks [Track 1 .. Track 6]
}

export interface AutoSceneRule {
  id: string;
  windowTitleMatch: string;
  targetSceneId: string;
  enabled: boolean;
}

export interface StreamChannelConfig {
  id: string;
  platform: "Twitch" | "YouTube Live" | "Kick" | "Facebook Live" | "Custom RTMP";
  name: string;
  rtmpUrl: string;
  streamKey: string;
  bitrateKbps: number;
  enabled: boolean;
}

export type WhiteboardTool =
  | "select"
  | "pen"
  | "highlighter"
  | "arrow"
  | "rect"
  | "circle"
  | "laser";

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  tool: Exclude<WhiteboardTool, "select">;
  color: string;
  width: number;
  points: WhiteboardPoint[];
  createdAt: number;
}

export interface HardwareTelemetry {
  cpu_brand: string;
  cpu_usage_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  gpu_name: string;
  gpu_vram_used_mb: number;
  gpu_vram_total_mb: number;
  gpu_utilization_percent: number;
}

export interface MediaFileEntry {
  name: string;
  path: string;
  size_bytes: number;
  created_display: string;
  kind: "video" | "screenshot";
}

export interface WindowInfo {
  hwnd: number;
  title: string;
  process_id: number;
  width: number;
  height: number;
}

export const SHADER_EFFECT_LIST: { id: ShaderEffectId; label: string }[] = [
  { id: "none", label: "Ninguno (Original)" },
  { id: "bloom", label: "Bloom (Resplandor de Luz)" },
  { id: "monochrome", label: "Monochrome (Blanco y Negro)" },
  { id: "oldmovie", label: "Old Movie (Cine Clásico Sepia)" },
  { id: "sketchpencilstroke", label: "Sketch Pencil (Boceto a Lápiz)" },
  { id: "invertcolor", label: "Invert Color (Negativo)" },
  { id: "magnifysmooth", label: "Magnify Smooth (Lupa Central)" },
  { id: "cool", label: "Cool (Tono Frío Cian)" },
  { id: "warm", label: "Warm (Tono Cálido Ámbar)" },
  { id: "sincity", label: "Sin City (Alto Contraste + Rojo)" },
  { id: "blur", label: "Blur (Desenfoque Gauss/Poisson)" },
  { id: "sharpen", label: "Sharpen (Nitidez 3x3)" },
  { id: "smoothen", label: "Smoothen (Suavizado 3x3)" },
  { id: "lut", label: "3D LUT (Gradación de Cine)" },
];

export const TRANSITION_LIST: { id: TransitionId; label: string }[] = [
  { id: "cut", label: "Cut (Corte Directo)" },
  { id: "fade", label: "Fade (Fundido Cruzado)" },
  { id: "fadetoblack", label: "Fade to Black (Fundir a Negro)" },
  { id: "fadetowhite", label: "Fade to White (Fundir a Blanco)" },
  { id: "clock", label: "Clock (Barrido de Reloj)" },
  { id: "fan", label: "Fan (Abanico Cuádruple)" },
  { id: "collapse", label: "Collapse (Contracción Radial)" },
  { id: "hole", label: "Hole (Apertura Circular)" },
  { id: "move_left", label: "Move Left (Deslizar Izquierda)" },
  { id: "move_right", label: "Move Right (Deslizar Derecha)" },
  { id: "move_left_right", label: "Move Left & Right (Persiana H)" },
  { id: "move_top", label: "Move Top (Deslizar Arriba)" },
  { id: "move_bottom", label: "Move Bottom (Deslizar Abajo)" },
  { id: "move_top_bottom", label: "Move Top & Bottom (Persiana V)" },
  { id: "wave", label: "Wave (Onda Sinusoidal)" },
  { id: "zoom", label: "Zoom (Escalado Dinámico)" },
  { id: "easeOutBounce", label: "Ease Out Bounce (Rebote Físico)" },
  { id: "easeOutElastic", label: "Ease Out Elastic (Elástico)" },
  { id: "easeInOutBack", label: "Ease In-Out Back (Cinemático)" },
  { id: "stinger", label: "Stinger Alpha (Destello Broadcast)" },
];

export function createDefaultSource(
  type: SourceType,
  name: string,
  zOrder: number,
  extra?: Partial<StageSource>
): StageSource {
  const isFullStage = type === "screen" || type === "window" || type === "color";
  const isLowerThird = type === "lower_third";
  const isText = type === "text";

  return {
    id: `src_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    type,
    zOrder,
    layout: {
      x: isFullStage ? 0 : isLowerThird ? 70 : isText ? 100 : 1340,
      y: isFullStage ? 0 : isLowerThird ? 860 : isText ? 80 : 680,
      width: isFullStage ? 1920 : isLowerThird ? 780 : isText ? 680 : 520,
      height: isFullStage ? 1080 : isLowerThird ? 150 : isText ? 110 : 320,
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
    colorKey: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hue: 0,
      opacity: 100,
      // Golden Rule #3: Chroma Key disabled by default
      chromaKey: {
        enabled: false,
        keyColor: "green",
        customHex: "#00FF00",
        threshold: 38,
        exposure: 20,
        smoothing: 15,
      },
      aiBgRemoval: false,
      removeChair: false,
    },
    effects: {
      shader: "none",
      intensity: 75,
      maskShape: "none",
      borderEnabled: type === "camera" || type === "replay",
      borderThickness: 3,
      borderRadius: type === "camera" ? 14 : 8,
      borderColor: type === "replay" ? "#FF2A54" : "#00F0FF",
      dropShadowEnabled: !isFullStage,
      dropShadowDistance: 10,
      dropShadowBlur: 18,
      dropShadowColor: "#000000",
      enterTransition: "fade",
      exitTransition: "fade",
      transitionDurationMs: 400,
    },
    textContent: isLowerThird
      ? "BORNICHO LIVE STUDIO"
      : isText
      ? "EN DIRECTO // GAMECASTER PLUS PRO"
      : undefined,
    subtitleContent: isLowerThird
      ? "RETRANSMISIÓN OFICIAL EN ALTA DEFINICIÓN"
      : undefined,
    socialHandle: isLowerThird ? "@bornicho1982" : undefined,
    fontFamily: "Rajdhani, Inter, sans-serif",
    fontSize: isLowerThird ? 44 : 52,
    textColor: "#FFFFFF",
    accentColor: "#00F0FF",
    bgColor: type === "color" ? "#0D1528" : "#080D1A",
    gradientEndColor: "#1E1035",
    mediaLoop: true,
    showCursor: true,
    hideYellowBorder: true,
    ...extra,
  };
}
