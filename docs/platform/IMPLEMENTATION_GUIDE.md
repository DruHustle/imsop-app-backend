# IMSOP Implementation Guide

**Version:** 2.0.0
**Author:** Andrew Gotora
**Email:** [andrewgotora@yahoo.com](mailto:andrewgotora@yahoo.com)
**Last Updated**: January 9, 2026

## 1. Project Setup

### 1.1 Prerequisites

Before starting development, ensure you have the following installed:

- **Node.js**: Version 22.x or higher
- **npm**: Version 10.x or higher (comes with Node.js)
- **Git**: Version 2.30 or higher
- **MySQL**: Version 8.0 or PostgreSQL 12+
- **Docker**: (Optional) Version 20.10 or higher for containerization

### 1.2 Environment Setup

#### 1.2.1 Clone Repository

```bash
git clone https://github.com/DruHustle/imsop-app.git
cd imsop-app
```

#### 1.2.2 Install Dependencies

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..

# Install server dependencies
cd server
npm install
cd ..
```

#### 1.2.3 Environment Variables

Create a `.env.local` file in the server directory:

```bash
# Database Configuration
DATABASE_URL=mysql://user:password@localhost:3306/imsop
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=root
DATABASE_PASSWORD=password
DATABASE_NAME=imsop

# Server Configuration
NODE_ENV=development
PORT=3001
HOST=localhost

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here_min_32_chars
JWT_EXPIRATION=24h

# CORS Configuration
CORS_ORIGIN=http://localhost:5173,http://localhost:3000

# Logging
LOG_LEVEL=debug
```

Create a `.env.local` file in the client directory:

```bash
# API Configuration
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME=IMSOP
VITE_APP_VERSION=1.0.0
```

### 1.3 Database Setup

#### 1.3.1 Create Database

```bash
# Using MySQL
mysql -u root -p
CREATE DATABASE imsop;
USE imsop;
```

#### 1.3.2 Run Migrations

```bash
# From server directory
cd server
npm run db:push
```

This will create all necessary tables based on the Drizzle schema.

#### 1.3.3 Seed Database (Optional)

```bash
# From server directory
npm run db:seed
```

## 2. Development Workflow

### 2.1 Starting Development Servers

#### 2.1.1 Start Backend Server

```bash
cd server
npm run dev
```

The server will start on `http://localhost:3001`

#### 2.1.2 Start Frontend Development Server

In a new terminal:

```bash
cd client
npm run dev
```

The frontend will start on `http://localhost:5173`

### 2.2 Code Structure

#### 2.2.1 Backend Structure

```
server/
├── src/
│   ├── index.ts              # Server entry point
│   ├── routes/               # API routes
│   │   ├── auth.ts          # Authentication routes
│   │   ├── operations.ts    # Operations routes
│   │   └── telemetry.ts     # Telemetry routes
│   ├── controllers/          # Request handlers
│   │   ├── authController.ts
│   │   ├── operationsController.ts
│   │   └── telemetryController.ts
│   ├── services/             # Business logic
│   │   ├── authService.ts
│   │   ├── operationsService.ts
│   │   └── telemetryService.ts
│   ├── middleware/           # Express middleware
│   │   ├── auth.ts          # JWT validation
│   │   ├── errorHandler.ts  # Error handling
│   │   └── validation.ts    # Input validation
│   ├── db/                   # Database
│   │   ├── schema.ts        # Drizzle schema
│   │   └── index.ts         # Database connection
│   └── utils/                # Utility functions
│       ├── logger.ts
│       ├── errors.ts
│       └── validators.ts
├── .env.local                # Environment variables
├── package.json
└── tsconfig.json
```

#### 2.2.2 Frontend Structure

```
client/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component
│   ├── pages/                # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Operations.tsx
│   │   ├── Telemetry.tsx
│   │   ├── Login.tsx
│   │   └── NotFound.tsx
│   ├── components/           # Reusable components
│   │   ├── Layout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── OperationForm.tsx
│   │   ├── TelemetryChart.tsx
│   │   └── ...
│   ├── hooks/                # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useOperations.ts
│   │   └── useTelemetry.ts
│   ├── services/             # API services
│   │   ├── authService.ts
│   │   ├── operationsService.ts
│   │   └── telemetryService.ts
│   ├── types/                # TypeScript types
│   │   ├── auth.ts
│   │   ├── operations.ts
│   │   └── telemetry.ts
│   ├── utils/                # Utility functions
│   │   ├── api.ts
│   │   ├── storage.ts
│   │   └── formatters.ts
│   ├── styles/               # CSS/Tailwind
│   │   └── globals.css
│   └── App.css
├── .env.local                # Environment variables
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 2.3 Development Best Practices

#### 2.3.1 Code Style

Follow these guidelines for consistent code:

**TypeScript:**
- Use strict mode: `"strict": true` in tsconfig.json
- Avoid `any` types; use proper typing
- Use interfaces for object shapes
- Use enums for constants

**Naming Conventions:**
- Files: `camelCase.ts` for utilities, `PascalCase.tsx` for components
- Variables/Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

**Example:**

```typescript
// Good
interface User {
  id: number;
  email: string;
  firstName: string;
}

