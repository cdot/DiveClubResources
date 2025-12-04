/*@preserve Copyright (C) 2019-2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */
import { Simulator } from "./Simulator.js";

/**
 * Sample that returns a delta in ms since the last on/off event.
 * Simulates class Timer.
 */
class OnOffSimulator extends Simulator {

  constructor() {
    super();
    this.lastask = Date.now();
  }

	/** @override */
	sample() {
    // Power on time since last sample
    const sample = Math.floor(Math.random() * (Date.now() - this.lastask));
    this.lastask = Date.now();
    return sample;
	}
}

export { OnOffSimulator }


