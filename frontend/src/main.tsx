import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { RouterProvider } from "react-router-dom";

import { router } from "./router";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    {import.meta.env.PROD && (
      <Analytics beforeSend={(event) => {
        const url = new URL(event.url);
        if (url.pathname.replace(/\/$/, "") === "/auth/callback") return null;
        return { ...event, url: url.origin + url.pathname };
      }} />
    )}
  </React.StrictMode>,
);
