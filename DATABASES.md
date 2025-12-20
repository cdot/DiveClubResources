# Databases

Two databases are used, a read-write application database, and a read-only
text file database held on a remote service (such as Google Drive).

## Application database

The application database contains:
* a copy of the text files in the remote DB,
* a number of data files maintained by the application, such as
  compressor and loan records,
* `config.json` which stores most of the configuration.

The application only stores plain-text CSV files in the application database. It can use a simple server that supports GET and POST requests (GetPostStore), or a WebDAV server (WebDAVStore). It would be easy to extend the
application to interface to a different store provider, should you want to.

The application server is accessed through the *Database URL* which
points to the root folder of the database. This setting is stored in the
`database_url` cookie in the browser. The app will attempt to load `config.json`
from this server to initialise the configuration. If it fails, it will prompt
for an alternative server.

### Using the sensor server for the application database

When you start the sensor server, it automatically starts a web server that supports unauthenticated GET and POST requests to a file store. This can be used as the file database for the app. Or you can use any other server that supports unauthenticated GET and POST requests to files in a directory.

### Using a WebDAV server as the application database

It's easy to set up a WebDAV server, even on a mobile device. Most
web server implementations include a WebDAV module (though note that
your server must support CORS, and not all do).

For example, you might configure an Apache server on Linux as follows:
```
DavLockDB /var/www/html/webdav/DavLockDB

# Add a rewrite to respond with a 200 SUCCESS on every OPTIONS request.
# This is required for CORS
RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=200,L]

<Location /webdav>
  # CORS
  Header always set Access-Control-Allow-Origin "*"
  # These are the methods used by Sheds
  Header always set Access-Control-Allow-Methods "GET, OPTIONS, PUT, PROPFIND, MKCOL"
  Header always set Access-Control-Max-Age "1000"
  Header always set Access-Control-Allow-Headers "x-requested-with, Content-Type, origin, authorization, accept, client-security-token, depth, cache-control"

  Dav On
  AuthType Basic
  AuthName "Login required"

  AuthUserFile "/var/www/html/webdav/.passwd"
  Require valid-user
</Location>
```
Note that we only support Basic Auth.

### If there is no database

*IN PROGRESS - DOESN'T WORK YET*

If you don't configure a database then the app will fall back to logging to
LocalStorage in the browser. This is mainly intended for use with a
portable compressor, when you are away from the internet. If the LocalStorage
contains logging records, they will automatically be synched to the main
database the next time you connect.

## Remote read-only database

The remote read-only database contains a number of read-only text files in CSV
(comma-separated value) format, indexed via a main CSV found via a URL
(referred to as the <b>Remote DB index URL</b>). The CSV files provide lists
of member roles (such as compressor operators and O2 blenders) and the
equipment inventory. The remote database is copied to the application
database so the machine hosting the app can work offline.

Click <b>Update from Remote DB</b> to update the application database from
the remote database (requires the machine running the application
to be connected to the internet.)

In HSAC's case the remote database is hosted on Google Drive in (publically
accessible) proxy spreadsheets that shadow data extracted from the
(highly protected) core databases, which are themselves spreadsheets,
using `IMPORTRANGE`. The proxy sheets are then published as CSV. This
approach gives us fine-grained control over what data enters the
public domain.

### Remote DB index URL

This is the URL of a CSV document that contains two columns, headed
`sheet` and `url`. The `sheet` column has two entries, `roles` and
`inventory`, each of which has a corresponding entry in the URL
column.
```
sheet, url
roles,http://address-of-roles.csv
inventory,http://address_of_inventory.csv
```

### Roles

The `roles` entry in the index points to the URL of a CSV document
with two columns, `role` and `list`.  The `role` column gives the name
of a role e.g. `member` and the `list` column gives a comma-separated
list of people who can perform that role.  There must be at least the
following rows:
1. `member` - club members who are permitted to borrow equipment
2. `operator` - qualified compressor operators
3. `blender` - qualified Nitrox blenders

Other lists may be provided in additional columns for future use. Example:
```
role,list
member,"Freddie Mercury,Abraham Lincoln,Nikola Tesla,Sun Tzu"
operator,"Abraham Lincoln,Sun Tzu"
blender,"Sun Tzu"
trainee,"Freddie Mercury"
```

### Inventory

The `inventory` entry in the index is the URL of another CSV document
that has `sheet` and `url` columns. This time the rows correspond to a
tab in the inventory, and the URL is of another sheet that provides
the columns for that tab. For example,
```
sheet,url
Cylinders,http://url-of-cylinders.csv
Regulators,http://url-of-rgeulators-csv
```
It's up to what columns you put in your inventory. An example for a
`Cylinders` sheet might be:
```
ID,Description,Serial #
014,Yellow 12L,49-89-92103
015,Blue pony 3,01-770-34589
```

### Setting up the database

There are a number of ways you can manage the remote database. The simplest
would be to have a number of CSV format files that you manually
edit. Slightly more functional is to publish sheets from spreadsheets
in Google Drive, as HSAC does. Or you could create an custom server
that would serve the required CSV from your existing database.
