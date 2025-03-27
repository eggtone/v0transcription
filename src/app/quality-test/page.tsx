import React from "react";
import QualityTestUI from "@/components/quality-test-ui";

export default function QualityTestPage() {
  return (
    <main className="container py-8">
      <h1 className="text-3xl font-bold mb-8 text-center">YouTube Audio Quality Test</h1>
      <QualityTestUI />
    </main>
  );
} 