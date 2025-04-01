# Let's Play Together

This project allows you to connect other users to your PC via the web—similar to Parsec but built for universal browser compatibility. The application leverages WebRTC to stream video and audio in real time, enabling the broadcaster to share either their entire screen or a specific window, while watchers join on demand.

**Note:** This project is a fork based on [WebRTC-Video-Broadcast](https://github.com/TannerGabriel/WebRTC-Video-Broadcast).

### Demo Videos

Below, you can view demonstration videos of the project showcasing various functionalities:

- **Real-time Streaming:** Watch how video and audio are transmitted using WebRTC.
- **PWA in Action:** Experience the seamless installation and native app-like usage.
- **Joystick Integration:** See how remote control is enabled through joystick support.

Select the demo link for each video to view the complete demonstration.

[DEMO 1](https://drive.google.com/file/d/18nEY7SVjaG-YvUxfSAcv4vzjBHrM6ujw/view?usp=sharing)

[DEMO 2](https://drive.google.com/file/d/1Yh2w4eSfkxDI_FfOqVREO4dD96mtr3fN/view?usp=sharing)

## Features

- **Real-time Streaming:** Sends video and audio using WebRTC technology.
- **PWA Support (Progressive Web App):** Install the application on mobile or desktop devices for a native-like experience.
- **Joystick Support:** Allows interaction via controllers by transmitting input data, simulating a remote gaming experience.
- **Cross-Browser Compatibility:** Works in major web browsers, eliminating the need to install additional software.
- **Security and Authentication:** Protects certain pathways with basic authentication and cookie validation.
- **Dynamic Control of Stream Parameters:** Automatically adjusts bitrate and resolution based on network conditions.
- **Socket Integration:** Uses Socket.IO for real-time communication, managing offers and ICE candidates during peer-to-peer connection setup.

## Getting Started

### Running the Application

#### Using Node.js

```bash
# Install server dependencies
npm install

# Start the server
node server
```

#### Using Docker

```bash
# Build the Docker image
docker build --tag webrtcvideobroadcast .

# Run the container
docker run -d -p 4000:4000 webrtcvideobroadcast
```

### Testing the Application

1. Open `localhost:4000/broadcast.html` to initiate a stream as the broadcaster; authentication will be required.
2. Open `localhost:4000` on another device or browser window to watch the live stream.

## Additional Configuration

### PWA Support

The application includes a Service Worker and manifest file to provide a progressive web app experience, allowing installation on mobile and desktop with offline capabilities in some cases.

### Joystick Support

Integrated joystick input enables remote control similar to gaming setups. Connect your controller (e.g., via VigemClient) to send axis and button data.

### Adding a TURN Server

If direct connections fail, you can configure a TURN server. Edit the settings in the `broadcast.js` and `watch.js` files to include your TURN server details and credentials.

## Additional Documentation

- **Tutorial:** Detailed explanation of the implementation is available in [this tutorial](https://gabrieltanner.org/blog/webrtc-video-broadcast).
- **Code and Configuration:** The repository includes ESLint configurations, Docker settings, and GitHub Actions for CodeQL and issue management.
- **License:** Distributed under the MIT License.

Enjoy connecting, sharing, and playing remotely through the web!

## Support and Contributions

If you encounter issues or have ideas for new features, check out the GitHub issues or submit a pull request. You can also support the project via [Buy Me A Coffee](https://buymeacoffee.com/pacificsilent).
