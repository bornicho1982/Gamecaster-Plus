# Especificación Técnica Clean-Room: Arquitectura de XSplit Broadcaster (v4.6.2609.2802)

> **Declaración de Auditoría Clean-Room:**
> Este documento ha sido generado mediante ingeniería inversa estática de lectura sobre los binarios nativos (`XSplitBroadcaster.dll`, `VHMediaCOM.dll`, `XSplitScrCapUWP.dll`, `XGS64.exe`), ensamblados gestionados (`XSplit.Core.exe`, `Interop.XSplitBroadcasterLib.dll`, `Interop.VHMediaCOMLib.dll`, `SplitMediaLabs.Xsplit.AddinFramework.dll`, `XSplit.Contracts.dll`), shaders HLSL (`re3/*.re3`), manifiestos COM y esquemas de configuración (`Placements.bpres`, `XSplit.Core.config.xml`, `FiltersEx2.xml`, `res/*.json`) instalados en `C:\Program Files\XSplit\Broadcaster` y `C:\ProgramData\XSplit\Broadcaster`.
> **Cumplimiento Estricto:** Cero código propietario, cero logotipos, cero iconos y cero activos gráficos de XSplit o SplitmediaLabs han sido ni serán copiados. Toda la información documentada describe exclusivamente contratos de interfaz, estructuras de datos, fórmulas matemáticas de shaders y flujos de subsistemas para construir desde cero un estudio de producción audiovisual propio y superior.

---

## Evidencias Forenses Registradas con REA (Ghidra 12.1.4 & Metadata Provider)

| Artefacto Analizado | Tipo / Arquitectura | SHA-256 / MVID | ID de Evidencia REA |
| :--- | :--- | :--- | :--- |
| `XSplit.Core.exe` | PE32+ x86_64 (.NET 4.8 Shell, 1.934 TypeDefs, 12.260 MethodDefs) | MVID `bf615ad3-5d48-4bcf-a144-de57f9b6078e` | `ev_7419de4cbd13d202df98a08a773cbc7f74ee5c9600466e29384e8a05d69e4e1b` |
| `Interop.XSplitBroadcasterLib.dll` | PE32+ x86_64 (COM Interop de `XSplitBroadcaster.dll`) | MVID `e476849e-0167-495d-baee-f20cbfecb8d4` | `ev_710792dd570d4b4b6edfa26049d299881c62855fbbce439370cff0d8004aca8c` / `ev_ea4ad2529dbc65f4d37142ff61caf5edbac7698127f79dfe9b6044d32d048d24` |
| `Interop.VHMediaCOMLib.dll` | PE32+ x86_64 (COM Interop de `VHMediaCOM.dll`, TLB `{7F9079F6-DCBA-40C4-AD11-47D6CB553F5F}`) | MVID `4ca2fc74-3a95-4b11-948e-52957ef20602` | `ev_bb313a58fd1289581b86b76a70d039f35a395756bef8712ed7ab7b0387e60e1f` |
| `SplitMediaLabs.Xsplit.AddinFramework.dll` | PE32+ x86_64 (Motor de Plugins `.plg` y Cifrado) | MVID `ef96e627-f83f-488e-a76f-f1bd3df887a0` | `ev_f1428af795c1d27527c269d36fe92c4e2b19e0b8a449b41423593ce6863eb965` |
| `XSplit.Contracts.dll` | PE32+ x86_64 (Contratos IPC y Telemetría) | MVID `e9e5be3e-6cc9-4f7c-8bf4-d977199cf8ab` | `ev_bb5d4d9d59eeb367ec8222561cffbac25e99306bff4d68b6020abc88ee27bf8c` |
| `XSplitScrCapUWP.dll` | PE32+ x86_64 C++/WinRT Nativo (`Windows.Graphics.Capture`) | SHA-256 `7f1f107f416ee1e6d0e690efd9f626bddefff59744a042790ae7870c10d711f2` | `ev_c8e7ee18ef7355409c2c8e26a2a9aebc6806c2594888dc7baee7081b53bd2ccf` / `ev_adbbf30030f290c98a0a0f962f82ade87ea88ecf3c54cfe548c10f8ccf0062ed` |

---

## 1. Arquitectura del Motor de Composición y Escenario Interactivo (`Stage`)

### 1.1. Arquitectura Híbrida de 3 Capas
El estudio se divide en tres anillos de ejecución desacoplados para evitar que la interfaz de usuario bloquee el bucle de renderizado de vídeo a 60/120/240 FPS:

