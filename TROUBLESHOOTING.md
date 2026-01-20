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

## 2026-01-19: ESLint Config Error on Vercel Build

### Context
Deploying to Vercel after implementing Project Notes feature.

### Problem
```
ESLint: Invalid Options: - Unknown options: useEslintrc, extensions - 'extensions' has been removed.
Failed to compile.
./components/EditProjectModal.tsx:144:35
```

Build failed on Vercel with ESLint configuration errors.

### Root Cause
**ESLint version incompatibility:**
- `eslint-config-next@16.1.3` requires ESLint >= 9.0.0
- ESLint 9 uses flat config format, but Next.js 14.2.35 with `.eslintrc.json` uses old format
- The error "Unknown options: useEslintrc, extensions" indicates ESLint 9 is trying to use ESLint 8 options
- Version mismatch between ESLint 9 and the config format expected by Next.js 14

### Solution Implemented
**Downgrade to compatible versions (NOT ignoring the error):**

1. **Downgrade ESLint to version 8:**
   ```bash
   npm install eslint@^8.57.0 --save-dev
   ```

2. **Downgrade eslint-config-next to version 14 (compatible with ESLint 8):**
   ```bash
   npm install eslint-config-next@14.2.4 --save-dev
   ```

3. **Update package.json:**
   ```json
   "eslint": "^8.57.0",
   "eslint-config-next": "^14.2.4"
   ```

This ensures:
- ESLint 8 works with `.eslintrc.json` format (no flat config needed)
- `eslint-config-next@14.2.4` is compatible with ESLint 8
- No need to ignore ESLint errors - proper configuration is used
- Builds will pass on Vercel with correct ESLint checking

### Prevention
- ✅ **DO NOT upgrade to ESLint 9** until Next.js fully supports ESLint 9 flat config format
- ✅ Keep ESLint 8 with eslint-config-next 14.x for Next.js 14 projects
- ✅ Check compatibility before upgrading ESLint major versions
- ✅ Verify that Next.js version supports the ESLint version you want to use
- ✅ Always test builds locally before deploying to catch version mismatches early

### When to Upgrade
- Wait for Next.js 15+ which may have better ESLint 9 support
- Or wait for eslint-config-next to provide proper ESLint 9 flat config support
- Always test builds locally before deploying

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
