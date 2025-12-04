// Test program
const RASPI = require('raspi');
const GPIO = require('raspi-gpio');
let last_edge;

RASPI.init(() => {
    const input = new GPIO.DigitalInput({
        //pin: "GPIO10",
        pin: "P1-19",
        pullResistor: GPIO.PULL_DOWN
    });

    input.on("change", value => {
        last_edge = Date.now();
        console.log('Edge', value);
    });

    console.log("Initial state", input.read());
});
