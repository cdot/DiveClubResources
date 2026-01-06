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
import BasicAuth from "express-basic-auth";
import bodyParser from "body-parser";
import HTTP from "http";
import HTTPS from "https";
import { Time } from "./Time.js";

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
  "\tGET /data/<file> - GET file text from data_dir",
  "\tPOST /data/<file> - POST text data to file in data_dir"
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
  // Apply configuration defaults
  if (typeof config.port === "undefined")
    config.port = 8000;

  const promises = [];
  if (config.https) {
    promises.push(
      Fs.readFile(config.https.key)
      .then(k => { config.https.key = k; }));
    promises.push(
      Fs.readFile(config.https.cert)
      .then(c => { config.https.cert = c; }));
  }

  return Promise.all(promises)
  .then(() => {
    const server = new Express();

    const protocol = config.https
          ? HTTPS.Server(config.https, server)
          : HTTP.Server(server);

    server.use(Cors());

    if (options.debug)
      server.use((req, res, next) => {
        console.debug(`${req.method} ${req.url}`);
        next();
      });

    if (config.auth) {
      // config.auth has user:pass keys. Make sure that server.cfg is not
      // accessible through the web server!
      console.debug("BasicAuth enabled");
      server.use(BasicAuth({
        users: config.auth,
        challenge: true,
        realm: "Dive Club Resources"
      }));
    }

    // get/post database files, if data_dir is defined.
    if (config.data_dir) {
      console.debug(`config: Database at ${config.data_dir}`);
      server.use(bodyParser.text({ type: '*/*' }));
      server.post("/data/*path", (req, res) => {
        const path = Path.normalize(
          Path.join(config.data_dir, req.params.path[0]));
        console.debug("DB POST", path);
        return Fs.writeFile(path, req.body)
        .then(() => res.status(200).send(`${path} saved`))
        .catch(e => {
          console.debug("DB POST failed", e);
          res.status(400).send(`${path} POST failed`);
        });
      });
      server.get("/data/*path", (req, res) => {
        const path = Path.normalize(
          Path.join(config.data_dir, req.params.path[0]));
        console.debug("DB GET", path);
        return Fs.readFile(path)
        .then(buff => res.status(200).send(buff))
        .catch(e => {
          console.debug("DB GET failed", e);
          res.status(400).send(`${path} GET failed`);
        });
      });
    }

    // Serve application files, if app_dir is defined
    if (config.app_dir) {
      console.debug(`config: Application at ${config.app_dir}`);
      server.use(Express.static(config.app_dir));
    }

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
            sensor_cfg.sensor.sample()
            .then(sample => {
					    console.debug(`${sensor_cfg.name} => ${sample.sample}`);
              res.set('Content-Type', 'application/json');
              res.send(sample);
            })
					  .catch(e => {
              console.debug(`${sensor_cfg.sensor.name} sampling error`, e);
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
      protocol.listen(config.port);
      console.log("Server started on port", config.port);
    });
  });
})
.catch(e => {
  console.error("Error", e);
});
