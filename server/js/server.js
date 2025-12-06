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
  serverConfigFile : Path.join(DISTRIBUTION, "server.cfg"),
  simulate: false,
  debug: false
};

const DESCRIPTION = [
  "DESCRIPTION\nServer giving GET/POST access to static files and database, and AJAX requests for reading sensors attached to host Raspberry Pi.",
  "", "OPTIONS",
  `\t-c, --config=ARG - Sensors configuration file (default ${options.serverConfigFile})`,
  "\t-h, --help - Show this help",
  "\t-s, --simulate - Use a simulation for any missing hardware, instead of backing off and retrying",
  "\t-d, --debug - Verbose debugging messages",
  "", "\tThe server supports the following routes:",
  "\tGET /<file> - GET static file from distribution",
  "\tGET /<sensor> - ajax request to read a sensor",
  "\tGET /data/<file> - GET file text from data_directory",
  "\tPOST /data/<file> - POST text data to file in data_directory"
].join("\n");

const go_parser = new Getopt.BasicParser(
  "c:(config)d(debug)h(help)s(simulate)", process.argv);

let option;
while ((option = go_parser.getopt())) {
  switch (option.option) {

  case "h": console.log(DESCRIPTION); process.exit();
  case "c": options.serverConfigFile = option.optarg; break;
  case 's': options.simulate = true; break;
  case 'd': options.debug = true; break;
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
	
Fs.readFile(options.serverConfigFile)
.then(config => JSON.parse(config))
.catch(e => {
  console.error(`Cannot read server configuration from ${options.serverConfigFile}`);
  console.error(e);
  console.log(DESCRIPTION);
  return Promise.reject(e.message);
})
.then(config => {
  // Apply configuratiuon defaults
  if (typeof config.data_dir === "undefined")
    config.data_dir = Path.join(DISTRIBUTION, "data");
  if (typeof config.port === "undefined")
    config.port = 8000;

  const server = new Express();

  server.use(Cors());
  
  if (options.debug)
    server.use((req, res, next) => {
      console.debug(`${req.method} ${req.url}`);
      next();
    });

  // Add routes

  // get/post database files
  server.get("/", Express.static(config.data_dir));
  server.use(bodyParser.text({ type: '*/*' }));
  server.post("/data/*", (req, res) => {
    console.debug("POST", req.url, req.body);
    const path = req.url.replace(/^.?\/data\//, config.data_dir);
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
    server.listen(config.port);
    console.log("Server started on port", config.port);
  });
})
.catch(e => {
  console.error("Error", e);
});