const getUserById = async (userId: number): Promise<User> => {
  // implementation
};

// Bad
interface user {
  id: number;
  email: string;
}

const get_user = async (user_id: any) => {
  // implementation
};
```

#### 2.3.2 Error Handling

Always handle errors properly:

```typescript
// Backend
try {
  const user = await userService.getUserById(id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  res.json(user);
} catch (error) {
  next(error);
}

// Frontend
try {
  const data = await api.get('/users/1');
  setUser(data);
} catch (error) {
  if (error instanceof AxiosError) {
    setError(error.response?.data?.message || 'An error occurred');
  }
}
```

#### 2.3.3 Async/Await

Always use async/await instead of callbacks:

```typescript
// Good
const fetchData = async () => {
  try {
    const response = await api.get('/data');
    return response.data;
  } catch (error) {
    console.error('Error:', error);
  }
};

// Bad
const fetchData = () => {
  api.get('/data').then(response => {
    return response.data;
  }).catch(error => {
    console.error('Error:', error);
  });
};
```

### 2.4 Testing

#### 2.4.1 Backend Testing

```bash
# Run tests
cd server
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

#### 2.4.2 Frontend Testing

```bash
# Run tests
cd client
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

#### 2.4.3 Writing Tests

**Backend Example:**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authService } from '../services/authService';

describe('Auth Service', () => {
  it('should register a new user', async () => {
    const user = await authService.register({
      email: 'test@example.com',
      password: 'Test123!',
      firstName: 'Test',
      lastName: 'User'
    });

    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });

  it('should throw error for duplicate email', async () => {
    expect(async () => {
      await authService.register({
        email: 'test@example.com',
        password: 'Test123!',
        firstName: 'Test',
        lastName: 'User'
      });
    }).rejects.toThrow();
  });
});
```

**Frontend Example:**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoginForm from '../components/LoginForm';

describe('LoginForm Component', () => {
  it('should render login form', () => {
    render(<LoginForm />);
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('should submit form with valid credentials', async () => {
    render(<LoginForm />);
    const emailInput = screen.getByPlaceholderText('Email');
    const passwordInput = screen.getByPlaceholderText('Password');
    const submitButton = screen.getByText('Login');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Test123!' } });
    fireEvent.click(submitButton);

    // Add assertions
  });
});
```

## 3. Building and Deployment

### 3.1 Production Build

#### 3.1.1 Build Backend

```bash
cd server
npm run build
```

This creates a `dist/` directory with compiled JavaScript.

#### 3.1.2 Build Frontend

```bash
cd client
npm run build
```

This creates a `dist/` directory with optimized production build.

### 3.2 Docker Deployment

#### 3.2.1 Build Docker Images

```bash
# Backend
docker build -f server/Dockerfile -t imsop-backend:latest ./server

# Frontend
docker build -f client/Dockerfile -t imsop-frontend:latest ./client
```

#### 3.2.2 Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: imsop
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: mysql://root:password@mysql:3306/imsop
      JWT_SECRET: your_jwt_secret_key_here
      NODE_ENV: production
    ports:
      - "3001:3001"
    depends_on:
      - mysql

  frontend:
    build:
      context: ./client
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  mysql_data:
```

Run with:

```bash
docker-compose up -d
```

### 3.3 Kubernetes Deployment

#### 3.3.1 Create Deployment Files

**backend-deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: imsop-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: imsop-backend
  template:
    metadata:
      labels:
        app: imsop-backend
    spec:
      containers:
      - name: backend
        image: imsop-backend:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

#### 3.3.2 Deploy to Kubernetes

```bash
# Create secrets
kubectl create secret generic db-secret --from-literal=url=mysql://...
kubectl create secret generic jwt-secret --from-literal=secret=...

# Deploy
kubectl apply -f backend-deployment.yaml
kubectl apply -f frontend-deployment.yaml
kubectl apply -f service.yaml
```

## 4. Database Management

### 4.1 Schema Modifications

#### 4.1.1 Add New Table

1. Update `server/src/db/schema.ts`:

```typescript
export const newTable = sqliteTable('new_table', {
  id: int().primaryKey().autoincrement(),
  name: text().notNull(),
  createdAt: text().default(sql`CURRENT_TIMESTAMP`),
});
```

2. Run migration:

```bash
npm run db:push
```

#### 4.1.2 Modify Existing Table

1. Update schema in `server/src/db/schema.ts`
2. Create migration:

```bash
npm run db:generate
```

3. Review and apply:

```bash
npm run db:push
```

### 4.2 Database Backup

#### 4.2.1 MySQL Backup

```bash
# Full backup
mysqldump -u root -p imsop > backup.sql

# Restore
mysql -u root -p imsop < backup.sql
```

#### 4.2.2 Automated Backups

Create a cron job:

```bash
# Daily backup at 2 AM
0 2 * * * mysqldump -u root -p$MYSQL_PASSWORD imsop > /backups/imsop_$(date +\%Y\%m\%d).sql
```

## 5. Monitoring and Logging

### 5.1 Application Logging

#### 5.1.1 Backend Logging

```typescript
import logger from './utils/logger';

// Log levels
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

#### 5.1.2 Frontend Logging

```typescript
// Development
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info');
}

// Production
import { logError } from './utils/logger';
logError(error);
```

### 5.2 Performance Monitoring

#### 5.2.1 Backend Metrics

```typescript
import { performance } from 'perf_hooks';

const start = performance.now();
// operation
const duration = performance.now() - start;
logger.info(`Operation took ${duration}ms`);
```

#### 5.2.2 Frontend Performance

```typescript
// Web Vitals
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

## 6. Troubleshooting

### 6.1 Common Issues

#### 6.1.1 Database Connection Error

**Problem:** `Error: connect ECONNREFUSED 127.0.0.1:3306`

**Solution:**
```bash
# Check if MySQL is running
mysql -u root -p

# If not running, start MySQL
sudo systemctl start mysql

# Or using Docker
docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password mysql:8.0
```

#### 6.1.2 Port Already in Use

**Problem:** `Error: listen EADDRINUSE: address already in use :::3001`

**Solution:**
```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>

# Or use different port
PORT=3002 npm run dev
```

#### 6.1.3 JWT Token Expired

**Problem:** `Error: jwt expired`

**Solution:**
```typescript
// In frontend, refresh token
const refreshToken = async () => {
  const response = await api.post('/auth/refresh');
  localStorage.setItem('token', response.data.token);
};
```

#### 6.1.4 CORS Error

**Problem:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
Update `.env.local`:
```bash
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

### 6.2 Debug Mode

#### 6.2.1 Backend Debug

```bash
# Start with debug logging
DEBUG=* npm run dev

# Or use Node debugger
node --inspect-brk dist/index.js
```

#### 6.2.2 Frontend Debug

```bash
# Chrome DevTools
# Press F12 to open DevTools
# Go to Sources tab to set breakpoints

# Or use VS Code debugger
# Create .vscode/launch.json:
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/client/src"
    }
  ]
}
```

## 7. Security Best Practices

### 7.1 Authentication

- Always use HTTPS in production
- Store JWT tokens securely (httpOnly cookies preferred)
- Implement token refresh mechanism
- Use strong password hashing (bcryptjs with 10+ rounds)

### 7.2 Authorization

- Implement role-based access control (RBAC)
- Validate user permissions on every request
- Use middleware to enforce authorization
- Log authorization failures

### 7.3 Data Protection

- Encrypt sensitive data at rest
- Use parameterized queries to prevent SQL injection
- Validate and sanitize all user inputs
- Implement rate limiting on sensitive endpoints

### 7.4 Secrets Management

Never commit secrets to version control:

```bash
# Use environment variables
export DATABASE_URL=mysql://user:pass@localhost/db
export JWT_SECRET=your_secret_key

