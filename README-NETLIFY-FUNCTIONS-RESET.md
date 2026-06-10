# Braindump Netlify Functions Reset

This build uses Netlify's default functions path:

netlify/functions

Expected repo root:

index.html
netlify.toml
package.json
netlify/functions/ping.js
netlify/functions/sort.js

Netlify build settings:

Base directory: blank
Package directory: blank
Build command: blank
Publish directory: .
Functions directory: netlify/functions

After deploy, test:

https://YOUR-SITE.netlify.app/.netlify/functions/ping

Expected: JSON message with ok:true.

Then test:

https://YOUR-SITE.netlify.app/.netlify/functions/sort

Expected from browser GET: 405 Method Not Allowed.
That means the sort function exists and the app can POST to it.
