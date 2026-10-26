"use client";
// Every app path (/scoreboard, /erp/demand-planning, /projects/p/<id>, ...)
// renders the single-page app; app/page.js reads the path and opens that
// module. Real routes (/form, /sign, /privacy, /rfp, /api ...) still win.
export { default } from "../page";
