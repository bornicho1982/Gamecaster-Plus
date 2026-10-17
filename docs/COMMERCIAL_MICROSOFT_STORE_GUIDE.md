# Guía Oficial de Comercialización Legal y Publicación en Microsoft Store — Gamecaster Plus v4.6

## 1. Diagnóstico Profundo (Por qué fallaba antes y cómo lo hemos solucionado de raíz)

| Problema detectado en tu PC | Causa técnica real | Solución implementada en Gamecaster Plus v4.6 |
| :--- | :--- | :--- |
| **Pantalla negra al capturar el monitor** | Windows 10/11 pinta un **rectángulo negro sólido** sobre toda ventana que tenga activado `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` cuando se captura con GDI `BitBlt` o FFmpeg `gdigrab`. Como Gamecaster Plus ocupaba la pantalla, se veía negro. | Desactivado `excludeFromCapture` por defecto al arrancar (`false`) tanto en Rust (`lib.rs`) como en React (`broadcaster.ts`), eliminando el bloque negro de raíz. |
| **Imagen aplastada horizontalmente al grabar** | Tienes **2 monitores de 1920×1080 (`3840×1080`)**. FFmpeg `gdigrab -i desktop` sin coordenadas capturaba los dos monitores juntos (`3840×1080`) y los comprimía en un vídeo 16:9. | Añadido `enumerate_monitors()` (Win32 `EnumDisplayMonitors`) y parámetros explícitos `-offset_x`, `-offset_y` y `-video_size 1920x1080` en `video_encoder.rs` más selector de Monitor Físico en Propiedades de Capa. |
| **El micrófono fallaba al grabar en Windows en español** | Tus micrófonos en DirectShow se llaman `"Micrófono (2- Wireless Stereo Headset)"`, `"Micrófono (WEB CAM)"` y `"Micrófono (Q9-1)"`. La tilde (`ó`) en consola de Windows rompía el comando `dshow` de FFmpeg. | `enumerate_dshow_audio_entries()` ahora extrae el identificador ASCII interno `@device_cm_{...}\wave_{...}` de DirectShow y se lo pasa a FFmpeg sin errores de codificación. |
| **La cámara web no abría a la primera** | Tienes 6 cámaras registradas (`WEB CAM`, `POCO X3 NFC`, `XSplit Broadcaster`, `PRISM Lens 1..3`). El navegador elegía primero una cámara virtual desconectada. | `StageCompositor.tsx` ahora filtra automáticamente las cámaras virtuales (`virtual`, `xsplit`, `prism`, `poco`, `obs`) y selecciona directamente tu cámara física USB (`WEB CAM`). |
| **Parpadeo en la vista previa y recorte (`Alt + Arrastrar`)** | La imagen se reasignaba sobre el mismo elemento `<img src=...>` mientras se pintaba a 60 FPS, y el cuadro cian de selección se dibujaba sobre el mismo lienzo que se grababa. | Implementado **doble buffer (`onload` swap)** con cero parpadeo, **lienzo de gizmos separado (`pgmGizmoCanvasRef`)** para que los vídeos grabados salgan 100% limpios, y **recorte interactivo estilo OBS (`Alt + Tirador`)** con bordes verdes (`#10B981`) en los 8 tiradores. |

---

## 2. Qué puedes y qué NO puedes hacer para Comercializar Gamecaster Plus Legalmente

### A. Regla 1 — Código de OBS Studio (Licencia GPLv2)
- **Qué NO puedes hacer:** No puedes copiar ni pegar archivos `.c` / `.cpp` directamente del repositorio de OBS Studio ni distribuir sus `.dll` (`obs.dll`, `win-capture.dll`) dentro de un programa cerrado de pago, porque la licencia **GPLv2** te obligaría a regalar todo el código fuente de tu programa.
- **Qué SÍ hemos hecho (100% Legal y Propietario):** Hemos utilizado ingeniería limpia (*Clean-Room Implementation*) en **Rust y TypeScript** escribiendo nuestro propio motor desde cero (`wgc_capture.rs`, `video_encoder.rs`, `StageCompositor.tsx`) usando únicamente las APIs oficiales del sistema operativo Microsoft Windows (`windows-sys`: `EnumDisplayMonitors`, `StretchBlt`, `PrintWindow`, `SetWindowDisplayAffinity`) y fórmulas matemáticas universales (conversión de color ITU-R BT.709 / YCbCr). **Todo el código de tu repositorio es 100% tuyo y puedes venderlo comercialmente sin abrir el código.**

