# Test Strategy

| Layer | Command | Coverage |
|---|---|---|
| .NET unit | `dotnet test src/IMSOP.sln -m:1` | Purchase-order validation |
| Node API | `pnpm -C server test` | Health, headers, validation, authentication boundary, RBAC, webhook signatures |
| Frontend unit | `pnpm test` in `imsop-app` | Components and demo authentication |
| Browser E2E | `pnpm e2e` in `imsop-app` | Desktop and mobile, all demo roles, routes and user workflows |

The browser suite uses isolated contexts. It covers:

- Authentication, invalid credentials, password recovery navigation and logout.
- Admin, engineer, analyst and user role matrices, including direct-route denial.
- Dashboard, operations, analytics, infrastructure, intelligence, assistant, settings and profile routes.
- Logistics search, map fallback and CSV download.
- Assistant request/response behavior.
- Theme and profile persistence.
- Demo password flow and 404 recovery.
- Desktop Chromium and Pixel 5 viewport behavior.

Real-account/database integration and email delivery require test infrastructure and provider credentials. Run those checks in a protected staging environment, never with production customer data.

