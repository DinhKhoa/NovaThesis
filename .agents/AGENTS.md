# UI/UX Design Constraints (Impeccable Framework)

**CRITICAL RULE FOR ALL UI TASKS**:
Whenever the user asks to design, improve, or build a web interface/UI, you MUST NOT generate arbitrary designs, generic "AI slop" templates, or rely on your own aesthetic assumptions.

You MUST strictly adhere to the `impeccable` framework located in `.agents/skills/impeccable`.

**Mandatory Workflow for UI Tasks**:
1. **Stop and Read**: You must read `.agents/skills/impeccable/reference/craft.md` and `PRODUCT.md` before writing a single line of UI code.
2. **Shape**: Run the shaping process (`/impeccable shape`) to establish the design register and visual direction.
3. **References**: Actively read the corresponding reference files in `.agents/skills/impeccable/reference/` (e.g., `layout.md`, `typeset.md`, `interaction-design.md`) to guide spacing, typography, and motion.
4. **Execution**: Follow the production bar defined in `craft.md`. Do not compress these gates. Do not substitute real imagery or robust interactions with cheap CSS gimmicks unless it strictly aligns with the chosen Impeccable register.
