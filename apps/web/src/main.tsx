import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { HouseholdProvider, useHousehold } from "./context/HouseholdContext";
import { HouseholdGate } from "./pages/HouseholdGate";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000 },
  },
});

function AppWithGate() {
  const { household, isLoading } = useHousehold();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }
  if (!household) {
    return <HouseholdGate />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <HouseholdProvider>
          <AppWithGate />
        </HouseholdProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
