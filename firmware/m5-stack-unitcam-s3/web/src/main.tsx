import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import PageRoot from "./routes/page-root";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PageRoot />
  </React.StrictMode>,
);
