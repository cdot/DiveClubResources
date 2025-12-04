/*@preserve Copyright (C) 2019-2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */
/* global __dirname */
/* global process */

/**
 * Server giving GET/POST access to static files and database, and AJAX
 * requests for reading sensors attached to server host Raspberry Pi.
 *
 * See SERVER.md at the root of this distribution for information
 */
import { promises as Fs } from "fs";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
import Path from "path";
const __dirname = Path.dirname(__filename);
import Getopt from "posix-getopt";

import Cors from "cors";
import Express from "express";
import bodyParser from "body-parser";
import HTTP from "http";
import { Time } from "./Time.js";

// This module is at server/js below the distribution
const DISTRIBUTION = Path.normalize(Path.join(__dirname, "..", ".."));

const options = {
  sensors_cfg_file : Path.join(DISTRIBUTION, "sensors.cfg"),
  data_dir: Path.join(DISTRIBUTION, "data"),
  simulate: false,
  port: 8000,
  debug: false
};

const DESCRIPTION = [
  "DESCRIPTION\nServer giving GET/POST access to static files and database, and AJAX requests for reading sensors attached to host Raspberry Pi.",
  "", "OPTIONS",
  `\t-c, --config=ARG - Sensors configuration file (default ${options.sensors_cfg_file})`,
  `\t-d, --data=ARG - full file path to /data directory (default ${options.data_dir})`,
  "\t-h, --help - Show this help",
  `\t-p, port=ARG - What port to run the server on (default ${options.port})`,
  "\t-s, --simulate - Use a simulation for any missing hardware, instead of backing off and retrying",
  "\t-v, --verbose - Verbose debugging messages",
  "", "\tThe server supports the following routes:",
  "\tGET /<file> - GET static file from distribution",
  "\tGET /<sensor> - ajax request to read a sensor",
  "\tGET /data/<file> - GET file text from database",
  "\tPOST /data/<file> - POST text data to file in to database"
].join("\n");

const go_parser = new Getopt.BasicParser(
  "c:(config)d:(data)h(help)p:(port)s(simulate)v(verbose)", process.argv);

let option;
while ((option = go_parser.getopt())) {
  switch (option.option) {
  case "d": options.data_dir = option.optarg; break;
  case "h": console.log(DESCRIPTION); process.exit();
  case "c": options.sensors_cfg_file = option.optarg; break;
  case "p": options.port = option.optarg; break;
  case 's': options.simulate = true; break;
  case 'v': options.debug = true; break;
  default: throw Error(`Unknown option -${option.option}\n${DESCRIPTION}`);
  }
}

// Override console.debug
if (!options.debug)
  console.debug = () => {};

function start_sensor(cfg) {
	cfg.sensor.connect()
	.then(() => console.debug(`start_sensor: ${cfg.name} connected`))
	.catch(error => {
		console.error(`start_sensor: ${cfg.name} error: ${error}`);
		// If simulation is requested, make a simulated sensor if the
		// connect failed
		if (options.simulate) {
			console.error(`start_sensor: Using simulation for '${cfg.name}'`);
			cfg.sensor.simulate();
		} else {
			// Back off and re-try
			console.error(`start_sensor: Backing off '${cfg.name}', will retry in 5s`);
			setTimeout(() => start_sensor(cfg), 5000);
		}
	});
}
	
Fs.readFile(options.sensors_cfg_file)
.then(config => JSON.parse(config))
.catch(e => {
  console.error(`Cannot read sensor configuration from ${options.sensors_cfg_file}`);
  console.error(e);
  console.log(DESCRIPTION);
  return Promise.reject(e.message);
})
.then(config => {
  const server = new Express();

  server.use(Cors());
  
  if (options.debug)
    server.use((req, res, next) => {
      console.debug(`${req.method} ${req.url}`);
      next();
    });

  // Add routes

  // get/post database files
  server.get("/", Express.static(options.data_dir));
  server.use(bodyParser.text({ type: '*/*' }));
  server.post("/data/*", (req, res) => {
    console.debug("POST", req.url, req.body);
    const path = Path.normalize(Path.join(DISTRIBUTION, req.url));
    return Fs.writeFile(path, req.body);
  });

  // Serve distribution files
  server.use(Express.static(DISTRIBUTION));

  // Make sensors
  const promises = [];
  for (const sensor_cfg of config.sensors) {
    const clss = sensor_cfg.class;

    promises.push(
      import(`./${clss}.js`)
      .then(mods => {
        const SensorClass = mods[clss];
        sensor_cfg.sensor = new SensorClass(sensor_cfg);
      })
      .catch(e => {
        console.debug(clss, `import(${clss}) : ${e}`);
        sensor_cfg.error = `Could not import ${clss}: ${e}`;
 			})
      .then(() => {
			  // Start trying to connect
			  console.debug(`Connect sensor ${sensor_cfg.name}`);
			  start_sensor(sensor_cfg);
		  })
      // Add routes
      .then(() => {
        server.get(`/${sensor_cfg.sensor.name}`, (req, res) => {
          if (typeof req.query.t !== "undefined")
            Time.sync(req.query.t);
					console.debug(`Got sensor ${sensor_cfg.name} request`);
          sensor_cfg.sensor.sample()
          .then(sample => {
            res.send(sample);
          })
					.catch(e => {
					});
        });
        return `Registered sensor /${sensor_cfg.sensor.name}`;
      })
      .catch(sensor_cfg => {
        console.debug(sensor_cfg.name, " sensor could not be registered", sensor_cfg);
        server.get(`/${sensor_cfg.name}`, (req, res, next) => {
          next();
        });
        return Promise.resolve(`failed /${sensor_cfg.name}`);
      }));
  }

  Promise.all(promises)
  .then(ps => {
    console.debug(ps);
    server.listen(options.port);
    console.log("Server started on port", options.port);
  });
})
.catch(e => {
  console.error("Error", e);
});
