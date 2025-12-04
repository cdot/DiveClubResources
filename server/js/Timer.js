/*@preserve Copyright (C) 2019-2025 Crawford Currie http://c-dot.co.uk license MIT*/

/* eslint-env node.js */
import { promises as Fs } from "fs";
import { Sensor } from "./Sensor.js";
import { Time } from "./Time.js";
import { OnOffSimulator } from "./OnOffSimulator.js";

const GPIOPATH = '/sys/class/gpio/';

/**
 * Keeps a count of the number of ms that a pin with a pull-down is held
 * in a given state between calls to sample().
 */
class Timer extends Sensor {

  /**
   * @param {string} config.name sensor name
   * @param {number?} config.poll Frequency at which to poll the pin, ms.
   * @param {number?} config.on_state State of pin that means timer on, 1 or 0, default 0
  */
  constructor(config) {
    super(config);

    // GPIO pin number
    this.gpio = config.gpio;

    // Frequency at which we poll the pin. Polling
    // will be no faster than this, and will probably be slower
    // due to delays in the IO system reading the pin. Default
    // is 100ms or 1/10th of a second.
    this.poll = config.poll || 100;

    // State of pin that means timer on, 1 or 0, default 0
    this.on_state = config.on_state || 0;

    // Current timer state, on = true, off = false
    this.isOn = false;

    // Accumulate "on" time since the last call to sample()
    this.onTime = 0;
    this.lastUpdate = Date.now();
  }

  pollPin() {
    Fs.readFile(`${GPIOPATH}gpio${this.gpio}/value`)
    .then(v => {
      v = parseInt(v.toString());
      const t = Date.now();
      const newState = v;
      if (this.isOn)
        this.onTime += t - this.lastUpdate;
      this.isOn = (newState === this.on_state);
      this.lastUpdate = t;
      setTimeout(() => this.pollPin(), this.poll);
    });
  }

  connect() {
    if (!this.gpio)
      return Promise.reject("Timer not given a gpio pin");

    // Force-unexport first, in case it was previously left locked after a crash
    return Fs.writeFile(`${GPIOPATH}unexport`, `${this.gpio}`)
    .catch(e => {
      console.error(`Timer: unexport GPIO ${this.gpio} failed`, e);
      return Promise.resolve();
    })
    .then(() => {
      return Fs.writeFile(`${GPIOPATH}export`, `${this.gpio}`);
    })
    .then(() => {
      return Fs.readFile(`${GPIOPATH}gpio${this.gpio}/value`);
    })
    .then(v => {
      this.isOn = (parseInt(v.toString()) === this.on_state);
      this.pollPin();
      console.debug(`Timer: polling GPIO ${this.gpio} every ${this.poll}ms`);
    });
  }

  /**
   * Sample is the runtime (time the compressor has been running
   * since the last sample() call)
   */
  sample() {
    return new Promise(resolve => {
      let sample;
      if (this.simulation)
        sample = this.simulation.sample();
      else
        sample = this.onTime;
      this.onTime = 0;
      resolve({ time: Time.now(), sample: sample });
    });
  }

  // @Override
  simulate() {
    this.simulation = new OnOffSimulator();
  }
}

export { Timer }
