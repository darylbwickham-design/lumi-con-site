LumiCon hosted site package • GitHub-ready • latest default = 1.0.2

What this package does
- Hosts the LumiCon landing page
- Makes 6x6 Matrix Mini the only live device tile
- Uses firmware/recent/ as the default install option
- Sets recent to version 1.0.2
- Shows the previous three versions in the dropdown: 0.4.2, 0.4.1, 0.4.0
- Keeps 0.3.6 archived on disk at firmware/versions/0_3_6/ even though it is not shown in the dropdown

GitHub Pages notes
- This folder includes a CNAME file for lumi-con.com
- This folder includes a .nojekyll file
- Publish the contents of this folder as your site root
- After GitHub Pages is live, point lumicon.co.uk to redirect to https://lumi-con.com

Folder logic
- firmware/recent/ = default recommended installer target
- firmware/versions/<version>/ = version-specific archive target

Firmware currently included
- recent -> 1.0.2
- archive -> 1.0.2, 0.4.2, 0.4.1, 0.4.0, 0.3.6
