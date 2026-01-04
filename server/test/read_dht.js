/*@preserve Copyright (C) 2019-2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */

// Test reading from DHT11 on pin GPIO 14
import DHT from 'node-dht-sensor';

DHT.read(11, 14, function(e, t, h) {
  console.log(e,t,h);
});
