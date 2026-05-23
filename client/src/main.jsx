/*
 * Project note: React starts from this file and mounts the whole Smart Tole interface.
 * Global providers, browser routing, and app-wide styles should be initialized here instead of inside individual pages.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
