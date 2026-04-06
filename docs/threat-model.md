# Synq Threat Model

## Assets

- user identities, handles, optional recovery data
- passkey/session state and device approval state
- ciphertext payloads and encrypted attachment references
- workspace security settings and audit history

## Primary threats

- account takeover via stolen refresh token or social recovery abuse
- malicious or cloned client bypassing UI-only privacy checks
- metadata leakage from logs, previews, search indexes, or analytics
- replay and out-of-order message delivery attacks in sealed rooms
- stolen device continuing to read sealed-room history after revocation
- insider misuse, invite abuse, spam, and malicious attachments inside team spaces

## Current controls

- short-lived access sessions with refresh rotation
- explicit device trust states: pending, approved, revoked, compromised
- redacted previews for E2EE conversations on the server response path
- attachment lifecycle states with encrypted upload-before-finalize-before-send requirement
- audit trail for passkey, device, attachment, and onboarding events
- durable runtime persistence for sessions and state when Postgres mode is enabled

## Gaps still to close

- replace simplified passkey flow with full WebAuthn attestation/assertion verification
- replace the current ratchet approximation with a fully reviewed double-ratchet implementation
- add structured log sinks, alerting, anomaly detection, and abuse scoring
- add formal key transparency and recovery-key procedures
- replace the current Postgres runtime bundle approach with normalized repositories + Redis coordination for horizontal scale
