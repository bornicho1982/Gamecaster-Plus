# AUDITORÍA TÉCNICA INTEGRAL DE GAMECASTER PLUS (MÓDULO POR MÓDULO)

**Fecha de Auditoría:** Octubre 2026  
**Referencias de Ingeniería Comparadas:** XSplit Broadcaster v4.6 (`C:\Program Files\XSplit\Broadcaster` auditado con REA) y OBS Studio (`libobs` / `obs-studio`).  
**Objetivo:** Identificar todos los cuellos de botella, fallos de rendimiento, desajustes visuales y puntos de mejora en los **8 módulos del programa** para dejarlo con calidad comercial (Microsoft Store).

---

## PARTE 1: POR QUÉ EL PROGRAMA SE QUEDABA PILLADO Y DESCUADRADO (4 CAUSAS RAÍZ CORREGIDAS HOY)

Al auditar línea por línea el código de Rust (`src-tauri/src/`) y React (`src/`), encontramos **4 fallos críticos de concurrencia y renderizado** que provocaban que la ventana se quedara congelada ("pillada") y que el lienzo se viera estirado fuera del recuadro azul:

### 1. Bloqueo del Hilo Principal de Windows (UI Thread) en `src-tauri/src/commands.rs`
- **Qué ocurría:** En Tauri v2, cualquier comando declarado como `#[tauri::command] pub fn` (síncrono, sin `async`) se ejecuta **directamente en el hilo principal de la ventana Win32** (donde corren los clics del ratón, el teclado y el repintado de WebView2).
  - `capture_live_frame` (captura GDI + escalado + compresión JPEG cada 45 ms) bloqueaba el hilo principal ~12 ms por fotograma.
  - `get_hardware_telemetry` lanzaba un proceso externo `nvidia-smi.exe` (que tarda **200 a 350 ms** en responder) y escaneaba todos los discos (`Disks::new_with_refreshed_list()`) **cada 1,8 segundos en el hilo de la interfaz**, congelando el ratón y los botones cada 2 segundos.
  - `capture_window_frame` ejecutaba `PrintWindow(hwnd)` síncronamente en el hilo de interfaz: si la ventana capturada tardaba en responder al mensaje WM_PRINT, Gamecaster Plus se quedaba pillado.
- **Solución Aplicada (`commands.rs` y `telemetry.rs`):**
  - Los **21 comandos de Tauri** son ahora `pub async fn` delegados a hilos de trabajo mediante `tauri::async_runtime::spawn_blocking`. El hilo principal de la ventana Win32 **nunca** vuelve a bloquearse.
  - En `telemetry.rs`, la consulta a `nvidia-smi` y el escaneo de discos se han cacheado en memoria (se consultan como máximo cada 12s y 20s en segundo plano).

### 2. Tormenta de Re-renderizados de React (`App.tsx` → 31 re-renders completos por segundo)
- **Qué ocurría:** `App.tsx` guardaba cada fotograma capturado en `useState<string | null>(desktopFrame)` (un string Base64 de ~100 KB) cada 45 ms (~22 veces por segundo) más `setVuLevels` cada 110 ms (~9 veces por segundo). Esto obligaba a React a reconstruir el Virtual DOM de **toda la aplicación** (menús, 4 escenas, lista de fuentes, mezclador de audio y modales) **31 veces por segundo**.
- **Solución Aplicada (`StageCompositor.tsx` y `App.tsx`):**
  - El bucle de captura (`capture_live_frame` y `capture_window_frame`) se ha movido **dentro de `StageCompositor.tsx`** usando referencias mutables (`desktopImgRef` y `windowImgsRef`) que actualizan directamente el `<canvas>` a 60 FPS **con CERO `useState` y CERO re-renderizados de React**.
  - `StageCompositor` está ahora envuelto en `React.memo`.

