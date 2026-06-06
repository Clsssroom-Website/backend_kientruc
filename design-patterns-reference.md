# Design Patterns & Architecture Reference (TypeScript)

> **Purpose**: Reference guide for AI coding assistants to select appropriate design patterns when implementing features in TypeScript. Before writing code, scan relevant sections and apply the best-fit pattern(s).
>
> **Language**: TypeScript. All examples use strict TypeScript idioms — interfaces, generics, utility types, decorators, and async/await.

---

## How to Use This Document

1. Identify the **nature of the feature** (data access, UI, async, communication, etc.)
2. Find the matching **category** below
3. Read the definition, TypeScript structure, and use cases
4. Apply the pattern — combine multiple patterns as needed

---

## Table of Contents

- [TypeScript-Specific Techniques](#typescript-specific-techniques)
- [Creational Patterns](#creational-patterns)
- [Structural Patterns](#structural-patterns)
- [Behavioral Patterns](#behavioral-patterns)
- [Architectural Patterns](#architectural-patterns)
- [Frontend Patterns (React + TS)](#frontend-patterns-react--ts)
- [Backend / API Patterns (Node.js + TS)](#backend--api-patterns-nodejs--ts)
- [Data Access Patterns](#data-access-patterns)
- [Concurrency & Async Patterns](#concurrency--async-patterns)
- [Security Patterns](#security-patterns)
- [Performance Patterns](#performance-patterns)
- [Testing Patterns](#testing-patterns)
- [Pattern Selection Quick Reference](#pattern-selection-quick-reference)

---

## TypeScript-Specific Techniques

> These are not GoF patterns but TypeScript language features that should be leveraged consistently.

### Strict Typing with Interfaces & Types

- **Prefer `interface`** for object shapes that may be extended or implemented.
- **Prefer `type`** for unions, intersections, mapped types, and primitives.
- **Never use `any`** — use `unknown` when the type is truly unknown, then narrow it.

```typescript
// Bad
function process(data: any) { ... }

// Good
function process(data: unknown): string {
  if (typeof data === "string") return data.toUpperCase();
  throw new Error("Expected string");
}
```

---

### Discriminated Unions (Tagged Unions)

- **What**: A union of types each with a common literal field (`kind`, `type`, `status`) used to narrow types safely.
- **Use when**: Modeling states, results, events, or messages with multiple variants.

```typescript
type Result<T> =
  | { status: "success"; data: T }
  | { status: "error"; error: Error }
  | { status: "loading" };

function render(result: Result<User>) {
  switch (result.status) {
    case "success": return result.data.name; // TS knows data exists here
    case "error":   return result.error.message;
    case "loading": return "Loading...";
  }
}
```

---

### Generic Constraints

- **Use when**: Writing reusable utilities that work across types but still need type safety.

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json() as Promise<T>;
}
```

---

### Utility Types

Always use built-in utility types before writing custom mapped types.

| Utility Type | Use case |
|---|---|
| `Partial<T>` | All fields optional — DTO updates, patch payloads |
| `Required<T>` | All fields required — validated output types |
| `Readonly<T>` | Immutable objects — config, frozen state |
| `Pick<T, K>` | Select subset of fields — view models, projections |
| `Omit<T, K>` | Exclude fields — remove `id` from create DTOs |
| `Record<K, V>` | Key-value maps — lookup tables, indexes |
| `Exclude<T, U>` | Remove union members |
| `ReturnType<T>` | Extract function return type |
| `Awaited<T>` | Unwrap Promise type |

```typescript
type CreateUserDTO = Omit<User, "id" | "createdAt">;
type UpdateUserDTO = Partial<Pick<User, "name" | "email">>;
type UserMap       = Record<string, User>;
```

---

### Zod for Runtime Validation

- **Use when**: Validating external data (API payloads, env vars, form inputs) and inferring TS types from schemas.
- **Tools**: `zod`

```typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  name:  z.string().min(1),
  email: z.string().email(),
  age:   z.number().int().positive().optional(),
});

type CreateUserDTO = z.infer<typeof CreateUserSchema>;

const result = CreateUserSchema.safeParse(req.body);
if (!result.success) throw new ValidationError(result.error);
const dto: CreateUserDTO = result.data; // fully typed, safe
```

---

### Branded / Nominal Types

- **Use when**: Preventing type confusion between structurally identical primitives (e.g., `UserId` vs `OrderId`).

```typescript
type UserId  = string & { readonly __brand: "UserId" };
type OrderId = string & { readonly __brand: "OrderId" };

function createUserId(id: string): UserId {
  return id as UserId;
}

function getUser(id: UserId): User { ... }

// getUser(orderId) → compile-time error ✓
```

---

### Dependency Injection with `tsyringe` or `inversify`

- **Use when**: Managing service dependencies in Node.js/NestJS apps; improves testability.

```typescript
import { injectable, inject, container } from "tsyringe";

@injectable()
class UserService {
  constructor(@inject("UserRepository") private repo: IUserRepository) {}

  async findById(id: UserId): Promise<User> {
    return this.repo.findById(id);
  }
}

const service = container.resolve(UserService);
```

---

## Creational Patterns

> Use when **object creation** needs to be controlled, abstracted, or centralized.

### Singleton

- **What**: One instance per process, globally accessible.
- **Use when**: DB connection pools, config, logger. Prefer DI containers over manual singletons in large apps.
- **Avoid when**: Unit testing (hard to mock — use DI instead).

```typescript
class AppConfig {
  private static instance: AppConfig;
  readonly dbUrl: string;

  private constructor() {
    this.dbUrl = process.env.DATABASE_URL ?? "";
  }

  static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }
}

const config = AppConfig.getInstance();
```

---

### Factory Method

- **What**: Creates objects through an interface; implementations decide the concrete class.
- **Use when**: The concrete type is determined at runtime (by config or user input).

```typescript
interface Notifier {
  send(to: string, message: string): Promise<void>;
}

class EmailNotifier implements Notifier { ... }
class SmsNotifier   implements Notifier { ... }
class PushNotifier  implements Notifier { ... }

type NotifierType = "email" | "sms" | "push";

function createNotifier(type: NotifierType): Notifier {
  const map: Record<NotifierType, Notifier> = {
    email: new EmailNotifier(),
    sms:   new SmsNotifier(),
    push:  new PushNotifier(),
  };
  return map[type];
}
```

---

### Abstract Factory

- **What**: Creates families of related objects without specifying concrete classes.
- **Use when**: Multi-provider integrations (AWS vs GCP), multi-theme UI, platform-specific renderers.

```typescript
interface StorageProvider {
  upload(file: Buffer, name: string): Promise<string>;
  delete(name: string): Promise<void>;
}

interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

interface InfrastructureFactory {
  createStorage(): StorageProvider;
  createEmail(): EmailProvider;
}

class AWSFactory implements InfrastructureFactory {
  createStorage() { return new S3Storage(); }
  createEmail()   { return new SESEmail(); }
}

class GCPFactory implements InfrastructureFactory {
  createStorage() { return new GCSStorage(); }
  createEmail()   { return new SendGridEmail(); }
}
```

---

### Builder

- **What**: Constructs complex objects step-by-step with a fluent API.
- **Use when**: Objects with many optional fields; complex query construction.

```typescript
class QueryBuilder<T> {
  private conditions: string[] = [];
  private _limit?: number;
  private _orderBy?: string;

  where(condition: string): this {
    this.conditions.push(condition);
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  orderBy(field: keyof T & string, dir: "ASC" | "DESC" = "ASC"): this {
    this._orderBy = `${field} ${dir}`;
    return this;
  }

  build(): string {
    let q = `SELECT * FROM table`;
    if (this.conditions.length) q += ` WHERE ${this.conditions.join(" AND ")}`;
    if (this._orderBy) q += ` ORDER BY ${this._orderBy}`;
    if (this._limit)   q += ` LIMIT ${this._limit}`;
    return q;
  }
}

const sql = new QueryBuilder<User>()
  .where("age > 18")
  .orderBy("createdAt", "DESC")
  .limit(20)
  .build();
```

---

### Prototype

- **What**: Clone objects using `structuredClone` or spread syntax.
- **Use when**: Cheap copies of complex config objects; duplicating entities.

```typescript
// Shallow clone
const updated = { ...originalConfig, theme: "dark" };

// Deep clone (native, no third-party needed)
const deep = structuredClone(originalObject);

interface Cloneable<T> {
  clone(): T;
}
```

---

## Structural Patterns

> Use when **composing classes and objects** into larger structures.

### Adapter

- **What**: Wraps an incompatible interface to match the expected one.
- **Use when**: Integrating third-party SDKs, legacy code, or replacing a dependency without changing callers.

```typescript
// Target interface your app expects
interface PaymentGateway {
  charge(amountCents: number, currency: string): Promise<string>; // returns txId
}

// Third-party SDK with a different shape
class StripeSDK {
  createCharge(params: { amount: number; currency: string }): Promise<{ id: string }> { ... }
}

// Adapter bridges the gap
class StripeAdapter implements PaymentGateway {
  constructor(private stripe: StripeSDK) {}

  async charge(amountCents: number, currency: string): Promise<string> {
    const result = await this.stripe.createCharge({ amount: amountCents, currency });
    return result.id;
  }
}
```

---

### Decorator

- **What**: Wraps an object to add behavior without changing its class.
- **Use when**: Cross-cutting concerns — logging, caching, retry, metrics, auth checks.

```typescript
class CachedUserRepository implements IUserRepository {
  private cache = new Map<string, User>();

  constructor(private inner: IUserRepository) {}

  async findById(id: UserId): Promise<User | null> {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const user = await this.inner.findById(id);
    if (user) this.cache.set(id, user);
    return user;
  }
}

// Stack decorators — each adds a concern
const repo = new CachedUserRepository(
  new LoggingUserRepository(
    new PrismaUserRepository(db)
  )
);
```

---

### Facade

- **What**: Single simplified API over a complex subsystem.
- **Use when**: Hiding orchestration logic; creating service layers; wrapping multiple calls.

```typescript
class OrderFacade {
  constructor(
    private inventory:    InventoryService,
    private payment:      PaymentService,
    private notification: NotificationService,
    private orderRepo:    OrderRepository,
  ) {}

  async placeOrder(dto: CreateOrderDTO): Promise<Order> {
    await this.inventory.reserve(dto.items);
    const txId  = await this.payment.charge(dto.userId, dto.totalCents);
    const order = await this.orderRepo.create({ ...dto, txId });
    await this.notification.send(dto.userId, "Order confirmed");
    return order;
  }
}
```

---

### Proxy

- **What**: Controls access to an object — for lazy init, logging, caching, or auth.
- **Use when**: Access control, rate limiting, remote service proxies.

```typescript
class AuthorizedRepository<T> implements IRepository<T> {
  constructor(
    private inner:        IRepository<T>,
    private currentUser:  User,
    private requiredRole: Role,
  ) {}

  async findAll(): Promise<T[]> {
    if (!this.currentUser.roles.includes(this.requiredRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    return this.inner.findAll();
  }
}
```

---

### Composite

- **What**: Tree of objects treated uniformly — leaves and composites share the same interface.
- **Use when**: Menu trees, permission groups, file systems, UI component hierarchies.

```typescript
interface Permission {
  name: string;
  isGranted(user: User): boolean;
}

class SinglePermission implements Permission {
  constructor(public name: string, private check: (u: User) => boolean) {}
  isGranted(user: User) { return this.check(user); }
}

class PermissionGroup implements Permission {
  name: string;
  private children: Permission[] = [];

  add(p: Permission): this { this.children.push(p); return this; }

  isGranted(user: User): boolean {
    return this.children.every(c => c.isGranted(user)); // ALL must pass
  }
}
```

---

## Behavioral Patterns

> Use when managing **algorithms, communication, and responsibilities** between objects.

### Strategy

- **What**: Interchangeable family of algorithms behind a common interface.
- **Use when**: Multiple ways to perform an operation (pricing, sorting, validation, export).

```typescript
interface PricingStrategy {
  calculate(basePrice: number, user: User): number;
}

class RegularPricing implements PricingStrategy {
  calculate(base: number): number { return base; }
}

class PremiumDiscount implements PricingStrategy {
  calculate(base: number): number { return base * 0.8; }
}

class PricingService {
  constructor(private strategy: PricingStrategy) {}

  setStrategy(s: PricingStrategy): void { this.strategy = s; }

  getPrice(base: number, user: User): number {
    return this.strategy.calculate(base, user);
  }
}
```

---

### Observer (Typed Event Emitter)

- **What**: Notify multiple subscribers when state changes.
- **Use when**: Domain events, plugin systems, reactive UI state, WebSocket broadcasts.

```typescript
type EventMap = {
  "user.created": [user: User];
  "order.placed": [order: Order];
};

class TypedEmitter<T extends Record<string, unknown[]>> {
  private listeners = new Map<keyof T, ((...args: unknown[]) => void)[]>();

  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): void {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...existing, listener as (...args: unknown[]) => void]);
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): void {
    this.listeners.get(event)?.forEach(fn => fn(...args));
  }
}

const bus = new TypedEmitter<EventMap>();
bus.on("user.created", (user) => sendWelcomeEmail(user)); // fully typed
```

---

### Command

- **What**: Encapsulates an action as an object — enabling queuing, logging, undo.
- **Use when**: Task queues, undo/redo, transactional operations, audit logs.

```typescript
interface Command<TResult = void> {
  execute(): Promise<TResult>;
  undo?(): Promise<void>;
}

class TransferFundsCommand implements Command {
  constructor(
    private from:     AccountId,
    private to:       AccountId,
    private amount:   number,
    private accounts: AccountRepository,
  ) {}

  async execute(): Promise<void> {
    await this.accounts.debit(this.from, this.amount);
    await this.accounts.credit(this.to, this.amount);
  }

  async undo(): Promise<void> {
    await this.accounts.debit(this.to, this.amount);
    await this.accounts.credit(this.from, this.amount);
  }
}
```

---

### Chain of Responsibility (Middleware)

- **What**: A request passes through a chain of handlers; each may process or forward it.
- **Use when**: HTTP middleware, validation pipelines, request processing steps.

```typescript
type Next = () => Promise<void>;

interface Middleware<TCtx> {
  handle(ctx: TCtx, next: Next): Promise<void>;
}

class AuthMiddleware implements Middleware<RequestContext> {
  async handle(ctx: RequestContext, next: Next): Promise<void> {
    if (!ctx.headers.authorization) throw new UnauthorizedError();
    ctx.user = await verifyToken(ctx.headers.authorization);
    await next();
  }
}

// Pipeline runner
async function runPipeline<T>(ctx: T, chain: Middleware<T>[]): Promise<void> {
  const run = (i: number): Promise<void> => {
    if (i >= chain.length) return Promise.resolve();
    return chain[i].handle(ctx, () => run(i + 1));
  };
  return run(0);
}
```

---

### State

- **What**: Object behavior changes based on its internal state — explicit state machine.
- **Use when**: Order lifecycle, connection states, UI modes, wizard steps.

```typescript
type OrderStatus = "pending" | "paid" | "shipped" | "delivered" | "cancelled";

interface OrderState {
  pay(order: Order): void;
  ship(order: Order): void;
  cancel(order: Order): void;
}

class PendingState implements OrderState {
  pay(order: Order)    { order.transitionTo("paid"); }
  ship(_order: Order)  { throw new Error("Must pay before shipping"); }
  cancel(order: Order) { order.transitionTo("cancelled"); }
}

class PaidState implements OrderState {
  pay(_order: Order)   { throw new Error("Already paid"); }
  ship(order: Order)   { order.transitionTo("shipped"); }
  cancel(order: Order) { order.refundAndTransitionTo("cancelled"); }
}
```

---

### Template Method

- **What**: Base class defines algorithm skeleton; subclasses override specific steps.
- **Use when**: ETL pipelines, report generators, data importers with shared structure.

```typescript
abstract class DataImporter<TRaw, TParsed> {
  // Fixed algorithm
  async run(source: string): Promise<void> {
    const raw       = await this.fetch(source);
    const parsed    = await this.parse(raw);
    const validated = this.validate(parsed);
    await this.save(validated);
  }

  protected abstract fetch(source: string): Promise<TRaw>;
  protected abstract parse(raw: TRaw): Promise<TParsed>;
  protected validate(data: TParsed): TParsed { return data; } // optional hook
  protected abstract save(data: TParsed): Promise<void>;
}

class CsvUserImporter extends DataImporter<string, User[]> {
  protected fetch(path: string)   { return fs.readFile(path, "utf-8"); }
  protected parse(csv: string)    { return parseCsvToUsers(csv); }
  protected save(users: User[])   { return this.userRepo.insertMany(users); }
}
```

---

### Iterator (AsyncGenerator-based)

- **What**: Traverse a collection lazily without exposing internal representation.
- **Use when**: Cursor-based pagination, streaming large datasets, lazy sequences.

```typescript
async function* paginatedFetch<T>(
  fetcher: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>,
): AsyncGenerator<T> {
  let cursor: string | undefined;
  do {
    const page = await fetcher(cursor);
    for (const item of page.items) yield item;
    cursor = page.nextCursor;
  } while (cursor);
}

// Usage
for await (const user of paginatedFetch(fetchUsersPage)) {
  await processUser(user);
}
```

---

### Mediator (CQRS Dispatcher)

- **What**: Central hub for communication between components; reduces direct coupling.
- **Use when**: CQRS command/query dispatching, event bus, form orchestration.

```typescript
interface Handler<TReq, TRes = void> {
  handle(request: TReq): Promise<TRes>;
}

class Mediator {
  private handlers = new Map<string, Handler<unknown, unknown>>();

  register<TReq, TRes>(token: string, handler: Handler<TReq, TRes>): void {
    this.handlers.set(token, handler as Handler<unknown, unknown>);
  }

  async send<TReq, TRes>(token: string, request: TReq): Promise<TRes> {
    const handler = this.handlers.get(token);
    if (!handler) throw new Error(`No handler registered for: ${token}`);
    return handler.handle(request) as Promise<TRes>;
  }
}

await mediator.send<CreateUserCommand, User>("CreateUser", { name: "Alice" });
```

---

### Visitor

- **What**: Add operations to objects without modifying their classes.
- **Use when**: AST traversal, document export (PDF/HTML/MD), static analysis tools.

```typescript
interface AstNode {
  accept<T>(visitor: AstVisitor<T>): T;
}

interface AstVisitor<T> {
  visitBinaryExpr(node: BinaryExpr): T;
  visitLiteral(node: Literal): T;
  visitIdentifier(node: Identifier): T;
}

class TypeCheckerVisitor implements AstVisitor<Type> {
  visitBinaryExpr(node: BinaryExpr): Type { ... }
  visitLiteral(node: Literal): Type       { ... }
  visitIdentifier(node: Identifier): Type { ... }
}
```

---

### Memento

- **What**: Captures and restores an object's state.
- **Use when**: Undo/redo, draft auto-save, game checkpoints.

```typescript
interface Memento<T> {
  readonly state: Readonly<T>;
  readonly timestamp: Date;
}

class History<T> {
  private snapshots: Memento<T>[] = [];

  save(state: T): void {
    this.snapshots.push({ state: structuredClone(state), timestamp: new Date() });
  }

  undo(): T | undefined {
    this.snapshots.pop();
    return this.snapshots.at(-1)?.state;
  }
}
```

---

## Architectural Patterns

> Use when structuring **entire applications or large subsystems**.

### Clean Architecture

- **What**: Concentric layers — Domain → Application → Infrastructure → Presentation. Dependencies point inward only.
- **Use when**: Long-lived apps; keeping domain logic free from frameworks and ORMs.

```
src/
  domain/          # Entities, value objects, domain events, repository interfaces
  application/     # Use cases, DTOs, service interfaces (zero framework imports)
  infrastructure/  # Prisma repos, Redis, Stripe adapter, Express/Fastify routes
  presentation/    # Controllers, route handlers, GraphQL resolvers
```

```typescript
// domain/entities/User.ts — no imports from outside domain
export class User {
  private constructor(
    public readonly id: UserId,
    public readonly email: Email,
    private _name: string,
  ) {}

  static create(id: UserId, email: Email, name: string): User {
    if (!name.trim()) throw new DomainError("Name cannot be blank");
    return new User(id, email, name);
  }
}

// application/use-cases/CreateUser.ts — depends only on domain interfaces
export class CreateUserUseCase {
  constructor(
    private users:  IUserRepository, // interface defined in domain
    private events: IEventBus,
  ) {}

  async execute(dto: CreateUserDTO): Promise<User> {
    const user = User.create(newUserId(), Email.parse(dto.email), dto.name);
    await this.users.save(user);
    await this.events.publish(new UserCreatedEvent(user));
    return user;
  }
}
```

---

### Modular Monolith

- **What**: Single deployable unit, split into modules with explicit public APIs; no cross-module DB access.
- **Use when**: Small-to-medium teams, early product stage, future microservices migration path.

```
src/modules/
  users/
    index.ts              # public API only — no internals exported
    users.service.ts
    users.repository.ts
  orders/
    index.ts
    orders.service.ts     # imports from users/index.ts, not users.repository.ts
  shared/
    events/
    errors/
    types/
```

---

### CQRS

- **What**: Separate write path (Commands mutate state) from read path (Queries return data).
- **Use when**: Different read/write load, complex domain, Event Sourcing.

```typescript
// Commands — mutate state, return void or minimal ack
interface Command { readonly type: string; }

class PlaceOrderCommand implements Command {
  readonly type = "PlaceOrder" as const;
  constructor(
    public readonly userId: UserId,
    public readonly items:  OrderItem[],
  ) {}
}

// Queries — read only, no side effects
interface Query<TResult> { readonly type: string; }

class GetOrdersByUserQuery implements Query<Order[]> {
  readonly type = "GetOrdersByUser" as const;
  constructor(public readonly userId: UserId) {}
}
```

---

### Event-Driven Architecture

- **What**: Services communicate through domain events, not direct calls.
- **Use when**: Microservices, decoupled workflows, audit trails, real-time features.
- **Tools**: `bullmq`, `kafkajs`, AWS SNS/SQS

```typescript
class OrderPlacedEvent {
  readonly type = "order.placed" as const;
  readonly occurredAt = new Date();
  constructor(public readonly order: Order) {}
}

// Subscriber in a different module/service — no direct dependency on order service
class SendConfirmationEmailHandler {
  async handle(event: OrderPlacedEvent): Promise<void> {
    await this.mailer.send(event.order.userEmail, "Your order is confirmed!");
  }
}
```

---

### Event Sourcing

- **What**: Persist state as an immutable log of events; derive current state by replaying.
- **Use when**: Financial systems, audit trails, undo/redo at scale. Pair with CQRS.

```typescript
type AccountEvent =
  | { type: "AccountOpened";  balance: number }
  | { type: "MoneyDeposited"; amount: number  }
  | { type: "MoneyWithdrawn"; amount: number  };

function applyEvent(state: AccountState, event: AccountEvent): AccountState {
  switch (event.type) {
    case "AccountOpened":  return { ...state, balance: event.balance };
    case "MoneyDeposited": return { ...state, balance: state.balance + event.amount };
    case "MoneyWithdrawn": return { ...state, balance: state.balance - event.amount };
  }
}

function rehydrate(events: AccountEvent[]): AccountState {
  return events.reduce(applyEvent, { balance: 0 });
}
```

---

## Frontend Patterns (React + TS)

> TypeScript + React patterns for component architecture and state management.

### Typed Component Props

Always define explicit prop interfaces; avoid `React.FC<any>`.

```typescript
interface ButtonProps {
  variant:    "primary" | "secondary" | "ghost";
  size?:      "sm" | "md" | "lg";
  isLoading?: boolean;
  onClick?:   (e: React.MouseEvent<HTMLButtonElement>) => void;
  children:   React.ReactNode;
}

export function Button({ variant, size = "md", isLoading, onClick, children }: ButtonProps) {
  return (
    <button className={clsx(styles[variant], styles[size])} onClick={onClick} disabled={isLoading}>
      {isLoading ? <Spinner /> : children}
    </button>
  );
}
```

---

### Custom Hooks (Typed)

- **Use when**: Sharing stateful logic across components.
- **Pattern**: Return a typed object (not a tuple unless hook is `useState`-like).

```typescript
interface UseFetchResult<T> {
  data:     T | null;
  isLoading: boolean;
  error:    Error | null;
  refetch:  () => void;
}

function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData]         = useState<T | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as T);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, error, refetch: load };
}
```

---

### Compound Components with Context

- **Use when**: Building flexible, composable UI components (Tabs, Accordion, Dropdown) that share state.

```typescript
interface TabsContextValue {
  activeTab:    string;
  setActiveTab: (id: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("useTabs must be used within <Tabs>");
  return ctx;
}

function Tabs({ defaultTab, children }: { defaultTab: string; children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
}

function Tab({ id, children }: { id: string; children: React.ReactNode }) {
  const { activeTab, setActiveTab } = useTabs();
  return (
    <button onClick={() => setActiveTab(id)} aria-selected={activeTab === id}>
      {children}
    </button>
  );
}

Tabs.Tab = Tab;
```

---

### Zustand for Client State

- **Use when**: Global client state (auth, UI theme, preferences) without Redux boilerplate.
- **Tools**: `zustand`

```typescript
import { create } from "zustand";

interface AuthState {
  user:   User | null;
  token:  string | null;
  login:  (user: User, token: string) => void;
  logout: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  user:   null,
  token:  null,
  login:  (user, token) => set({ user, token }),
  logout: ()            => set({ user: null, token: null }),
}));
```

---

### TanStack Query (React Query) for Server State

- **Use when**: All server data fetching, caching, background sync. Keep server state OUT of Zustand.
- **Tools**: `@tanstack/react-query`

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function useUser(id: UserId) {
  return useQuery<User, Error>({
    queryKey: ["users", id],
    queryFn:  () => fetchUser(id),
    staleTime: 60_000,
  });
}

function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateUserDTO) => updateUser(dto),
    onSuccess:  (user) => qc.setQueryData(["users", user.id], user),
  });
}
```

---

### Optimistic UI

- **Use when**: Mutations that usually succeed (likes, todos, messages) — eliminate perceived latency.

```typescript
useMutation({
  mutationFn: toggleLike,
  onMutate: async (postId) => {
    await qc.cancelQueries({ queryKey: ["posts", postId] });
    const prev = qc.getQueryData<Post>(["posts", postId]);
    qc.setQueryData<Post>(["posts", postId], (old) =>
      old ? { ...old, liked: !old.liked, likeCount: old.likeCount + (old.liked ? -1 : 1) } : old!
    );
    return { prev };
  },
  onError: (_, postId, ctx) => {
    qc.setQueryData(["posts", postId], ctx?.prev); // rollback
  },
});
```

---

## Backend / API Patterns (Node.js + TS)

> Patterns for Express, Fastify, NestJS, or framework-agnostic Node.js services.

### Result Type (Typed Error Handling)

- **Use when**: Functions with predictable failure cases. Avoids undeclared thrown exceptions.

```typescript
type Ok<T>  = { ok: true;  value: T };
type Err<E> = { ok: false; error: E };
type Result<T, E = Error> = Ok<T> | Err<E>;

const ok  = <T>(value: T): Ok<T>  => ({ ok: true, value });
const err = <E>(error: E): Err<E> => ({ ok: false, error });

async function createUser(
  dto: CreateUserDTO
): Promise<Result<User, "EMAIL_TAKEN" | "INVALID_INPUT">> {
  const existing = await userRepo.findByEmail(dto.email);
  if (existing) return err("EMAIL_TAKEN");
  const user = await userRepo.create(dto);
  return ok(user);
}

// Caller handles each case explicitly — no hidden throws
const result = await createUser(dto);
if (!result.ok) {
  if (result.error === "EMAIL_TAKEN") return res.status(409).json({ message: "Email already in use" });
  return res.status(400).json({ message: "Invalid input" });
}
return res.status(201).json(result.value);
```

---

### Repository Pattern (with Prisma)

- **What**: Abstract data access behind an interface; swap DB implementations without touching use cases.

```typescript
interface IUserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<User>;
  delete(id: UserId): Promise<void>;
}

class PrismaUserRepository implements IUserRepository {
  constructor(private db: PrismaClient) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(user: User): Promise<User> {
    const row = await this.db.user.upsert({
      where:  { id: user.id },
      create: toPersistence(user),
      update: toPersistence(user),
    });
    return toDomain(row);
  }
}
```

---

### Circuit Breaker

- **What**: Stops calling a failing service after a threshold; returns fallback. Prevents cascading failures.
- **States**: Closed → Open (on error threshold) → Half-Open (test recovery)
- **Tools**: `opossum`

```typescript
import CircuitBreaker from "opossum";

const breaker = new CircuitBreaker(callExternalService, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 10_000,
});

breaker.fallback(() => getCachedResult());
breaker.on("open",     () => logger.warn("Circuit OPEN — using fallback"));
breaker.on("halfOpen", () => logger.info("Circuit HALF-OPEN — testing"));
breaker.on("close",    () => logger.info("Circuit CLOSED — recovered"));

const result = await breaker.fire(payload);
```

---

### Retry with Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 300 }: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError!: Error;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt === maxAttempts) break;
      const jitter = Math.random() * 100;
      await sleep(baseDelayMs * 2 ** (attempt - 1) + jitter);
    }
  }
  throw lastError;
}
```

---

### Outbox Pattern

- **What**: Write events to an `outbox` table in the same DB transaction; a poller publishes them.
- **Use when**: Ensuring exactly-once event publishing; avoiding dual-write (DB + message broker).

```typescript
// Atomically write state change + outbox event in one transaction
await db.$transaction(async (tx) => {
  const order = await tx.order.create({ data: orderData });
  await tx.outboxEvent.create({
    data: {
      type:        "order.placed",
      payload:     JSON.stringify(order),
      publishedAt: null,
    },
  });
});

// Separate poller publishes pending events
async function processOutbox(): Promise<void> {
  const events = await db.outboxEvent.findMany({ where: { publishedAt: null }, take: 50 });
  for (const event of events) {
    await messageBroker.publish(event.type, JSON.parse(event.payload));
    await db.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
  }
}
```

---

## Concurrency & Async Patterns

### Async/Await Best Practices

```typescript
// Run independent async ops in parallel — not sequentially
const [user, orders] = await Promise.all([
  userRepo.findById(userId),
  orderRepo.findByUser(userId),
]);

// Settle all — handle each result individually
const results = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
results.forEach((r) => {
  if (r.status === "fulfilled") process(r.value);
  else                          logError(r.reason);
});

// Race with timeout
const result = await Promise.race([
  fetchData(),
  sleep(5000).then(() => { throw new TimeoutError(); }),
]);
```

---

### Producer-Consumer (BullMQ)

- **Use when**: Background jobs, email sending, image processing, scheduled tasks.
- **Tools**: `bullmq` (Redis-backed)

```typescript
import { Queue, Worker } from "bullmq";

interface EmailJobData {
  to:         string;
  templateId: string;
  variables:  Record<string, string>;
}

// Producer — enqueue job
const emailQueue = new Queue<EmailJobData>("emails");
await emailQueue.add("welcome", { to: user.email, templateId: "welcome", variables: { name: user.name } });

// Consumer — separate process
const worker = new Worker<EmailJobData>("emails", async (job) => {
  await mailer.send(job.data);
});
```

---

### Debounce & Throttle (Typed)

```typescript
function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  waitMs: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

function throttle<T extends unknown[]>(
  fn: (...args: T) => void,
  limitMs: number,
): (...args: T) => void {
  let lastRun = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastRun >= limitMs) {
      lastRun = now;
      fn(...args);
    }
  };
}