1. **Capa de Presentación y Orquestación (`XSplit.Core.exe` + `libcef.dll` + `Xjs.dll`):**
   - El shell principal gestiona las ventanas nativas, el grafo de presentación (`.bpres`), los atajos globales (`HotKeyConfig28`) y aloja vistas Chromium Embedded Framework (CEF) para los paneles de propiedades, tienda de plugins, mezclador de audio y fuentes HTML5/Widgets.
   - `Xjs.dll` y `IXSplitBroadcasterScriptDllContext` exponen un puente RPC bidireccional (`CallFunc(string func, string param)`, `get_Property(string prop)`, `set_Property(string prop, string val)`, evento `_IXSplitBroadcasterEvents.OnEvent`) entre la UI en HTML/JS y el motor C++ nativo.

2. **Servidor COM de Control de Escenario (`XSplitBroadcaster.dll` — CLSID `{D2AC286E-B842-44C2-89B8-81B68BF37E29}`):**
   - Implementa `IXSplitBroadcaster`, que administra la lista activa de fuentes de vídeo (`IXSplitBroadcasterVideoItem`), el mezclador maestro (`get_VideoMixer`, `get_VideoMixerEngine`), la duplicación de texturas en GPU (`IXSplitBroadcasterDuplication` mediante `SharedHandle` y `SharedHandleNT` DXGI) y el contador de fotogramas perdidos (`get_StreamDrops`).

3. **Motor Multimedia y Compositor Direct3D 11/12 (`VHMediaCOM.dll` — TLB `{7F9079F6-DCBA-40C4-AD11-47D6CB553F5F}`):**
   - **Compositor de 3ª Generación (`VHCOMRenderEngine3`, CLSID `{947725DA-7341-4824-A8F1-BAD8BE437871}`):** Evolución de `VHCOMRenderEngine` y `VHCOMRenderEngine2`. Mantiene un grafo de objetos renderizables (`IVHCOMRenderEngineObject` y `IVHCOMRenderEngine3ObjectBkgRem`) en memoria de vídeo (VRAM).
   - **Modos de Salida Simultánea (`ViewsOutputCount`):** Permite componer simultáneamente un lienzo horizontal principal (`resolution:0`, ej. `1920x1080` 16:9) y un segundo lienzo vertical (`resolution:1` / `ResolutionOut1`, ej. `720x1280` o `1080x1920` 9:16 Portrait) para emisión dual (Twitch/YouTube + TikTok/Shorts/Reels).
   - **Anti-Aliasing en GPU:** Soporta `MSAA` (`MSAA_Str="1,0"`) y `MLAA` sobre las aristas de las capas rotadas en 3D.

---

### 1.2. Subsistemas de Captura de Fuentes (`Sources`)
Cada elemento añadido al escenario (`Stage`) implementa un nodo `IVHCOMRenderEngineObject` alimentado por uno de los 10 motores de entrada:

1. **Captura de Pantalla / Monitor / Ventana / Región (`type_screen`):**
   - **Motor Moderno (`XSplitScrCapUWP.dll`):** Decompilado con Ghidra (`XSplitScrCapUWPCreate` en `0x180005690` y `FUN_180004330` en `0x180004330`):
     - Verifica `Windows.Foundation.UniversalApiContract` v8 (Windows 10 1903+) para instanciar `GraphicsCaptureItem` sobre un `HWND` o `HMONITOR`.
     - Crea un `Direct3D11CaptureFramePool` con formato `DXGI_FORMAT_B8G8R8A8_UNORM` (`0x57 = 87`) y `2` buffers en anillo sobre el dispositivo D3D11 (`CreateDirect3D11DeviceFromDXGIDevice`), registrando un delegado `TypedEventHandler` (`FUN_180004f60`) libre de copias por CPU.
     - Consulta `UniversalApiContract` v10 (`0x0A`) para activar/desactivar la captura del cursor (`IsCursorCaptureEnabled` / `show_mouse`) y `UniversalApiContract` v12 (`0x0C`) para ocultar o mostrar el borde amarillo de Windows 11 (`IsBorderRequired` / `show_yellow_border`).
   - **Motor Legacy / Región (`VHScrCap64.ax` — `VHScrCap`, `VHScrCapEnum`, `VHScrCapWndEnum`):** Basado en DXGI Desktop Duplication / GDI con opciones de `exclude_xsplit_window` (`SetWindowDisplayAffinity`), `optimize_window_capture`, `capture_layered_windows`, `client_area` (recorte automático de barra de título y bordes de ventana mediante `DwmGetWindowAttribute` + `MapWindowPoints`), `show_mouse_clicks` (halo visual al hacer clic) y `track_window_title`.

