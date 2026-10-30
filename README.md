# ScreenCast 🎥✨

**ScreenCast** es una herramienta web moderna, ligera y de código abierto para grabar la pantalla de tu dispositivo directamente desde el navegador. **No requiere registro, instalación ni extensiones adicionales**; todo se procesa de manera local de forma rápida y segura.

[![Licencia](https://img.shields.io/badge/licence-Gratuito%20--%20Open%20Source-blue.svg)](LICENSE)
[![HTML5](https://img.shields.io/badge/HTML5-%23E34F26.svg?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![JavaScript](https://img.shields.io/badge/JavaScript-%23F7DF1E.svg?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

---

## 🚀 Características Principales

* **Grabación de Pantalla y Pestañas**: Captura tu pantalla completa, ventanas de aplicaciones o pestañas del navegador con soporte opcional para audio del sistema.
* **Múltiples Formatos de Exportación**:
  * **Video WebM**: Ligero e ideal para la web.
  * **Video MP4**: Compatible de forma nativa con la gran mayoría de plataformas.
  * **Animación GIF personalizable**: Configura los fotogramas por segundo (fps), ancho, calidad, bucle y realiza recortes de tiempo exactos antes de convertir.
  * **Fotogramas en ZIP**: Extrae fotogramas individuales en formato PNG comprimidos en un archivo `.zip`.
  * **Sólo Audio (MP3)**: Convierte y extrae el sonido de tu grabación directamente en un archivo de audio MP3 gracias a `lamejs`.
* **Diseño Moderno e Intuitivo**: Interfaz minimalista con efectos de cristal (`backdrop-filter`), animaciones suaves y modo oscuro/dinámico durante la grabación.
* **100% Privado (Client-Side)**: Las grabaciones se procesan enteramente en tu navegador web utilizando la API de `MediaRecorder` y librerías externas mediante CDN.

---

## 🛠️ Tecnologías Utilizadas

* **HTML5 / CSS3**: Estructura limpia y estilos modernos mediante variables CSS y efectos visuales avanzados.
* **JavaScript (ES6+)**: Lógica asíncrona de grabación y manipulación de flujos multimedia.
* **Librerías Externas**:
  * [`gifenc`](https://github.com/transitive-bullshit/gifenc): Para la codificación y generación eficiente de GIFs animados.
  * [`lamejs`](https://github.com/nkron/lamejs): Para la codificación directa de audio a MP3 en el cliente.
  * [`JSZip`](https://stuk.github.io/jszip/): Para empaquetar los fotogramas en formato ZIP.
  * [Miller Icons](https://milericons.github.io/): Iconografía minimalista para los controles.

---

## 📦 Estructura del Proyecto

```text
├── index.html          # Interfaz principal de la aplicación
├── styles.css          # Estilos visuales, animaciones y diseño responsivo
├── app.js              # Lógica de grabación, manejo de flujos y exportación de archivos
├── favicon.ico / .svg  # Iconos del sitio web
└── apple-touch-icon.png  # Icono para dispositivos Apple
