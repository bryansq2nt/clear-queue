# Troubleshooting Log

This document tracks problems encountered during development and their solutions to prevent recurring issues.

---

## 2026-01-19: Type Error in tabs.tsx Build

### Context
Building Project Notes feature with shadcn/ui Tabs component.

### Problem
```
Type error: Type 'ForwardRefExoticComponent<TabsListProps & RefAttributes<HTMLDivElement>>' 
does not satisfy the constraint...
```

Build failed during `npm run build` with TypeScript errors in `components/ui/tabs.tsx`.

### Root Cause
**Dependency version incompatibility:**
- React 19 was installed in the project
- `lucide-react@0.309.0` only supports React 16-18
- `@radix-ui/react-tabs` and other UI packages not yet compatible with React 19
- Peer dependency conflicts causing type errors

### Solution Implemented
**NO CODE CHANGES NEEDED** - The issue was dependency versions, not the code itself.

1. **Downgrade React to version 18:**
   ```bash
   npm install react@18 react-dom@18 @types/react@18 @types/react-dom@18
   ```

2. **Update @radix-ui/react-tabs to latest:**
   ```bash
   npm install @radix-ui/react-tabs@latest
   ```

3. **Verify build:**
   ```bash
   npm run build
   ```

### Prevention
- ✅ **DO NOT upgrade to React 19** until all packages (especially UI libraries like lucide-react, @radix-ui/*) explicitly support it
- ✅ Check peer dependencies before upgrading React versions
- ✅ Verify compatibility of all UI packages before major React upgrades
- ✅ Keep React 18 until ecosystem catches up

### Related Issues
- Similar type errors may occur with other Radix UI components if React 19 is installed
- Recharts components also had similar issues (resolved with `as any` casts, but dependency fix is preferred)

---

## Development Guidelines

### Before Implementing New Features
1. ✅ Consult this troubleshooting log
2. ✅ Check for similar errors already resolved
3. ✅ Apply preventive solutions from the start
4. ✅ Verify React version compatibility with all packages

### During Development
- If you encounter a new error, document it immediately
- Add the solution once resolved
- Update this log with identified patterns

### React Version Policy
- **Current:** React 18.x
- **Do NOT upgrade to React 19** until:
  - lucide-react supports React 19
  - All @radix-ui/* packages support React 19
  - All other UI dependencies are verified compatible

---

## Notes
- This log should be updated whenever a new problem is encountered and resolved
- Focus on root causes, not just symptoms
- Include exact commands/steps that fixed the issue