2. **Captura de Juegos de Alto Rendimiento (`type_game`):**
   - Implementada mediante el servicio `XGS64.exe`, el hook `gs\XSplitGameSource64.dll` y la capa implícita de Vulkan `VK_LAYER_XSPLIT_64.json`.
   - Intercepta el `Present` de DirectX 8, 9, 10, 11, 12, OpenGL y Vulkan, exportando la textura del backbuffer mediante `IXSplitGameSourceBuffer` (Shared NT Handles en GPU).
   - Parámetros configurables: detección automática de juego a pantalla completa (`addmenu_game_auto`) o proceso específico, `show_mouse`, `enable_special_optimization`, `enable_playback_smoothness` (interpolador de cadencia de FPS con factor porcentual), `limit_game_fps` (limitador de FPS inyectado en el juego), `allow_transparency` y `offline_image` (imagen estática o placeholder cuando el juego está cerrado).

3. **Cámara Web y Capturadoras de Vídeo HDMI/SDI (`type_live`):**
   - Gestionadas por `XSplitCameraManager` (`{80DEAE48-CF83-4AA3-B712-D037E290BBF2}`), `DirectShowLib-2005.dll` y filtros `DecklinkVideoSource` / `DecklinkAudioSource`.
   - Soporta selección de resolución, espacio de color (`videosubtype`, ej. MJPEG `{47504A4D-...}`, NV12, YUY2), `frametime` (ej. `333333` hnsec = 30 FPS, `166667` = 60 FPS), controles UVC Hardware (`camctrl` / `vprocamp`: exposición, zoom, foco, balance de blancos), `hdr` (Alto Rango Dinámico), desentrelazado (`deinterlace`), **Retraso de Audio en ms** (`delay` para sincronía labial), **Detección de Silencio** (`threshold` + `silence_period`) y **Modo de Bajo Consumo** (`keep_active_when_not_shown` apaga la cámara cuando no está visible en la escena activa).

4. **Archivos Multimedia de Vídeo y Audio (`type_file`):**
   - Decodificados mediante FFmpeg (`avcodec-61.dll`, `avformat-61.dll`, `swscale-8.dll`) y aceleración por hardware (`AcceleratedVideoPlayback`).
   - Controles de transporte y edición no destructiva: recorte de punto de entrada (`start_at`) y salida (`end_at`), modo de repetición (`once`, `forever`, `custom` N veces), acción al finalizar (`nothing`, `rewind`, `loop`, `hide`, `transparent`), `start_on_load`, `remember_playback_position`, **sistema de Cuepoints** (marcadores de tiempo `Start`, `End`, `Cut`, `Pause`, `Resume` editables sobre la línea de tiempo del vídeo) y enrutamiento de audio (`System Sound` vs `Stream Only`).

5. **Imágenes (`type_image`) y Presentación de Diapositivas (`imageslideshowplg.plg`):**
   - Carga PNG, APNG, JPEG, GIF animado, BMP y WebP con soporte de canal alfa completo. El plugin de diapositivas permite listas de imágenes con temporizador de transición, orden aleatorio y bucle.

6. **Texto, Rótulos y Tercios Inferiores (`type_text` / `titleplg.plg` / `lowerThirdSourceplg.plg`):**
   - Renderizado vectorial de texto con fuentes personalizadas, grosor, cursiva, color de relleno, contorno (`outline`), sombra, opacidad, alineación y animaciones de entrada/salida o desplazamiento tipo *ticker* (marquesina horizontal/vertical).

7. **Página Web / Navegador CEF (`type_html`):**
   - Instancia aislada de Chromium off-screen con soporte de transparencia alfa, resolución virtual personalizada (`width`, `height`), FPS configurables (`enable_60_fps`), inyección de CSS personalizado (`overwrite_css`), inyección de JavaScript (`add_custom_js`), bloqueo de clics/scrollbars (`disable_clicks`, `disable_scrollbars`), aceleración por navegador (`BrowserSourceOptimization`) y recarga automática al entrar en la escena (`reload_on_scene_enter`).

8. **Fuentes de Red y Texturas Compartidas (`type_ndi`, `Spout2`, `type_stream`):**
   - **NDI® (`Processing.NDI.Lib.Advanced.x64.dll`):** Receptor `VHMediaCOM.NdiSource` con descubrimiento mDNS en LAN y soporte de canal alfa.
   - **Spout2 (`XjsSpout2.dll` + `SpoutLibrary.dll`):** Receptor `XjsSpout2.Spout2Source` para compartir texturas OpenGL/DirectX en GPU entre aplicaciones (ej. Unreal Engine, TouchDesigner, VTuber Studio) con modos alfa `Opaque`, `Normal` y `Premultiplied`.
   - **Streams Remotos (`type_stream`):** Ingesta RTMP (`rtmp.url`, `rtmp.streamName`, `rtmp.buffer` en segundos) y RTSP (`TCP`, `UDP`, `HTTP`, `Custom`).

