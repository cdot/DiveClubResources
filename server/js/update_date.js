/*@preserve Copyright (C) 2019 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */
/* global __dirname */
/* global process */

/**
 * Server giving access to sensors attached to Raspberry Pi
 *
 * See sensors/README.md for information
 */
requirejs = require('requirejs');
requirejs.config({
    baseUrl: __dirname.replace(/\/[^/]*$/, "")
});

requirejs(["fs-extra", "node-getopt", "request", "child_process"], function(Fs, Getopt, request, child_process) {
    const DESCRIPTION =
          "DESCRIPTION\nA Raspberry PI sensors ajax server.\n" +
          "See sensors/README.md for details\n\nOPTIONS\n";
    const DEFAULT_PORT = 8000;

    const cliopt = Getopt.create([
        ["h", "help", "Show this help"],
        ["c", "config=ARG", "Configuration file (default ~/sensors.cfg)"]
    ])
        .bindHelp()
        .setHelp(DESCRIPTION + "[[OPTIONS]]")
        .parseSystem()
        .options;

    if (typeof cliopt.config === "undefined")
        cliopt.config = process.env.HOME + "/sensors.cfg";

    Fs.readFile(cliopt.config)
    .then(config => {
        return JSON.parse(config);
    })
   .then(config => {
        request.get(config.get_date.url, {
            auth: {
                user: config.get_date.user,
                pass: config.get_date.pass,
                sendImmediately: false
            }
        })
        .on('response', function(response) {
            child_process.exec("date -s " + response.headers.date);
        });
    });
});

