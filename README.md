# Studio Flow Viewer

A single-page web tool for reviewing and testing NICE CXone Studio IVR scripts. Upload a Studio script export (`.xml`) and it draws the call flow as a chart you can click through, explains each step in plain language, runs QA checks, generates test cases, and compares versions.

Everything runs in the browser. Uploaded scripts are never sent anywhere.

## What it does

| Step | What you get |
|---|---|
| **1 Add a flow** | Upload one or more Studio `.xml` exports, or drag them onto the page. Try the built-in example first. |
| **2 Review** | Summary tiles, an interactive flow chart, step details, **Walk a call** (follow one caller step by step), a plain-language overview and QA findings: dead ends, unreachable steps, menus without timeout or invalid-input branches, integrations without error branches, loops with no exit, missing Default branches. |
| **3 Test** | Test cases generated so every reachable branch is tested at least once, with branch coverage. Copy as CSV for Excel or as Gherkin. Click a test to see its path on the chart. |
| **4 Compare** | Pick an older upload of the same script to see added, removed and changed steps, properties and branches. |
| **Optional** | Upload your tenant's skills, hours profiles or script names (CSV) to flag names a script uses that don't exist in CXone. |

**Needs the claude.ai version:** Ask Claude, and reading photos, screenshots or lists. This GitHub copy runs on its own, without a connection to Claude, so those buttons are marked *claude.ai only*.

## Use it

### Option A: open the file on your computer (no setup)

1. On this repository's page, click **index.html**, then the **Download raw file** button (the down-arrow icon at the top right of the file).
2. Double-click the downloaded file. It opens in your default browser (Chrome, Edge, Safari or Firefox).
3. Click **Try the example**, or **Upload files** and choose a Studio `.xml` export.

> Don't open the file from SharePoint, OneDrive, Teams, Google Drive, an email preview or a file preview pane. Those block the page's scripts, so it shows but nothing responds. A red banner at the top of the page tells you when this happens.

### Option B: publish it as a web page with GitHub Pages (shareable link)

1. Go to this repository's **Settings** → **Pages** (left sidebar, under *Code and automation*).
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Under **Branch**, choose **main** and **/ (root)**, then click **Save**.
4. Wait 1–2 minutes, then refresh the Pages settings screen. The site address appears at the top, for example `https://s16us-hub.github.io/AshtonVille/`.
5. Open that address and share it with your team.

**Note:** this repository is private. GitHub Pages on a private repository needs a paid GitHub plan (Pro, Team or Enterprise). On the free plan the **Pages** screen says you need to upgrade or make the repository public. If you make it public, the page is public too. Uploaded scripts still never leave each person's browser, but anyone could open the tool.

With **GitHub Enterprise Cloud** you can also set the site to **Private** under Pages → *Visibility*, so only people in your organization can open it.

### Option C: host it on your own web server

Copy `index.html` to any web server that serves HTML pages (IIS, Apache, Nginx, Azure Static Web Apps, Netlify). No build step or server code is needed.

## Exporting a script from CXone Studio

In CXone Studio, open the script and use Studio's option to save or export the script to a local file (`.xml`). Menu names vary by Studio version, so check NICE's Studio help if you can't find it. Upload that file. Subscripts are separate files: upload them too, and a RUNSUB step will link to them.

## Exporting reference lists for the optional check

In CXone Admin, export the Skills or Hours of Operation list as CSV. On the page, open **Check against your CXone setup**, choose the list type, click **Upload CSV**, and tick **Check flows against these lists**.

## Updating the page

Replace `index.html` with a newer version and commit it. GitHub Pages republishes automatically within a minute or two.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole tool, in one file |
| `examples/main-inbound-example.xml` | A sample Studio script to try uploading |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Privacy

Scripts, lists and generated tests stay in the browser tab and are gone when the tab closes. The page loads two things from the internet: the IBM Plex fonts (Google Fonts) and the chart layout library (`dagre` from jsDelivr). If they can't load, the page still works, with system fonts and a simpler chart layout.