const handleSearch   = debounce((q: string) => fetchResults(q), 300);
const handleScroll   = throttle(() => updatePosition(), 100);
```

---

### Saga Pattern (Orchestration)

- **Use when**: Long-running distributed transactions needing compensating rollbacks.

```typescript
async function bookingOrchestrator(dto: BookingDTO): Promise<void> {
  const seatId = await seatService.reserve(dto.seatId);
  try {
    await paymentService.charge(dto.userId, dto.priceCents);
    try {
      await emailService.sendConfirmation(dto.userId);
    } catch {
      logger.warn("Confirmation email failed — non-critical, continuing");
    }
  } catch (e) {
    await seatService.release(seatId); // compensating transaction
    throw e;
  }
}
```

---

## Security Patterns

### JWT Authentication (`jose`)

- **Tools**: `jose` (Web-standard; works in Node, Edge, Deno)

```typescript
import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(SECRET);
}

async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, SECRET);
  return payload as JwtPayload;
}
```

---

### RBAC with Typed Roles

```typescript
const ROLES = ["admin", "editor", "viewer"] as const;
type Role = typeof ROLES[number];

const PERMISSIONS: Record<Role, ReadonlySet<string>> = {
  admin:  new Set(["read", "write", "delete", "manage_users"]),
  editor: new Set(["read", "write"]),
  viewer: new Set(["read"]),
};

