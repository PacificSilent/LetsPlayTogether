# Lets Play Together

Este proyecto permite conectar a otras personas a tu PC a través de la web, de forma similar a lo que hace Parsec, pero aprovechando la compatibilidad con todos los navegadores. La aplicación utiliza WebRTC para transmitir video y audio en tiempo real, permitiendo que el usuario (broadcaster) comparta la pantalla o una ventana mientras los clientes (watchers) se conectan bajo petición.

**Nota:** Este proyecto es un fork basado en [WebRTC-Video-Broadcast](https://github.com/TannerGabriel/WebRTC-Video-Broadcast).

## Características

- **Transmisión en tiempo real:** Envia video y audio usando tecnología WebRTC.
- **Soporte PWA (Progressive Web App):** La aplicación puede ser instalada como una app en dispositivos móviles o de escritorio, ofreciendo una experiencia nativa.
- **Soporte para joysticks:** Permite interactuar mediante controladores, enviando datos de entrada para simular una experiencia similar a la de videojuegos remotos.
- **Compatibilidad multi-navegador:** Funciona en los principales navegadores web, eliminando la necesidad de instalar software adicional.
- **Seguridad y autenticación:** El acceso a ciertas rutas se protege mediante autenticación básica y validación de cookies.
- **Control dinámico de la transmisión:** Ajusta parámetros de bitrate y resolución en función de las condiciones de red para mejorar la calidad de la transmisión.
- **Integración de sockets:** Comunicación en tiempo real usando Socket.IO para enviar ofertas y candidatos durante el proceso de conexión Peer-to-Peer.

## Cómo Empezar

### Iniciando la Aplicación

#### Usando Node.js

```bash
# Instalar dependencias del servidor
npm install

# Iniciar el servidor
node server
```

#### Usando Docker

```bash
# Construir la imagen
docker build --tag webrtcvideobroadcast .

# Ejecutar el contenedor
docker run -d -p 4000:4000 webrtcvideobroadcast
```

### Prueba de la Aplicación

1. Accede a `localhost:4000/broadcast.html` para iniciar una transmisión (broadcaster). Se solicitará autenticación para proteger el acceso.
2. Abre `localhost:4000` desde otro dispositivo o ventana para ver la transmisión en vivo como cliente (watcher).

## Configuración Adicional

### Soporte PWA

La aplicación incluye un Service Worker y un archivo de manifiesto para ofrecer una experiencia PWA. Esto permite la instalación de la aplicación en dispositivos móviles y de escritorio, con un rendimiento optimizado y la posibilidad de trabajar fuera de línea en ciertos casos.

### Soporte para Joysticks

Integrado para mejorar la interacción, el proyecto puede recibir entradas desde joysticks. Esto hace posible conectar controladores (por ejemplo, mediante VigemClient) para enviar datos de ejes y botones, permitiendo usar la PC de forma remota similar a una experiencia gaming.

### Agregar un Servidor TURN

En escenarios donde la conexión directa falla, puedes agregar un servidor TURN. Edita las configuraciones en los archivos `broadcast.js` y `watch.js` para incluir tus credenciales y detalles del servidor TURN.

## Documentación Adicional

- **Tutorial:** Se explica el funcionamiento y la implementación en [este tutorial](https://gabrieltanner.org/blog/webrtc-video-broadcast).
- **Código y Configuración:** El repositorio incluye ejemplos de configuración para ESLint, Docker, y GitHub Actions para CodeQL y gestión de issues.
- **Licencia:** El proyecto está licenciado bajo la Licencia MIT.

¡Disfruta conectando, compartiendo y jugando de forma remota a través de la web!

## Soporte y Contribuciones

Si encuentras algún problema o tienes ideas para nuevas funciones, por favor revisa los issues en GitHub o envía un pull request. También puedes apoyar el proyecto mediante [Buy Me A Coffee](https://buymeacoffee.com/pacificsilent).
