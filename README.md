# digiApps PDF Viewer

A lightweight and functional PDF viewer built with pure JavaScript, Tailwind CSS, and PDF.js. Designed for a comfortable reading experience with continuous scroll and a built-in dark theme.

## Features
- **Continuous Scroll**: All pages loaded in a single vertical list for a fluid experience.
- **Lazy Rendering**: Uses Intersection Observer to only render pages near the viewport, saving memory and boosting performance.
- **Toolbar**: Dedicated controls for zoom (up to 500%), smooth pagination, and high-quality native printing.
- **Sidebar**: Interactive thumbnail list for quick document navigation and previews.

## Tech Stack
- **Vanilla JavaScript**: Pure logic without heavy frameworks.
- **Tailwind CSS**: Modern utility-first styling.
- **PDF.js**: Industry-standard PDF rendering by Mozilla.

## Setup & Usage
No build process is required. Simply open the `index.html` file in any modern web browser or serve it using a local server.

### Load a specific PDF
You can load any PDF by appending the `file` parameter to the URL:
```text
index.html?file=your-document.pdf
```

---
Developed by [digiApps](https://www.digiapps.com.co/)
