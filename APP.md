# Browser Application
This is the browser app for the Sheds framework.

The application is written to run in a standard web
browser, which provides a high degree of portability and openness.
It presents a tab interface, where each tab offers a particular service:

1. [Compressor](Compressor.md) - logging compressor usage using sensors on the server.
2. Nitrox - nitrox blending calculations - the calculations necessary for nitrox fills from a bank of cylinders are performed using an ideal gas approximation (there is support for real gas approximation, but it is significantly more complex and makes little difference to the results).
3. Portable compressor - like fixed compressor but tuned for a portable
4. Inventory - equipment records. The inventory tab provides a way to quickly look up and find the location of equipment.
5. Loans - recording of equipment loans with complete editable history and cross-links to inventory. Outgoing loans are recorded by selection from the inventory. Loan returns are recorded aginst the name of the person receiving back the kit. The `Inventory` tab is automatically updated to reflect kit that is out on loan.

You can disable tabs you aren't using by editing index.html.

## Databases

See [DATABASES.md](DATABASES.md) for details of the database organisation
and configuration.

# Development

The browser application is written entirely in Javascript, and should run
on most modern browsers.

[node.js](https://nodejs.org/en/) is required for development.
`npm` is used to run development tasks. Available targets are:
```
$ npm run lint # run eslint on source code
$ npm run update # run ncu-u to update npm dependencies
$ npm run test # use mocha to run all unit tests
```
To simplify app development, the [server](SERVER.md) can be run
even when no hardware sensors are available.

Because web browsers on mobile devices don't generally support the developer console, there is
a debug mode that can be enabled by adding `?debug` to the URL. This enables a developer console that can be opened
using the bug button that appears in the upper right and captures `console.debug`.
