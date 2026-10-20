APP LOGO
========

The app mark lives at /public/favicon.png and is used by the navbar, footer,
account rail, authentication screens, browser favicon, PWA manifest, social
preview and transactional email header. It is the single source of truth.

The image is rendered with object-contain at a fixed height, so it is never
stretched, distorted or recoloured. If the file cannot load, the company name is
shown as plain text in the logo position.

This /brand folder is kept only for future approved brand assets. It is no
longer read by the Logo component; to change the mark, replace
/public/favicon.png (and the paths in index.html if the filename changes).
