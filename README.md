# Let's Play Together

This project allows you to connect other users to your PC through the web similar to Parsec but built for universal browser compatibility. The application uses WebRTC to transmit video and audio in real time, allowing the broadcaster to share their entire screen or a specific window with OBS virtual camera, while viewers join on demand.

### Demo Videos

Below, you can see demonstration videos of the project:

Select the demo link for each video to see the full demonstration.

[DEMO 1](https://drive.google.com/file/d/18nEY7SVjaG-YvUxfSAcv4vzjBHrM6ujw/view?usp=sharing)

[DEMO 2](https://drive.google.com/file/d/1Yh2w4eSfkxDI_FfOqVREO4dD96mtr3fN/view?usp=sharing)

## Features

- **Real-time Streaming:** Send video and audio using WebRTC technology.
- **PWA Support (Progressive Web App):** Install the application on mobile or desktop devices for a native app-like experience.
- **Joystick Support:** Allows interaction through controls by transmitting input data, simulating a remote gaming experience (up to 4 joysticks connected per peer).
- **Virtual Gamepad:** Includes an on-screen virtual control for users without a physical joystick.
- **Voice Chat:** Real-time voice communication between broadcaster and viewers.
- **Text Chat:** Integrated messaging system for written communication.
- **Live Game Voting:** System that allows viewers to vote on which game to play.
- **Quality Settings:** Manual control of streaming quality.
- **Real-time Statistics:** Visualization of streaming performance data (FPS, latency, etc).
- **Multi-Browser Compatibility:** Works on major web browsers, eliminating the need to install additional software.
- **Security and Authentication:** Protects certain routes with basic authentication and cookie validation.
- **Dynamic Stream Parameter Control:** Automatically adjusts bitrate and resolution based on network conditions.
- **Socket Integration:** Uses Socket.IO for real-time communication, managing offers and ICE candidates during peer-to-peer connection setup.

## Getting Started

### Running the Application

#### Requirements

Before running this application, make sure you have the following:

- **OBS (Open Broadcaster Software)**: Required to use the virtual camera functionality for streaming.
- **Python**: A specific Python version is needed for joystick functionality.
- **API Key**: Add your API key to the `.env` file to enable downloading game covers.

#### Using Node.js

```bash
# Install server dependencies
npm install

# Start the server
node server
```

### Testing the Application

1. Open `localhost:4000/broadcast.html` to start a broadcast as the sender; authentication will be required.
2. Open `localhost:4000` on another device or browser window to view the live broadcast.

## Additional Configuration

### PWA Support

The application includes a Service Worker and manifest file to provide a progressive web app experience, allowing installation on mobile and desktop with offline capabilities in some cases.

### Joystick and Virtual Gamepad Support

The integrated joystick input allows remote control similar to gaming setups. Connect your controller (for example, via VigemClient) to send axis and button data. If you don't have a physical joystick, you can use the virtual gamepad included in the interface.

### Adding a TURN Server

If direct connections fail, you can configure a TURN server. Edit the configuration in the `broadcast.js` and `watch.js` files to include your TURN server details and credentials.

Enjoy connecting, sharing, and playing remotely through the web!

## Support and Contributions

If you find issues or have ideas for new features, check out the GitHub issues or submit a pull request. You can also support the project through [Buy Me A Coffee](https://buymeacoffee.com/pacificsilent). Let's Play Together
