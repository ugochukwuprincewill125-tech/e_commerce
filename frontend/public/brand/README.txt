OFFICIAL LOGO GOES HERE
=======================

Drop the official Timeline Global Systems Limited logo files into this folder
using these exact names (PNG with a transparent background, or SVG):

  timeline-logo.png         -> the standard logo (used on light backgrounds:
                               navbar, auth pages, checkout)
  timeline-logo-white.png   -> OPTIONAL light/white version for dark
                               backgrounds (footer, hero). If this file is
                               missing, the standard logo is shown on a small
                               white plate so it stays legible.

Want SVG instead? Change LOGO_SRC / LOGO_ON_DARK_SRC in
src/components/Logo/Logo.jsx.

The logo is rendered with `object-contain` and a fixed height only, so it is
never stretched, distorted or recoloured.

Until the file is added, the site shows the company name in plain text in the
logo position. That text is only a placeholder and is not a logo.
