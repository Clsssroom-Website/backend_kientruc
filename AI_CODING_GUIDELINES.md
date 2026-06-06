# AI CODING GUIDELINES: DESIGN PATTERNS IMPLEMENTATION

## Context & Role
Act as an Expert Software Architect and Senior Backend Developer (Node.js/TypeScript). You are developing a "Classroom Management System". 

## Strict Architectural Directives
Whenever you generate code for this project, you MUST strictly adhere to the following Design Patterns for their respective use cases. Do not deviate from these architectural decisions.

### 1. Singleton Pattern: Database Connection Management
- **Use Case:** Managing connections to the Database (SQL Server/MongoDB).
- **Implementation Rule:** Ensure the backend application uses only ONE single instance to manage the database connection pool. This prevents resource exhaustion and ensures data synchronization and high performance.
- **Naming Convention:** `DatabaseConnection.getInstance()`

### 2. Factory Method Pattern: Object Creation (Users & Assignments)
- **Use Case:** Instantiating scalable and polymorphic objects.
- **Implementation Rule - Users:** Create a `UserFactory` that returns specific objects based on the user role (`Teacher`, `Student`, `Admin`). Each subclass must implement its own specific methods (e.g., `Student.submitAssignment()`, `Teacher.gradeAssignment()`).
- **Implementation Rule - Assignments:** Create an `AssignmentFactory` to easily support future assignment types (e.g., DragAndDrop, Coding, MultipleChoice) without modifying the core logic.

### 3. Observer Pattern: Notification System
- **Use Case:** Real-time and asynchronous event notifications.
- **Implementation Rule:** Treat the action of updating grades or creating assignments as the `Subject` (Publisher). Treat the students/users as `Observers` (Subscribers). 
- **Action:** Automatically trigger notifications via Email or Socket.io to all relevant Observers when the Subject's state changes.

### 4. Facade Pattern: Complex Workflow Simplification (Clean Code)
- **Use Case:** Encapsulating multi-step, complex business processes.
- **Implementation Rule:** For processes like "End of Course" or "Finalize Grades", do not write scattered logic in the Controller. 
- **Action:** Create a `FinalizeGradeFacade` class. It must expose a single `execute()` method that internally coordinates the sub-systems: Calculate Average -> Check Pass/Fail Conditions -> Export Excel Report -> Send Email Notifications.

### 5. Strategy Pattern: Grading Algorithms
- **Use Case:** Handling different grading rules dynamically and eliminating nested `if-else` statements.
- **Implementation Rule:** Define a `GradingStrategy` interface. Implement concrete strategies for different assignment types (e.g., `AutoGradingStrategy` for Quizzes, `ManualGradingStrategy` for File Uploads). The context class should switch strategies dynamically based on the assignment type.

### 6. Adapter Pattern: Third-party Data Integration
- **Use Case:** Converting incompatible third-party data structures into the internal application schema.
- **Implementation Rule:** When integrating with external services like Google Forms, the incoming JSON payload will not match the system's Database schema.
- **Action:** Implement a `GoogleFormAdapter`. This class will act as a translator, parsing and mapping the external data fields into the standardized entity format understood by our system.

## Coding Standards Enforcement
- **Strict Typing:** Always use TypeScript interfaces/types. Absolutely NO use of `any`.
- **Error Handling:** Implement robust `try/catch` blocks.
- **Clean Code:** Keep functions small. Use `camelCase` for variables/methods and `PascalCase` for Classes/Interfaces.
- **Comments:** Comment on the *business logic* (WHY), not the syntax (HOW).