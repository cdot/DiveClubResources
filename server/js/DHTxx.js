/*@preserve Copyright (C) 2019 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */

import DHT from 'node-dht-sensor';
import { promises as Fs } from "fs";
import { Sensor } from "./Sensor.js";
import { Time } from "./Time.js";
import { RangeSimulator } from "./RangeSimulator.js";

const BACK_OFF = 5000; // 5s in ms

/**
 * Interface to a DHTxx sensor
 * @private
 */
class DHTPin {

  constructor(type, gpio) {
    this.mType = type;
    this.gpio = gpio;
    this.mLastSample = { temperature: 0, humidity: 0,
                         time: 0, dubious: "Uninitialised" };
    this.mSamplingPromise = null;
    this.mUnusable = false;
    this.simulate = undefined;
  }

  /**
   * Promise to read a sample from the pin. If the sample is requested
   * during the backoff period, or while we are waiting for the last
   * read to return, then the last sample is returned.
   */
  sample() {
    if (this.mUnusable)
      return Promise.reject("Unusable");

    if (this.mSamplingPromise)
      return this.mSamplingPromise;

    if (typeof this.mLastSample.error === "undefined" // Force resampling if there was an error
        && Time.now() - this.mLastSample.time < BACK_OFF) {
      return Promise.resolve(this.mLastSample);
    }

    const self = this;
    this.mSamplingPromise = new Promise((resolve, reject) => {
      self.mTimeout = setTimeout(() => {
        self.mIsSampling = false;
        self.mTimeout = null;
        reject("Timed out");
      }, BACK_OFF);
      const handler = (e, t, h) => {
        clearTimeout(self.mTimeout); // clear it ASAP
        self.mTimeout = null;
        if (e) {
          this.mUnusable = true;
          console.error("DHT error", e);
          reject("DHT error " + e);
          return;
        }

        // Check sample range
        const sample = { time: Time.now(), temperature: t, humidity: h };
        if (h < 20 || h > 90)
          sample.humidity_dubious = "sensor may require recalibration";
        if (t < 0 || t > 50)
          sample.temperature_dubious = `${t}C out of range 0C..50C`;
        self.mLastSample = sample;
        resolve(sample);
      };
      if (this.simulate)
        handler(null, this.simulate.temp.sample(),
                this.simulate.hum.sample());
      else
        DHT.read(this.mType, this.gpio, handler);
    })
    .catch(e => {
      this.mLastSample.error = e;
      return Promise.resolve(this.mLastSample);
    })
    .finally(f => {
      if (this.mTimeout)
        clearTimeout(this.mTimeout);
      this.mTimeout = null;
      this.mSamplingPromise = null;
    });
    return this.mSamplingPromise;
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
      console.error(this.field, "DHT connect failed: ", e.message);
      return Promise.reject(e.message);
    })
    .then(s => {
      return DHTPins[this.gpio].sample()
      .then(s => {
        if (s.error) {
          console.error(this.field, "DHT connect sample failed: ", s.error);
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
