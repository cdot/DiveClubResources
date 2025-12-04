/*@preserve Copyright (C) 2019 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */

/**
 * Network latency in our system is at most a few milliseconds, which is
 * is irrelevant as far as sampling is concerned. At the same time, running
 * ntp is an unwelcome burden. It is simpler to keep the sensor server and
 * the sheds app in sync by using the timestamp on requests coming in to
 * the sensor. That's what this class handles.
 */

// Time difference between local clock and remote when last sync received
let delta = 0;

class Time {
  static sync(time) {
    delta = time - Date.now();
  }
  
  static now() {
    return Date.now() + delta;
  }
}

export { Time }
