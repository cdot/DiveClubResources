/*@preserve Copyright (C) 2019 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */
import { Time } from "./Time.js";
import { Simulator } from "./Simulator.js";

/**
 * Sample that moves within a min..max range with occasional
 * forays into illegal values
 */
class RangeSimulator extends Simulator {

  constructor(min, max) {
    super();
		this.min = min;
    this.max = max;
  }

	/**
   * @override
   */
  sample() {
    if (typeof this.lastsample == "undefined")
      this.lastsample = (this.min + this.max) / 2;
    const delta = (Math.random() - 0.5) * (this.max - this.min) / 10;
    this.lastsample += delta;
    if (this.lastsample > this.max)
      this.lastsample = this.max;
    if (this.lastsample < this.min)
      this.lastsample = this.min;
		// 1 in 10 values is illegal
		if (Math.random < 0.05)
			this.lastSample = this.max + 1;
		else if (Math.random < 0.1)
			this.lastSample = this.max - 1;
    return this.lastsample;
  }
}

export { RangeSimulator }