9. **Escena Vinculada (`type_scene`) y Fuente de Fondo (`backgroundSourceplg.plg` / `colorsourceplg.plg`):**
   - Permite anidar cualquier escena completa como una capa dentro de otra escena (composición jerárquica), así como generadores de color sólido y degradados.

10. **Repetición Instantánea (`type_replay`):**
    - Fuente especializada conectada al buffer circular de salida (`Recording` o `Stream`), con duración de buffer (`bufferLength`), tiempo de repetición (`replayTime`), atajo de teclado disparador (`triggerHotkey`) y guardado en disco al reproducir (`saveToDiskOnPlayback`).

---

### 1.3. Transformaciones Interactivas en el Lienzo (`Stage`) y Pipeline de Shaders Por Capa
Todas las fuentes del escenario pasan por un pipeline de transformación geométrica y de píxeles en `VHCOMRenderEngine3`:

1. **Geometría, Posición, Tamaño y Agrupación (`layouttab.*`):**
   - Coordenadas `(x, y)` y dimensiones `(width, height)` con bloqueo de relación de aspecto (`keep_aspect_ratio`), bloqueo de posición en el lienzo (`lock_position`) y ajuste magnético a cuadrícula (`SnapToGrid`).
   - Acciones rápidas de encuadre: Ajustar a pantalla (`Ctrl + Shift + F`), redimensionar a `1/4` o `1/8` del lienzo, alinear a bordes/centro, agrupar múltiples fuentes (`group`) y **Pegar Vinculado (`paste_linked`)** para compartir la misma instancia en memoria (`keep_in_memory`) entre múltiples escenas.
   - Orden de apilamiento Z (`zorder` en el constant buffer `p1[3]` del shader), con controles para subir/bajar capa y mostrar/ocultar (`eye` icon).

2. **Recorte Interactivo de Bordes (`Cropping` — `Alt + Arrastrar`):**
   - Recorte independiente en píxeles o porcentaje para los 4 bordes (`top`, `bottom`, `left`, `right`) manteniendo la escala original del contenido, más función `autocrop` (detección automática de bandas negras).

3. **Rotación 2D/3D y Proyección (`Shift + Arrastrar`):**
   - Matriz de rotación tridimensional con ángulos Euler independientes: **Eje X (`x_rotation` / Pitch)**, **Eje Y (`y_rotation` / Yaw)** y **Eje Z (`z_rotation` / Roll)** de `-180°` a `+180°`.
   - Rotación rápida en pasos de `90°` horario/antihorario, volteo horizontal (`flip_horizontal`), volteo vertical (`flip_vertical`) y proyección esférica de vídeo 360°.

