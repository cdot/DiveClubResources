# Databases

Two databases are used, a read-write cache database, and a read-only
text file database held on a remote service (such as Google Drive.)

## Local database

The local database contains:
* a cached copy of the text files in the remote DB,
* a number of data files maintained by the application, such as
  compressor and loan records
* `config.json` which stores most of the configuration.

Included in the distribution is an interface suitable for using a
WebDAV server as the cache server. It would be easy to extend the
application to interface to a different store provider, should you
need to do so.

The cache server is accessed through the *Local cache URL* which
points to the root folder of the cache. This setting is stored in the
`cache_url` cookie in the browser. The cookie can be
initialised/overridden by the `?cache_url=` URL parameter when the
application is started.

### Using a WebDAV server as the local database

It's easy to set up a WebDAV server, even on a mobile device. Most
web server implementations include a WebDAV module (though note that
your server must support CORS, and not all do). We use "HTTP Server
powered by Apache" by Tautvydas Andrikys, which is easy to set up and
configure on Android.

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
You will need to provide the URL of your cache server to the user interface.

Note that we only support Basic Auth.

## Remote read-only database

The remote database contains a number of read-only text files in CSV
(comma-separated value) format, indexed via a main CSV found via a URL
(refereed to as the <b>Remote DB index URL</b>), and each accessible
via URLs found therein. The CSV files provide lists of member roles
(such as compressor operators, and O2 blenders) and the baseline
equipment inventory. The remote database is synched to the local
database, so the machine hosting the app can work offline.

Click <b>Update Cache From Web</b> to update the cache database from
the remote database (requires that the machine running the application
is currently connected to the internet.)

In HSAC's case the remote database is hosted in (publically
accessible) proxy spreadsheets that are used to extract data from the
(highly protected) core databases (which are themselves spreadsheets)
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
1. member - club members who are permitted to borrow equipment
2. operator - qualified compressor operators
3. blender - qualified Nitrox blenders

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
ID,Description,Location,Kit Pool
01,Yellow 12L,Cage,Training,
04,Blue pony 3,Cage,Qualified
```
Two columns are special in these sheets, `Location` and `Kit
Pool`. These columns are included in the top-level `Inventory` tab but
are ignored in the inventory pick dialog on the `Loans` tab.

### Setting up the database

There are a number of ways you can manage the database. The simplest
would be to have a number of CSV format files that you manually
edit. Slightly more functional is to publish sheets from spreadsheets
in Google Drive, as HSAC does. Or you could create an application
(e.g. using PHP) that would serve the required CSV from your existing
database.
