# Dive Club Resources

Custom server and browser application for managing a dive club's resources.
This was created for [Hartford Sub-Aqua Club (HSAC)](http://hartfordscuba.co.uk), and reflects
the way the club organises and manages its resources - training kit, compressor, and oxygen bank. It has
been used successfully by the club since 2018.

The application comprises two parts:
1. A [browser application](APP.md)
3. A [web server](SERVER.md)

HSAC members can get [information on our specific configuration](https://docs.google.com/document/d/13a0xBhF8_AJsvffOMFLHleUT0XIu8TSBcTyFuffQ9EQ)

## Browser Application
![Compressor page](images/Compressor.png)

The app supports a number of services:

1. Fixed compressor - recording compressor usage with tracking of filter lifetime and sensor integration
2. Nitrox - nitrox blending calculations
3. Portable compressor - like fixed compressor but tuned for a portable
4. Inventory - equipment records
5. Loans - recording of equipment loans with complete editable history and cross-links to inventory

Services can be conditionally enabled/disabled depending on the requirements of the club.

The app supports the use of two online databases, accessed through AJAX calls.
A static read-only database is used to retrieve information about resources, while an application database is used for logging.

Help information is readily available throughout the application through info buttons.

See the [APP.md](APP.md) for more information.

## Web Server

The web server is designed to run on a Raspberry Pi that interfaces to a number
of electronic sensors on the compressor. The server also provides data storage.

See [SERVER.md](SERVER.md) for more information. The server
can be run without any connected sensors for debugging the web application.

## About
Sheds was written by Crawford Currie http://c-dot.co.uk and is licensed
under MIT license terms.
