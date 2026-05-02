import type { Metadata } from "next";
import { CardFlowApp } from "@/components/card-flow/card-flow-app";

export const metadata: Metadata = {
  title: "Card Flow",
  description: "Capture business cards, build a contact list, and draft follow-ups from your phone.",
};

export default function CardFlowPage() {
  return <CardFlowApp />;
}
