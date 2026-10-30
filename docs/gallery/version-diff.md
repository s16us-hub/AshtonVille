# Comparing two versions

A changed greeting and a new promo step, as the diff command reports them.

Old: `test/fixtures/flow-v1.xml`  New: `test/fixtures/flow-v2.xml`

```text
Comparing flow-v1.xml (old) with flow-v2.xml (new)

ADDED    Promo (#4, PLAY)
CHANGED  Welcome (#2)
           Property Sequence: %welcome.wav → %welcome_v2.wav
           Branch added: Default → Promo
           Branch removed: Default → Hang up

1 added, 0 removed, 1 changed.
```
