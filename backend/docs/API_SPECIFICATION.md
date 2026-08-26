# HireQuest Backend - REST API Specification

**Version**: 1.0.0  
**Base URL**: `/api/v1`  
**Content-Type**: `application/json`  
**Authentication**: Bearer JWT Access Token in `Authorization` header (`Bearer <token>`) & HTTP-Only Refresh Token Cookie (`refreshToken`).

---

## Standard API Response Format

All API endpoints return JSON conforming to the standardized enterprise response structure:

### Success Response (200 OK / 201 Created)
```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

### Error Response (4xx / 5xx)
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_IDENTIFIER",
    "message": "Human readable error message.",
    "details": null
  }
}
```

---

## 1. Authentication & Authorization Module (`/api/v1/auth`)

### 1.1 Register HR / User
- **HTTP Method**: `POST /api/v1/auth/register`
- **Access**: Public
- **Request Body**:
```json
{
  "email": "hr.recruiter@hirequest.com",
  "password": "StrongPassword123#",
  "firstName": "Rohit",
  "lastName": "Panchal",
  "role": "HR"
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "message": "User registered successfully.",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "cuid_user_123",
      "firstName": "Rohit",
      "lastName": "Panchal",
      "fullName": "Rohit Panchal",
      "email": "hr.recruiter@hirequest.com",
      "role": "HR",
      "isActive": true,
      "emailVerified": false,
      "createdAt": "2026-08-21T12:00:00.000Z"
    }
  }
}
```

---

### 1.2 User Login
- **HTTP Method**: `POST /api/v1/auth/login`
- **Access**: Public
- **Request Body**:
```json
{
  "email": "hr.recruiter@hirequest.com",
  "password": "StrongPassword123#"
}
```
- **Response** (`200 OK`): Sets `refreshToken` HTTP-Only Cookie.
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "cuid_user_123",
      "firstName": "Rohit",
      "lastName": "Panchal",
      "fullName": "Rohit Panchal",
      "email": "hr.recruiter@hirequest.com",
      "role": "HR",
      "isActive": true
    }
  }
}
```

---

### 1.3 Refresh Access Token
- **HTTP Method**: `POST /api/v1/auth/refresh-token`
- **Access**: Public (Cookie `refreshToken` required)
- **Response** (`200 OK`): Rotates refresh token & returns new access token.

---

### 1.4 Get Current Authenticated Profile
- **HTTP Method**: `GET /api/v1/auth/me`
- **Access**: Protected (`requireAuth`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response** (`200 OK`): Returns sanitized profile.

---

### 1.5 User Logout
- **HTTP Method**: `POST /api/v1/auth/logout`
- **Access**: Public / Protected
- **Response** (`200 OK`): Clears HTTP-only cookie and revokes refresh token.

---

## 2. Assessment Management Module (`/api/v1/assessments`)

### 2.1 List Assessments
- **HTTP Method**: `GET /api/v1/assessments`
- **Access**: Protected (`requireAuth`, Roles: `SUPER_ADMIN`, `HR`)
- **Query Params**: `page=1`, `limit=10`, `search=Frontend`, `status=PUBLISHED`, `type=TECHNICAL`
- **Response** (`200 OK`): Paginated collection of assessments.

---

### 2.2 Create Assessment
- **HTTP Method**: `POST /api/v1/assessments`
- **Access**: Protected (`requireAuth`, Roles: `SUPER_ADMIN`, `HR`)
- **Request Body**:
```json
{
  "title": "Senior Frontend Developer Cognitive Assessment",
  "description": "Evaluates React, Next.js, and System Architecture skills",
  "durationMinutes": 60,
  "passingScore": 70,
  "maximumScore": 100,
  "type": "TECHNICAL",
  "difficulty": "HARD"
}
```
- **Response** (`201 Created`): Created assessment object.

---

### 2.3 Assign Questions to Assessment
- **HTTP Method**: `POST /api/v1/assessments/:id/questions`
- **Access**: Protected (`requireAuth`, Roles: `SUPER_ADMIN`, `HR`)
- **Request Body**:
```json
{
  "questionIds": ["cuid_q1", "cuid_q2", "cuid_q3"]
}
```
- **Response** (`200 OK`): Updated assessment with questions assigned.

---

### 2.4 Lifecycle Transitions
- `POST /api/v1/assessments/:id/publish` -> Transition status to `PUBLISHED`
- `POST /api/v1/assessments/:id/activate` -> Transition status to `ACTIVE`
- `POST /api/v1/assessments/:id/archive`  -> Transition status to `ARCHIVED`
- `POST /api/v1/assessments/:id/duplicate` -> Deep clone assessment & questions

---

## 3. Question Bank Module (`/api/v1/questions`)

### 3.1 List Questions
- **HTTP Method**: `GET /api/v1/questions`
- **Access**: Protected (`requireAuth`, Roles: `SUPER_ADMIN`, `HR`)
- **Query Params**: `page=1`, `limit=10`, `search=React`, `type=SINGLE_CHOICE`, `difficulty=MEDIUM`
- **Response** (`200 OK`): Paginated question items.

---

### 3.2 Create Question
- **HTTP Method**: `POST /api/v1/questions`
- **Access**: Protected (`requireAuth`, Roles: `SUPER_ADMIN`, `HR`)
- **Request Body**:
```json
{
  "title": "What is the primary purpose of React useEffect hook?",
  "description": "Core React Lifecycle Question",
  "type": "SINGLE_CHOICE",
  "difficulty": "EASY",
  "status": "PUBLISHED",
  "marks": 5,
  "negativeMarks": 1,
  "categoryId": "cuid_cat_frontend",
  "tagIds": ["cuid_tag_react"],
  "options": [
    {
      "optionText": "To perform side effects in functional components",
      "isCorrect": true,
      "sequence": 1
    },
    {
      "optionText": "To render direct DOM elements directly",
      "isCorrect": false,
      "sequence": 2
    }
  ]
}
```
- **Response** (`201 Created`): Created question with options & tags.

---

## 4. Question Category Module (`/api/v1/question-categories`)

### 4.1 List Categories
- **HTTP Method**: `GET /api/v1/question-categories`
- **Access**: Protected (`requireAuth`)
- **Response** (`200 OK`): Active category list with question count.

### 4.2 Create Category
- **HTTP Method**: `POST /api/v1/question-categories`
- **Access**: Protected (`requireAuth`, Roles: `SUPER_ADMIN`, `HR`)
- **Request Body**: `{ "name": "Frontend Engineering", "description": "UI frameworks and Web Vitals" }`

---

## 5. Question Tag Module (`/api/v1/question-tags`)

### 5.1 List Tags
- **HTTP Method**: `GET /api/v1/question-tags`
- **Access**: Protected (`requireAuth`)
- **Response** (`200 OK`): Active tags list.

### 5.2 Create Tag
- **HTTP Method**: `POST /api/v1/question-tags`
- **Access**: Protected (`requireAuth`, Roles: `SUPER_ADMIN`, `HR`)
- **Request Body**: `{ "name": "React.js", "description": "React core library" }`
