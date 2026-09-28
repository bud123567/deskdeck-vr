---
version: alpha
colors:
  background: "#0b0e13"
  surface: "#11151c"
  raised: "#191f29"
  border: "#252c37"
  foreground: "#e9edf5"
  muted: "#8e99ab"
  primary: "#438fff"
  primaryFill: "#246bd1"
  accent: "#72cbd7"
  success: "#81d9b0"
  danger: "#ffa69c"
typography:
  sans:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
rounded:
  panel: "9px"
  control: "6px"
spacing:
  panel: "20px"
  page: "36px"
---

# DeskDeck VR

## Overview

A working spatial desktop instrument for Mac owners using Quest. Product register, English locale. The user's attached brief is the product authority. Signature: the actual WebXR scene is also the dashboard's workspace preview, not a decorative screenshot or landing-page hero.

## Colors

Runtime ownership: `web/app/globals.css` :root is the canonical CSS token implementation. The tokens above map respectively to --bg, --panel, --raised, --border, --text, --muted, --blue, --cyan, --success, --danger. The primaryFill token maps to --primary-fill for white button text contrast. Three.js scene colors are environment-specific rendering materials, not UI tokens. Changes update this file and CSS together.

## Typography

System sans with SF Pro on macOS. Technical values use system monospace. No external font request, so pairing UI works on an isolated LAN. Compact labels and deliberately restrained heading scale.

## Layout

225px navigation rail, central live scene, 247px inspector. The stage is the main object, not a giant headline. Document owns vertical scrolling. Below 700px, the inspector flows below the scene. At intermediate widths, navigation collapses to icons; names remain accessible.

## Elevation & Depth

Thin borders separate controls; depth belongs to the actual 3D scene. Modal backdrop only uses blur. No decorative dashboard gradients or glowing cards.

## Shapes

Small control and panel radii. App dock icons can use 11px radius to evoke familiar macOS objects. No giant rounded cards.

## Components

Native buttons and selects. Native dialog supplies modal focus confinement and Escape; application owns labels, state, validation, styling and outcome. Each meaningful action has pending, error and disabled behavior. The stage never shows invented connection metrics. Offline app icons remain visible and disabled with a reason.

## Do's and Don'ts

Show a preview label when disconnected. All saved layouts are local and contain no credentials. Keep remote controls disabled until a data channel exists. Do not imply multiple independent desktops from duplicate textures. Reduced motion removes CSS transitions; the XR render loop still tracks the headset.
