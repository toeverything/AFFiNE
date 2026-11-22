# Frozen server contract artifacts

Generate versioned artifacts exclusively through
`scripts/oracle/extract-v0275-contracts.mjs` using the root immutable Yarn graph.
Do not edit generated HTML, SDL or JSON manually. The version manifest records
source/lock fingerprints, exact counts and artifact hashes; check mode must reject
any source/artifact drift. The schema audit compares backend root declarations and
frontend generated object/input fields. Distinguish controller routes from
imperative/flavor-specific mounts when reporting counts.
