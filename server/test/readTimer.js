/*@preserve Copyright (C) 2019-2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */

// Set up a sensor on a pin given on command line and sample it every
// half second for "on" time
import { Timer } from "../src/Timer.js";

let gpio = process.argv[2];

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