function can(user: User, action: string): boolean {
  return PERMISSIONS[user.role].has(action);
}

// Express middleware
function requirePermission(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!can(req.user, action)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  };
}
```

---

### Input Validation with Zod

```typescript
const CreatePostSchema = z.object({
  title:   z.string().min(1).max(200),
  content: z.string().min(10),
  tags:    z.array(z.string()).max(5).default([]),
  isDraft: z.boolean().default(true),
});

type CreatePostDTO = z.infer<typeof CreatePostSchema>;

// In route handler
const parsed = CreatePostSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ errors: parsed.error.flatten() });
}
const dto: CreatePostDTO = parsed.data;
```

---

## Performance Patterns

### Memoization (Generic)

```typescript
function memoize<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  keyFn: (...args: TArgs) => string = (...args) => JSON.stringify(args),
): (...args: TArgs) => TReturn {
  const cache = new Map<string, TReturn>();
  return (...args) => {
    const key = keyFn(...args);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}
```

---

### Cache-Aside (Redis)

```typescript
async function getCachedUser(id: UserId): Promise<User> {
  const key    = `user:${id}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as User;

  const user = await userRepo.findById(id);
  if (!user) throw new NotFoundError(`User ${id}`);
  await redis.setex(key, 300, JSON.stringify(user)); // TTL: 5 min
  return user;
}
```

---

### Cursor-based Pagination (Prisma)

```typescript
interface PageResult<T> {
  items:      T[];
  nextCursor: string | null;
  hasMore:    boolean;
}

async function getUsers(cursor?: string, limit = 20): Promise<PageResult<User>> {
  const rows = await db.user.findMany({
    take:    limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
  });

  const hasMore = rows.length > limit;
  const items   = hasMore ? rows.slice(0, limit) : rows;

  return {
    items:      items.map(toDomain),
    nextCursor: hasMore ? items.at(-1)!.id : null,
    hasMore,
  };
}
```

---

## Testing Patterns

### Arrange-Act-Assert (Vitest)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("CreateUserUseCase", () => {
  let userRepo: { findByEmail: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    userRepo = { findByEmail: vi.fn(), save: vi.fn() };
    useCase  = new CreateUserUseCase(userRepo as unknown as IUserRepository);
  });

  it("returns ok when email is available", async () => {
    // Arrange
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.save.mockImplementation(async (u: User) => u);

    // Act
    const result = await useCase.execute({ name: "Alice", email: "alice@example.com" });

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.email).toBe("alice@example.com");
    expect(userRepo.save).toHaveBeenCalledOnce();
  });

  it("returns EMAIL_TAKEN when email already exists", async () => {
    userRepo.findByEmail.mockResolvedValue({ id: "existing" });
    const result = await useCase.execute({ name: "Bob", email: "taken@example.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("EMAIL_TAKEN");
  });
});
```

---

### In-Memory Repository (Fake)

- **Use when**: Fast unit tests that need a working repository without a real DB.

```typescript
class InMemoryUserRepository implements IUserRepository {
  private store = new Map<string, User>();

