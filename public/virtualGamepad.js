(() => {
  const socket = io();

  // Estado actual del joystick virtual
  const gamepadState = {
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    leftStickBtn: false,
    rightStickBtn: false,
    dpad: { up: false, down: false, left: false, right: false },
    faceButtons: { A: false, B: false, X: false, Y: false },
    shoulder: { L1: false, L2: false, R1: false, R2: false },
    start: false,
    select: false,
  };

  function sendState() {
    const axes = [
      gamepadState.leftStick.x, // leftStick X
      gamepadState.leftStick.y, // leftStick Y
      gamepadState.rightStick.x, // rightStick X
      gamepadState.rightStick.y, // rightStick Y
    ];

    const buttons = new Array(17).fill(0);
    buttons[0] = gamepadState.faceButtons.A ? 1 : 0; // A
    buttons[1] = gamepadState.faceButtons.B ? 1 : 0; // B
    buttons[2] = gamepadState.faceButtons.X ? 1 : 0; // X
    buttons[3] = gamepadState.faceButtons.Y ? 1 : 0; // Y
    buttons[4] = gamepadState.shoulder.L1 ? 1 : 0; // L1
    buttons[5] = gamepadState.shoulder.R1 ? 1 : 0; // R1
    buttons[6] = gamepadState.shoulder.L2 ? 1 : 0; // Left Trigger (L2)
    buttons[7] = gamepadState.shoulder.R2 ? 1 : 0; // Right Trigger (R2)
    buttons[8] = gamepadState.select ? 1 : 0; // Select
    buttons[9] = gamepadState.start ? 1 : 0; // Start
    buttons[10] = gamepadState.leftStickBtn ? 1 : 0; // L3
    buttons[11] = gamepadState.rightStickBtn ? 1 : 0; // R3
    buttons[12] = gamepadState.dpad.up ? 1 : 0; // D-pad Up
    buttons[13] = gamepadState.dpad.down ? 1 : 0; // D-pad Down
    buttons[14] = gamepadState.dpad.left ? 1 : 0; // D-pad Left
    buttons[15] = gamepadState.dpad.right ? 1 : 0; // D-pad Right
    buttons[16] = 0; // GUIDE (no usado)

    const data = {
      id: socket.id + "-virtual",
      axes: axes,
      buttons: buttons,
    };
    socket.emit("joystick-data", data);
  }

  // Contenedor global (absoluto, cubre toda la pantalla)
  const container = document.createElement("div");
  container.id = "virtual-gamepad-container";
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "none"; // No interfiere por defecto
  container.style.zIndex = "1000";
  container.style.userSelect = "none"; // Desactiva selección de texto
  container.style.display = "none"; // Se oculta por defecto
  document.body.appendChild(container);

  // Botón para ocultar el gamepad dentro de su contenedor
  const hideGamepadBtn = document.createElement("button");
  hideGamepadBtn.id = "show-gamepad";
  hideGamepadBtn.className =
    "bg-accent px-2 py-1 rounded text-sm flex items-center space-x-1 hover:bg-accent/90 transition";
  hideGamepadBtn.style.position = "absolute";
  hideGamepadBtn.style.top = "10px";
  hideGamepadBtn.style.right = "10px";
  hideGamepadBtn.style.zIndex = "1100";

  const icon = document.createElement("i");
  icon.className = "fa-solid fa-gamepad";

  const span = document.createElement("span");
  span.textContent = "Ocultar Gamepad";

  hideGamepadBtn.appendChild(icon);
  hideGamepadBtn.appendChild(span);

  // Estilos basados en los botones de watch.html
  hideGamepadBtn.style.backgroundColor = "#219EBC"; // bg-accent
  hideGamepadBtn.style.color = "#fff";
  hideGamepadBtn.style.padding = "8px 12px"; // px-2 py-1 aproximado
  hideGamepadBtn.style.border = "none";
  hideGamepadBtn.style.borderRadius = "6px"; // rounded
  hideGamepadBtn.style.fontSize = "14px"; // text-sm
  hideGamepadBtn.style.display = "inline-flex";
  hideGamepadBtn.style.alignItems = "center";
  hideGamepadBtn.style.justifyContent = "center";
  hideGamepadBtn.style.cursor = "pointer";
  hideGamepadBtn.style.transition = "background-color 0.2s ease";

  // Efecto hover similar a watch (hover:bg-accent/90)
  hideGamepadBtn.addEventListener("mouseenter", () => {
    hideGamepadBtn.style.backgroundColor = "rgba(33,158,188,0.9)";
  });
  hideGamepadBtn.addEventListener("mouseleave", () => {
    hideGamepadBtn.style.backgroundColor = "#219EBC";
  });

  hideGamepadBtn.addEventListener("click", () => {
    container.style.display = "none";
    // Volver a mostrar el panel de opciones
    document.getElementById("options-panel").classList.remove("hidden");
  });
  container.appendChild(hideGamepadBtn);

  // UTILIDAD: función para crear un botón digital.
  function createButton(text, onDown, onUp) {
    const btn = document.createElement("div");
    btn.textContent = text;
    btn.style.position = "absolute";
    btn.style.width = "40px";
    btn.style.height = "40px";
    btn.style.background = "rgba(255,255,255,0.8)";
    btn.style.borderRadius = "50%";
    btn.style.textAlign = "center";
    btn.style.lineHeight = "40px";
    btn.style.userSelect = "none";
    btn.style.touchAction = "none";
    btn.style.pointerEvents = "auto";
    btn.style.color = "black"; // forzar texto en negro

    // Almacenar el color de fondo por defecto y definir el color cuando se presione.
    const defaultBg = btn.style.background;
    const pressedBg = "rgba(100,100,100,0.8)"; // Color más oscuro al presionar

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.style.background = pressedBg; // Cambiar color al presionar
      onDown();
    });
    btn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      btn.style.background = defaultBg; // Restaurar color original
      onUp();
    });
    btn.addEventListener("pointercancel", (e) => {
      e.preventDefault();
      btn.style.background = defaultBg;
      onUp();
    });
    return btn;
  }

  // Función para crear un analog stick (solo movimiento). Se coloca según las posiciones pasadas.
  function createAnalogStick(id, pos) {
    const stickContainer = document.createElement("div");
    stickContainer.style.position = "absolute";
    stickContainer.style.width = "120px";
    stickContainer.style.height = "120px";
    stickContainer.style.background = "rgba(0,0,0,0.3)";
    stickContainer.style.borderRadius = "50%";
    stickContainer.style.touchAction = "none";
    stickContainer.style.pointerEvents = "auto";
    stickContainer.style.userSelect = "none";
    stickContainer.style.display = "flex";
    stickContainer.style.justifyContent = "center";
    stickContainer.style.alignItems = "center";
    if (pos.left) stickContainer.style.left = pos.left;
    if (pos.right) stickContainer.style.right = pos.right;
    if (pos.top) stickContainer.style.top = pos.top;
    if (pos.bottom) stickContainer.style.bottom = pos.bottom;

    const knob = document.createElement("div");
    knob.style.width = "50px";
    knob.style.height = "50px";
    knob.style.background = "rgba(255,255,255,0.8)";
    knob.style.borderRadius = "50%";
    knob.style.transform = "translate(0px, 0px)";
    knob.style.touchAction = "none";
    knob.style.pointerEvents = "auto";
    stickContainer.appendChild(knob);

    let dragging = false;
    let startX = 0,
      startY = 0;
    const maxDist = 50;

    stickContainer.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      // Captura este pointer para el stick y permite multitouch
      stickContainer.setPointerCapture(e.pointerId);
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
    });

    stickContainer.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let dist = Math.sqrt(dx * dx + dy * dy);
      let moveX = dx,
        moveY = dy;
      if (dist > maxDist) {
        const angle = Math.atan2(dy, dx);
        moveX = Math.cos(angle) * maxDist;
        moveY = Math.sin(angle) * maxDist;
      }
      knob.style.transform = `translate(${moveX}px, ${moveY}px)`;
      if (id === "leftStick") {
        gamepadState.leftStick.x = moveX / maxDist;
        gamepadState.leftStick.y = moveY / maxDist;
      } else {
        gamepadState.rightStick.x = moveX / maxDist;
        gamepadState.rightStick.y = moveY / maxDist;
      }
      sendState();
    });

    stickContainer.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      knob.style.transform = "translate(0px, 0px)";
      if (id === "leftStick") {
        gamepadState.leftStick.x = 0;
        gamepadState.leftStick.y = 0;
      } else {
        gamepadState.rightStick.x = 0;
        gamepadState.rightStick.y = 0;
      }
      sendState();
      stickContainer.releasePointerCapture(e.pointerId);
    });

    stickContainer.addEventListener("pointercancel", (e) => {
      if (!dragging) return;
      dragging = false;
      knob.style.transform = "translate(0px, 0px)";
      if (id === "leftStick") {
        gamepadState.leftStick.x = 0;
        gamepadState.leftStick.y = 0;
      } else {
        gamepadState.rightStick.x = 0;
        gamepadState.rightStick.y = 0;
      }
      sendState();
      stickContainer.releasePointerCapture(e.pointerId);
    });

    container.appendChild(stickContainer);

    // Botón separado para L3 o R3 (reposicionado y de mayor tamaño)
    const stickBtn = createButton(
      id === "leftStick" ? "L3" : "R3",
      () => {
        if (id === "leftStick") gamepadState.leftStickBtn = true;
        else gamepadState.rightStickBtn = true;
        sendState();
      },
      () => {
        if (id === "leftStick") gamepadState.leftStickBtn = false;
        else gamepadState.rightStickBtn = false;
        sendState();
      }
    );
    stickBtn.style.position = "absolute";
    // Para el analog izquierdo, colocar L3 a la derecha, centrado verticalmente:
    if (id === "leftStick") {
      stickBtn.style.right = "-80px"; // Se sale un poco del contenedor
      stickBtn.style.top = "50%";
      stickBtn.style.transform = "translateY(-50%)";
    } else {
      // Para el analog derecho, colocar R3 a la izquierda, centrado verticalmente:
      stickBtn.style.left = "-80px";
      stickBtn.style.top = "50%";
      stickBtn.style.transform = "translateY(-50%)";
    }
    stickBtn.style.width = "50px";
    stickBtn.style.height = "50px";
    stickBtn.style.fontSize = "16px";
    stickContainer.appendChild(stickBtn);
  }

  // Cruceta (D-pad) en la parte izquierda, encima del left analog stick
  function createDpad() {
    const dpadContainer = document.createElement("div");
    dpadContainer.style.position = "absolute";
    dpadContainer.style.left = "20px";
    dpadContainer.style.bottom = "160px";
    dpadContainer.style.width = "120px";
    dpadContainer.style.height = "120px";
    dpadContainer.style.pointerEvents = "auto";

    const up = createButton(
      "↑",
      () => {
        gamepadState.dpad.up = true;
        sendState();
      },
      () => {
        gamepadState.dpad.up = false;
        sendState();
      }
    );
    const down = createButton(
      "↓",
      () => {
        gamepadState.dpad.down = true;
        sendState();
      },
      () => {
        gamepadState.dpad.down = false;
        sendState();
      }
    );
    const left = createButton(
      "←",
      () => {
        gamepadState.dpad.left = true;
        sendState();
      },
      () => {
        gamepadState.dpad.left = false;
        sendState();
      }
    );
    const right = createButton(
      "→",
      () => {
        gamepadState.dpad.right = true;
        sendState();
      },
      () => {
        gamepadState.dpad.right = false;
        sendState();
      }
    );
    up.style.position = "absolute";
    up.style.left = "40px";
    up.style.top = "0px";
    down.style.position = "absolute";
    down.style.left = "40px";
    down.style.bottom = "0px";
    left.style.position = "absolute";
    left.style.left = "0px";
    left.style.top = "40px";
    right.style.position = "absolute";
    right.style.right = "0px";
    right.style.top = "40px";
    dpadContainer.appendChild(up);
    dpadContainer.appendChild(down);
    dpadContainer.appendChild(left);
    dpadContainer.appendChild(right);
    container.appendChild(dpadContainer);
  }

  // Botones de acción (Face Buttons) en la parte derecha con disposición diamante
  function createFaceButtons() {
    const faceContainer = document.createElement("div");
    faceContainer.style.position = "absolute";
    faceContainer.style.right = "20px";
    faceContainer.style.bottom = "160px";
    faceContainer.style.width = "120px";
    faceContainer.style.height = "120px";
    faceContainer.style.pointerEvents = "auto";

    const btnA = createButton(
      "A",
      () => {
        gamepadState.faceButtons.A = true;
        sendState();
      },
      () => {
        gamepadState.faceButtons.A = false;
        sendState();
      }
    );
    const btnB = createButton(
      "B",
      () => {
        gamepadState.faceButtons.B = true;
        sendState();
      },
      () => {
        gamepadState.faceButtons.B = false;
        sendState();
      }
    );
    const btnX = createButton(
      "X",
      () => {
        gamepadState.faceButtons.X = true;
        sendState();
      },
      () => {
        gamepadState.faceButtons.X = false;
        sendState();
      }
    );
    const btnY = createButton(
      "Y",
      () => {
        gamepadState.faceButtons.Y = true;
        sendState();
      },
      () => {
        gamepadState.faceButtons.Y = false;
        sendState();
      }
    );

    // Ajustamos posiciones para formar un diamante simétrico en un contenedor de 120x120px,
    // suponiendo que cada botón es de 40x40px.
    btnY.style.position = "absolute";
    btnY.style.left = "40px"; // 40px desde la izquierda
    btnY.style.top = "0px"; // en la parte superior

    btnB.style.position = "absolute";
    btnB.style.left = "80px"; // 80px desde la izquierda (40px de margen a la derecha)
    btnB.style.top = "40px"; // centrado verticalmente

    btnA.style.position = "absolute";
    btnA.style.left = "40px"; // centrado horizontalmente
    btnA.style.top = "80px"; // en la parte inferior

    btnX.style.position = "absolute";
    btnX.style.left = "0px"; // en la parte izquierda
    btnX.style.top = "40px"; // centrado verticalmente

    faceContainer.appendChild(btnY);
    faceContainer.appendChild(btnB);
    faceContainer.appendChild(btnA);
    faceContainer.appendChild(btnX);
    container.appendChild(faceContainer);
  }

  // Botones superiores y centrales (Shoulders, Start y Select) en la parte superior central
  function createShouldersAndCenter() {
    // Modificamos el contenedor de hombros para que se ubique encima de Start/Select
    const shoulderContainer = document.createElement("div");
    shoulderContainer.style.position = "absolute";
    shoulderContainer.style.bottom = "100px"; // Posicionado directamente arriba de Start/Select
    shoulderContainer.style.left = "50%";
    shoulderContainer.style.transform = "translateX(-50%)";
    shoulderContainer.style.width = "260px";
    shoulderContainer.style.height = "60px";
    shoulderContainer.style.pointerEvents = "auto";

    const l1 = createButton(
      "L1",
      () => {
        gamepadState.shoulder.L1 = true;
        sendState();
      },
      () => {
        gamepadState.shoulder.L1 = false;
        sendState();
      }
    );
    const l2 = createButton(
      "L2",
      () => {
        gamepadState.shoulder.L2 = true;
        sendState();
      },
      () => {
        gamepadState.shoulder.L2 = false;
        sendState();
      }
    );
    const r1 = createButton(
      "R1",
      () => {
        gamepadState.shoulder.R1 = true;
        sendState();
      },
      () => {
        gamepadState.shoulder.R1 = false;
        sendState();
      }
    );
    const r2 = createButton(
      "R2",
      () => {
        gamepadState.shoulder.R2 = true;
        sendState();
      },
      () => {
        gamepadState.shoulder.R2 = false;
        sendState();
      }
    );

    // Posicionar en el contenedor: dos a la izquierda, dos a la derecha
    l1.style.position = "absolute";
    l1.style.left = "0px";
    l1.style.top = "0px";

    l2.style.position = "absolute";
    l2.style.left = "60px";
    l2.style.top = "0px";

    r1.style.position = "absolute";
    r1.style.right = "60px";
    r1.style.top = "0px";

    r2.style.position = "absolute";
    r2.style.right = "0px";
    r2.style.top = "0px";

    shoulderContainer.appendChild(l1);
    shoulderContainer.appendChild(l2);
    shoulderContainer.appendChild(r1);
    shoulderContainer.appendChild(r2);
    container.appendChild(shoulderContainer);

    // Contenedor central para Start y Select (permanece sin cambios)
    const centerContainer = document.createElement("div");
    centerContainer.style.position = "absolute";
    centerContainer.style.bottom = "60px";
    centerContainer.style.left = "50%";
    centerContainer.style.transform = "translateX(-50%)";
    centerContainer.style.width = "120px";
    centerContainer.style.height = "40px";
    centerContainer.style.pointerEvents = "auto";

    const start = createButton(
      "Start",
      () => {
        gamepadState.start = true;
        sendState();
      },
      () => {
        gamepadState.start = false;
        sendState();
      }
    );
    const select = createButton(
      "Select",
      () => {
        gamepadState.select = true;
        sendState();
      },
      () => {
        gamepadState.select = false;
        sendState();
      }
    );
    start.style.position = "absolute";
    start.style.right = "0px";
    start.style.bottom = "0px";

    select.style.position = "absolute";
    select.style.left = "0px";
    select.style.bottom = "0px";

    centerContainer.appendChild(start);
    centerContainer.appendChild(select);
    container.appendChild(centerContainer);
  }

  // Botones L1 y L2 sobre la cruceta (D-pad)
  function createLeftShoulders() {
    const leftShoulder = document.createElement("div");
    leftShoulder.style.position = "absolute";
    leftShoulder.style.left = "20px";
    leftShoulder.style.bottom = "310px"; // Se posiciona 60px por encima del D-pad (bottom: 160px)
    leftShoulder.style.width = "80px";
    leftShoulder.style.height = "40px";
    leftShoulder.style.pointerEvents = "auto";

    const l1 = createButton(
      "L1",
      () => {
        gamepadState.shoulder.L1 = true;
        sendState();
      },
      () => {
        gamepadState.shoulder.L1 = false;
        sendState();
      }
    );
    const l2 = createButton(
      "L2",
      () => {
        gamepadState.shoulder.L2 = true;
        sendState();
      },
      () => {
        gamepadState.shoulder.L2 = false;
        sendState();
      }
    );
    l1.style.position = "absolute";
    l1.style.left = "0px";
    l1.style.top = "0px";

    l2.style.position = "absolute";
    l2.style.left = "80px";
    l2.style.top = "0px";

    leftShoulder.appendChild(l1);
    leftShoulder.appendChild(l2);
    container.appendChild(leftShoulder);
  }

  // Botones R1 y R2 sobre los botones ABXY (face buttons)
  function createRightShoulders() {
    const rightShoulder = document.createElement("div");
    rightShoulder.style.position = "absolute";
    rightShoulder.style.right = "20px";
    rightShoulder.style.bottom = "310px"; // Se posiciona 60px por encima de los face buttons (bottom: 160px)
    rightShoulder.style.width = "80px";
    rightShoulder.style.height = "40px";
    rightShoulder.style.pointerEvents = "auto";

    const r1 = createButton(
      "R1",
      () => {
        gamepadState.shoulder.R1 = true;
        sendState();
      },
      () => {
        gamepadState.shoulder.R1 = false;
        sendState();
      }
    );
    const r2 = createButton(
      "R2",
      () => {
        gamepadState.shoulder.R2 = true;
        sendState();
      },
      () => {
        gamepadState.shoulder.R2 = false;
        sendState();
      }
    );
    r1.style.position = "absolute";
    r1.style.right = "0px";
    r1.style.top = "0px";

    r2.style.position = "absolute";
    r2.style.right = "80px";
    r2.style.top = "0px";

    rightShoulder.appendChild(r1);
    rightShoulder.appendChild(r2);
    container.appendChild(rightShoulder);
  }

  // Crear controles con la nueva distribución
  createAnalogStick("leftStick", { left: "20px", bottom: "20px" });
  createAnalogStick("rightStick", { right: "20px", bottom: "20px" });
  createDpad();
  createFaceButtons();
  createLeftShoulders();
  createRightShoulders();
  // (Si deseas mantener Start/Select, puedes seguir utilizando createShouldersAndCenter para ellos)
})();