4. **Corrección de Color, Chroma Key y Eliminación de Fondo por IA (`colortab.*`):**
   - Ajustes de color primarios: Brillo (`brightness`), Contraste (`contrast`), Matiz (`hue`), Saturación (`saturation`), Opacidad (`opacity` 0–100%), Suavizado Alfa (`alpha_smoothing`) y Rango Dinámico Completo (`full_dynamic_range` 0–255 vs 16–235).
   - **3 Modos de Recorte de Fondo (`Keying`):**
     1. **Chroma Key (HSL / YUV):** Selección de color primario (`Green`, `Blue`, `Red`) o cuentagotas en vivo (`eyedropper`), con controles de Umbral (`threshold`), Exposición (`exposure`) y Anti-aliasing (`None`, `Low`, `High`).
     2. **Color Key (RGB):** Recorte por tolerancia RGB directa.
     3. **Eliminación Automática de Fondo por IA (`Automatic Background Removal`):** Ejecutada por `VHCOMRenderEngine3ObjectBkgRem` + `Smdnn.dll` + `DirectML.dll` (modelos neuronales `.nmx` en `SmdnnModels\`). Segmenta la silueta humana sin pantalla verde con perfiles de calidad (`Low`, `Standard`, `High`, `Highest`, `NPU`), aceleración por GPU y opción **Eliminar Silla (`remove_chair`)**.

5. **Máscaras de Forma, Sombra Paralela, Bordes y Filtros HLSL (`transitiontab.*` + `re3/effects.re3` + `re3/filters.re3`):**
   - **Enmascaramiento (`Masking`):** Formas vectoriales (`Rectangular`, `Rounded`, `Oval`, `Diamond`) o archivo de imagen con máscara alfa personalizada, aplicable a la fuente o al escenario.
   - **Sombra Paralela (`Drop Shadow`):** Posición direccional, Tamaño (`size`), Distancia/Desplazamiento (`distance`), Desenfoque (`blur`), Opacidad y Color.
   - **Borde (`Border`):** Grosor (`thickness`), Radio de esquina redondeada (`radius`), Color y Opacidad.
   - **14 Efectos y Filtros de Pixel Shader HLSL (`re3/effects.re3` & `re3/filters.re3`):**
     - Todos reciben un factor de intensidad `pc0[0]` (`0.0` a `1.0`) en `cbuffer myPrivateConst : register(b2)`:
       1. `bloom`: Extracción de altas luces (`BloomThreshold = 0.25`, `BloomIntensity = 1.5`) combinada con atenuación de quemado en base.
       2. `monochrome`: Conversión por luminancia Rec.601 (`dot(rgb, float3(0.30, 0.59, 0.11))`) multiplicada por `FilterColor`.
       3. `oldmovie`: Tono sepia envejecido (`float3(0.9, 0.8, 0.6)`), arañazos verticales animados (`ScratchAmount`) y viñeteado con fluctuación lumínica.
       4. `sketchpencilstroke`: Operador Laplaciano de 4 muestras (`brushSize = 0.007`) invertido para simular dibujo a lápiz.
       5. `invertcolor`: Inversión lineal `1.0 - color.rgb`.
       6. `magnifysmooth`: Lupa esférica suave con `InnerRadius = 0.19`, `OuterRadius = 0.6`, `MagnificationAmount = 2.1`.
       7. `cool` / `warm`: Tonificación bitonal interpolando sombras (`DarkColor`) y altas luces (`LightColor`) con desaturación parcial.
       8. `sincity`: Efecto alto contraste blanco y negro con preservación selectiva del canal rojo (`smoothstep(0.1, 0.25, colorin.r - bwcolor)`).
       9. `median3x3` / `median5x5`: Reducción de ruido no lineal mediante redes de ordenación rápida (*sorting networks* de 6 y 25 registros en GPU).
       10. `lut` (*Look-Up Table 3D*): Mapeo de color tridimensional usando una textura atlas `512x512` (`8x8` bloques de `64x64`, ej. `images\default_LUT.png`) con interpolación bilineal entre planos azules (`floor(color_b)` y `ceil(color_b)`).
       11. `blur`: Desenfoque de disco de Poisson de hasta 64 muestras precalculadas (`blur_x[128]`, `blur_y[128]`).
       12. `sharpen`: Kernel convolucional `3x3` de realce de bordes (`9 * center - neighbors`).
       13. `smoothen`: Kernel convolucional `3x3` de media (`sum / 9.0`).

6. **Transiciones Individuales de Entrada/Salida por Fuente (`transitiontab.in` / `transitiontab.out`):**
   - Cada fuente puede animarse de forma independiente al activarse/desactivarse su visibilidad (`eye`) usando cualquiera de los shaders de transición (`Fade`, `Clock`, `Collapse`, `Move Left/Right/Top/Bottom`, `Zoom`, `Ease Out Bounce`, `Ease Out Elastic`, `Ease In Out Back`) con duración en milisegundos (`ms`) y curva de suavizado (`easing`: `none`, `in`, `out`, `inout`).

---

## 2. Matriz de Escenas, Modo Estudio (`Preview Editor`) y Transiciones

### 2.1. Esquema de Presentación `.bpres` (`Placements.bpres`)
Las presentaciones de XSplit Broadcaster se almacenan en archivos XML híbridos con bloques JSON incrustados:
- `<configuration cur="0" pidvolume="1.0" Version="4.6.2609.2802">`: Nodo raíz que indica el índice de escena activa (`cur`) y el volumen maestro.
- `<placement name="Scene 1" id="{GUID}" preset_id="{GUID}" trid="cut" trtime="500" trvol="1.0">`: Cada nodo `<placement>` representa una **Escena** completa con su lista de capas (`<item>`), sub-preajustes de escena (`BroadcasterScnPreset1..3`) y su transición específica.
- `<global>`: Registra dispositivos físicos globales (como cámaras web identificadas por su moniker USB PnP) para evitar reabrir el driver al cambiar de escena.
- `<scriptproperty __map_id="global">`: Contiene diccionarios clave-valor `<presproperty>`, incluyendo:
  - `AllSettings`: Objeto JSON con `GeneralSettings` (`Resolution`, `ResolutionOut1`, `Framerate`, `SplitView`, `SnapToGrid`, `Transition`, `TransitionTime`), `GeneralTabSettings`, `AudioSettings` (grafo XML del motor de audio multipista `AudioEngine: 3`) y `AdvancedSettings`.
  - `XmlSettings_HotKeyConfig28`: Mapa de atajos de teclado globales.
  - `XmlSettings_Internal`: Configuración detallada de canales de salida (`LocalRecording`, `Twitch`, `CustomRTMP`, etc.) y parámetros de codificador (`libh264nvext`, bitrate, perfil, VBV buffer).
  - `XmlSettings_Resolutions`: Catálogo de resoluciones 16:9 (`720p` a `4K 2160p`) y 9:16 verticales (`720p Portrait`, `1080p Portrait`).

### 2.2. Matriz de Escenas y Modo Estudio (`Split Mode` / `Preview Editor`)
- **Matriz de Escenas (`Scene Grid`):** Panel inferior que muestra todas las escenas en cuadrícula con miniaturas en vivo (`ThumbnailPreview`), indicador de escena activa en el aire (`LIVE`), control de silencio rápido de escena, duplicación/renombrado/reordenación y asignación directa de atajos (`BroadcasterScene1` a `BroadcasterSceneN`).
- **Modo Estudio de Doble Monitor (`Preview Editor` / `SplitView`):**
  - Al activar `SplitView`, el área central del estudio se divide en dos monitores lado a lado (`SplitViewSize: 0.5`):
    - **Izquierda — Editor de Vista Previa (`Preview`):** Permite seleccionar cualquier escena inactiva, añadir/mover/redimensionar fuentes, cambiar textos o probar filtros en privado sin alterar la emisión.
    - **Derecha — Salida en Vivo (`Program / PGM`):** Muestra exactamente lo que se está transmitiendo y grabando.
  - **Botón `Push Live` (`Transmitir en vivo` / `Empuje en vivo`, atajo `BroadcasterPushLive`):** Ejecuta la transición configurada para transferir la escena de `Preview` a `Program`, con opción de guardado automático de cambios (`PEAutoSave`).

### 2.3. Motor de Transiciones de Escena (`re3/transitions.re3` y `Stingers`)
1. **15 Transiciones de Shader en GPU (`re3/transitions.re3`):**
   - Ejecutadas por `VHCOMRenderEngine3` pasando el progreso normalizado `clock` (`p0[3]` de `0.0` a `1.0`) al Pixel Shader:
     - **Básicas:** `cut` (conmutación en `clock >= 0.5`), `fade` (`Out.a *= 1.0 - clock`), `fadetoblack` (fundido a negro intermedio en `clock = 0.5`), `fadetowhite` (fundido a blanco en `clock = 0.5`).
     - **Geométricas / Barridos Radiales:** `clock` (barrido polar mediante `atan2`), `fan` (abanico cuádruple `fmod(atan2(...), PI/2)`), `collapse` (contracción radial desde los bordes hacia el centro), `hole` (apertura circular desde el centro hacia afuera).
     - **Desplazamientos y Bandas:** `move_left`, `move_right`, `move_top`, `move_bottom`, `move_left_right` (persiana horizontal sinusoidal de 10 bandas alternadas `sin(PI * 2 * 10 * y)`), `move_top_bottom` (persiana vertical de 10 bandas alternadas).
     - **Deformación y Curvas Cinemáticas:** `wave` (ondulación sinusoidal X/Y con fundido), `zoom` (escalado lineal desde el centro), `easeOutBounce` (rebote físico de Robert Penner), `easeOutElastic` (resorte elástico amortiguado `pow(2, -10*t) * sin(...)`), `easeInOutBack` (anticipación y sobreimpulso con `s = 1.70158`).
2. **Transiciones Stinger con Canal Alfa (`stinger_dialog_chrome` + `webm/stinger_howto.txt`):**
   - Reproduce un archivo de vídeo `.webm` (VP8/VP9 con canal alfa y audio Vorbis/Opus, ej. `Demo stinger_800.webm`) o secuencia `.png`/`.mov` sobre las dos escenas.
   - **Punto de Transición (`Transition Point ms`):** Milisegundo exacto (ej. `800 ms`) en el que la animación cubre toda la pantalla y el motor conmuta instantáneamente la escena A por la escena B debajo del vídeo Stinger, con control de volumen de audio de transición (`trvol`).
3. **Gestor de Reglas de Transición (`Transition Override Manager` — `transitionmanagerplg.plg`):**
   - Permite definir reglas específicas `Escena Origen -> Escena Destino` (ej. de *Intro* a *Juego* usar `Stinger 800ms`, pero de *Juego* a *Cámara Completa* usar `Fade 300ms`) y marcar transiciones favoritas.

---

## 3. Desglose Completo de Funciones Pro / Premium (A Desbloquear al 100%)

A partir de la auditoría de `purchase_point_chrome.es.lang.json`, `stream_settings_chrome.es.lang.json`, `Placements.bpres` y `VHMediaCOM.dll`, se identifican todas las capacidades avanzadas y restricciones de licencia que nuestro nuevo estudio implementará **100% desbloqueadas de serie y sin marcas de agua**:

| # | Función Pro / Premium en XSplit Broadcaster | Implementación Interna Identificada | Estado en Nuestro Estudio Clean-Room |
| :- | :--- | :--- | :--- |
| **1** | **Escenas Ilimitadas y Preajustes por Escena** | Eliminación del límite gratuito de 4 escenas (`purchasePoint.Header2`) y soporte de sub-presets por escena (`BroadcasterScnPreset1..3`). | **100% Desbloqueado** (Escenas y presets ilimitados). |
| **2** | **Resoluciones 4K60, 1080p240 y Lienzo Dual (16:9 + 9:16) sin Marca de Agua** | Eliminación de `CreateWatermarkFilter` en `XSplitBroadcaster.dll` (`streamSettings.freeUserLimitationStreamResoFps`). Soporte de `3840x2160`, `2560x1440`, `1920x1080` hasta 240 FPS y salida vertical simultánea (`ResolutionOut1`). | **100% Desbloqueado** (Cero marcas de agua en cualquier resolución/FPS). |
| **3** | **Modo Estudio (`Preview Editor` / `Split Mode`)** | Edición simultánea de escena en vista previa con botón `Push Live` (`purchasePoint.MessagePreviewEditor`). | **100% Desbloqueado** en la barra superior del estudio. |
| **4** | **Codificación Hardware GPU Multi-Vendor y Grabación Multipista** | `VHMultiWriterExt2.exe` con NVENC (`libh264nvext`, Preset P6, Spatial AQ, CBR/VBR/ConstQP), Intel QSV (`libvpl.dll`), AMD AMF (`amd_ags_x64.dll`), x264 y grabación MKV/MP4/FLV con múltiples pistas de audio. | **100% Desbloqueado** (Auto-detección de NVENC RTX / AMF / QSV / x264). |
| **5** | **Mezclador de Audio de 6 Pistas, Retraso (`ms`) y Supresión de Ruido por IA** | `XSplitAudioEngine` (Modo 3) con 6 buses (`Track 1..6`), compensación de delay en `ms`, monitoreo de audio independiente, `XSplitAudioSoxDSP` y supresión de ruido `NSTransform.dll` (`DeepFilterNet3` ONNX + `NVidiaRTXNoiseSuppressionDSP` + `WebRTC`). | **100% Desbloqueado** (Mezclador multipista, delay ms, filtros DSP y Noise Gate/Suppression). |
| **6** | **Chroma Key Avanzado + Eliminación de Fondo por IA** | Keying HSL/YUV/RGB con suavizado alfa + segmentación neuronal `VHCOMRenderEngine3ObjectBkgRem` (`Smdnn.dll` + `DirectML.dll`). | **100% Desbloqueado** por fuente de cámara/vídeo. |
| **7** | **Cámara Virtual (`Virtual Cam`), Salida NDI®, Spout2 y Proyector de Monitor** | `XSplitBroadcasterCam.dll` / `XSplitVCamServer64.exe` (expone el lienzo PGM como webcam para Discord/Zoom), `VHMediaCOM.NdiRenderer`, `Spout2` y `Projector` a pantalla completa sin bordes (`ProjectorBorder`) en cualquier monitor físico. | **100% Desbloqueado** (Salidas de Proyector, Virtual Cam y streaming local). |
| **8** | **Retraso de Transmisión (`Stream Delay`) y Programador (`Stream Schedule`)** | `IVHStreamDelay` (buffer anti-*stream sniping* en memoria) y `XSplitStreamSchedule` (`XSplit.StreamScheduler.Common.dll`). | **100% Desbloqueado**. |
| **9** | **Editor de Vídeo Express (`Express Video Editor`) y Remux/Reparación MP4** | `IXSplitEditingEngine` (`recordings.menu_edit_video`: recorte rápido y unión de clips grabados) + `IVHCOMRemux` (`recordings.menu_repair_video`: conversión/reparación instantánea a MP4 sin recodificar). | **100% Desbloqueado** en el gestor de grabaciones del estudio. |

---

## 4. Arquitectura de Extensiones y Plugins Integrados de Fábrica

### 4.1. Mecanismo de Carga de Plugins (`.plg`, `AddinFramework.dll` y `repos/`)
El ecosistema de extensiones de XSplit Broadcaster opera mediante tres subsistemas que hemos auditado con REA:
1. **Empaquetado Cifrado `.plg` (`SplitMediaLabs.Xsplit.AddinFramework.dll`):**
   - Los archivos en `C:\ProgramData\XSplit\Broadcaster\Extensions\*.plg` y `PlgPlugins\*.plg` están empaquetados y cifrados en Base64/AES por `Xsplit.AddinFramework.Security.Crypto` y `Xsplit.AddinFramework.Utils.FilePackager` (`PackageStream`).
   - En tiempo de ejecución, `AddinManager` desencripta el paquete en memoria y lo monta bajo el esquema `html:script:plugin:<nombre>` dentro de CEF, inyectando el puente `Xjs.dll` para que el plugin lea y modifique propiedades de la presentación (`<scriptproperty __map_id="html%3Ascript%3Aplugin%3A...">` en `Placements.bpres`).
2. **Plugins de Salida Nativa (`repos/*/*.dll`):**
   - Cada plataforma de transmisión (`Twitch.dll`, `YouTubeLive.dll`, `Kick.dll`, `FacebookLive.dll`, `CustomRTMP.dll`, `Restream.dll`, `AmazonIVS.dll`, `LocalStreaming.dll`, `SplitMediaLabs.LocalRecording.dll`) es un ensamblado .NET que provee el diálogo Pre-Stream (`prestream_dialog_*_chrome.es.lang.json`), autenticación OAuth, prueba de ancho de banda y cadena de configuración RTMP/RTMPS para `VHMultiWriterExt2.exe`.

### 4.2. Especificación de las 7 Extensiones que Integraremos de Fábrica en Nuestro Estudio
En lugar de obligar al usuario a descargar paquetes `.plg` externos, nuestro nuevo estudio incorporará nativamente en el núcleo (Rust + React/TypeScript) las 7 herramientas clave:

1. **Audio Mixer Pro (`audiomixerplg.plg` + `audioEffectsplg.plg`):**
   - Faders individuales por dispositivo físico (Micrófono, Altavoces/Juego) y por fuente multimedia de la escena.
   - Vúmetros de pico/RMS en tiempo real (`period:1000000`), ganancia (`VHAudioGain`), mezcla mono (`monomix`), silencio (`mute`), **Retraso de sincronización en milisegundos (`0` a `2000 ms`)**, matriz de enrutamiento a **6 pistas de audio independientes (`Track 1..6`)** y cadena DSP (Puerta de ruido, Compresor, Supresión de ruido IA).

2. **Audio por Escena (`perSceneAudioplg.plg`):**
   - Permite vincular un perfil de volumen y estado de silencio específico de cada micrófono/dispositivo a cada escena individual (ej. en escena *"Ya Volvemos / BRB"* silenciar automáticamente el micrófono y subir la música al 100%; al volver a *"Escena Juego"*, restaurar el micrófono al 100% con fundido cruzado suave).

3. **Cambiador Automático de Escenas (`sceneSwitcherplg.plg`):**
   - Demonio nativo en Rust que monitoriza cada 250 ms la ventana activa en primer plano de Windows (`GetForegroundWindow` + ruta del ejecutable / título de ventana) o un temporizador cíclico, disparando automáticamente la transición hacia la escena asignada (ej. cuando el juego está en primer plano -> *Escena Gameplay*; al hacer `Alt+Tab` al navegador o escritorio -> *Escena Charlando / Desktop*).

4. **Repetición Instantánea (`type_replay` / `Instant Replay`):**
   - Buffer circular continuo con duración configurable (`15s`, `30s`, `45s`, `60s`, `120s`), disparable mediante botón o atajo global para:
     1. Guardar el clip en disco inmediatamente en alta calidad (`MP4`), y/o
     2. Reproducir automáticamente el clip recién capturado dentro de una fuente de *Instant Replay* en la escena en vivo (con marco, cámara lenta opcional y transición Stinger de entrada/salida).

5. **Pizarra y Anotaciones en Pantalla (`whiteboardoverlayplg.plg`):**
   - Capa interactiva transparente superpuesta sobre el lienzo del escenario (`Stage`) que permite dibujar en directo con el ratón o tableta gráfica: lápiz de mano alzada, marcador fluorescente, flechas tácticas, rectángulos, círculos, puntero láser con estela que desaparece, selector de color/grosor, deshacer/rehacer y borrado instantáneo.

6. **Tercios Inferiores y Títulos Animados (`lowerThirdSourceplg.plg` + `titleplg.plg`):**
   - Generador integrado de gráficos broadcast (*Lower Thirds*) con plantillas animadas a 60 FPS (Título principal, Subtítulo/Rol, red social, logotipo/icono, colores de acento personalizables, curva de entrada/salida `easeOutBack`/`easeInOutCubic` y temporizador de auto-ocultación).

7. **Multistreaming Simultáneo y Pre-Stream Studio (`VHMultiWriterExt2.exe` + `repos/*`):**
   - Motor de emisión multi-destino capaz de transmitir simultáneamente a **Twitch, YouTube Live, Kick, Facebook Live y servidores RTMP/RTMPS personalizados** desde un único proceso codificador acelerado por GPU (evitando duplicar la carga de la tarjeta gráfica), acompañado de configuración Pre-Stream (título, categoría, etiquetas) y Chat Unificado en vivo.
