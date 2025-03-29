const VIGEMClient = require("vigemclient");

const client = new VIGEMClient();
client.connect();

const controllers = {};

function sendToVigembus(data) {
  // Verificar que data.axes exista y sea un array
  if (!data.axes || !Array.isArray(data.axes)) {
    console.error("Datos de joystick inválidos:", data);
    return;
  }

  const deviceKey = data.id;

  if (!controllers[deviceKey]) {
    controllers[deviceKey] = client.createX360Controller();
    const err = controllers[deviceKey].connect();
    if (err) {
      console.log(
        `Error connecting the virtual controller for device ${deviceKey}:`,
        err.message
      );
      return;
    }
    controllers[deviceKey].updateMode = "manual";
    console.log(`Virtual controller created for device ${deviceKey}`);
  }
  const controller = controllers[deviceKey];
  let changed = false;
  const epsilon = 0.1; // o el valor que necesites

  if (Math.abs(controller.axis.leftX.value - data.axes[0]) > epsilon) {
    controller.axis.leftX.setValue(data.axes[0]);
    changed = true;
  }
  if (Math.abs(controller.axis.leftY.value - -data.axes[1]) > epsilon) {
    controller.axis.leftY.setValue(-data.axes[1]);
    changed = true;
  }
  if (Math.abs(controller.axis.rightX.value - data.axes[2]) > epsilon) {
    controller.axis.rightX.setValue(data.axes[2]);
    changed = true;
  }
  if (Math.abs(controller.axis.rightY.value - -data.axes[3]) > epsilon) {
    controller.axis.rightY.setValue(-data.axes[3]);
    changed = true;
  }

  const newLeftTrigger = data.buttons[6];
  const newRightTrigger = data.buttons[7];
  if (controller.axis && controller.axis.leftTrigger) {
    controller.axis.leftTrigger.setValue(newLeftTrigger);
    changed = true;
  }
  if (controller.axis && controller.axis.rightTrigger) {
    controller.axis.rightTrigger.setValue(newRightTrigger);
    changed = true;
  }

  if (controller.axis && controller.axis.dpadHorz) {
    let newDpadHorz = 0;
    if (data.buttons[14] === 1) newDpadHorz = -1;
    else if (data.buttons[15] === 1) newDpadHorz = 1;
    controller.axis.dpadHorz.setValue(newDpadHorz);
    changed = true;
  }
  if (controller.axis && controller.axis.dpadVert) {
    let newDpadVert = 0;
    if (data.buttons[12] === 1) newDpadVert = 1;
    else if (data.buttons[13] === 1) newDpadVert = -1;
    controller.axis.dpadVert.setValue(newDpadVert);
    changed = true;
  }

  const buttonMapping = {
    A: data.buttons[0] === 1,
    B: data.buttons[1] === 1,
    X: data.buttons[2] === 1,
    Y: data.buttons[3] === 1,
    LEFT_SHOULDER: data.buttons[4] === 1,
    RIGHT_SHOULDER: data.buttons[5] === 1,
    BACK: data.buttons[8] === 1,
    START: data.buttons[9] === 1,
    LEFT_THUMB: data.buttons[10] === 1,
    RIGHT_THUMB: data.buttons[11] === 1,
    GUIDE: data.buttons[16] === 1,
  };

  for (const key in buttonMapping) {
    if (controller.button.hasOwnProperty(key)) {
      if (controller.button[key].value !== buttonMapping[key]) {
        controller.button[key].setValue(buttonMapping[key]);
        changed = true;
      }
    }
  }

  if (changed) {
    controller.update();
  }
}

function disconnectJoysticks(targetId) {
  for (const key in controllers) {
    if (key.startsWith(targetId)) {
      if (
        controllers[key] &&
        typeof controllers[key].disconnect === "function"
      ) {
        controllers[key].disconnect();
      }
      delete controllers[key];
    }
  }
}

module.exports = {
  sendToVigembus,
  disconnectJoysticks,
};
