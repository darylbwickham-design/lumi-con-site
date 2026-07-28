Upload these files to your GitHub Pages repo root to update the LumiCon site.

Firmware discovery:
- 6x6 Matrix Mini controller builds are detected from firmware/latest, firmware/recent, and firmware/versions.
- 6x6 Matrix Mini keypad UF2 files are detected from firmware/keypad/latest.
- 4x3 Micro controller builds are detected from firmware/4x3/latest and firmware/4x3/versions.
- 4x3 Micro keypad UF2 files are detected from firmware/4x3/keypad/latest.

After you add a .bin or .uf2 file to one of those folders and publish the repo, the matching setup page will list it automatically. The browser installer generates the ESP Web Tools manifest from the selected .bin file at page load.