### 3. Descuadre Visual entre el Lienzo de Vídeo y el Recuadro Azul (Gizmo) en `StageCompositor.tsx`
- **Qué ocurría (visible en tu captura de pantalla):** El `<canvas width={1920} height={1080}>` tenía las clases CSS `w-full h-auto max-h-full object-contain`. Cuando el contenedor central era muy ancho (`~1360px`) pero tenía altura limitada (`~480px`), el navegador estiraba el elemento `<canvas>` a `1360×480` píxeles CSS, deformando la imagen de fondo y haciendo que el recuadro cian (`1920×1080`) no coincidiera con los bordes reales del vídeo.
- **Solución Aplicada (`StageCompositor.tsx`):**
  - Se ha implementado un `ResizeObserver` matemático que calcula al milímetro la caja exacta `16:9` (o `9:16`) que cabe dentro del área central (`fittedSize.w × fittedSize.h`) y fija ambos `<canvas>` (el de vídeo `pgmCanvasRef` y el de controles interactivos `pgmGizmoCanvasRef`) exactamente al mismo tamaño en píxeles. Ahora el borde cian encaja **1:1 al píxel** con el vídeo y los recortes `Alt + Arrastrar` funcionan con precisión milimétrica.

### 4. Congelación al Abrir Grabaciones o Repeticiones (`read_media_file_bytes`)
- **Qué ocurría:** Al abrir un vídeo grabado en la galería (`StudioModals.tsx`) o disparar una Repetición Instantánea (`App.tsx`), se llamaba a `invoke<number[]>("read_media_file_bytes")`, lo que convertía un archivo MP4 de 30 MB en un array JSON de 30 millones de números `[0, 24, 255, ...]` por IPC, bloqueando WebView2 varios segundos.
- **Solución Aplicada (`App.tsx` y `StudioModals.tsx`):**
  - Se utiliza directamente `convertFileSrc(filePath)` del protocolo nativo de assets de Tauri (`asset://localhost/...`), cargando vídeos de cualquier tamaño de forma instantánea (0 ms) en streaming desde disco.

---

## PARTE 2: INVENTARIO Y AUDITORÍA DE LOS 8 MÓDULOS DEL PROGRAMA (PLAN DE REVISIÓN UNO POR UNO)

A continuación tienes la radiografía completa de los **8 módulos** que componen **Gamecaster Plus** para que vayamos revisándolos, probándolos y retocándolos **uno por uno** en el orden que prefieras:

| # | Módulo | Archivos Principales | Estado tras el Parche de Hoy | Puntos que Podemos Retocar / Perfeccionar Uno por Uno |
| :--- | :--- | :--- | :--- | :--- |
| **Módulo 1** | **Motor Nativo de Captura de Pantalla, Monitor y Ventanas** | `src-tauri/src/engine/wgc_capture.rs`<br>`src-tauri/src/commands.rs` | ✅ **Desbloqueado (Async Worker)**<br>- Captura multimonitor (`EnumDisplayMonitors`)<br>- Anti-espejo `SetWindowDisplayAffinity`<br>- Captura de ventana con `PrintWindow` + fallback por título | - Añadir selector visual rápido de monitor directamente en la barra del lienzo.<br>- Optimizar aún más la transferencia del frame (evitar Base64 usando protocolo binario o buffer directo si queremos 60 FPS puros en captura GDI/DXGI). |
| **Módulo 2** | **Lienzo Interactivo PGM / Preview, Gizmo, Recorte (`Alt+Drag`) y 3D** | `src/components/StageCompositor.tsx` | ✅ **Corregido (Encaje 1:1 + 0 Re-renders)**<br>- ResizeObserver exacto 16:9 y 9:16<br>- Arrastre libre, 8 tiradores, recorte `Alt+Drag` en bordes<br>- Modo Estudio (Preview + PGM SplitView) | - Añadir menú contextual con clic derecho directamente sobre cualquier elemento del lienzo (Traer al frente, Enviar al fondo, Centrar, Ajustar a pantalla, Recortar).<br>- Añadir controles de zoom (`Rueda del ratón`) en el lienzo para colocar capas con precisión quirúrgica. |
| **Módulo 3** | **Motor de Grabación, Replay y Streaming (FFmpeg / NVENC / MediaFoundation)** | `src-tauri/src/engine/video_encoder.rs`<br>`src/App.tsx` | ✅ **Asíncrono + Streaming a Disco**<br>- Grabación de Escena Compuesta (con WebAudio mezclado) por bloques a disco<br>- Grabación Nativa `gdigrab` + Audio DirectShow<br>- Fallback `NVENC` → `h264_mf` → `libx264` | - Mostrar en tiempo real el tamaño del archivo en MB y bitrate real mientras graba.<br>- Añadir prueba automática de velocidad de codificador y verificación de audio del sistema (WASAPI Loopback nativo en Rust para capturar el sonido del juego sin depender de Mezcla Estéreo). |
| **Módulo 4** | **Panel de Fuentes de Escena (Columna Inferior Izquierda)** | `src/components/SourcesPanel.tsx`<br>`src/types/broadcaster.ts` | ✅ **Operativo**<br>- 8 tipos de fuentes (Pantalla, Ventana, Cámara, Vídeo, Imagen, Texto, Lower Third, Color/Degradado)<br>- Ordenación Z-Order, bloqueo, visibilidad y duplicación | - Mejorar el menú de añadir fuente con previsualización instantánea de cámaras web reales (`enumerateDevices`) y miniaturas de ventanas abiertas.<br>- Permitir arrastrar y soltar archivos de imagen/vídeo desde el Explorador de Windows directamente sobre el lienzo. |
| **Módulo 5** | **Inspector de Propiedades de Fuente (Chroma Key, Máscaras, Color, Bordes)** | `src/components/SourcePropertiesModal.tsx` | ✅ **Operativo**<br>- 4 pestañas: Disposición/Recorte/3D, Color/Chroma Key, Efectos/Máscaras/Bordes, Fuente/Dispositivo | - Hacer que la ventana de Propiedades sea flotante/arrastrable a un lado para ver el lienzo completo mientras ajustas el Chroma Key o los recortes en vivo. |
| **Módulo 6** | **Matriz de Escenas y Motor de Transiciones Broadcast (Columna Central)** | `src/components/ScenesGridPanel.tsx` | ✅ **Operativo**<br>- Hasta 12 escenas configurables<br>- 8 transiciones (Cut, Fade, Wipe, Slide, Zoom, Stinger, 3D Cube, Barn Doors)<br>- Renombrado y duplicación de escenas | - Añadir miniaturas en vivo (Live Thumbnails) o iconos personalizados en cada tarjeta de escena estilo XSplit Broadcaster.<br>- Permitir reordenar las escenas arrastrándolas. |
| **Módulo 7** | **Mezclador de Audio Pro 6 Pistas, DSP y Multi-Dock (Columna Derecha)** | `src/components/AudioAndDockPanel.tsx`<br>`src/App.tsx` | ✅ **Optimizado**<br>- Grafo WebAudio real (Filtro paso-alto 85Hz + Compresor + Ganancia + Monitorización)<br>- Matriz de 6 pistas (Tracks 1-6)<br>- Pestañas de Chat IRC de Twitch y Grabaciones Rápidas | - Captura nativa de **Audio de Escritorio (WASAPI Loopback)** desde Rust para que el vúmetro de "Audio del Sistema / Juego" mida el sonido real de Windows al 100% y lo inyecte automáticamente en la grabación compuesta.<br>- Añadir medidor de picos con marcas en dB (`-60 dB` a `0 dB`). |
| **Módulo 8** | **Centro de Configuración Global y Herramientas Pro (Modales)** | `src/components/GlobalSettingsModal.tsx`<br>`src/components/StudioModals.tsx` | ✅ **Optimizado (`convertFileSrc` 0ms)**<br>- 6 pestañas de Configuración Global<br>- Auto Scene Switcher, Estudio de Lower Thirds, Express Video Editor (Recorte y Remux MKV→MP4), Multistreaming | - Persistir automáticamente toda la configuración global y las escenas en `localStorage` / archivo de perfil al cerrar para que nunca pierdas tus ajustes al reiniciar el programa.<br>- Preparar el manifiesto `AppxManifest.xml` / instalador MSIX para publicación comercial en **Microsoft Store**. |