  async findById(id: UserId): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.store.values()].find(u => u.email === email) ?? null;
  }

  async save(user: User): Promise<User> {
    this.store.set(user.id, user);
    return user;
  }

  // Test helper
  seed(users: User[]): void {
    users.forEach(u => this.store.set(u.id, u));
  }
}
```

---

### Contract Testing with Zod

```typescript
const UserApiResponseSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string(),
  email:     z.string().email(),
  createdAt: z.string().datetime(),
});

it("GET /users/:id matches response contract", async () => {
  const res = await request(app).get(`/users/${testUserId}`).expect(200);
  const parsed = UserApiResponseSchema.safeParse(res.body);
  expect(parsed.success, parsed.error?.message).toBe(true);
});
```

---

## Pattern Selection Quick Reference

| Feature Type | Recommended Patterns / Tools |
|---|---|
| Object creation with complex config | Builder, Factory Method |
| Pluggable behavior / algorithms | Strategy, Command |
| State machine / workflow | State, Chain of Responsibility, Saga |
| UI component system (React) | Compound Components, Custom Hooks, Atomic Design |
| Client-side global state | Zustand |
| Server / async data in React | TanStack Query (React Query) |
| Optimistic updates in UI | Optimistic UI + TanStack Query `onMutate` |
| Reactive events / pub-sub | Typed Observer / EventEmitter |
| Data access abstraction | Repository + Interface (Prisma impl) |
| Runtime validation + TS types | Zod (`z.infer<>`) |
| Typed error handling | Result type (`Ok` / `Err`) |
| Preventing primitive confusion | Branded / Nominal Types |
| Cross-cutting concerns | Decorator, Middleware Chain |
| Hiding subsystem complexity | Facade |
| Adapting third-party SDKs | Adapter |
| Access control proxy | Proxy, RBAC middleware |
| Large-scale app structure | Clean Architecture, Modular Monolith |
| Write/read separation | CQRS + Read Model |
| Audit trail / temporal queries | Event Sourcing + CQRS |
| Exactly-once event publishing | Outbox Pattern |
| Decoupled microservice communication | Event-Driven + Typed EventEmitter / Kafka |
| Background / async jobs | Producer-Consumer (`bullmq`) |
| Resilient external calls | Circuit Breaker (`opossum`), Retry + Backoff |
| Performance / caching | Cache-Aside (Redis), Memoize, Cursor Pagination |
| Authentication | JWT (`jose`), OAuth 2.0 / OIDC |
| Authorization | RBAC with typed roles, ABAC for fine-grained |
| Dependency management / testability | Dependency Injection (`tsyringe` / `inversify`) |
| Undo / history / snapshots | Command + Memento |
| Streaming / lazy large datasets | AsyncGenerator iterator |
| Testing without a real DB | In-Memory Repository (Fake) |
| API response contract testing | Zod schema validation in tests |

---

*Written for TypeScript strict mode. All patterns use TypeScript idioms. Combine freely. Prefer simplicity — only escalate to complex patterns when the problem demands it.*
