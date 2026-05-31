import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { ScoreExplainer } from "./admin/ScoreExplainer.jsx";
import { GoldSetHarness } from "./admin/GoldSetHarness.jsx";

// Admin console: two tabs — F1 (Score Explainer) and F2 (Gold-Set Harness).
// Entry point for scoring + relevance regression work (v0.33 T1).
export function AdminConsole() {
  const { user, status } = useAuth();
  const [activeTab, setActiveTab] = useState("score-explainer");

  // Check admin status from plan (WS3 identity model: plan='admin').
  // For now, rely on the Supabase user record; in production, verify via API.
  const isAdmin = user?.user_metadata?.plan === "admin" ||
                  (typeof window !== "undefined" && localStorage.getItem("opencite_admin") === "true");

  if (status !== "authenticated" || !isAdmin) {
    return (
      <div className="py-8 text-center border border-red-300 bg-red-50/60 px-4">
        <p className="mono-font text-[11px] uppercase tracking-widest text-red-900">
          Admin access required.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-2 border-b border-stone-200 pb-3">
        {[
          { id: "score-explainer", label: "Score Explainer (F1)" },
          { id: "gold-set", label: "Gold-Set Harness (F2)" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`mono-font text-xs uppercase tracking-widest px-3 py-1.5 border-b-2 transition ${
              activeTab === tab.id
                ? "border-stone-900 text-stone-900"
                : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "score-explainer" && <ScoreExplainer />}
        {activeTab === "gold-set" && <GoldSetHarness />}
      </div>
    </div>
  );
}
