# PLAN MAESTRO DE ARQUITECTURA COMERCIAL: OBS STUDIO + XSPLIT BROADCASTER -> GAMECASTER PLUS

**Fecha de Auditoría REA:** 17 de Octubre de 2026  
**Binarios Auditados con REA (`rea` MCP):**
- **OBS Studio v30+ (Open-Source Industry Standard):**
  - `C:\Program Files\obs-studio\obs-plugins\64bit\win-capture.dll` (`sha256: 3c00a7b4b2c823fd09d9422514cbaa13c06853a53ca3bbdf9d68148ca003e68a`)
  - `C:\Program Files\obs-studio\obs-plugins\64bit\obs-ffmpeg.dll` (`sha256: 05a1ff4918a9dae88375576c3a93f217f8069d5d1d80aa99145001655dc5a01d`)
  - `C:\Program Files\obs-studio\data\obs-plugins\obs-filters\chroma_key_filter_v2.effect` & `color_correction_filter.effect`
- **XSplit Broadcaster v4.6 (Commercial Broadcast Suite):**
  - `XSplit.Core.exe`, `VHMultiWriterExt2.exe`, `xsplit.gamecapture64.dll`, `d3d11.fx` (documentados en `docs/BROADCASTER_CLEANROOM_SPEC.md`)

---

## 1. COMPARATIVA TÉCNICA: ¿QUÉ HACE TAN BUENOS A OBS STUDIO Y XSPLIT BROADCASTER?

| Subsistema | OBS Studio (Código Abierto) | XSplit Broadcaster (Comercial Pro) | Síntesis en **Gamecaster Plus** |
| :--- | :--- | :--- | :--- |
| **Captura de Ventanas y Juegos (`win-capture.dll` vs `xsplit.gamecapture64.dll`)** | En `FUN_18000cd10` (`win-capture.dll`), OBS ofrece 3 métodos (`Auto`, `BitBlt`, `WGC`), prioridad de emparejamiento de ventana (`Class`, `Title`, `Executable`), recorte de área cliente (`client_area`) y renderizado de cursor (`GetCursorInfo` + `DrawIconEx`). | Emparejamiento automático de procesos DX9/11/12/Vulkan, captura de ventana fuera de pantalla (`PrintWindow` con `PW_RENDERFULLCONTENT`) y exclusión de la propia ventana (`SetWindowDisplayAffinity`). | Motor híbrido con exclusión automática del propio PID (`GetCurrentProcessId()`), captura de área cliente sin bordes (`GetClientRect` + `ClientToScreen`), re-enganche automático por título/ejecutable si cambia el `HWND`, y dibujado real del cursor (`DrawIconEx`). |
| **Codificación y Grabación Segura (`obs-ffmpeg.dll` vs `VHMultiWriterExt2.exe`)** | `obs-ffmpeg.dll` utiliza `ffmpeg_muxer` con **Hybrid MP4 / Fragmented MP4** (`frag_keyframe+empty_moov`) resistente a cierres inesperados + **Auto-Remux** (`-c copy -movflags +faststart`), Replay Buffer en RAM y NVENC (`h264_nvenc`) con fallback a `libx264`. | `VHMultiWriterExt2.exe` aísla el codificador en un subproceso dedicado con control de CBR/VBR, perfiles de emisión por canal y grabación multipista simultánea. | Subproceso dedicado FFmpeg con detección automática de GPU **NVIDIA NVENC (`h264_nvenc`)** y fallback transparente a **`libx264`**, grabación **Hybrid MP4 anti-corrupción** con remux instantáneo `+faststart` al detener, y streaming por bloques (`Chunked Disk Pipe`) sin congelar la interfaz. |
| **Motor de Audio y Mezcla (`win-wasapi` / `obs-filters` vs `wasapi.dll`)** | Captura WASAPI/DirectShow independiente, filtros DSP por canal (`Noise Gate`, `Compressor`, `3-Band EQ`, `Gain`), escala logarítmica dBFS (`-60 dB` a `0 dB`) y **Monitorización de Audio** (`Monitor Off`, `Monitor Only`, `Monitor and Output`). | Mezclador compacto integrado con separación clara entre Micro y Sistema, silenciamiento rápido y barra de estado de codificación en vivo. | Grafo DSP **Web Audio API** real en vivo (`GainNode` + `DynamicsCompressorNode` + `BiquadFilterNode` Noise Gate + `MediaStreamAudioDestinationNode`) inyectado directamente en la grabación del lienzo compuesto, más captura DirectShow en grabación nativa. |
| **Composición Escénica y Shaders (`chroma_key_filter_v2.effect` vs `d3d11.fx`)** | `chroma_key_filter_v2.effect` convierte RGB a espacio **YCbCr** (`cb_v4`, `cr_v4`), calcula distancia cromática con muestreo suavizado y aplica **Spill Reduction** (desaturación por luminancia en bordes verdes). | Gizmos interactivos en el lienzo con 8 tiradores de escala, recorte (`Cropping`), opacidad, encaje magnético (`Snap Guides`), Modo Estudio (`PVW -> PGM`) y cuadrícula de 12 escenas con atajos `F1-F12`. | Lienzo interactivo con gizmos de 8 puntos, guías magnéticas, Modo Estudio Doble (`PVW/PGM`), cuadrícula de escenas XSplit y algoritmo **YCbCr Chroma Key V2 con reducción de Spill** idéntico al shader de OBS Studio. |
| **Telemetría y Diagnóstico (`Stats Dock` vs `Status Footer`)** | Panel de estadísticas técnicas en tiempo real: FPS reales vs objetivo, tiempo de renderizado por fotograma (`ms`), frames codificados/saltados, bitrate efectivo (`kbps`) y espacio libre en disco (`GB`). | Cabecera y pie de estado ejecutivo con cronómetros independientes de `STREAM` y `REC`, uso de CPU/GPU y accesos rápidos a grabaciones. | Barra de telemetría unificada **OBS Stats + XSplit Header** con FPS reales, Frame Time (`ms`), espacio libre en disco (`GB`), codificador activo (`NVENC` / `x264`), Bitrate y alertas de salud. |

