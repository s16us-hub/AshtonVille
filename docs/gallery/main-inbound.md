# Main inbound line (example)

The sample script that ships with the viewer: hours check, menu, CRM lookup and queue routing.

Source: `examples/main-inbound-example.xml`

## QA check

```text
examples/main-inbound-example.xml: Main Inbound Line (example) (27 steps, 41 branches)
  MED   Menu has no invalid-input branch (step #18)
        Offer a callback (#18) doesn't handle a key that isn't a menu option.
  MED   Unreachable action (step #50)
        Old promo message (#50) can't be reached from Begin or any event. It may be left over from an earlier version.
  LOW   No Default branch (step #17)
        Wait over 5 minutes? (#17) has no Default branch. Studio guidance is to always connect Default.
  LOW   Subscript not in the library (step #24)
        Post-call survey (#24) runs "PostCallSurvey", which hasn't been uploaded. Upload it to follow this step.

4 finding(s): 0 high, 2 medium, 2 low.
```

## Test cases (CSV)

The first rows of the CSV export. Open the full file with `studio-flow-check tests` to see every row.

```csv
﻿"Test ID","Scenario","Preconditions","Steps","Expected path","Expected result","Script"
"TC-001","Closed → Hang up","Inbound call reaches the script
Hours profile state: Closed (Support - US Eastern)","1. No caller decisions on this path","#1 > #2 > #3 > #5 > #30","Caller can leave a voicemail. Call ends at ""Hang up""","Main Inbound Line (example)"
"TC-002","Open → OnError → 1 → True → 1 → Hang up","Inbound call reaches the script
```

## Flowchart (Mermaid)

Paste this into any Mermaid-aware viewer to draw the flow.

```mermaid
flowchart TD
  n0(["Begin [BEGIN]"])
  n1{"Check business hours [HOURS]"}
  n2["After-hours message [PLAY]"]
  n3["Holiday closure message [PLAY]"]
  n4["Leave a voicemail [VOICEMAIL]"]
  n5["Welcome greeting [PLAY]"]
  n6["Prepare caller lookup [SNIPPET]"]
  n7["Look up caller in CRM [RESTAPI]"]
  n8{"Platinum customer? [IF]"}
  n9{"Main menu [MENU]"}
  n10["Billing queue [REQAGENT]"]
  n11["Technical support queue [REQAGENT]"]
  n12["Sales queue [REQAGENT]"]
  n13["General queue [REQAGENT]"]
  n14["Sorry, that wasn't an option [PLAY]"]
  n15["Get estimated wait time [SNIPPET]"]
  n16{"Wait over 5 minutes? [IF]"}
  n17{"Offer a callback [MENU]"}
  n18["Hold music and queue position [PLAY]"]
  n19["Platinum priority queue [REQAGENT]"]
  n20["Schedule callback [QUEUECALLBACK]"]
  n21["Callback confirmation [PLAY]"]
  n22["Post-call survey [RUNSUB]"]
  n23(["Hang up [HANGUP]"])
  n24(["Caller hangs up [ONRELEASE]"])
  n25(["End [END]"])
  n26["Old promo message [PLAY]"]
  n0 -->|"Default"| n1
  n1 -->|"Open"| n5
  n1 -->|"Closed"| n2
  n1 -->|"Holiday"| n3
  n1 -->|"Default"| n5
  n2 -->|"Default"| n4
  n3 -->|"Default"| n4
  n4 -->|"Default"| n23
  n5 -->|"Default"| n6
  n6 -->|"Default"| n7
  n7 -->|"Default"| n8
  n7 -->|"OnError"| n9
  n8 -->|"True"| n19
  n8 -->|"False"| n9
  n8 -->|"Default"| n9
  n9 -->|"1"| n10
  n9 -->|"2"| n11
  n9 -->|"3"| n12
  n9 -->|"0"| n13
  n9 -->|"Timeout"| n14
  n9 -->|"InvalidDigit"| n14
  n9 -->|"Default"| n13
  n10 -->|"Default"| n15
  n11 -->|"Default"| n15
  n12 -->|"Default"| n15
  n13 -->|"Default"| n15
  n14 -->|"Default"| n9
  n15 -->|"Default"| n16
  n16 -->|"True"| n17
  n16 -->|"False"| n18
  n17 -->|"1"| n20
  n17 -->|"2"| n18
  n17 -->|"Timeout"| n18
  n17 -->|"Default"| n18
  n18 -->|"Default"| n15
  n19 -->|"Default"| n18
  n20 -->|"Default"| n21
  n21 -->|"Default"| n22
  n22 -->|"Default"| n23
  n24 -->|"Default"| n25
  n26 -->|"Default"| n23
```
