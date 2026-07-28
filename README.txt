LumiCon GitHub Pages site

This repository contains the public overview and setup pages for LumiCon stream
controllers. The 6x6 Matrix Mini page is the current reference guide for the
open hardware build, phone-first Wi-Fi setup, Lumia plugin connection, and
ESP8266/Pico firmware flow.

The site keeps the firmware installer dynamic:

- 6x6 Matrix Mini controller builds are detected from `firmware/latest`,
  `firmware/recent`, and `firmware/versions`.
- 6x6 Matrix Mini keypad UF2 files are detected from `firmware/keypad/latest`.
- 4x3 Micro controller builds are detected from `firmware/4x3/latest` and
  `firmware/4x3/versions`.
- 4x3 Micro keypad UF2 files are detected from `firmware/4x3/keypad/latest`.

Add a `.bin` or `.uf2` to the matching folder, commit it, and publish the site.
The matching setup page reads the public GitHub tree and lists the new file
automatically. The browser installer generates its ESP Web Tools manifest from
the selected `.bin` at page load.

The device source and detailed build documentation live in:

`https://github.com/darylbwickham-design/lumicon_6x6_mini`
