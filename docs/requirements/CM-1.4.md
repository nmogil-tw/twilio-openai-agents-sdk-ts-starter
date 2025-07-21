# Requirement CM-1.4 – Pluggable Subject Resolver

**Status:** 🚧 In Progress

---

## 1. User Story

> *“As a developer, I can map phone numbers to Segment profile IDs or CRM contacts without touching core code.”*

## 2. Objective

Abstract channel-specific identifiers (phone, cookie, userId) into a canonical **`subjectId`** via a plug-in mechanism.

## 3. Interface

Add `src/identity/subject-resolver.ts`:

```ts
export type SubjectId = string;

export interface SubjectResolver {
  /**
   * @param raw Arbitrary metadata from channel (e.g., { from: "+1415555…", cookies: … })
   */
  resolve(raw: Record<string, any>): Promise<SubjectId>;
}
```

## 4. Tasks

### 4.1 DefaultPhoneSubjectResolver

- [ ] Implement class that:
  * Accepts `{ from: "+E.164" }` and returns lowercase phone stripped of `+` → `subjectId`.
  * Persists a lookup table `phone → subjectId` in `./data/subject-map.json` to ensure stability.

### 4.2 Resolver Registry

- [ ] Create `SubjectResolverRegistry` singleton allowing:
  ```ts
  register(name: string, resolver: SubjectResolver)
  get(name: string): SubjectResolver
  ```
- [ ] Load default resolver on startup.

### 4.3 Channel Adapter Wiring

- [ ] Pass raw metadata to configured resolver (env `SUBJECT_RESOLVER=phone|custom`).

### 4.4 Docs & Examples

- [ ] README: How to create `CrmSubjectResolver` that hits external REST API.
- [ ] Provide stub in `examples/custom-resolvers/crm.ts`.

### 4.5 Tests

- [ ] Unit test: same phone across channels returns same id.

## 5. Code Example – Custom Resolver

```ts
class CrmSubjectResolver implements SubjectResolver {
  async resolve(raw: Record<string, any>) {
    const phone = raw.from;
    const res = await fetch(`${process.env.CRM_BASE}/lookup?phone=${phone}`);
    const data = await res.json();
    return data.profileId as SubjectId;
  }
}
SubjectResolverRegistry.register('crm', new CrmSubjectResolver());
```

## 6. Acceptance Criteria

1. Switching `SUBJECT_RESOLVER` via env changes mapping logic without code edits.
2. Default resolver maps phone consistently.
3. Channel adapters use `SubjectResolver` exclusively to obtain `subjectId`.

## 7. Definition of Done

- [ ] Tasks complete, CI green.
- [ ] Docs updated with resolver guide.

---

*Module CM done ⇒ proceed to PL-1.0.* 