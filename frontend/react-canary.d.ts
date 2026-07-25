/*
 * <ViewTransition> ships in the React build the App Router uses, but its types
 * live in the canary declaration file rather than the stable one. Pulling them
 * in here keeps `import { ViewTransition } from "react"` type-checked instead
 * of forcing a cast at every call site.
 */
/// <reference types="react/canary" />
