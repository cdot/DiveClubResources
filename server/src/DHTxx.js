/*@preserve Copyright (C) 2019-2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */

import DHT from 'node-dht-sensor';
import { promises as Fs } from "fs";
import { Sensor } from "./Sensor.js";
import { Time } from "./Time.js";
import { RangeSimulator } from "./RangeSimulator.js";

const BACK_OFF = 5000; // 5s in ms

// Humidity range supported by different DHT types
const RANGE = {
  11: { rhmin: 20, rhmax: 90, tmin: 0, tmax: 50 },
  22: { rhmin: 0, rmmax: 100, tmin: -40, tmax: 80 }
};

/**
 * Interface to a DHTxx sensor
 * @private
 */
class DHTPin {

  constructor(type, gpio) {
    this.type = type; // 11 or 22
    this.gpio = gpio;
    this.lastSample = {
      temperature: 0,
      humidity: 0,
      time: 0,
      dubious: "Uninitialised"
    };
    // Current sampling promise, don't replace
    this.samplingPromise = null;
    // Reference to simulator, if required
    this.simulate = undefined;
  }

  /**
   * Promise to read a sample from the pin. If the sample is requested
   * during the backoff period, or while we are waiting for the last
   * read to return, then the last sample is returned.
   */
  sample() {
    if (this.samplingPromise)
      return this.samplingPromise;

    if (typeof this.lastSample.error === "undefined" // Force resampling if there was an error
        && Time.now() - this.lastSample.time < BACK_OFF) {
      return Promise.resolve(this.lastSample);
    }

    const self = this;
    this.samplingPromise = new Promise((resolve, reject) => {
      self.mTimeout = setTimeout(() => {
        self.mIsSampling = false;
        self.mTimeout = null;
        reject("Timed out");
      }, BACK_OFF);
      const handler = (e, t, h) => {
        clearTimeout(self.mTimeout); // clear it ASAP
        self.mTimeout = null;
        if (e) {
          console.debug("DHT error", e);
          reject("DHT error " + e);
          return;
        }

        // Check sample range
        const sample = { time: Time.now(), temperature: t, humidity: h };
        if (h < RANGE[this.type].rhmin || h > RANGE[this.type].rhmax)
          sample.humidity_dubious = `${h}% out of range ${RANGE[this.type].rhmin}%..${RANGE[this.type].rhmax}%`;
        if (t < RANGE[this.type].tmin || t > RANGE[this.type].tmax)
          sample.temperature_dubious = `${t}C out of range ${RANGE[this.type].tmin}C..${RANGE[this.type].tmax}C`;
        self.lastSample = sample;
        resolve(sample);
      };
      if (this.simulate)
        handler(null, this.simulate.temp.sample(),
                this.simulate.hum.sample());
      else
        DHT.read(this.type, this.gpio, handler);
    })
    .catch(e => {
      this.lastSample.error = e;
      return Promise.resolve(this.lastSample);
    })
    .finally(f => {
      if (this.mTimeout)
        clearTimeout(this.mTimeout);
      this.mTimeout = null;
      this.samplingPromise = null;
    });
    return this.samplingPromise;
  }
}

const DHTPins = {};

/**
 * A single GPIO pin may have up to two DHTxx objects on it in the
 * configuration, for sensing temperature and humidity. However they
 * will both use the same DHTPin object.
 */
class DHTxx extends Sensor {

  /**
   * @param {number} config.device_type type 11 or 22
   * @param {number} config.gpio raspberry pi gpio pin number
   * @param {number} config.field which field of the sample to return (temperature or humidity)
   */
  constructor(config) {
    super(config);

    this.device_type = config.type;
    this.gpio = config.gpio;
    this.field = config.field;
  }

  /**
   * @Override
   */
  connect() {
    if (!this.device_type || this.device_type != 11
        && this.device_type != 22)
      return Promise.reject(`${this.name} has bad type ${this.device_type}`);

    if (!this.gpio)
      return Promise.reject(`${this.name} has no gpio`);

    if (!DHTPins[this.gpio])
      DHTPins[this.gpio] = new DHTPin(this.device_type, this.gpio);

    // Make sure we have GPIO available, and we can read a sample
    return Fs.stat("/dev/gpiomem")
    .catch(e => {
      console.debug(this.field, "DHT connect failed: ", e.message);
      return Promise.reject(e.message);
    })
    .then(s => {
      return DHTPins[this.gpio].sample()
      .then(s => {
        if (s.error) {
          console.debug(this.field, "DHT connect sample failed: ", s.error);
          return Promise.reject("sample failed: " + s.error);
        }
        console.debug(this.name, "connected to GPIO", this.gpio);
        return Promise.resolve();
      });
    });
  }

  /**
   * @Override
   */
  sample() {
    return DHTPins[this.gpio].sample()
    .then(sam => {
      const res = { sample: sam[this.field], time: sam.time };
      if (sam[this.field + "_dubious"])
        res.dubious = sam[this.field + "_dubious"];
      return res;
    });
  }

  /**
   * @Override
   */
  simulate() {
    DHTPins[this.gpio].simulate = {
      hum: new RangeSimulator(20, 100),
      temp: new RangeSimulator(1, 45)
    };
  }
};

export { DHTxx }
