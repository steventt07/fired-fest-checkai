// ============================================================================
// Demo seed material
//
// A small, realistic set of event-production files used to feed the harness in
// the console. Deliberately includes a member with only a first name and a
// string-typed amount so the checkpoints have something to catch and the
// feedback-driven retry has work to do.
// ============================================================================

import type { MaterialFile } from "./types";

export function buildSeedFiles(): MaterialFile[] {
  return [
    {
      id: "seed-workflow",
      name: "run-of-show.md",
      category: "Workflow",
      content: [
        "# Summit Corp Annual Gala — Run of Show",
        "Date: 2026-09-18",
        "Doors 18:00 / Dinner 19:30 / Headline 21:00",
        "Venue: The Aurora Ballroom, 88 Harbor St, Seattle WA",
      ].join("\n"),
    },
    {
      id: "seed-people",
      name: "band-roster.csv",
      category: "People",
      content: [
        "name,role,fee",
        "Maya Rodriguez,Lead Vocals,1200",
        "James Okafor,Guitar,900",
        "Priya,Keys,850",
        "Devon Carter,Drums,$900",
      ].join("\n"),
    },
    {
      id: "seed-payments",
      name: "settlement.txt",
      category: "Payments",
      content: [
        "Performance fee total: 3850",
        "Deposit received: 1500",
        "Balance due on night: 2350",
      ].join("\n"),
    },
    {
      id: "seed-comms",
      name: "client-email.txt",
      category: "Comms",
      content: [
        "From: events@summitcorp.example.com",
        "Subject: Final headcount + AV",
        "Hi team, we're confirmed for 240 guests. Client contact: Dana Lin.",
      ].join("\n"),
    },
  ];
}
