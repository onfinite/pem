# Coding Standards

## File line limits (hard)

| File type | Max lines |
|-----------|-----------|
| React Native `.tsx` component | 150 |
| NestJS service | 200 |
| NestJS controller | 80 |
| Hook | 80 |
| Util | 60 |
| Type/interface file | no limit |

Split at the limit. Not into one big + one small — into logical units that each have a single reason to exist.

## Naming

### Files

```
# React Native
ChatScreen.tsx          ← screen
UserVoiceBubble.tsx     ← component
useChatMessages.ts      ← hook
formatDuration.ts       ← util
chat.types.ts           ← types
chat.constants.ts       ← constants

# NestJS
chat.service.ts
chat.controller.ts
chat.module.ts
classify-intent.ts      ← single-purpose function
chat.dto.ts
```

### Variables and functions

- Booleans: `isLoading`, `hasError`, `canSend`, `shouldRefetch`, `didReceiveMessage`
- Event handlers: `handleSend`, `handleMicPress`, `handleDrawerClose`
- Async fetch: `fetchMessages`, `loadMoreMessages`
- No `any` — ever

## Path alias (`@/`)

Use `@/` for all internal imports — never `../../` chains.
- `api/`: `@/` → `src/`
- `mobile-app/`: `@/` → project root

## Types

Use `type` for data shapes. Use `interface` for things that get implemented.

```typescript
// ✓ type for data
type Message = { id: string; role: 'user' | 'pem'; content: string }

// ✓ interface for implementations
interface MessageRepository {
  findByUser(userId: string): Promise<Message[]>
}
```

## Enums

Use `as const` objects, not TypeScript `enum`:

```typescript
export const Intent = { DUMP: 'dump', COMMAND: 'command' } as const
export type Intent = typeof Intent[keyof typeof Intent]
```

## Components (React Native)

### One component per file, named exports only

```tsx
// UserVoiceBubble.tsx
export function UserVoiceBubble({ message }: UserVoiceBubbleProps) { ... }
```

### File structure order

1. Imports
2. Types/interfaces
3. Constants local to the component (if any)
4. Component function: state → refs → derived values → effects → handlers → early returns → JSX
5. `StyleSheet.create` at bottom

### No inline styles for static values

```tsx
// ✓ Dynamic value inline (changes at runtime)
<View style={{ opacity: progress }} />

// ✗ Static value inline (should be in StyleSheet)
<View style={{ backgroundColor: '#faf8f4', padding: 16 }} />
```

Colors, spacing, radius, fonts from `constants/theme.ts` and `constants/typography.ts` only.

### JSX ternaries

If either branch has >1 line of JSX, extract a named component. Use early returns for loading/error/empty states.

```tsx
// ✓
if (isLoading) return <LoadingState />
if (error) return <ErrorState error={error} />
return <MessageList messages={messages} />

// ✗
return isLoading ? <LoadingState /> : error ? <ErrorState /> : <MessageList />
```

Ternary is fine for single values or single components:
```tsx
<Text style={isRead ? styles.read : styles.unread}>{text}</Text>
{isLoading ? <Spinner /> : <MessageList messages={messages} />}
```

### Extract sub-components aggressively

Even single-use components are fine — they name a concept and keep files readable.

## Hooks

Components render, hooks think. A component with >2–3 `useState`/`useEffect` calls needs a hook.

```tsx
// ✓ Logic in hook
export function ChatInput() {
  const { text, setText } = useChatText()
  const { isRecording, duration, startRecording, stopRecording } = useVoiceRecording()
  return isRecording
    ? <RecordingBar duration={duration} onStop={stopRecording} />
    : <TextBar text={text} onChange={setText} onMicPress={startRecording} />
}
```

Return only what the component needs — no internal state.

## Utils

One function per util file (usually). Pure functions — no side effects, no imports from app code.

```typescript
// ✓ Pure, testable, reusable
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

## NestJS specifics

### Controllers are thin

Route and delegate only — no business logic.

```typescript
// ✓
@Post('messages')
async sendMessage(@Body() dto: SendMessageDto, @GetUser() user: AuthUser) {
  return this.chatService.sendMessage(user.id, dto)
}
```

### Services have one responsibility

If a service does classification AND embedding AND SSE events — split it.

### No raw SQL

Use Drizzle query builder — it parameterizes automatically.

```typescript
// ✓
const messages = await db
  .select({ id: m.id, role: m.role, content: m.content })
  .from(messagesTable)
  .where(and(eq(m.userId, userId), lt(m.createdAt, before)))
  .orderBy(desc(m.createdAt))
  .limit(50)
```

### Always paginate — no unbounded queries

### DTOs validate at the boundary

```typescript
export class SendMessageDto {
  @IsEnum(['text', 'voice'])
  kind: 'text' | 'voice'

  @IsString()
  @MaxLength(10000)
  @IsOptional()
  content?: string
}
```

### Prompts are isolated

AI prompts live in `.system-prompt.ts` files or as private string builders on `@Injectable()` services — not embedded in orchestration services.

## Magic values → named constants

```typescript
// ✗
if (messages.length > 50) loadMore()
setTimeout(retry, 3000)

// ✓
const MESSAGES_PER_PAGE = 50
const RETRY_DELAY_MS = 3000
```

## Comments

Comment the **why**, not the what. If removing the comment wouldn't confuse a future reader, don't write it.

---

## Security checklist (every new API endpoint)

- [ ] Protected by `ClerkAuthGuard`? (or explicitly `@Public()`)
- [ ] Every DB query filtering by `authenticatedUserId` from JWT, not request body?
- [ ] All input validated by DTO with `class-validator` and `@MaxLength`?
- [ ] Rate-limited (global `ThrottlerGuard` covers it unless intentionally skipped)?
- [ ] No secrets, tokens, or user content in logs?
- [ ] If file upload: MIME type and size validated?

## Scalability checklist (every new feature)

- [ ] DB indexes on all WHERE and ORDER BY fields?
- [ ] All data paginated — no unbounded queries?
- [ ] Slow AI calls (`gpt-4o`, 3–30s) in BullMQ jobs, not the request path?
- [ ] Service stateless — no in-memory state shared between instances (use Redis)?
- [ ] Structured logs with timing for slow-path operations?
- [ ] Anything cacheable in Redis with TTL + invalidation?
- [ ] BullMQ jobs configured with retry + exponential backoff?
- [ ] SSE connections cleaned up on disconnect?

## Code quality checklist (every PR)

- [ ] No file over its line limit
- [ ] No JSX ternary with >1-line blocks on either side
- [ ] No inline styles for static values
- [ ] No hardcoded colors, spacing, or text values
- [ ] Booleans start with is/has/can/should/did
- [ ] Handlers start with handle
- [ ] No `any`
- [ ] Controllers thin — no business logic
- [ ] No magic numbers — everything named
- [ ] AI prompts extracted, not buried in orchestration