---

## 2. DIAGNÓSTICO DE FALLOS ENCONTRADOS EN NUESTRO CÓDIGO Y SOLUCIÓN DEFINITIVA

### Fallo Crítico 1: Las grabaciones salían SIN AUDIO o congelaban la app al detener
- **Causa raíz:**
  1. En `video_encoder.rs`, `start_native_recording` lanzaba FFmpeg únicamente con `-f gdigrab -i desktop` sin ninguna entrada de audio (`-f dshow`), produciendo vídeos 100% mudos.
  2. En `App.tsx`, la grabación del lienzo compuesto (`canvas.captureStream(60)`) solo capturaba la pista de vídeo 2D del `<canvas>` sin adjuntar el flujo de audio mezclado (`MediaStreamAudioDestinationNode`), y al parar convertía todo el archivo de vídeo en un array JSON (`Array.from(new Uint8Array(buf))`) bloqueando Tauri IPC si el vídeo duraba más de 15 segundos.
- **Solución implementada:**
  1. **Grafo de Audio Mezclado Real (`AudioContext` -> `MediaStreamAudioDestinationNode`):** Conectamos el micrófono real + el audio de las fuentes multimedia (pasando por su ganancia, Noise Gate y Compresor DSP) a un nodo de destino de stream y añadimos sus pistas (`getAudioTracks()`) al `MediaStream` del `<canvas>` antes de iniciar `MediaRecorder`.
  2. **Escritura Incremental por Bloques (`Chunked Disk Streaming`):** Eliminamos el envío masivo en memoria. Ahora `MediaRecorder` emite bloques cada `500ms` que se escriben directamente en disco mediante `append_canvas_recording_chunk`, y al pulsar "Detener" se ejecuta `finalize_canvas_recording_file`, que remuxea y codifica con **NVIDIA NVENC (`h264_nvenc`)** (o `libx264` en fallback) + audio **AAC 192 kbps** con `-movflags +faststart`.
  3. **Detección de Dispositivos de Audio DirectShow en Rust (`list_dshow_audio_devices`):** Para la grabación nativa por motor Rust y emisión RTMP, enumeramos automáticamente el micrófono real de Windows con FFmpeg DirectShow e inyectamos `-f dshow -i audio="..."` junto con los parámetros configurados por el usuario (resolución, 60 FPS, NVENC/x264, bitrate).

### Fallo Crítico 2: La captura de pantalla no mostraba el cursor del ratón y la lista de ventanas incluía al propio Gamecaster Plus
- **Causa raíz:**
  1. `BitBlt` por sí solo no dibuja el cursor de hardware de Windows a menos que se invoque `GetCursorInfo` + `DrawIconEx` sobre el `HDC` de memoria.
  2. `enumerate_visible_windows` no filtraba el `PID` del proceso actual (`GetCurrentProcessId()`), permitiendo seleccionar la propia ventana de Gamecaster Plus.
- **Solución implementada en `wgc_capture.rs`:**
  1. Añadido dibujado nativo del cursor de Windows (`GetCursorInfo` + `GetIconInfo` + `DrawIconEx`) sobre el contexto GDI cuando la fuente tiene `showCursor: true` (exactamente como `win-capture.dll` en OBS).
  2. Filtrado estricto de `GetCurrentProcessId()` en `enumerate_visible_windows()` para que Gamecaster Plus jamás aparezca como ventana capturable ni genere bucle visual.
  3. Soporte de recorte de **Área Cliente (`client_area`)** (`GetClientRect` + `ClientToScreen`) y re-emparejamiento automático por título de ventana si un juego recrea su `HWND` al cambiar de resolución.

### Fallo Crítico 3: Chroma Key básico en RGB dejaba bordes verdes ("Spill")
- **Causa raíz:** El filtro Chroma Key anterior calculaba distancia euclídea simple en RGB, lo que falla ante cambios de iluminación en la webcam.
- **Solución implementada en `StageCompositor.tsx`:**
  - Portado el algoritmo exacto de **`chroma_key_filter_v2.effect` de OBS Studio**: conversión de RGB a componentes de crominancia **YCbCr (`Cb`, `Cr`)**, cálculo de distancia en el plano cromático independiente de la luminancia (`Y`), rampa suave de transparencia (`similarity` + `smoothness`) y **Spill Suppression** (desaturación proporcional a la luminancia en los píxeles cercanos al color clave).

### Fallo Crítico 4: Falta de Monitorización de Audio y Telemetría de Salud de Emisión (Estilo OBS Stats)
- **Solución implementada:**
  - Añadido selector de **Monitorización de Audio** por canal (`Sin monitorizar`, `Solo monitorizar`, `Monitorizar y enviar a salida`) conectado al `AudioContext.destination`.
  - Añadido cálculo real de espacio libre en disco (`disk_free_gb`), FPS del compositor, tiempo de fotograma (`frame_time_ms`) y estado del codificador (`NVENC H.264` / `x264`) en la barra inferior y en el panel de estadísticas.
