import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { initTheme } from "./lib/theme";
import { Toaster } from "./lib/toast";
import "./styles.css";

initTheme();

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <HashRouter>
        <App />
      </HashRouter>
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