# Or use .env.local (add to .gitignore)
echo ".env.local" >> .gitignore
```

## 8. Performance Optimization

### 8.1 Backend Optimization

- Use database indexing on frequently queried columns
- Implement caching (Redis) for frequently accessed data
- Use connection pooling for database connections
- Implement pagination for large result sets
- Use compression middleware (gzip)

### 8.2 Frontend Optimization

- Code splitting with React.lazy()
- Image optimization and lazy loading
- Minimize bundle size with tree-shaking
- Use React.memo() for expensive components
- Implement virtual scrolling for large lists

### 8.3 Database Optimization

- Create indexes on foreign keys
- Analyze query performance with EXPLAIN
- Archive old data periodically
- Use database replication for read scaling
- Implement query caching

## 9. Continuous Integration

### 9.1 GitHub Actions

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: password
          MYSQL_DATABASE: imsop
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3

    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
```

## 10. Release Process

### 10.1 Version Management

Follow semantic versioning (MAJOR.MINOR.PATCH):

```bash
# Bump version
npm version patch    # 1.0.0 -> 1.0.1
npm version minor    # 1.0.0 -> 1.1.0
npm version major    # 1.0.0 -> 2.0.0
```

### 10.2 Changelog

Maintain `CHANGELOG.md`:

```markdown
## [1.1.0] - 2024-01-09

### Added
- New feature X
- New feature Y

### Fixed
- Bug fix A
- Bug fix B

### Changed
- Breaking change C
```

### 10.3 Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit changes: `git commit -m "Release v1.1.0"`
4. Tag release: `git tag -a v1.1.0 -m "Release version 1.1.0"`
5. Push changes: `git push origin main --tags`
6. Create GitHub Release with changelog
7. Deploy to production

This implementation guide provides comprehensive instructions for developing, testing, deploying, and maintaining the IMSOP application.