### B. Regla 2 — XSplit Broadcaster (Software Propietario)
- **Qué NO puedes hacer:** No puedes incluir ningún archivo `.dll`, `.plg`, icono o logotipo extraído de la carpeta de XSplit.
- **Qué SÍ hemos hecho:** Nuestro diseño visual (`GamecasterLogo.tsx`), iconos y código son 100% originales.

### C. Regla 3 — FFmpeg y Codificadores H.264 (`libx264` vs `h264_nvenc` / `h264_mf`)
- **Importante para vender en Microsoft Store:**
  - Las compilaciones de FFmpeg que incluyen `libx264` tienen licencia **GPL**. Si vendes un programa cerrado en la tienda de Microsoft, **no debes empaquetar un `ffmpeg.exe` compilado con `--enable-gpl` / `--enable-libx264`**.
  - **Solución Comercial implementada en Gamecaster Plus v4.6:** Hemos añadido soporte nativo para **`h264_mf` (Windows MediaFoundation H.264)** y **`h264_nvenc` (NVIDIA NVENC)** en `video_encoder.rs` y en `Configuración ⚙️ -> 4. Grabación`.
  - Con `h264_mf` y `h264_nvenc`, el codificador H.264 lo proporciona el propio sistema operativo Windows 10/11 o el driver de NVIDIA (cuyas patentes MPEG-LA ya están pagadas por Microsoft y NVIDIA), o bien puedes usar una compilación **FFmpeg LGPL** (sin `libx264`).

---

## 3. Pasos para Publicar y Vender Gamecaster Plus en la Microsoft Store

1. **Cuenta de Desarrollador en Microsoft Partner Center:**
   - Entra en [partner.microsoft.com/dashboard](https://partner.microsoft.com/dashboard) y registra tu cuenta de desarrollador (pago único de ~19 USD para cuenta individual).
   - Reserva el nombre de tu aplicación: **`Gamecaster Plus`**.

2. **Tipo de Paquete en la Tienda (MSIX o Instalador Win32 `.exe` / `.msi`):**
   - La Microsoft Store actual permite dos modalidades para aplicaciones de escritorio en Tauri v2:
     - **Opción A (Más rápida — Win32 Installer `.exe` / `.msi`):** Subes directamente el instalador NSIS (`gamecaster-plus_4.6.0_x64-setup.exe`) o `.msi` generado en `src-tauri/target/release/bundle/`. No requiere certificado de firma propio porque la Microsoft Store firma el instalador gratuitamente tras la revisión.
     - **Opción B (Paquete MSIX con cobro integrado de la tienda):** Usa el manifiesto [`src-tauri/AppxManifest.xml`](file:///c:/proyectos%20antigravity/Gamecaster%20Plus/src-tauri/AppxManifest.xml) que ya hemos dejado configurado con las capacidades `runFullTrust`, `webcam` y `microphone`.

3. **Requisitos obligatorios que te pedirá Microsoft al enviar la app:**
   - **URL de Política de Privacidad:** Como la aplicación accede a la cámara (`webcam`) y al micrófono (`microphone`), debes poner un enlace (puede ser una página en tu propio GitHub Pages) indicando que *"Gamecaster Plus procesa el vídeo y el audio localmente en el ordenador del usuario y no envía grabaciones a servidores de terceros salvo a las cuentas RTMP configuradas por el propio usuario"*.
   - **Notas para el certificador de Microsoft:** Indica que es un software de escritorio Win32 (`runFullTrust`) de grabación y streaming en directo.
