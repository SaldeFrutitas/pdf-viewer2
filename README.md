# Premium PDF Viewer

A high-performance, framework-less PDF viewer built with HTML, CSS, Vanilla JavaScript, and Mozilla's `pdf.js`.

## Features

- **Vanilla Stack**: Pure JS implementation, no frameworks (Vue, React, etc.).
- **URL Parameter Loading**: Load any PDF via query string: `?file=https://example.com/doc.pdf`.
- **Premium UI**: 
  - Glassmorphic toolbar.
  - Dark/Light mode toggle.
  - Smooth zoom & navigation.
  - Responsive design.
- **Keyboard Friendly**: Use arrow keys and shortcuts for navigation.

## Setup

Since this is a vanilla project, you can run it using any simple local server.

### Option 1: Live Server (VS Code)
Just right-click `index.html` and select **Open with Live Server**.

### Option 2: NPX
```bash
npx serve .
```

## Usage

Append the PDF URL to your address:
`index.html?file=https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf`
