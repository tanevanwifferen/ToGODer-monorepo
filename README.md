# ToGODer Monorepo

A unified monorepo for the ToGODer ecosystem using PNPM workspaces and Turborepo.

## Structure

- `packages/core` - Backend server (Node.js/TypeScript, Express, Prisma, WebSocket)
- `packages/mobile-app` - Mobile app (Expo/React Native)
- `packages/mcp-server` - Model Context Protocol server for AI integration
- `packages/book` - Documentation and scripture content
- `apps/web-frontend` - Web frontend (extracted from ToGODer/Frontend)
- `shared/types` - Shared TypeScript types
- `shared/utils` - Shared utilities

## Getting Started

```bash
# Install dependencies
pnpm install

# Run all packages in dev mode
pnpm dev

# Run specific package
pnpm dev:core
pnpm dev:mobile
pnpm dev:mcp

# Build all packages
pnpm build
```

## Migration Status

- [ ] Move ToGODer backend to packages/core
- [ ] Move ToGODer_app to packages/mobile-app
- [ ] Move ToGODer-mcp-server to packages/mcp-server
- [ ] Move ToGODer-book content to packages/book
- [ ] Extract web frontend to apps/web-frontend
- [ ] Set up shared types and utils
