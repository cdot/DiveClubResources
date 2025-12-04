// Set up a sensor and sample it every half second for "on" time
let requirejs = require('requirejs');
requirejs.config({
    baseUrl: __dirname.replace(/\/[^\/]*$/, "")
});

let gpio = process.argv[2];

requirejs(["js/Timer"], function(Timer) {
   let pooh = new Timer({
       gpio: gpio,
       poll: 100,
       on_state: 0
   });

    function bah() {
        pooh
        .sample()
        .then(s => {
            if (s.sample > 0)
                console.log("On for", s, "ms");
	    setTimeout(bah, 1000);
        });
    }

    pooh.connect()
    .then(() => {
        console.log("Connected to GPIO", gpio);
        bah();
   });
});


