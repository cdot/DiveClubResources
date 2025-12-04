let fs = require("fs-extra");

console.log(process.argv);
const gpioPin = parseInt(process.argv[2]);

let state;
function sample() {
    fs.readFile('/sys/class/gpio/gpio' + gpioPin + "/value")
    .then(newstate => {
        newstate = parseInt(newstate.toString());
        if (newstate != state)
            console.log("Edge", newstate);
        state = newstate;
        setTimeout(sample, 100);
    });
}

fs.writeFile('/sys/class/gpio/export', "" + gpioPin)
.then(() => {
    return fs.writeFile('/sys/class/gpio/gpio' + gpioPin + "/direction", "in");
})
.catch(e => {
    console.error(e);
})
.then(() => {
    sample();
});


